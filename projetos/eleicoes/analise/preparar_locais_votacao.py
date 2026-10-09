"""Produto "Locais de votação": abstenção e votos para Presidente por local de votação, 1º turno de 2026 × 2022.

Derivado da seção de locais do "Mapa da virada" (mesma ligação seção → local e mesmo par entre eleições, EL0009).
Votos por seção (tse.votacao_secao, _BR) somados por local e por grupo de 2026 (EL0008): Lula, Flávio, Cury, Renan e
Outros (Caiado e demais). Válidos por seção pela regra do EL0003 — 2026: destino `dvt` da API (candidatura ausente da
API = nulo técnico); 2022: `NM_TIPO_DESTINACAO_VOTOS` de votacao_candidato_munzona.

Conferência (tolerância zero), por município: 2026 — válidos = `vv` da API e votos por grupo = Σ `vap`;
2022 — válidos = detalhe município/zona e votos por grupo = base do Mapa da virada (votacao_partido_munzona).

Saídas: <produto>/data/locais/<IBGE>.js (JSON em gzip + base64, um por município), o relatório
analise/relatorio_qualidade_locais_votacao.json e o index.html do produto.

Uso: python -m projetos.eleicoes.analise.preparar_locais_votacao [--so-html]
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import yaml

from labdados.catalogo import raiz
from projetos.eleicoes.analise import preparar_locais_mapa_virada as lv
from projetos.eleicoes.analise import validar_mapa_virada as qa
from projetos.eleicoes.analise.preparar_mapa_virada import PRODUTO as PRODUTO_VIRADA, _embutir, regioes_ibge

PRODUTO = Path("projetos/eleicoes/produtos/2026-10_locais-de-votacao")
SAIDA = PRODUTO / "data" / "locais"
RELATORIO = Path("projetos/eleicoes/analise/relatorio_qualidade_locais_votacao.json")
BLOCOS = [("lula", "Lula"), ("flavio", "Flávio Bolsonaro"), ("cury", "Augusto Cury"), ("renan", "Renan Santos"),
          ("outros", "Outros")]
IDS = [b for b, _ in BLOCOS]
# ordem dos totais de cada local/município: aptos, abstenções, válidos e votos de cada bloco
TOTAIS = ["aptos", "abstencoes", "validos", *IDS]
CAMPOS = ["zona", "local", "nome", "bairro", "endereco", "tipo", "lat", "lon", "coord", "secoes", "par",
          "nome_2022", "distancia_2022_m", "t2026", "t2022", "turnos2022"]
# 1º e 2º turno de 2022 por candidatura (não por grupo: no 1º turno o grupo de Lula soma o PDT de Ciro) — PT × PL
TURNOS = ["aptos_1t", "abstencoes_1t", "validos_1t", "pt_1t", "pl_1t", "aptos_2t", "abstencoes_2t", "validos_2t", "pt_2t", "pl_2t"]


def bloco_de(conglomerado: str | None) -> str:
    """Grupo de 2026 (EL0008) → coluna da tabela: Caiado, demais e sem candidatura vão para "Outros"."""
    return conglomerado if conglomerado in ("lula", "flavio", "cury", "renan") else "outros"


DISPUTA_PRINCIPAL = ("lula", "flavio")


def saldo_entre_turnos(t: dict, grupo: str) -> dict | None:
    """Saldo líquido do 1º para o 2º turno num lugar (2018 ou 2022), por candidatura: PT (perspectiva Lula) × PSL/PL
    (perspectiva Flávio Bolsonaro). t: TURNOS. Conta do lugar, não de pessoas: com o mesmo eleitorado, os ganhos das
    duas candidaturas + a variação de brancos/nulos e de abstenção ≈ os votos das outras candidaturas no 1º turno
    (diferença = variação dos aptos entre os turnos). `fatia` = ganho da candidatura / (ganho PT + ganho PSL/PL),
    None se a soma dos ganhos não for positiva. Outras candidaturas: None (não houve 2º turno com elas)."""
    if grupo not in DISPUTA_PRINCIPAL:
        return None
    g_pt, g_pl = t["pt_2t"] - t["pt_1t"], t["pl_2t"] - t["pl_1t"]
    bn = lambda s: t[f"aptos_{s}"] - t[f"abstencoes_{s}"] - t[f"validos_{s}"]
    proprio = g_pt if grupo == "lula" else g_pl
    return {"outros_1t": t["validos_1t"] - t["pt_1t"] - t["pl_1t"], "ganho_pt": g_pt, "ganho_pl": g_pl,
            "brancos_nulos": bn("2t") - bn("1t"), "abstencoes": t["abstencoes_2t"] - t["abstencoes_1t"],
            "fatia": 100 * proprio / (g_pt + g_pl) if g_pt + g_pl > 0 else None}


def votos_em_disputa(t26: dict, grupo: str, t22: dict | None = None) -> dict:
    """Votos em disputa num local, na perspectiva de `grupo` (mesma conta para qualquer candidatura; Mapa da virada).

    t26/t22: {aptos, abstencoes, validos, lula, flavio, cury, renan, outros}. Devolve:
      abstencoes; brancos_nulos = aptos − abstenções − válidos (inclui anulados);
      outras = votos das candidaturas fora da disputa principal (Lula × Flávio Bolsonaro), sem o próprio grupo;
      disputa = abstencoes + brancos_nulos + outras;
      perdas = votos do grupo em 2022 − em 2026, se positivo (None sem par ou sem candidatura em 2022) —
      componente à parte, fora da soma: pode ser a mesma pessoa que hoje se abstém ou vota em outra candidatura.
    """
    outras = sum(t26[b] for b in IDS if b not in DISPUTA_PRINCIPAL and b != grupo)
    bn = t26["aptos"] - t26["abstencoes"] - t26["validos"]
    perdas = None if t22 is None else max(0, t22[grupo] - t26[grupo])
    return {"abstencoes": t26["abstencoes"], "brancos_nulos": bn, "outras": outras,
            "disputa": t26["abstencoes"] + bn + outras, "perdas": perdas}


def destinos_2026(raiz_lab: Path, ag) -> dict[str, tuple[str, bool]]:
    """Número da candidatura → (bloco, válido?) pela API de 2026 (`dvt`); a mesma em todos os municípios."""
    snap = json.loads((raiz_lab / "dados/snapshots/tse.resultados_2026_1t_presidente_municipios/atual.json").read_text(encoding="utf-8"))
    out: dict[str, tuple[str, bool]] = {}
    for x in snap["resultados"]:
        for agr in x["payload"]["carg"][0]["agr"]:
            for par in agr["par"]:
                for c in par["cand"]:
                    v = (bloco_de(ag.conglomerado_de(par["sg"], 2026)), c.get("dvt") in ("Válido", "Válido (legenda)"))
                    if out.setdefault(c["n"], v) != v:
                        raise SystemExit(f"destino de {c['n']} muda entre municípios na API")
    return out


def destinos_2022(raiz_lab: Path, ag) -> dict[str, tuple[str, bool]]:
    """Número da candidatura → (bloco, válido?) por `NM_TIPO_DESTINACAO_VOTOS` (Presidente, 1º turno, EL0003)."""
    out: dict[str, tuple[str, bool]] = {}
    for r in qa.linhas_csv(raiz_lab / qa.BRUTO / "votacao_candidato_munzona/votacao_candidato_munzona_2022.zip",
                           "votacao_candidato_munzona_2022_BR.csv", "Presidente"):
        if r["DS_CARGO"] != "Presidente" or r["NR_TURNO"] != "1":
            continue
        out[r["NR_CANDIDATO"]] = (bloco_de(ag.conglomerado_de(r["SG_PARTIDO"], 2022)),
                                  r["NM_TIPO_DESTINACAO_VOTOS"] in ("Válido", "Válido (legenda)"))
    return out


def votos_por_local(con, tabela: str, destino: dict[str, tuple[str, bool]], ano: int) -> tuple[dict, Counter]:
    """{(mun, zona, nº do local): Counter(validos, <bloco>…)} e os votos de candidaturas sem destino conhecido.
    2026: local pela seção do cadastro (c26); 2022: pelo detalhe por seção (d22)."""
    junta = ("join c26 l using (mun, zona, secao)" if ano == 2026 else "join d22 l using (mun, zona, secao)")
    linhas = con.sql(f"""select v.mun, v.zona, l.nl, v.nr, sum(v.qt) from {tabela} v {junta} group by all""").fetchall()
    out: dict[tuple, Counter] = defaultdict(Counter)
    fora = Counter()
    for mun, zona, nl, nr, qt in linhas:
        if nr in ("95", "96"):
            continue                       # brancos e nulos
        if nr not in destino:
            fora[nr] += qt                 # 2026: ausente da API = nulo técnico (EL0003)
            continue
        b, valido = destino[nr]
        if valido:
            out[(mun, zona, nl)][b] += qt
            out[(mun, zona, nl)]["validos"] += qt
    return out, fora


def montar(raiz_lab: Path, tmp: Path) -> tuple[dict, dict, list]:
    import duckdb

    con = duckdb.connect()
    l26, l22, rel_lig = lv.ler_secoes(raiz_lab, tmp, con)
    opt = "sep=';', encoding='latin-1', header=true, all_varchar=true"
    for ano in (2026, 2022):
        csv_ = lv._extrair(raiz_lab / lv.BRUTO / f"votacao_secao/votacao_secao_{ano}_BR.zip", [rf"votacao_secao_{ano}_BR\.csv"], tmp)[0]
        con.sql(f"""create table v{ano % 100} as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao,
                    NR_VOTAVEL nr, QT_VOTOS::int qt from read_csv('{csv_}', {opt})
                    where NR_TURNO = '1' and CD_CARGO = '1' and SG_UF <> 'ZZ'""")
        if ano == 2022:
            con.sql(f"""create table v22t2 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao,
                        NR_VOTAVEL nr, QT_VOTOS::int qt from read_csv('{csv_}', {opt})
                        where NR_TURNO = '2' and CD_CARGO = '1' and SG_UF <> 'ZZ'""")
    det22 = tmp / "detalhe_votacao_secao_2022_BRASIL.csv"
    con.sql(f"""create table d22t2 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao,
                QT_APTOS::int aptos, QT_ABSTENCOES::int abst from read_csv('{det22}', {opt})
                where NR_TURNO = '2' and CD_CARGO = '1' and SG_UF <> 'ZZ'""")
    ag = qa.Agrupamento(yaml.safe_load((raiz_lab / qa.REFERENCIA).read_text(encoding="utf-8")))
    vot26, nulo_tecnico = votos_por_local(con, "v26", destinos_2026(raiz_lab, ag), 2026)
    vot22, sem_destino22 = votos_por_local(con, "v22", destinos_2022(raiz_lab, ag), 2022)
    if sem_destino22:
        raise SystemExit(f"2022: candidaturas sem destino em votacao_candidato_munzona: {dict(sem_destino22)}")

    # 1º × 2º turno de 2022 por local (local de cada seção pelo detalhe do 1º turno; 2º turno: candidaturas 13 e 22)
    turnos: dict[tuple, Counter] = defaultdict(Counter)
    for q, campos in (
        ("""select v.mun, v.zona, l.nl, sum(qt) filter (where nr = '13'), sum(qt) filter (where nr = '22') from v22 v join d22 l using (mun, zona, secao) group by all""", ("pt_1t", "pl_1t")),
        ("""select v.mun, v.zona, l.nl, sum(qt) filter (where nr not in ('95', '96')), sum(qt) filter (where nr = '13'), sum(qt) filter (where nr = '22') from v22t2 v join d22 l using (mun, zona, secao) group by all""", ("validos_2t", "pt_2t", "pl_2t")),
        ("""select t.mun, t.zona, l.nl, sum(t.aptos), sum(t.abst) from d22t2 t join d22 l using (mun, zona, secao) group by all""", ("aptos_2t", "abstencoes_2t"))):
        for r in con.sql(q).fetchall():
            turnos[r[:3]].update({c: v or 0 for c, v in zip(campos, r[3:])})
    for m, z, n, _nomes, _coords, a, b in l22:
        turnos[(m, z, n)].update({"aptos_1t": a, "abstencoes_1t": b, "validos_1t": vot22.get((m, z, n), Counter())["validos"]})

    corr = qa.correspondencia(raiz_lab)
    reg = regioes_ibge(raiz_lab)
    malha = lv.ler_malha(raiz_lab)
    ant = {(m, z, n): {"nomes": {lv.normalizar_nome(x) for x in nomes}, "coords": [tuple(c) for c in coords or []],
                       "nome": sorted(nomes)[0], "aptos": a, "abst": b} for m, z, n, nomes, coords, a, b in l22}
    dentro = iter(lv.dentro_do_municipio(malha, [(corr.get(str(r[0]), ("",))[0], r[7], r[8]) for r in l26 if r[7] is not None]))

    def totais(aptos, abst, v: Counter) -> list[int]:
        return [aptos, abst, v["validos"], *(v[b] for b in IDS)]

    por_mun: dict[str, dict] = {}
    cont = Counter()
    for mun, zona, nl, nome, bairro, end, tipo, lat, lon, secoes, aptos, abst, _nn in l26:
        ibge = corr.get(str(mun), ("",))[0]
        coord = "sem" if lat is None else ("ok" if next(dentro) else "fora")
        if not ibge or ibge not in reg:
            continue
        t = lv.TIPOS[tipo]
        a = ant.get((mun, zona, nl))
        par, dist = lv.situacao_par(t, nome, lat, lon, a)
        cont[par] += 1
        comparavel = par in ("nome", "distancia")
        if ibge not in por_mun:
            por_mun[ibge] = {"m": ibge, "tse": str(mun), "contorno": lv.contorno(malha, ibge), "campos": CAMPOS, "totais": TOTAIS, "turnos": TURNOS, "l": []}
        por_mun[ibge]["l"].append([zona, nl, nome.strip(), (bairro or "").strip(), (end or "").strip(), t,
                                   None if lat is None else round(lat, 5), None if lon is None else round(lon, 5), coord, secoes,
                                   par, a["nome"].strip() if comparavel else None, None if dist is None else round(dist),
                                   totais(aptos, abst, vot26.get((mun, zona, nl), Counter())),
                                   totais(a["aptos"], a["abst"], vot22.get((mun, zona, nl), Counter())) if comparavel else None,
                                   [turnos[(mun, zona, nl)][c] for c in TURNOS] if comparavel else None])

    # totais do município (todos os locais de cada eleição, com ou sem par) e conferência
    tse_ibge = {m["tse"]: ibge for ibge, m in por_mun.items()}
    soma = {2026: defaultdict(Counter), 2022: defaultdict(Counter)}
    for ano, ls, vot in ((2026, l26, vot26), (2022, l22, vot22)):
        for r in ls:
            mun, zona, nl = r[0], r[1], r[2]
            aptos, abst = (r[10], r[11]) if ano == 2026 else (r[5], r[6])
            c = soma[ano][str(mun)]
            c["aptos"] += aptos
            c["abstencoes"] += abst
            c.update(vot.get((mun, zona, nl), Counter()))
    for tse, ibge in tse_ibge.items():
        for ano in (2026, 2022):
            c = soma[ano].get(tse, Counter())
            por_mun[ibge][f"t{ano}"] = [c[k] for k in TOTAIS] if c else None

    ofi26 = qa.presidente_2026(raiz_lab, ag)
    ofi26_val = {k[2]: v for k, v in ofi26[1].items()}
    ofi26_bloco: dict[str, Counter] = defaultdict(Counter)
    for k, ps in ofi26[0].items():
        for sg, v in ps.items():
            ofi26_bloco[k[2]][bloco_de(ag.conglomerado_de(sg, 2026))] += v
    ofi22_val = {k[2]: v for k, v in qa.detalhe(raiz_lab, 2022).items() if k[0] == "1" and k[1] == "presidente"}
    base_v = json.loads(gzip.decompress((raiz_lab / PRODUTO_VIRADA / "data/base_mapa_virada.json.gz").read_bytes()))
    e22 = next(e for e in base_v["eleicoes"] if e["id"] == "presidente_2022_1")
    ofi22_bloco = {tse: Counter({b: sum(e22["votos"][g][k] or 0 for g in e22["votos"] if bloco_de(g) == b) for b in IDS})
                   for k, tse in enumerate(base_v["municipios"]["tse"])}

    def conferir(ano, val, bloc):
        divs = []
        for tse, c in soma[ano].items():
            o = Counter({"aptos": val.get(tse, {}).get("aptos", 0), "abstencoes": val.get(tse, {}).get("abstencoes", 0),
                         "validos": val.get(tse, {}).get("validos", 0), **bloc.get(tse, Counter())})
            for k in TOTAIS:
                if tse in bloc or k in ("aptos", "abstencoes", "validos"):
                    if c[k] != o[k]:
                        divs.append({"municipio_tse": tse, "campo": k, "soma_locais": c[k], "oficial": o[k]})
        return {"municipios": len(soma[ano]), "divergencias": len(divs), "amostras": divs[:20],
                "totais": {k: sum(c[k] for c in soma[ano].values()) for k in TOTAIS}}

    # conferência dos turnos de 2022 (tolerância zero): Σ locais por município × base do Mapa da virada e detalhe município/zona
    e22b = next(e for e in base_v["eleicoes"] if e["id"] == "presidente_2022_2")
    det2 = {k[2]: v for k, v in qa.detalhe(raiz_lab, 2022).items() if k[0] == "2" and k[1] == "presidente"}
    st = defaultdict(Counter)
    for (m, _z, _n), c in turnos.items():
        st[str(m)].update(c)
    div_t = []
    for k, tse in enumerate(base_v["municipios"]["tse"]):
        if tse not in st:
            continue
        ofi = {"pt_1t": e22["destaque"]["PT"][k], "pl_1t": e22["destaque"]["PL"][k], "pt_2t": e22b["destaque"]["PT"][k], "pl_2t": e22b["destaque"]["PL"][k],
               "validos_2t": e22b["validos"][k], "aptos_2t": det2.get(tse, {}).get("aptos"), "abstencoes_2t": det2.get(tse, {}).get("abstencoes")}
        for c, o in ofi.items():
            if (o or 0) != st[tse][c]:
                div_t.append({"municipio_tse": tse, "campo": c, "soma_locais": st[tse][c], "oficial": o})

    rel = {
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "decisoes": ["EL0003", "EL0008", "EL0009", "EL0002", "L0001"],
        "ligacao_secao_local": rel_lig,
        "nulo_tecnico_2026": dict(nulo_tecnico),
        "conferencia_2026": conferir(2026, ofi26_val, ofi26_bloco),
        "conferencia_2022": conferir(2022, ofi22_val, ofi22_bloco),
        "conferencia_turnos_2022": {"municipios": len(st), "divergencias": len(div_t), "amostras": div_t[:20]},
        "pareamento": dict(cont),
        "municipios_com_arquivo": len(por_mun),
    }
    municipios = sorted(([c, reg[c]["nome"], reg[c]["uf"]] for c in por_mun), key=lambda x: (x[1], x[2]))
    return por_mun, rel, municipios


def evolucao(raiz_lab: Path) -> dict:
    """Presidente, 1º turno de 2018, 2022 e 2026 por município (base do Mapa da virada, já conferida com os totais
    oficiais): {"anos", "campos", "sem_candidatura", "municipios": {IBGE: [[aptos, abstenções, válidos, blocos…] por ano]}}.
    `sem_candidatura[ano]` = blocos sem nenhum voto no país naquele ano (o grupo não teve candidatura)."""
    base_v = json.loads(gzip.decompress((raiz_lab / PRODUTO_VIRADA / "data/base_mapa_virada.json.gz").read_bytes()))
    es = {e["id"]: e for e in base_v["eleicoes"]}
    anos = ["2018", "2022", "2026"]
    sel = [es[f"presidente_{a}_1"] for a in anos]
    out, sem = {}, {}
    for a, e in zip(anos, sel):
        sem[a] = [b for b in IDS if sum(sum(e["votos"][g][k] or 0 for g in e["votos"] if bloco_de(g) == b) for k in range(len(base_v["municipios"]["ibge"]))) == 0]
    for k, ibge in enumerate(base_v["municipios"]["ibge"]):
        linhas = []
        for e in sel:
            if e["validos"][k] is None:
                linhas.append(None)
                continue
            linhas.append([e["aptos"][k], e["abstencoes"][k], e["validos"][k],
                           *(sum(e["votos"][g][k] or 0 for g in e["votos"] if bloco_de(g) == b) for b in IDS)])
        out[ibge] = linhas
    # 1º × 2º turno por município, por candidatura (PT × PSL em 2018, PT × PL em 2022)
    tur = {}
    for k, ibge in enumerate(base_v["municipios"]["ibge"]):
        ls = []
        for ano, dir_ in (("2018", "PSL"), ("2022", "PL")):
            e1, e2 = es[f"presidente_{ano}_1"], es[f"presidente_{ano}_2"]
            if e1["validos"][k] is None or e2["validos"][k] is None:
                ls.append(None)
                continue
            ls.append([e1["aptos"][k], e1["abstencoes"][k], e1["validos"][k], e1["destaque"]["PT"][k], e1["destaque"][dir_][k],
                       e2["aptos"][k], e2["abstencoes"][k], e2["validos"][k], e2["destaque"]["PT"][k], e2["destaque"][dir_][k]])
        tur[ibge] = ls
    # mesmos campos somados por UF e no Brasil (comparação na aba "Entre turnos"); só municípios com dado nos dois turnos
    ufs = base_v["niveis"]["uf"]
    por_uf: dict[str, list] = {}
    brasil = [[0] * len(TURNOS) for _ in range(2)]
    for k, ibge in enumerate(base_v["municipios"]["ibge"]):
        uf = ufs[base_v["municipios"]["uf"][k]]
        alvo = por_uf.setdefault(uf, [[0] * len(TURNOS) for _ in range(2)])
        for j, t in enumerate(tur[ibge]):
            if t is None:
                continue
            for c in range(len(TURNOS)):
                alvo[j][c] += t[c]
                brasil[j][c] += t[c]
    # quem eram as outras candidaturas no 1º turno (por cidade, as quatro mais votadas fora de PT e PSL/PL)
    nomes = {ano: nomes_presidente(raiz_lab, ano) for ano in ("2018", "2022")}
    outras = {}
    for ano, dir_ in (("2018", "PSL"), ("2022", "PL")):
        e1 = es[f"presidente_{ano}_1"]
        por_mun: dict[int, list] = defaultdict(list)
        for sg, dd in e1["partidos"].items():
            if sg in ("PT", dir_):
                continue
            idx = 0
            for di, v in zip(dd["i"], dd["v"]):
                idx += di
                if v:
                    por_mun[idx].append([nomes[ano].get(sg, sg), sg, v])
        outras[ano] = {base_v["municipios"]["ibge"][k]: sorted(ls, key=lambda x: -x[2])[:4] for k, ls in por_mun.items()}
    return {"anos": anos, "campos": TOTAIS, "sem_candidatura": sem, "municipios": out,
            "turnos": {"anos": ["2018", "2022"], "campos": TURNOS, "municipios": tur, "uf": por_uf, "brasil": brasil,
                       "nome_pt": {a: nomes[a].get("PT") for a in nomes}, "nome_dir": {"2018": nomes["2018"].get("PSL"), "2022": nomes["2022"].get("PL")},
                       "outras": outras}}


def nomes_presidente(raiz_lab: Path, ano: str) -> dict[str, str]:
    """Sigla → nome de urna da candidatura a Presidente (consulta_cand_<ano>_BR; a apta, se houver mais de uma)."""
    out: dict[str, str] = {}
    for r in qa.linhas_csv(raiz_lab / qa.BRUTO / f"candidatos/consulta_cand_{ano}.zip", f"consulta_cand_{ano}_BR.csv", "PRESIDENTE"):
        if r["DS_CARGO"].upper() != "PRESIDENTE":
            continue
        if r["SG_PARTIDO"] not in out or r["DS_SITUACAO_CANDIDATURA"].upper() == "APTO":
            out[r["SG_PARTIDO"]] = r["NM_URNA_CANDIDATO"].title()
    return out


def gravar(raiz_lab: Path, por_mun: dict[str, dict]) -> int:
    pasta = raiz_lab / SAIDA
    pasta.mkdir(parents=True, exist_ok=True)
    for antigo in pasta.glob("*.js"):
        antigo.unlink()
    total = 0
    for ibge, m in por_mun.items():
        texto = f'(window.LOCAIS_PRESIDENTE = window.LOCAIS_PRESIDENTE || {{}})["{ibge}"] = "{_embutir(m)}";\n'
        (pasta / f"{ibge}.js").write_text(texto, encoding="utf-8")
        total += len(texto.encode("utf-8"))
    return total


def gerar_html(raiz_lab: Path, base: dict) -> Path:
    from labdados import metodologia
    from labdados.produto_web import montar_html

    src = raiz_lab / PRODUTO / "src"
    perfil = yaml.safe_load((raiz_lab / "autor/perfil.yaml").read_text(encoding="utf-8"))
    base = {**base, "metodologia": metodologia.montar(raiz_lab, raiz_lab / PRODUTO, gerado_em=base["meta"]["gerado_em"])}
    html = montar_html(raiz_lab, (src / "index.template.html").read_text(encoding="utf-8"), app_js=(src / "app.js").read_text(encoding="utf-8"),
                       base=base, produto_dir=raiz_lab / PRODUTO,
                       substituicoes={"__AUTOR__": perfil["nome_curto"],
                                      "__PORTFOLIO__": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "../../../../docs/index.html"})
    destino = raiz_lab / PRODUTO / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--so-html", action="store_true", help="só remonta o HTML com a base já gerada")
    a = ap.parse_args()
    raiz_lab = raiz()
    arquivo = raiz_lab / PRODUTO / "data" / "base.json"
    if a.so_html:
        base = json.loads(arquivo.read_text(encoding="utf-8"))
        base["evolucao"] = evolucao(raiz_lab)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            por_mun, rel, municipios = montar(raiz_lab, Path(tmp))
        rel["tamanho_total_mb"] = round(gravar(raiz_lab, por_mun) / 1e6, 1)
        (raiz_lab / RELATORIO).write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({k: rel[k] for k in ("nulo_tecnico_2026", "pareamento", "municipios_com_arquivo", "tamanho_total_mb")}, ensure_ascii=False))
        for k in ("conferencia_2026", "conferencia_2022", "conferencia_turnos_2022"):
            print(k, rel[k]["divergencias"], "divergências", rel[k]["amostras"][:3])
        base = {"meta": {"gerado_em": rel["gerado_em"], "eleicao": "Presidente · 1º turno · 2026 × 2022"},
                "blocos": [{"id": b, "nome": n, "sem_2022": rel["conferencia_2022"]["totais"][b] == 0} for b, n in BLOCOS],
                "municipios": municipios, "evolucao": evolucao(raiz_lab)}
        arquivo.write_text(json.dumps(base, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"HTML: {gerar_html(raiz_lab, base).relative_to(raiz_lab)}")


if __name__ == "__main__":
    main()
