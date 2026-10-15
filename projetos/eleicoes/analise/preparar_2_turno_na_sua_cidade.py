"""Story "Onde o 2º turno para presidente pode ser decidido em sua cidade?" (2026-10_2-turno-na-sua-cidade).

Promovido de "Onde o 2º turno pode ser decidido em sua cidade" (2026-10_locais-de-votacao, versão 1.2 — L0009), com a
tabela de locais do piloto "votos em disputa" (mesmas funções, mesmas regras). Grava, por município, a tabela longa dos
locais e os dados de cada cartão (L0007: nada é calculado no navegador):

- resumo: % dos válidos de Lula no 1º turno de 2026 e de Lula (PT) em 2022 (EL0010) na cidade, no estado e no
  Brasil — somas dos totais municipais da base do produto de origem (conferida com o TSE);
- série 2018 → 2022 → 2026 em % do eleitorado apto (candidaturas, brancos e nulos, abstenção), igual ao resumo do
  produto de origem; em 2018 e 2022, cada linha é a candidatura do partido (PT: Haddad, Lula; PSL/PL: Jair Bolsonaro — EL0010);
- bairros: soma dos votos em disputa dos locais EM DESTAQUE por bairro, os 10 maiores. Bairro como consta no cadastro
  do TSE, agrupado sem diferença de maiúsculas, acentos e espaços (nenhuma variante juntada à mão); o cartão só aparece
  com 3 ou mais bairros com local em destaque (decisões do pesquisador, 2026-10-11);
- textos com números e as condições de cada cartão (tem_comparaveis, tem_destaque, tem_mapa, tem_bairros).

Uso:  PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_2_turno_na_sua_cidade.py [--so 2211001 ...]
Saídas: <produto>/data/locais/<IBGE>.js, <produto>/data/municipios.json, analise/relatorio_qualidade_2_turno_na_sua_cidade.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(RAIZ / "nucleo"), str(RAIZ)]
from labdados.produto_web import codificar_base  # noqa: E402
from projetos.eleicoes.analise import preparar_votos_em_disputa as vd  # noqa: E402

ORIGEM = vd.ORIGEM
PRODUTO = RAIZ / "projetos/eleicoes/produtos/2026-10_2-turno-na-sua-cidade"
RELATORIO = RAIZ / "projetos/eleicoes/analise/relatorio_qualidade_2_turno_na_sua_cidade.json"
num = vd.num
MIN_BAIRROS = 3
TOP_BAIRROS = 10
# séries do resumo de origem (rótulo, cor = token do produto); brancos e nulos e abstenção tracejados
SERIES = [("lula", "Lula", "cg-lula"), ("flavio", "Flávio Bolsonaro", "cg-flavio"), ("cury", "Augusto Cury", "cg-cury"),
          ("renan", "Renan Santos", "cg-renan"), ("outros", "Outros", "cg-outros")]
NOMES_UF = {"AC": "no Acre", "AL": "em Alagoas", "AM": "no Amazonas", "AP": "no Amapá", "BA": "na Bahia", "CE": "no Ceará",
            "DF": "no Distrito Federal", "ES": "no Espírito Santo", "GO": "em Goiás", "MA": "no Maranhão", "MG": "em Minas Gerais",
            "MS": "em Mato Grosso do Sul", "MT": "em Mato Grosso", "PA": "no Pará", "PB": "na Paraíba", "PE": "em Pernambuco",
            "PI": "no Piauí", "PR": "no Paraná", "RJ": "no Rio de Janeiro", "RN": "no Rio Grande do Norte", "RO": "em Rondônia",
            "RR": "em Roraima", "RS": "no Rio Grande do Sul", "SC": "em Santa Catarina", "SE": "em Sergipe", "SP": "em São Paulo",
            "TO": "no Tocantins"}


def pct(v: float | None) -> str:
    return "—" if v is None else f"{num(v, 1)}%"


def chave_bairro(b: str) -> str:
    """Nome do bairro sem diferença de maiúsculas, acentos e espaços (nada além disso é juntado)."""
    s = unicodedata.normalize("NFKD", b or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def bairros(linhas: list[dict]) -> list[dict]:
    """Soma dos votos em disputa dos locais em destaque por bairro, do maior para o menor (empate: nome).
    Rótulo = a grafia mais frequente do cadastro dentro do grupo."""
    soma, n, grafias = defaultdict(int), Counter(), defaultdict(Counter)
    for l in linhas:
        if not l["destaque"]:
            continue
        k = chave_bairro(l["bairro"]) or "(sem bairro no cadastro)"
        soma[k] += l["disputa"]; n[k] += 1; grafias[k][l["bairro"].strip() or "(sem bairro no cadastro)"] += 1
    return [{"bairro": grafias[k].most_common(1)[0][0], "disputa": soma[k], "locais": n[k]}
            for k in sorted(soma, key=lambda k: (-soma[k], k))]


def totais(ev: dict, ids: list[str]) -> dict[str, dict | None]:
    """Soma dos totais municipais por ano (campos de base.evolucao); None se nenhum município tem o ano."""
    out = {}
    for k, ano in enumerate(ev["anos"]):
        rs = [ev["municipios"][i][k] for i in ids if ev["municipios"].get(i) and ev["municipios"][i][k]]
        out[ano] = dict(zip(ev["campos"], map(sum, zip(*rs)))) if rs else None
    return out


def pct_validos(t: dict | None, g: str = "lula") -> float | None:
    return None if not t or not t["validos"] else 100 * t[g] / t["validos"]


def serie(t_anos: dict, ev: dict) -> dict:
    """Linhas 2018 → 2026 em % do eleitorado apto, como no resumo do produto de origem."""
    anos = ev["anos"]
    p = lambda t, v: None if not t or not t["aptos"] else round(100 * v / t["aptos"], 1)
    S = [{"id": i, "rotulo": r, "cor": c, "valores": [None if i in ev["sem_candidatura"][a] else p(t_anos[a], (t_anos[a] or {}).get(i, 0)) for a in anos]}
         for i, r, c in SERIES]
    S.append({"id": "bn", "rotulo": "Brancos e nulos", "cor": "cor-brancos-nulos", "tracejado": True,
              "valores": [p(t_anos[a], t_anos[a]["aptos"] - t_anos[a]["abstencoes"] - t_anos[a]["validos"]) if t_anos[a] else None for a in anos]})
    S.append({"id": "abst", "rotulo": "Abstenção", "cor": "cor-abstencao", "tracejado": True,
              "valores": [p(t_anos[a], t_anos[a]["abstencoes"]) if t_anos[a] else None for a in anos]})
    return {"anos": anos, "series": S}


def cartoes(nome: str, uf: str, linhas: list[dict], med_y: float | None, res: dict, bs: list[dict]) -> dict:
    """Textos e dados dos cartões do story (marcadores {e.…} do viz.yaml)."""
    n = len(linhas)
    dest = sorted((l for l in linhas if l["destaque"]), key=lambda l: (-l["disputa"], l["id"]))
    n_coord = sum(1 for l in linhas if l["lat"] is not None)
    loc = lambda k: "local" if k == 1 else "locais"
    c26, c22, u26, u22, b26, b22 = (res[k] for k in ("cidade_2026", "cidade_2022", "uf_2026", "uf_2022", "br_2026", "br_2022"))
    bs_ok = len(bs) >= MIN_BAIRROS
    t: dict = {
        "tem_comparaveis": n > 0, "tem_destaque": bool(dest), "tem_mapa": n_coord > 0 and bool(dest), "tem_bairros": bs_ok,
        "capa": f"Os locais de votação de {nome} no 1º turno de 2026, comparados com 2022.",
        "resumo_texto": (f"Lula teve ⟦{pct(c26)}⟧ dos votos válidos em {nome} no 1º turno de 2026."
                         + (f" Em 2022, Lula teve {pct(c22)}." if c22 is not None else "")),
        "resumo_numeros": [{"rotulo": "Lula, 2026", "valor": pct(c26), "cor": "cg-lula"},
                           {"rotulo": "Lula, 2022", "valor": pct(c22), "cor": "cor-texto-secundario"}],
        "resumo_comparacao": f"{(lambda s: s[:1].upper() + s[1:])(NOMES_UF.get(uf, uf))}: {pct(u26)} (em 2022, {pct(u22)}) · no Brasil: {pct(b26)} (em 2022, {pct(b22)})",
        "serie_texto": (f"Como {nome} votou para Presidente no 1º turno, em % do eleitorado apto. Em 2018, a linha de Lula é a "
                        "candidatura do PT (Fernando Haddad) e a de Flávio Bolsonaro, a de Jair Bolsonaro (PSL; em 2022, PL)."),
        "sem_comparaveis": f"Nenhum local de votação de {nome} tem par em 2022 para comparar (EL0009): não há como mostrar onde Lula perdeu espaço.",
    }
    if n:
        t["locais_texto"] = (f"Cada ponto é um dos {num(n)} {loc(n)} de votação de {nome}. À esquerda, onde Lula perdeu espaço desde 2022; "
                             f"no alto, onde há mais votos em disputa: abstenções, brancos e nulos e votos em outras candidaturas.")
        t["destaque_texto"] = (f"Em ⟦{num(len(dest))} de {num(n)}⟧ {loc(n)}, Lula perdeu espaço e os votos em disputa estão na mediana da cidade "
                               f"({num(med_y)} por local) ou acima." if dest else
                               f"Em nenhum dos {num(n)} {loc(n)} Lula perdeu espaço com votos em disputa na mediana da cidade ou acima.")
    if dest:
        m = dest[0]
        t["maior_texto"] = (f"O maior é ⟦{m['local']}⟧{', bairro ' + m['bairro'].title() if m['bairro'] else ''}: {num(m['disputa'])} votos em disputa, "
                            f"e Lula com {vd.num(m['variacao'], 1).replace('-', '−')} pontos desde 2022.")
        t["maior"] = {"alvo": m["id"], "texto": f"{num(m['disputa'])} votos em disputa"}
        dm = sum(1 for l in dest if l["lat"] is not None)
        t["mapa_texto"] = (f"No mapa, os mesmos locais: em cor, os {num(dm)} em destaque" + (f" ({num(len(dest) - dm)} sem coordenada no cadastro)" if dm < len(dest) else "")
                           + ". O tamanho é o número de votos em disputa.")
    if bs_ok:
        b0 = bs[0]
        t["bairros"] = bs[:TOP_BAIRROS]
        t["bairros_texto"] = (f"⟦{b0['bairro'].title()}⟧ reúne {num(b0['locais'])} {loc(b0['locais'])} em destaque e {num(b0['disputa'])} votos em disputa. "
                              f"Os locais em destaque estão em {num(len(bs))} bairros.")
    return t


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--so", nargs="*", help="só estes municípios (IBGE), para teste")
    a = ap.parse_args()
    base = json.loads((ORIGEM / "data/base.json").read_text(encoding="utf-8"))
    ev = base["evolucao"]
    nomes = {m[0]: (m[1], m[2]) for m in base["municipios"]}
    por_uf = defaultdict(list)
    for k, (_, uf) in nomes.items():
        por_uf[uf].append(k)
    t_uf = {uf: totais(ev, ids) for uf, ids in por_uf.items()}
    t_br = totais(ev, list(nomes))
    saida = PRODUTO / "data/locais"
    saida.mkdir(parents=True, exist_ok=True)
    alvos = a.so or sorted(nomes)
    if not a.so:
        for antigo in saida.glob("*.js"):
            antigo.unlink()
    conf, total = {}, 0
    for ibge in alvos:
        nome, uf = nomes[ibge]
        tab, c = vd.municipio(vd.ler_origem(ORIGEM / f"data/locais/{ibge}.js"), nome, uf)
        linhas = [dict(zip(tab["colunas"], r)) for r in tab["linhas"]]
        t_c = totais(ev, [ibge])
        res = {"cidade_2026": pct_validos(t_c["2026"]), "cidade_2022": pct_validos(t_c["2022"]),
               "uf_2026": pct_validos(t_uf[uf]["2026"]), "uf_2022": pct_validos(t_uf[uf]["2022"]),
               "br_2026": pct_validos(t_br["2026"]), "br_2022": pct_validos(t_br["2022"])}
        bs = bairros(linhas)
        tab["textos"] = {**tab["textos"], **cartoes(nome, uf, linhas, tab["med_y"], res, bs), "serie": serie(t_c, ev)}
        texto = f'(window.VIZ_FATIAS = window.VIZ_FATIAS || {{}})["{ibge}"] = "{codificar_base(tab)}";\n'
        (saida / f"{ibge}.js").write_text(texto, encoding="utf-8")
        total += len(texto.encode("utf-8"))
        conf[ibge] = {**c, "bairros_com_destaque": len(bs),
                      "bairros_fecha": sum(b["disputa"] for b in bs) == sum(l["disputa"] for l in linhas if l["destaque"])}
    (PRODUTO / "data/municipios.json").write_text(json.dumps(
        {"colunas": ["ibge", "nome", "uf"], "linhas": [[k, *nomes[k]] for k in sorted(nomes, key=lambda k: (nomes[k][1], nomes[k][0]))],
         "dicionario": vd.COLUNAS, "origem": "2026-10_locais-de-votacao@1.2 (data/locais, data/base.json)", "gerado_em": base["meta"]["gerado_em"]},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rel = {
        "municipios": len(conf), "bytes": total,
        "sem_comparaveis": sorted(k for k, c in conf.items() if not c["comparaveis"]),
        "locais_comparaveis": sum(c["comparaveis"] for c in conf.values()),
        "locais_em_destaque": sum(c["destaque"] for c in conf.values()),
        "com_cartao_de_bairros": sum(1 for c in conf.values() if c["bairros_com_destaque"] >= MIN_BAIRROS),
        "bairros_fecham_com_destaque_em_todos": all(c["bairros_fecha"] for c in conf.values()),
        "brasil_lula_validos": {"2022": round(pct_validos(t_br["2022"]), 2), "2026": round(pct_validos(t_br["2026"]), 2)},
        "teresina": conf.get("2211001"),
    }
    if not a.so:
        RELATORIO.write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: (v if k != "sem_comparaveis" else len(v)) for k, v in rel.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
