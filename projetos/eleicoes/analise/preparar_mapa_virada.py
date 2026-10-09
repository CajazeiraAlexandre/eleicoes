"""Base e página do produto "O mapa da virada" (Brasil, município, 2018–2026).

    PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_mapa_virada.py            # base + página + paridade
    PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_mapa_virada.py --so-html  # só a interface

Regras: EL0008 (conglomerados, federações, linhagem), EL0002 (municípios TSE ⇄ IBGE, adendo nacional),
decisões locais do produto.yaml (Câmara em votos nominais; denominador = Σ partidos; eleição anulada = sem
dado). Tudo é calculado aqui; a página só soma por região, divide, ordena e correlaciona (L0002), com
funções espelhadas em src/nucleo.js e conferidas na página de paridade.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Sequence

import yaml

from labdados.catalogo import raiz
from projetos.eleicoes.analise import validar_mapa_virada as qa

PRODUTO = Path("projetos/eleicoes/produtos/2026-10_mapa-da-virada")
MALHA = Path("dados/bruto/ibge/malha_municipios_2022/BR_Municipios_2022.zip")
TOLERANCIA_MALHA = 0.02          # graus; shapely.coverage_simplify (fronteiras compartilhadas sem buracos)
REGIOES = {"N": "Norte", "NE": "Nordeste", "SE": "Sudeste", "S": "Sul", "CO": "Centro-Oeste"}
REGIAO_DA_UF = {**dict.fromkeys(["AC", "AM", "AP", "PA", "RO", "RR", "TO"], "N"),
                **dict.fromkeys(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"], "NE"),
                **dict.fromkeys(["ES", "MG", "RJ", "SP"], "SE"), **dict.fromkeys(["PR", "RS", "SC"], "S"),
                **dict.fromkeys(["DF", "GO", "MS", "MT"], "CO")}
# capitais (códigos IBGE) — para o filtro capital × interior
CAPITAIS = {"1200401", "2704302", "1600303", "1302603", "2927408", "2304400", "5300108", "3205309", "5208707",
            "2111300", "5103403", "5002704", "3106200", "1501402", "2507507", "4106902", "2611606", "2211001",
            "3304557", "2408102", "4314902", "1100205", "1400100", "4205407", "3550308", "2800308", "1721000"}
PORTES = [(20_000, "até 20 mil"), (100_000, "20 a 100 mil"), (500_000, "100 a 500 mil"), (math.inf, "mais de 500 mil")]

# eleições do produto: (id, ano, cargo, turno, rótulo)
ELEICOES = [
    ("presidente_2018_1", 2018, "presidente", "1", "Presidente · 2018 · 1º turno"),
    ("presidente_2018_2", 2018, "presidente", "2", "Presidente · 2018 · 2º turno"),
    ("presidente_2022_1", 2022, "presidente", "1", "Presidente · 2022 · 1º turno"),
    ("presidente_2022_2", 2022, "presidente", "2", "Presidente · 2022 · 2º turno"),
    ("presidente_2026_1", 2026, "presidente", "1", "Presidente · 2026 · 1º turno"),
    ("senador_2018", 2018, "senador", "1", "Senado · 2018"),
    ("senador_2022", 2022, "senador", "1", "Senado · 2022"),
    ("senador_2026", 2026, "senador", "1", "Senado · 2026"),
    ("dep_federal_2018", 2018, "dep_federal", "1", "Câmara · 2018"),
    ("dep_federal_2022", 2022, "dep_federal", "1", "Câmara · 2022"),
    ("dep_federal_2026", 2026, "dep_federal", "1", "Câmara · 2026"),
    ("prefeito_2020", 2020, "prefeito", "1", "Prefeito · 2020 · 1º turno"),
    ("prefeito_2024", 2024, "prefeito", "1", "Prefeito · 2024 · 1º turno"),
    ("vereador_2020", 2020, "vereador", "1", "Vereador · 2020"),
    ("vereador_2024", 2024, "vereador", "1", "Vereador · 2024"),
]
# de onde vem a abstenção de cada eleição (o eleitor que comparece vota em todos os cargos do dia)
ABSTENCAO_DE = {"presidente": "presidente", "senador": "presidente", "dep_federal": "presidente",
                "prefeito": "prefeito", "vereador": "prefeito"}


# ---------------------------------------------------------------- funções de referência (espelhadas em nucleo.js)

def agregar(valores: Sequence[float | None], grupo: Sequence[int], n: int) -> list[float | None]:
    """Soma valores por grupo (índice 0..n-1; grupo < 0 = fora). Grupo sem nenhum valor = None."""
    soma: list[float | None] = [None] * n
    for v, g in zip(valores, grupo):
        if g < 0 or v is None:
            continue
        soma[g] = (soma[g] or 0) + v
    return soma


def percentual(parte: float | None, total: float | None) -> float | None:
    """100 · parte / total; None se faltar dado ou o total for 0."""
    if parte is None or not total:
        return None
    return 100 * parte / total


def pearson(x: Sequence[float | None], y: Sequence[float | None], peso: Sequence[float] | None = None,
            minimo: int = 3) -> dict:
    """Correlação de Pearson (peso igual ou ponderada). Pares com algum None ficam fora. r = None se n < mínimo
    ou variância nula. Fórmula ponderada: covariância e variâncias com pesos normalizados."""
    pares = [(a, b, 1.0 if peso is None else peso[i]) for i, (a, b) in enumerate(zip(x, y))
             if a is not None and b is not None and (peso is None or (peso[i] or 0) > 0)]
    n = len(pares)
    if n < minimo:
        return {"r": None, "n": n}
    w = sum(p for _, _, p in pares)
    mx = sum(a * p for a, _, p in pares) / w
    my = sum(b * p for _, b, p in pares) / w
    sxy = sum(p * (a - mx) * (b - my) for a, b, p in pares)
    sxx = sum(p * (a - mx) ** 2 for a, _, p in pares)
    syy = sum(p * (b - my) ** 2 for _, b, p in pares)
    if sxx <= 0 or syy <= 0:
        return {"r": None, "n": n}
    return {"r": sxy / math.sqrt(sxx * syy), "n": n}


def quantil(valores: Sequence[float | None], q: float) -> float | None:
    """Quantil por interpolação linear entre os ordenados (tipo 7 de Hyndman e Fan, o padrão do R e do NumPy)."""
    v = sorted(a for a in valores if a is not None)
    if not v:
        return None
    h = (len(v) - 1) * q
    lo = math.floor(h)
    return v[lo] + (h - lo) * (v[min(lo + 1, len(v) - 1)] - v[lo])


def resumo(valores: Sequence[float | None]) -> dict | None:
    """Resumo do boxplot: n, mínimo, quartis (quantil tipo 7), máximo e bigodes de Tukey (o valor observado mais
    extremo dentro de 1,5 × a distância interquartil a partir de cada quartil). None se não houver valores."""
    v = sorted(a for a in valores if a is not None)
    if not v:
        return None
    q1, med, q3 = quantil(v, 0.25), quantil(v, 0.5), quantil(v, 0.75)
    d = 1.5 * (q3 - q1)
    return {"n": len(v), "min": v[0], "q1": q1, "mediana": med, "q3": q3, "max": v[-1],
            "bigode_inf": min(a for a in v if a >= q1 - d), "bigode_sup": max(a for a in v if a <= q3 + d)}


def diferencas(indices: Sequence[int]) -> list[int]:
    """Índices crescentes → primeiro índice e as diferenças entre vizinhos (o gzip comprime bem números pequenos).
    A página desfaz com a soma acumulada (nucleo.js, `indicesDe`)."""
    return [b - a for a, b in zip([0, *indices[:-1]], indices)]


# ---------------------------------------------------------------- leitura

def votos_por_sigla(raiz_lab: Path, ano: int) -> dict[tuple, dict[str, list[int]]]:
    """{(turno, cargo, município TSE): {sigla: [nominais válidos, legenda válidos]}} — arquivo de partidos."""
    out: dict[tuple, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for r in qa.linhas_csv(raiz_lab / qa.BRUTO / f"votacao_partido_munzona/votacao_partido_munzona_{ano}.zip",
                           f"votacao_partido_munzona_{ano}_BRASIL.csv"):
        if not qa.no_escopo(r):
            continue
        v = out[(r["NR_TURNO"], qa.CARGOS[r["DS_CARGO"]], r["CD_MUNICIPIO"].lstrip("0"))][r["SG_PARTIDO"]]
        v[0] += qa.i(r["QT_VOTOS_NOMINAIS_VALIDOS"])
        v[1] += qa.i(r["QT_TOTAL_VOTOS_LEG_VALIDOS"])
    return out


def ler_indicadores(raiz_lab: Path) -> dict[str, dict[str, float | None]]:
    def ultimo(ds):
        return json.loads(sorted((raiz_lab / "dados/snapshots" / ds).glob("*.json"))[-1].read_text(encoding="utf-8"))
    censo, pib, bf = ultimo("ibge.censo2022_municipios"), ultimo("ibge.pib_municipios"), ultimo("mds.bolsa_familia_municipios")
    c = {k: v["valores"] for k, v in censo["consultas"].items()}
    pib_mil = pib["consultas"]["pib_mil_reais"]["valores"]
    pessoas_bf = {str(d["codigo_ibge"]): d.get("qtd_pessoas_beneficiarias_bolsa_familia_i") for d in bf["municipios"]}
    out: dict[str, dict[str, float | None]] = {}
    for m, pop in c["populacao"].items():
        urb = c["populacao_urbana"].get(m)
        out[m] = {"populacao": pop,
                  "urbana": percentual(urb, pop),
                  "alfabetizacao": c["alfabetizacao_15mais"].get(m),
                  "renda_pc": c["renda_domiciliar_per_capita"].get(m),
                  "pib_pc": (1000 * pib_mil[m] / pop) if pib_mil.get(m) is not None and pop else None,
                  "bolsa_familia": percentual(pessoas_bf.get(m[:6]), pop)}
    return out, {"bolsa_familia_mes": bf["anomes"], "pib_ano": "2022", "censo": "2022"}


def regioes_ibge(raiz_lab: Path) -> dict[str, dict]:
    reg = json.loads(sorted((raiz_lab / "dados/snapshots/ibge.municipios_regiao_imediata").glob("*.json"))[-1].read_text(encoding="utf-8"))
    out = {}
    for m in reg:
        im = m["regiao-imediata"]
        out[str(m["id"])] = {"nome": m["nome"], "uf": im["regiao-intermediaria"]["UF"]["sigla"],
                             "imediata": im["nome"], "intermediaria": im["regiao-intermediaria"]["nome"]}
    return out


# ---------------------------------------------------------------- base

def montar_base(raiz_lab: Path) -> dict:
    ref = yaml.safe_load((raiz_lab / qa.REFERENCIA).read_text(encoding="utf-8"))
    ag = qa.Agrupamento(ref)
    congl = list(ref["conglomerados"])
    corr = qa.correspondencia(raiz_lab)
    reg = regioes_ibge(raiz_lab)
    ind, ind_meta = ler_indicadores(raiz_lab)

    # municípios do mapa: ligados ao IBGE e presentes na divisão regional (ordem: UF, nome)
    tse_de = {v[0]: tse for tse, v in corr.items() if v[0] and v[0] in reg}
    ibges = sorted(tse_de, key=lambda c: (reg[c]["uf"], reg[c]["nome"]))
    idx_tse = {tse_de[c]: k for k, c in enumerate(ibges)}
    n = len(ibges)
    nomes_niveis = {nv: sorted({reg[c][nv] for c in ibges}) for nv in ("uf", "imediata", "intermediaria")}
    nomes_niveis["regiao"] = list(REGIOES)
    pos = {nv: {x: k for k, x in enumerate(v)} for nv, v in nomes_niveis.items()}
    municipios = {
        "ibge": ibges, "tse": [tse_de[c] for c in ibges], "nome": [reg[c]["nome"] for c in ibges],
        "uf": [pos["uf"][reg[c]["uf"]] for c in ibges],
        "regiao": [pos["regiao"][REGIAO_DA_UF[reg[c]["uf"]]] for c in ibges],
        "imediata": [pos["imediata"][reg[c]["imediata"]] for c in ibges],
        "intermediaria": [pos["intermediaria"][reg[c]["intermediaria"]] for c in ibges],
        "capital": [1 if c in CAPITAIS else 0 for c in ibges],
        "porte": [next(k for k, (lim, _) in enumerate(PORTES) if (ind.get(c, {}).get("populacao") or 0) <= lim) for c in ibges],
    }
    indicadores = {k: [ind.get(c, {}).get(k) for c in ibges]
                   for k in ("populacao", "urbana", "alfabetizacao", "renda_pc", "pib_pc", "bolsa_familia")}

    # votos por ano
    eleicoes = []
    fontes_ano: dict[int, tuple] = {}
    for ano in (2018, 2020, 2022, 2024):
        fontes_ano[ano] = (votos_por_sigla(raiz_lab, ano), qa.detalhe(raiz_lab, ano))
    p26, o26, coletado = qa.presidente_2026(raiz_lab, ag)
    n26, eleitos26 = qa.estaduais_2026(raiz_lab, ag)

    def vetor_vazio():
        return [None] * n

    for eid, ano, cargo, turno, rotulo in ELEICOES:
        votos = {c: vetor_vazio() for c in congl}
        destaque = {"PT": vetor_vazio(), "PL": vetor_vazio(), "PSL": vetor_vazio()}
        base_validos, aptos, abst = vetor_vazio(), vetor_vazio(), vetor_vazio()
        anuladas = []
        partidos: dict[str, dict] = {}          # sigla da época → votos esparsos por município (popups)
        if ano == 2026:
            if cargo == "presidente":
                siglas = {k[2]: {s: [v, 0] for s, v in c.items()} for k, c in p26.items()}
            else:
                siglas = {k[2]: {s: [v, 0] for s, v in c.items()} for k, c in n26.items() if k[1] == cargo}
            oficial = {k[2]: v for k, v in o26.items()}
        else:
            vs, det = fontes_ano[ano]
            siglas = {k[2]: c for k, c in vs.items() if k[0] == turno and k[1] == cargo}
            oficial = {k[2]: v for k, v in det.items() if k[0] == turno and k[1] == ABSTENCAO_DE[cargo]}
        for tse, k in idx_tse.items():
            s = siglas.get(tse)
            o = oficial.get(tse)
            if o:
                aptos[k], abst[k] = o["aptos"], o["abstencoes"]
            if not s or sum(a + (0 if cargo == "dep_federal" else b) for a, b in s.values()) == 0:
                if o and cargo in ("prefeito", "vereador"):
                    anuladas.append(k)
                continue
            tot = 0
            for c in congl:
                votos[c][k] = 0
            for c in destaque:
                destaque[c][k] = 0
            for sigla, (nom, leg) in s.items():
                v = nom if cargo == "dep_federal" else nom + leg      # Câmara: votos nominais (decisão local)
                tot += v
                votos[ag.conglomerado_de(sigla, ano)][k] += v
                if v:
                    sp = partidos.setdefault(sigla.strip().upper(), {"c": ag.conglomerado_de(sigla, ano), "i": [], "v": []})
                    sp["i"].append(k)
                    sp["v"].append(v)
                p26_ = ag.partido_2026(sigla)
                if p26_ == "PT":
                    destaque["PT"][k] += v
                if p26_ == "PL":
                    destaque["PL"][k] += v
                if sigla.strip().upper() == "PSL":
                    destaque["PSL"][k] += v
            base_validos[k] = tot                                    # denominador = Σ partidos
        eleicoes.append({"id": eid, "ano": ano, "cargo": cargo, "turno": turno, "rotulo": rotulo,
                         "base": "votos nominais" if cargo == "dep_federal" else "votos válidos",
                         "votos": votos, "destaque": destaque, "validos": base_validos, "aptos": aptos,
                         "abstencoes": abst, "anuladas": anuladas,
                         "partidos": {s: {**d, "i": diferencas(d["i"])} for s, d in sorted(partidos.items(), key=lambda kv: -sum(kv[1]["v"]))}})

    # bancadas (eleitos) por conglomerado
    bancadas, bancadas_partidos = {}, {}
    for ano, el in (("2018", qa.eleitos_cadastro(raiz_lab, 2018)), ("2022", qa.eleitos_cadastro(raiz_lab, 2022)), ("2026", eleitos26)):
        for cargo, por_sigla in el.items():
            cont = Counter()
            for s, q in por_sigla.items():
                cont[ag.conglomerado_de(s, int(ano))] += q
            bancadas.setdefault(cargo, {})[ano] = {c: cont.get(c, 0) for c in congl}
            # sigla do eleito (cadastro do TSE) → [cadeiras, conglomerado], para o detalhamento nos popups
            bancadas_partidos.setdefault(cargo, {})[ano] = {s: [q, ag.conglomerado_de(s, int(ano))]
                                                            for s, q in sorted(por_sigla.items(), key=lambda kv: -kv[1]) if q}

    # fora do mapa (sem polígono de 2022): só para a tabela
    fora = []
    for tse in sorted({k[2] for k in o26} - set(idx_tse)):
        o = o26[("1", "presidente", tse)]
        fora.append({"tse": tse, "aptos": o["aptos"], "abstencoes": o["abstencoes"], "validos": o["validos"],
                     "votos": {c: sum(v for s, v in p26[("1", "presidente", tse)].items() if ag.conglomerado_de(s, 2026) == c) for c in congl}})

    return {"schema_version": 1, "municipios": municipios, "niveis": nomes_niveis,
            "nomes_regioes": REGIOES, "portes": [p for _, p in PORTES], "indicadores": indicadores,
            "indicadores_meta": ind_meta,
            "conglomerados": [{"id": c, "nome": ref["conglomerados"][c]["nome"],
                               "agremiacoes": ref["conglomerados"][c]["agremiacoes"]} for c in congl],
            "eleicoes": eleicoes, "bancadas": bancadas, "bancadas_partidos": bancadas_partidos, "fora_do_mapa": fora,
            "meta": {"api_2026_coletada_em": coletado}}


def malha(raiz_lab: Path, base: dict) -> dict:
    """Polígonos simplificados por município e contornos dissolvidos (UF, intermediária, imediata)."""
    import geopandas as gpd
    import shapely

    g = gpd.read_file(f"zip://{raiz_lab / MALHA}")
    pos = {c: k for k, c in enumerate(base["municipios"]["ibge"])}
    g = g[g["CD_MUN"].isin(pos)].copy()
    g["geometry"] = shapely.coverage_simplify(g.geometry.values, tolerance=TOLERANCIA_MALHA, simplify_boundary=True)
    g["id"] = g["CD_MUN"].map(pos)
    for nv in ("uf", "intermediaria", "imediata", "regiao"):
        g[nv] = g["id"].map(lambda k: base["municipios"][nv][k])
    saida = {}
    for nv in ("municipio", "uf", "intermediaria", "imediata", "regiao"):
        camada = g[["id", "geometry"]] if nv == "municipio" else g[[nv, "geometry"]].dissolve(by=nv, as_index=False).rename(columns={nv: "id"})
        # d3-geo (coordenadas esféricas) exige anel externo em sentido horário; o shapely grava anti-horário,
        # e o polígono viraria "o globo menos o município"
        camada = camada.set_geometry(shapely.orient_polygons(camada.geometry.values, exterior_cw=True))
        texto = re.sub(r"(-?\d+\.\d{3})\d+", r"\1", camada.to_json(drop_id=True))
        saida[nv] = json.loads(texto)
    return saida


def _embutir(base: dict) -> str:
    return base64.b64encode(gzip.compress(json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)).decode("ascii")


def gerar_html(raiz_lab: Path, base: dict, dados_b64: str) -> Path:
    from labdados.produto_web import montar_html

    src = raiz_lab / PRODUTO / "src"
    perfil = yaml.safe_load((raiz_lab / "autor/perfil.yaml").read_text(encoding="utf-8"))
    app = (src / "nucleo.js").read_text(encoding="utf-8").replace("export function", "function") + "\n" + (src / "app.js").read_text(encoding="utf-8")
    from labdados import metodologia

    base = {**base, "metodologia": metodologia.montar(raiz_lab, raiz_lab / PRODUTO, gerado_em=base["meta"].get("gerado_em"))}
    html = montar_html(raiz_lab, (src / "index.template.html").read_text(encoding="utf-8"), app_js=app, base=base, produto_dir=raiz_lab / PRODUTO,
                       substituicoes={"__AUTOR__": perfil["nome_curto"],
                                      "__PORTFOLIO__": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "../../../../docs/index.html"})
    destino = raiz_lab / PRODUTO / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--so-html", action="store_true")
    a = ap.parse_args()
    raiz_lab = raiz()
    arquivo = raiz_lab / PRODUTO / "data" / "base_mapa_virada.json.gz"
    if a.so_html:
        base = json.loads(gzip.decompress(arquivo.read_bytes()))
    else:
        base = montar_base(raiz_lab)
        base["malha"] = malha(raiz_lab, base)
        base["meta"]["gerado_em"] = datetime.now().astimezone().isoformat(timespec="seconds")
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        arquivo.write_bytes(gzip.compress(json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9))
    dados = _embutir(base)
    print(f"base: {len(base['municipios']['ibge'])} municípios · {len(base['eleicoes'])} eleições · {len(dados) / 1e6:.1f} MB embutidos")
    if (raiz_lab / PRODUTO / "src" / "nucleo.js").exists():
        print(f"HTML: {gerar_html(raiz_lab, base, dados).relative_to(raiz_lab)}")


if __name__ == "__main__":
    main()
