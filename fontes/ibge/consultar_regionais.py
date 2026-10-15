"""Séries do IBGE por Brasil, Grande Região e UF para o story "O Brasil no fim de cada governo" (revisão de 2026-10-12).

    PYTHONPATH=nucleo:. python fontes/ibge/consultar_regionais.py

Bases (catálogo; cópias locais autorizadas pelo pesquisador em 2026-10-12, decisão 5 — todas abaixo de 1 MB):
  ibge.inpc_mensal          — INPC, número-índice mensal (SIDRA 1736, var. 2289), Brasil: deflator dos valores em R$ (D1).
  ibge.pib_uf               — PIB a preços correntes (5938, var. 37), Brasil, Grandes Regiões e UFs, 2002–.
  ibge.pnadc_anual_regioes  — PNAD Contínua anual: desocupação (4562), Gini da renda domiciliar per capita (7435),
                              rendimento real domiciliar per capita (7395), analfabetismo 15+ (7113) e nível de
                              instrução 25+ (7269: médio completo e superior completo), cada um com o coeficiente
                              de variação (CV) publicado; sempre a categoria "Total" das demais classificações.
  ibge.projecao_populacao_2024 — arquivo da Projeção da População, revisão 2024, tabela 4 (indicadores implícitos por
                              Brasil, Grande Região e UF, 2000–2070), guardado como baixado em dados/bruto/ibge/.
Cada consulta é registrada no manifesto; a cópia local fica em dados/snapshots/<dataset>/<data>.json.
"""
from __future__ import annotations

import httpx

from labdados.api import salvar_snapshot
from labdados.catalogo import raiz
from labdados.manifesto import registrar_arquivo, registrar_consulta

API = "https://servicodados.ibge.gov.br/api/v3/agregados"
TERRITORIO = "N1[all]|N2[all]|N3[all]"
PROJECAO = "https://ftp.ibge.gov.br/Projecao_da_Populacao/Projecao_da_Populacao_2024/projecoes_2024_tab4_indicadores.xlsx"

# dataset → [(chave, tabela, variável, classificações fixas {classificação: categoria}, localidades)]
CONSULTAS = {
    "ibge.inpc_mensal": [("inpc_indice", "1736", "2289", {}, "N1[all]")],
    "ibge.pib_uf": [("pib_mil_reais", "5938", "37", {}, TERRITORIO)],
    "ibge.pnadc_anual_regioes": [
        ("desocupacao", "4562", "4099", {}, TERRITORIO), ("desocupacao_cv", "4562", "4103", {}, TERRITORIO),
        ("gini", "7435", "10681", {}, TERRITORIO), ("gini_cv", "7435", "10682", {}, TERRITORIO),
        ("renda_real_pc", "7395", "4196", {}, TERRITORIO), ("renda_real_pc_cv", "7395", "4197", {}, TERRITORIO),
        ("analfabetismo_15mais", "7113", "10267", {"2": "6794", "58": "2795"}, TERRITORIO),
        ("analfabetismo_15mais_cv", "7113", "10268", {"2": "6794", "58": "2795"}, TERRITORIO),
        ("medio_completo_25mais", "7269", "10270", {"2": "6794", "1568": "48135"}, TERRITORIO),
        ("medio_completo_25mais_cv", "7269", "10271", {"2": "6794", "1568": "48135"}, TERRITORIO),
        ("superior_completo_25mais", "7269", "10270", {"2": "6794", "1568": "99713"}, TERRITORIO),
        ("superior_completo_25mais_cv", "7269", "10271", {"2": "6794", "1568": "99713"}, TERRITORIO),
    ],
}


def url_consulta(tabela: str, variavel: str, classificacoes: dict[str, str], localidades: str) -> str:
    """Todos os períodos de uma variável, nas localidades pedidas, com as classificações fixas na categoria dada."""
    cls = "|".join(f"{c}[{cat}]" for c, cat in classificacoes.items())
    return (f"{API}/{tabela}/periodos/all/variaveis/{variavel}?localidades={localidades}"
            + (f"&classificacao={cls}" if cls else ""))


def series(resposta: list[dict]) -> tuple[dict[str, dict[str, float | None]], dict[str, dict]]:
    """{"<nível>:<código>": {período: valor}} e {"<nível>:<código>": {nome, nivel}}. A chave leva o nível porque o IBGE
    repete códigos entre níveis (Brasil = N1:1 e Norte = N2:1). Valores não numéricos ('-', '...', 'X') viram None."""
    valores: dict[str, dict[str, float | None]] = {}
    nomes: dict[str, dict] = {}
    for item in resposta:
        for res in item["resultados"]:
            for s in res["series"]:
                loc = s["localidade"]
                chave = f"{loc['nivel']['id']}:{loc['id']}"
                nomes[chave] = {"nome": loc["nome"], "nivel": loc["nivel"]["id"], "codigo": loc["id"]}
                saida = valores.setdefault(chave, {})
                for periodo, bruto in s["serie"].items():
                    try:
                        saida[periodo] = float(bruto)
                    except (TypeError, ValueError):
                        saida[periodo] = None
    return valores, nomes


def consultar(dataset: str, consultas: list, cliente: httpx.Client) -> dict:
    dados = {"fonte": API, "localidades": {}, "consultas": {}}
    for chave, tabela, variavel, cls, locs in consultas:
        url = url_consulta(tabela, variavel, cls, locs)
        r = cliente.get(url)
        r.raise_for_status()
        valores, nomes = series(r.json())
        dados["localidades"].update(nomes)
        registrar_consulta(dataset, url, n_registros=sum(len(v) for v in valores.values()))
        dados["consultas"][chave] = {"tabela": tabela, "variavel": variavel, "classificacoes": cls, "url": url, "valores": valores}
        print(f"{dataset} · {chave}: {len(valores)} localidades")
    return dados


def baixar_projecao(cliente: httpx.Client) -> None:
    destino = raiz() / "dados/bruto/ibge/projecao_populacao_2024" / PROJECAO.rsplit("/", 1)[1]
    destino.parent.mkdir(parents=True, exist_ok=True)
    r = cliente.get(PROJECAO)
    r.raise_for_status()
    destino.write_bytes(r.content)
    registrar_arquivo("ibge.projecao_populacao_2024", PROJECAO, destino)
    print(f"ibge.projecao_populacao_2024: {destino.relative_to(raiz())} ({len(r.content) / 1e6:.1f} MB)")


def main() -> None:
    with httpx.Client(timeout=180, follow_redirects=True) as cliente:
        for dataset, consultas in CONSULTAS.items():
            destino = salvar_snapshot(dataset, consultar(dataset, consultas, cliente), confirmado=True)  # autorizado em 2026-10-12
            print(f"cópia local: {destino.relative_to(raiz())}")
        baixar_projecao(cliente)


if __name__ == "__main__":
    main()
