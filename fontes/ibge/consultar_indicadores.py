"""Consulta indicadores municipais no IBGE (API de agregados v3 / SIDRA) e salva cópias locais.

    python fontes/ibge/consultar_indicadores.py

Bases (aprovadas pelo pesquisador em 2026-10-07, produto "O mapa da virada"):
  ibge.censo2022_municipios — Censo 2022: população residente total e urbana (tabela 10211, var. 93),
      taxa de alfabetização de 15 anos ou mais (9543, var. 2513) e rendimento nominal médio mensal
      domiciliar per capita (10295, var. 13431); sempre a categoria "Total" das demais classificações.
  ibge.pib_municipios — PIB a preços correntes de 2022 (5938, var. 37), no mesmo ano da população do
      Censo, para o PIB per capita.
Cada consulta é registrada no manifesto; a cópia local fica em dados/snapshots/<dataset>/<data>.json.
"""
from __future__ import annotations

import httpx

from labdados.api import salvar_snapshot
from labdados.manifesto import registrar_consulta

API = "https://servicodados.ibge.gov.br/api/v3/agregados"

# (chave, tabela, período, variável, classificações fixas na categoria indicada)
CONSULTAS_CENSO = [
    ("populacao", "10211", "2022", "93", {"1": "6795", "2661": "32776"}),
    ("populacao_urbana", "10211", "2022", "93", {"1": "1", "2661": "32776"}),
    ("alfabetizacao_15mais", "9543", "2022", "2513", {"2": "6794", "86": "95251", "287": "100362"}),
    ("renda_domiciliar_per_capita", "10295", "2022", "13431", {"2": "6794", "86": "95251", "58": "95253"}),
]
CONSULTAS_PIB = [("pib_mil_reais", "5938", "2022", "37", {})]


def url_consulta(tabela: str, periodo: str, variavel: str, classificacoes: dict[str, str]) -> str:
    """Endereço da consulta por município (N6) na API de agregados do IBGE."""
    cls = "|".join(f"{c}[{cat}]" for c, cat in classificacoes.items())
    return (f"{API}/{tabela}/periodos/{periodo}/variaveis/{variavel}?localidades=N6[all]"
            + (f"&classificacao={cls}" if cls else ""))


def valores_por_municipio(resposta: list[dict], periodo: str) -> dict[str, float | None]:
    """Extrai {código IBGE do município: valor}. Valores não numéricos do IBGE ('-', '...', 'X') viram None."""
    saida: dict[str, float | None] = {}
    for item in resposta:
        for res in item["resultados"]:
            for serie in res["series"]:
                bruto = serie["serie"].get(periodo)
                try:
                    saida[serie["localidade"]["id"]] = float(bruto)
                except (TypeError, ValueError):
                    saida[serie["localidade"]["id"]] = None
    return saida


def consultar(dataset: str, consultas: list) -> dict:
    dados = {"fonte": API, "consultas": {}}
    with httpx.Client(timeout=120, follow_redirects=True) as cliente:
        for chave, tabela, periodo, variavel, cls in consultas:
            url = url_consulta(tabela, periodo, variavel, cls)
            resposta = cliente.get(url)
            resposta.raise_for_status()
            valores = valores_por_municipio(resposta.json(), periodo)
            registrar_consulta(dataset, url, n_registros=len(valores))
            dados["consultas"][chave] = {"tabela": tabela, "periodo": periodo, "variavel": variavel,
                                          "classificacoes": cls, "url": url, "valores": valores}
            print(f"{dataset} · {chave}: {len(valores)} municípios")
    return dados


def main() -> None:
    for dataset, consultas in (("ibge.censo2022_municipios", CONSULTAS_CENSO), ("ibge.pib_municipios", CONSULTAS_PIB)):
        destino = salvar_snapshot(dataset, consultar(dataset, consultas), confirmado=True)  # aprovado em 2026-10-07
        print(f"cópia local: {destino}")


if __name__ == "__main__":
    main()
