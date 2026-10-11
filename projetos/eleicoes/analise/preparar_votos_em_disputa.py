"""Piloto do tipo Visualização: "Onde Lula perdeu espaço e há mais votos em disputa" (2026-10_votos-em-disputa).

Promovido do produto "Onde o 2º turno pode ser decidido em sua cidade" (2026-10_locais-de-votacao, versão 1.1 — L0009).
Lê o recorte publicado desse produto (data/locais/<IBGE>.js: totais por local em 2026 e 2022, turnos de 2022,
coordenadas e contorno, já conferidos com tolerância zero contra o TSE) e grava, por município, a TABELA NO FORMATO
LONGO da Visualização (L0007, L0011: colunas + linhas, só o que a peça usa) e os TEXTOS COM NÚMEROS (marcadores por
estado; nenhum número escrito à mão), além de um relatório de conferência.

Contas (as mesmas do produto de origem, funções testadas em tests/test_eleicoes_locais_mapa_virada.py):
- unidade: local convencional com par em 2022 (EL0009); locais especiais (trânsito, presos, temporários) e sem par ficam fora;
- votos em disputa = abstenções + brancos e nulos + votos nas candidaturas fora da disputa principal (votos_em_disputa);
- variação de Lula = % dos válidos de Lula em 2026 − em 2022 no mesmo local (grupo de 2026 aplicado a 2022, EL0008);
- destaque: variação < 0 e votos em disputa ≥ mediana dos locais da cidade (quantil tipo 7);
- cor: fatia de Lula no ganho somado PT + PL entre o 1º e o 2º turno de 2022 no local (saldo_entre_turnos).

Uso:  PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_votos_em_disputa.py [--so 2211001 ...]
Saídas: <produto>/data/locais/<IBGE>.js (window.VIZ_FATIAS[<IBGE>], lido por lab-viz.js), <produto>/data/municipios.json, analise/relatorio_qualidade_votos_em_disputa.json
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(RAIZ / "nucleo"), str(RAIZ)]
from labdados.produto_web import codificar_base  # noqa: E402
from projetos.eleicoes.analise.preparar_locais_votacao import saldo_entre_turnos, votos_em_disputa  # noqa: E402
from projetos.eleicoes.analise.preparar_mapa_virada import quantil  # noqa: E402

ORIGEM = RAIZ / "projetos/eleicoes/produtos/2026-10_locais-de-votacao"
PRODUTO = RAIZ / "projetos/eleicoes/produtos/2026-10_votos-em-disputa"
RELATORIO = RAIZ / "projetos/eleicoes/analise/relatorio_qualidade_votos_em_disputa.json"
G = "lula"
NOME_G = "Lula"
COLUNAS = {   # dicionário de colunas (L0007): tipo, unidade e descrição; "nulo" diz o que a ausência significa
    "id": {"tipo": "rotulo", "descricao": "zona e número do local de votação em 2026 (zona-local)"},
    "local": {"tipo": "rotulo", "descricao": "nome do local de votação (cadastro do TSE, 2026)"},
    "endereco": {"tipo": "texto", "descricao": "endereço do local (cadastro do TSE, 2026)"},
    "bairro": {"tipo": "texto", "descricao": "bairro do local (cadastro do TSE, 2026)"},
    "lat": {"tipo": "geo", "codigo": "wgs84_lat", "descricao": "latitude do local", "nulo": "sem coordenada no cadastro do TSE"},
    "lon": {"tipo": "geo", "codigo": "wgs84_lon", "descricao": "longitude do local", "nulo": "sem coordenada no cadastro do TSE"},
    "aptos": {"tipo": "medida", "unidade": "eleitores", "descricao": "eleitores aptos no local em 2026"},
    "variacao": {"tipo": "medida", "unidade": "p.p.", "casas": 1,
                 "descricao": "% dos válidos de Lula em 2026 menos % do grupo de Lula em 2022, no mesmo local (EL0008)"},
    "disputa": {"tipo": "medida", "unidade": "votos", "descricao": "abstenções + brancos e nulos + votos nas candidaturas fora da disputa Lula × Flávio Bolsonaro"},
    "abstencoes": {"tipo": "medida", "unidade": "eleitores", "descricao": "eleitores aptos que não votaram em 2026"},
    "brancos_nulos": {"tipo": "medida", "unidade": "votos", "descricao": "votos brancos e nulos em 2026"},
    "outras": {"tipo": "medida", "unidade": "votos", "descricao": "votos nas demais candidaturas em 2026 (sem Lula e Flávio Bolsonaro)"},
    "perdas": {"tipo": "medida", "unidade": "votos", "descricao": "votos que Lula tem a menos que o grupo de Lula em 2022 no local (0 se ganhou)", "nulo": "sem par em 2022"},
    "fatia": {"tipo": "medida", "unidade": "%", "casas": 1, "descricao": "parte de Lula no ganho somado de Lula e Jair Bolsonaro entre o 1º e o 2º turno de 2022",
              "nulo": "sem ganho somado no 2º turno de 2022"},
    "pct_2026": {"tipo": "medida", "unidade": "%", "casas": 1, "descricao": "% dos votos válidos de Lula em 2026"},
    "votos_2026": {"tipo": "medida", "unidade": "votos", "descricao": "votos de Lula em 2026"},
    "destaque": {"tipo": "booleano", "descricao": "variação < 0 e votos em disputa ≥ mediana dos locais da cidade"},
}


def num(v: float, casas: int = 0) -> str:
    """1234.5 → '1.234,5' (pt-BR)."""
    return f"{v:,.{casas}f}".replace(",", "§").replace(".", ",").replace("§", ".")


def ler_origem(arq: Path) -> dict:
    """data/locais/<IBGE>.js do produto de origem → dicionário (gzip + base64 dentro de um script)."""
    t = arq.read_text(encoding="utf-8")
    return json.loads(gzip.decompress(base64.b64decode(re.search(r'"([A-Za-z0-9+/=]{20,})"', t).group(1))))


def linhas_municipio(d: dict) -> list[dict]:
    """Locais convencionais com par em 2022 → uma linha por local, com as contas da peça (ver docstring do módulo)."""
    C, T, TT = d["campos"], d["totais"], d["turnos"]
    saida = []
    for r in d["l"]:
        o = dict(zip(C, r))
        if o["tipo"] != "C" or not o["t2022"]:
            continue
        t26, t22 = dict(zip(T, o["t2026"])), dict(zip(T, o["t2022"]))
        if not t26["validos"] or not t22["validos"]:
            continue
        v = votos_em_disputa(t26, G, t22)
        s = saldo_entre_turnos(dict(zip(TT, o["turnos2022"])), G) if o["turnos2022"] else None
        saida.append({
            "id": f"{o['zona']}-{o['local']}", "local": o["nome"], "endereco": o["endereco"] or "", "bairro": o["bairro"] or "",
            "lat": o["lat"] if o["coord"] == "ok" else None, "lon": o["lon"] if o["coord"] == "ok" else None,
            "aptos": t26["aptos"], "variacao": 100 * t26[G] / t26["validos"] - 100 * t22[G] / t22["validos"],
            "disputa": v["disputa"], "abstencoes": v["abstencoes"], "brancos_nulos": v["brancos_nulos"], "outras": v["outras"],
            "perdas": v["perdas"], "fatia": None if not s else s["fatia"],
            "pct_2026": 100 * t26[G] / t26["validos"], "votos_2026": t26[G]})
    return saida


def textos(linhas: list[dict], med_y: float | None) -> dict:
    """Textos com números da peça (marcadores por estado, L0011): subtítulo, N, referências e anotação."""
    n = len(linhas)
    dest = sorted((l for l in linhas if l["destaque"]), key=lambda l: -l["disputa"])
    n_coord = sum(1 for l in linhas if l["lat"] is not None)
    loc = lambda k: "local" if k == 1 else "locais"
    if not n:
        return {"subtitulo": "Nenhum local de votação desta cidade tem par em 2022 para comparar (EL0009).",
                "amostra_grafico": "N = 0 locais de votação comparáveis", "amostra_mapa": "N = 0 locais de votação comparáveis",
                "ref_y": "", "ref_x": "0 = igual a 2022", "legenda_linhas": "", "anotacao": None, "rotulos": []}
    sub = (f"{num(len(dest))} de {num(n)} {loc(n)} onde {NOME_G} perdeu participação desde 2022 e com votos em disputa "
           f"acima da mediana ({num(med_y)} por local)." if dest else
           f"Em nenhum dos {num(n)} {loc(n)} {NOME_G} perdeu participação desde 2022 com votos em disputa acima da mediana ({num(med_y)} por local).")
    em_cor = f" · em cor, os {num(len(dest))} em destaque" if dest else ""
    return {
        "subtitulo": sub,
        "amostra_grafico": f"N = {num(n)} {loc(n)} de votação{em_cor}",
        "amostra_mapa": (f"N = {num(n_coord)} {loc(n_coord)} de votação no mapa"
                         + (f" ({num(n - n_coord)} sem coordenada)" if n_coord < n else "")
                         + (f" · em cor, os {num(sum(1 for l in dest if l['lat'] is not None))} em destaque" if dest else "")),
        "ref_y": f"mediana: {num(med_y)}", "ref_x": "0 = igual a 2022",
        "legenda_linhas": f"linhas tracejadas: mediana dos votos em disputa ({num(med_y)} por local) e variação zero",
        "anotacao": {"alvo": dest[0]["id"], "texto": f"Maior volume em disputa entre os destacados: {num(dest[0]['disputa'])} votos"} if dest else None,
        "rotulos": [l["id"] for l in dest[:5]],
    }


def municipio(d: dict, nome: str, uf: str) -> tuple[dict, dict]:
    """Tabela longa + textos de um município, e a sua linha de conferência."""
    linhas = linhas_municipio(d)
    med_y = quantil([l["disputa"] for l in linhas], 0.5)
    for l in linhas:
        l["destaque"] = bool(med_y is not None and l["variacao"] < 0 and l["disputa"] >= med_y)
    r = lambda v, c: None if v is None else round(v, c)
    tab = {
        "m": d["m"], "nome": nome, "uf": uf, "contorno": d.get("contorno"), "med_y": med_y,
        "colunas": list(COLUNAS), "linhas": [[l["id"], l["local"], l["endereco"], l["bairro"], r(l["lat"], 5), r(l["lon"], 5),
                                              l["aptos"], r(l["variacao"], 2), l["disputa"], l["abstencoes"], l["brancos_nulos"],
                                              l["outras"], l["perdas"], r(l["fatia"], 1), r(l["pct_2026"], 1), l["votos_2026"],
                                              int(l["destaque"])] for l in linhas],
        "textos": textos(linhas, med_y),
    }
    conf = {"locais_origem": len(d["l"]), "comparaveis": len(linhas), "destaque": sum(l["destaque"] for l in linhas),
            "disputa_fecha": all(l["disputa"] == l["abstencoes"] + l["brancos_nulos"] + l["outras"] for l in linhas),
            "aptos_comparaveis": sum(l["aptos"] for l in linhas)}
    return tab, conf


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--so", nargs="*", help="só estes municípios (IBGE), para teste")
    a = ap.parse_args()
    base = json.loads((ORIGEM / "data/base.json").read_text(encoding="utf-8"))
    nomes = {m[0]: (m[1], m[2]) for m in base["municipios"]}
    saida = PRODUTO / "data/locais"
    saida.mkdir(parents=True, exist_ok=True)
    alvos = a.so or sorted(nomes)
    if not a.so:
        for antigo in saida.glob("*.js"):
            antigo.unlink()
    conf, total = {}, 0
    for ibge in alvos:
        tab, c = municipio(ler_origem(ORIGEM / f"data/locais/{ibge}.js"), *nomes[ibge])
        texto = f'(window.VIZ_FATIAS = window.VIZ_FATIAS || {{}})["{ibge}"] = "{codificar_base(tab)}";\n'
        (saida / f"{ibge}.js").write_text(texto, encoding="utf-8")
        total += len(texto.encode("utf-8"))
        conf[ibge] = c
    (PRODUTO / "data/municipios.json").write_text(json.dumps(
        {"colunas": ["ibge", "nome", "uf"], "linhas": [[k, *nomes[k]] for k in sorted(nomes, key=lambda k: (nomes[k][1], nomes[k][0]))],
         "dicionario": COLUNAS, "origem": "2026-10_locais-de-votacao@1.1 (data/locais)", "gerado_em": base["meta"]["gerado_em"]},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rel = {
        "municipios": len(conf), "bytes": total,
        "sem_comparaveis": sorted(k for k, c in conf.items() if not c["comparaveis"]),
        "locais_comparaveis": sum(c["comparaveis"] for c in conf.values()),
        "locais_em_destaque": sum(c["destaque"] for c in conf.values()),
        "disputa_fecha_em_todos": all(c["disputa_fecha"] for c in conf.values()),
        "teresina": conf.get("2211001"),
    }
    if not a.so:
        RELATORIO.write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: (v if k != "sem_comparaveis" else len(v)) for k, v in rel.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
