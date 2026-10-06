"""Base e indicadores do produto "Forças políticas no Piauí" (2018, 2020, 2022, 2024, 2026).

Produto: projetos/eleicoes/produtos/2026-10_forcas-politicas-pi
Decisões: L0001, L0002, EL0002, EL0003, EL0004 (grupos), EL0005 (indicadores), EL0006 (paleta).

    PYTHONPATH=nucleo:. python projetos/eleicoes/analise/forcas_pi.py

Gera:
  dados/referencia/grupos_politicos_pi.csv                 (tabela partido → grupo por eleição, EL0004)
  projetos/eleicoes/analise/relatorio_qualidade_forcas_pi.json
  projetos/eleicoes/produtos/2026-10_forcas-politicas-pi/data/base_forcas_pi.json.gz

Fontes de votos válidos por partido × município:
  2018–2024  — votacao_partido_munzona: QT_VOTOS_NOMINAIS_VALIDOS + QT_TOTAL_VOTOS_LEG_VALIDOS;
               total do cargo = QT_TOTAL_VOTOS_VALIDOS do detalhe município/zona.
  2026       — votação por seção com destino dos votos (EL0003), porque os arquivos de
               partido e de detalhe municipal de 2026 ainda estão sem linhas; os nominais
               são conferidos contra votacao_candidato_munzona_2026.
Eleitos: votacao_candidato_munzona (2020–2026) ou consulta_cand (2018, só deputados: evita o
arquivo nacional de 395 MB). Prefeito eleito: 1º turno ou, onde houve, 2º turno (Teresina, 2020).
Conferência obrigatória (tolerância zero): Σ partidos = válidos do cargo em cada município.
"""
from __future__ import annotations

import csv
import gzip
import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from labdados.catalogo import raiz
from labdados.manifesto import sha256

from projetos.eleicoes.analise import validar_distribuicao_pi as qa

PRODUTO = Path("projetos/eleicoes/produtos/2026-10_forcas-politicas-pi")
RELATORIO = Path("projetos/eleicoes/analise/relatorio_qualidade_forcas_pi.json")
TABELA_GRUPOS = Path("dados/referencia/grupos_politicos_pi.csv")
TERRITORIOS = Path("dados/referencia/territorios_desenvolvimento_pi.csv")
SNAPSHOT_IBGE = Path("dados/snapshots/ibge.municipios_regiao_imediata")
_B = Path("dados/bruto/tse")

GRUPOS = ("PT", "PSD", "MDB", "PP", "Outros")
FEDERACAO_PT = "PT/PC do B/PV"
FEDERACAO_PP_2026 = "UNIÃO/PP"
# antes das federações (2018, 2020): mesma composição dos grupos de 2022–2026 (revisão do EL0004, 2026-10-06)
SIGLAS_PT_ANTES_2022 = {"PT", "PC do B", "PV"}         # partidos da Federação Brasil da Esperança
SIGLAS_PP_ANTES_2022 = {"PP", "DEM", "PSL"}            # PP + antecessores do União Brasil (DEM + PSL)
ANOS = ("2018", "2020", "2022", "2024", "2026")
ANOS_MUNICIPAIS = ("2020", "2024")
CARGOS = {  # (ano, código) → nome
    ("2018", "7"): "Deputado Estadual", ("2018", "6"): "Deputado Federal",
    ("2020", "13"): "Vereador", ("2020", "11"): "Prefeito",
    ("2022", "7"): "Deputado Estadual", ("2022", "6"): "Deputado Federal",
    ("2024", "13"): "Vereador", ("2024", "11"): "Prefeito",
    ("2026", "7"): "Deputado Estadual", ("2026", "6"): "Deputado Federal",
}
VAGAS_DEPUTADOS_PI = {"7": 30, "6": 10}   # bancadas do PI (Constituição/TSE)
SITUACOES_ELEITO = {"ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA"}
SIGLAS_EQUIVALENTES = {"PCDOB": "PC do B"}
# Lacunas das fontes, registradas por decisão do pesquisador (não preenchidas).
LACUNAS = {
    ("2024", "13", "12670"): (
        "Caraúbas do Piauí, Vereador 2024: detalhe com 4.278 válidos, mas sem linhas de vereador "
        "nos arquivos de partido e candidatura (cópias de 02–03/10/2026); seção soma 4.379. "
        "Mantida como lacuna por decisão do pesquisador em 2026-10-05."),
}


# ---------------------------------------------------------------- EL0004: grupos

def normalizar_sigla(sigla: str) -> str:
    """Unifica grafias da mesma sigla entre arquivos (ex.: PCDOB → PC do B)."""
    s = sigla.strip()
    return SIGLAS_EQUIVALENTES.get(s, s)


def grupo_de(ano: str, sigla: str, federacao: str) -> str:
    """Grupo de um partido numa eleição (EL0004).

    PT = partidos da Federação Brasil da Esperança; PP = PP + União em todas as
    eleições (em 2026, a Federação União Progressista); PSD; MDB; demais = Outros.
    Antes de 2022 (sem federações): PT + PCdoB + PV e PP + DEM + PSL.
    """
    federacao = (federacao or "").strip()
    if int(ano) < 2022:
        if sigla in SIGLAS_PT_ANTES_2022:
            return "PT"
        if sigla in SIGLAS_PP_ANTES_2022:
            return "PP"
    if federacao == FEDERACAO_PT:
        return "PT"
    if federacao == FEDERACAO_PP_2026 or sigla in ("PP", "UNIÃO"):
        return "PP"   # PP + União em todas as eleições (revisão do EL0004, 2026-10-06)
    if sigla in ("PSD", "MDB"):
        return sigla
    return "Outros"


# ---------------------------------------------------------------- leitura por ano

def _membro_pi(zip_path: Path) -> str:
    import zipfile
    with zipfile.ZipFile(zip_path) as z:
        return next(n for n in z.namelist() if n.endswith(f"_{qa.UF}.csv"))


def _ordinaria_1t(r: dict, ano: str) -> bool:
    return r["ANO_ELEICAO"] == ano and r["CD_TIPO_ELEICAO"] == "2" and r["NR_TURNO"] == "1"


def ler_ano_arquivos(raiz_lab: Path, ano: str):
    """2022/2024: votos válidos por partido × município e válidos oficiais do cargo."""
    cargos = {c for (a, c) in CARGOS if a == ano}
    partidos: Counter = Counter()         # (cargo, mun, sigla) → votos válidos
    federacao: dict[str, str] = {}
    zp = raiz_lab / _B / f"votacao_partido_munzona/votacao_partido_munzona_{ano}.zip"
    for r in qa.linhas_uf(zp, _membro_pi(zp)):
        if not _ordinaria_1t(r, ano) or r["CD_CARGO"] not in cargos:
            continue
        sigla = normalizar_sigla(r["SG_PARTIDO"])
        federacao[sigla] = r["SG_FEDERACAO"] if r["SG_FEDERACAO"] not in ("#NULO#", "#NULO", "#NE#") else ""
        partidos[(r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"), sigla)] += (
            qa._int(r["QT_VOTOS_NOMINAIS_VALIDOS"]) + qa._int(r["QT_TOTAL_VOTOS_LEG_VALIDOS"]))
    validos: Counter = Counter()
    zd = raiz_lab / _B / f"detalhe_votacao_munzona/detalhe_votacao_munzona_{ano}.zip"
    for r in qa.linhas_uf(zd, _membro_pi(zd)):
        if _ordinaria_1t(r, ano) and r["CD_CARGO"] in cargos:
            validos[(r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"))] += qa._int(r["QT_TOTAL_VOTOS_VALIDOS"])
    return partidos, validos, federacao, {}


def ler_2026(raiz_lab: Path):
    """2026: votos por seção com destino (EL0003), agregados por partido × município."""
    ano, cargos = "2026", {"6", "7"}
    fontes = qa.FONTES[2026]

    def ler(nome):
        _, caminho, membro = fontes[nome]
        return qa.linhas_uf(raiz_lab / caminho, membro)

    def votacao():
        yield from ler("votacao_secao_uf")
        yield from ler("votacao_secao_br")

    por_secao, por_cand_zona, por_secao_cand, por_secao_leg, _ = qa.somar_votacao_secao(votacao(), 2026)
    destino, _, _, legenda_anulada, _ = qa.ler_api_2026(raiz_lab)
    for chave in {(k[0], sq) for k, sq in por_secao_cand} - set(destino):
        destino[chave] = "Nulo técnico (ausente da API)"
    validos_secao = qa.validos_por_secao(por_secao, por_secao_cand, por_secao_leg, destino, legenda_anulada)

    # partido de cada candidatura e de cada número de legenda (arquivo de candidaturas 2026)
    zc = raiz_lab / _B / "votacao_candidato_munzona/votacao_candidato_munzona_2026.zip"
    sigla_sq, sigla_numero, federacao, nominais_oficiais = {}, {}, {}, Counter()
    for r in qa.linhas_uf(zc, _membro_pi(zc)):
        if not _ordinaria_1t(r, ano) or r["CD_CARGO"] not in cargos:
            continue
        sigla = normalizar_sigla(r["SG_PARTIDO"])
        sigla_sq[r["SQ_CANDIDATO"]] = sigla
        sigla_numero[r["NR_PARTIDO"]] = sigla
        federacao[sigla] = r["SG_FEDERACAO"] if r["SG_FEDERACAO"] not in ("#NULO#", "#NULO", "#NE#") else ""
        nominais_oficiais[(r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"), r["SQ_CANDIDATO"])] += qa._int(r["QT_VOTOS_NOMINAIS"])

    partidos: Counter = Counter()
    sem_partido = Counter()
    for ((t, c, mun, _z, _s), sq), v in por_secao_cand.items():
        if c in cargos and destino[(t, sq)] in qa.DESTINOS_VALIDOS:
            if sq not in sigla_sq:
                sem_partido[sq] += v
                continue
            partidos[(c, mun, sigla_sq[sq])] += v
    for ((t, c, mun, _z, _s), numero), v in por_secao_leg.items():
        if c in cargos and (t, c, numero) not in legenda_anulada:
            if numero not in sigla_numero:
                sem_partido[f"legenda {numero}"] += v
                continue
            partidos[(c, mun, sigla_numero[numero])] += v
    validos: Counter = Counter()
    for (t, c, mun, _z, _s), v in validos_secao.items():
        if c in cargos:
            validos[(c, mun)] += v

    # conferência: nominais por candidatura × município (seções × arquivo oficial)
    nominais_secao: Counter = Counter()
    for (t, c, mun, _z, sq), v in por_cand_zona.items():
        if c in cargos:
            nominais_secao[(c, mun, sq)] += v
    # candidaturas ausentes do arquivo oficial: devem ser exatamente as de nulo técnico (EL0003)
    sq_oficiais = {k[2] for k in nominais_oficiais}
    ausentes = {k[2] for k in nominais_secao} - sq_oficiais
    nulos_tecnicos = {sq for (t, sq), d in destino.items() if d.startswith("Nulo técnico")}
    chaves = {k for k in set(nominais_secao) | set(nominais_oficiais) if k[2] not in ausentes}
    dif = sorted(k for k in chaves if nominais_secao.get(k, 0) != nominais_oficiais.get(k, 0))
    if ausentes - nulos_tecnicos:
        dif += [("ausente_do_munzona_sem_ser_nulo_tecnico", "", sq) for sq in sorted(ausentes - nulos_tecnicos)]
    extra = {"conferencia_nominais_secao_x_munzona_2026": {
        "candidaturas_ausentes_do_munzona": sorted(ausentes),
        "ausentes_iguais_aos_nulos_tecnicos": ausentes == nulos_tecnicos & {k[2] for k in nominais_secao},
        "chaves": len(chaves), "divergencias": len(dif),
        "amostras": [{"chave": list(k), "secoes": nominais_secao.get(k, 0), "munzona": nominais_oficiais.get(k, 0)} for k in dif[:10]]},
        "votos_validos_sem_partido_identificado": dict(sem_partido)}
    return partidos, validos, federacao, extra


def ler_eleitos(raiz_lab: Path, ano: str):
    """Candidaturas eleitas (ordinária) com partido e município (prefeitos/vereadores).

    Deputados e vereadores: 1º turno. Prefeito: eleito no 1º turno ou no 2º turno, onde houve;
    onde a ordinária não elegeu ninguém (votos do mais votado anulados), o eleito na eleição
    extraordinária do mesmo ano (decisão do pesquisador, 2026-10-06; Juazeiro do Piauí e
    Murici dos Portelas em 2020). Os votos dos indicadores continuam sendo os da ordinária.
    2018 (só deputados): arquivo de candidaturas (consulta_cand), sem município.
    """
    cargos = {c for (a, c) in CARGOS if a == ano}
    if ano == "2018":
        zc = raiz_lab / _B / f"candidatos/consulta_cand_{ano}.zip"
    else:
        zc = raiz_lab / _B / f"votacao_candidato_munzona/votacao_candidato_munzona_{ano}.zip"
    def vale(r):
        if r["ANO_ELEICAO"] != ano or r["CD_TIPO_ELEICAO"] != "2" or r["CD_CARGO"] not in cargos:
            return False
        return r["NR_TURNO"] == "1" or (r["NR_TURNO"] == "2" and r["CD_CARGO"] == "11")
    def registro(r, extraordinaria=False):
        return {"cargo": r["CD_CARGO"], "municipio": r.get("CD_MUNICIPIO", "").lstrip("0"), "turno": r["NR_TURNO"],
                "sigla": normalizar_sigla(r["SG_PARTIDO"]),
                "federacao": r["SG_FEDERACAO"] if r["SG_FEDERACAO"] not in ("#NULO#", "#NULO", "#NE#") else "",
                "nome_urna": r["NM_URNA_CANDIDATO"], "situacao": r["DS_SIT_TOT_TURNO"], "extraordinaria": extraordinaria}
    eleitos, extra_pref = {}, {}
    for r in qa.linhas_uf(zc, _membro_pi(zc)):
        if r["DS_SIT_TOT_TURNO"] not in SITUACOES_ELEITO:
            continue
        if vale(r):
            eleitos[r["SQ_CANDIDATO"]] = registro(r)
        elif (r["ANO_ELEICAO"] == ano and r["CD_TIPO_ELEICAO"] == "1" and r["CD_CARGO"] == "11" and "11" in cargos):
            extra_pref[r["SQ_CANDIDATO"]] = registro(r, extraordinaria=True)
    com_prefeito = {e["municipio"] for e in eleitos.values() if e["cargo"] == "11"}
    for sq, e in extra_pref.items():
        if e["municipio"] not in com_prefeito:
            eleitos[sq] = e
    return eleitos


# ---------------------------------------------------------------- territórios

def ler_territorios(raiz_lab: Path) -> dict[str, dict]:
    """Município TSE → {ibge, nome, imediata, intermediaria, territorio} (L0001 + EL0002)."""
    corr = qa.ler_correspondencia(raiz_lab)                      # tse → ibge
    snapshot = sorted((raiz_lab / SNAPSHOT_IBGE).glob("*.json"))[-1]
    ibge = {str(m["id"]): m for m in json.loads(snapshot.read_text(encoding="utf-8"))}
    with (raiz_lab / TERRITORIOS).open(encoding="utf-8") as f:
        td = {r["cd_municipio_ibge"]: r["territorio"] for r in csv.DictReader(f)}
    saida = {}
    for tse, cod in corr.items():
        m = ibge[cod]
        imed = m["regiao-imediata"]
        saida[tse] = {"tse": tse, "ibge": cod, "nome": m["nome"],
                      "imediata": imed["nome"], "intermediaria": imed["regiao-intermediaria"]["nome"],
                      "territorio": td[cod]}
    return saida


# ---------------------------------------------------------------- EL0005: indicadores (funções de referência)

def participacao(votos: float, validos: float) -> float | None:
    """I1 — % dos válidos; None sem válidos."""
    return 100.0 * votos / validos if validos > 0 else None


def lider(votos_partido: dict[str, float], grupo_partido: dict[str, str],
          votos_grupo: dict[str, float], validos: float) -> dict | None:
    """I5/I6 — grupo líder da unidade, intensidade e margem (EL0005, regra revista em 2026-10-05).

    Líder = grupo com mais votos somados entre os elegíveis: os quatro grupos
    nomeados sempre; "Outros" só quando o partido mais votado da unidade é de
    fora deles (o agregado não "lidera" por somar partidos pequenos).
    Intensidade = % dos válidos do grupo líder; margem = p.p. sobre o 2º elegível.
    Empate no topo → {"grupo": "empate"}.
    """
    if not votos_partido or validos <= 0:
        return None
    partido_top = max(votos_partido.items(), key=lambda kv: kv[1])[0]
    elegiveis = [g for g in votos_grupo if g != "Outros"]
    if grupo_partido[partido_top] == "Outros":
        elegiveis.append("Outros")
    ordem = sorted(((votos_grupo.get(g, 0), g) for g in elegiveis), reverse=True)
    if len(ordem) > 1 and ordem[0][0] == ordem[1][0]:
        return {"partido_mais_votado": partido_top, "grupo": "empate", "intensidade": None, "margem": 0.0}
    v1, g1 = ordem[0]
    v2 = ordem[1][0] if len(ordem) > 1 else 0
    return {"partido_mais_votado": partido_top, "grupo": g1,
            "intensidade": 100.0 * v1 / validos, "margem": 100.0 * (v1 - v2) / validos}


def resumo_boxplot(valores: list[float]) -> dict | None:
    """Resumo de cinco números + bigodes de Tukey (EL0005, I6 — intensidade da liderança).

    Quartis pelo método linear (interpolação entre posições ordenadas; igual ao
    numpy padrão e ao d3.quantile). Bigodes: até 1,5 × IIQ além dos quartis,
    limitados ao menor/maior valor observado dentro desse alcance (Tukey, 1977).
    """
    v = sorted(x for x in valores if x is not None)
    n = len(v)
    if n == 0:
        return None

    def quantil(q: float) -> float:
        pos = (n - 1) * q
        i = math.floor(pos)
        return v[i] + (v[min(i + 1, n - 1)] - v[i]) * (pos - i)

    q1, med, q3 = quantil(0.25), quantil(0.5), quantil(0.75)
    iiq = q3 - q1
    inf = min(x for x in v if x >= q1 - 1.5 * iiq)
    sup = max(x for x in v if x <= q3 + 1.5 * iiq)
    return {"n": n, "min": v[0], "q1": q1, "mediana": med, "q3": q3, "max": v[-1],
            "bigode_inf": inf, "bigode_sup": sup,
            "discrepantes": sum(1 for x in v if x < inf or x > sup)}


def pearson(x: list[float | None], y: list[float | None]) -> dict:
    pares = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    n = len(pares)
    if n < 3:
        return {"r": None, "n": n}
    mx = sum(a for a, _ in pares) / n
    my = sum(b for _, b in pares) / n
    sxy = sum((a - mx) * (b - my) for a, b in pares)
    sxx = sum((a - mx) ** 2 for a, _ in pares)
    syy = sum((b - my) ** 2 for _, b in pares)
    if sxx == 0 or syy == 0:
        return {"r": None, "n": n}
    return {"r": sxy / math.sqrt(sxx * syy), "n": n}


# ---------------------------------------------------------------- montagem

def montar(raiz_lab: Path) -> tuple[dict, dict]:
    terr = ler_territorios(raiz_lab)
    relatorio: dict = {"gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
                       "escopo": "PI; eleição ordinária, 1º turno; cargos do briefing (EL0004/EL0005)",
                       "anos": {}}
    linhas_grupos, eleicoes = [], {}
    for ano in ANOS:
        partidos, validos, federacao, extra = ler_2026(raiz_lab) if ano == "2026" else ler_ano_arquivos(raiz_lab, ano)
        eleitos = ler_eleitos(raiz_lab, ano)
        for e in eleitos.values():
            federacao.setdefault(e["sigla"], e["federacao"])
        siglas = sorted({k[2] for k in partidos} | {e["sigla"] for e in eleitos.values()})
        grupo_partido = {s: grupo_de(ano, s, federacao.get(s, "")) for s in siglas}
        for s in siglas:
            linhas_grupos.append({"ano": ano, "sg_partido": s, "sg_federacao": federacao.get(s, ""),
                                  "grupo": grupo_partido[s]})

        # lacunas registradas: retiradas dos votos e dos válidos (não entram nos indicadores)
        lacunas = {(c, m): motivo for (a_, c, m), motivo in LACUNAS.items() if a_ == ano}
        for chave in lacunas:
            validos.pop(chave, None)
        partidos = Counter({k: v for k, v in partidos.items() if (k[0], k[1]) not in lacunas})
        eleitos = {sq: e for sq, e in eleitos.items() if (e["cargo"], e["municipio"]) not in lacunas}

        # conferências (tolerância zero)
        soma = Counter()
        for (c, mun, s), v in partidos.items():
            soma[(c, mun)] += v
        chaves = set(soma) | set(validos)
        dif = sorted(k for k in chaves if soma.get(k, 0) != validos.get(k, 0))
        muns = {mun for (_, mun) in validos} | {m for (_, m) in lacunas}
        sem_territorio = sorted(muns - set(terr))
        r_ano = {"conferencia_partidos_x_validos": {"chaves_cargo_municipio": len(chaves), "divergencias": len(dif),
                 "amostras": [{"chave": list(k), "soma_partidos": soma.get(k, 0), "validos": validos.get(k, 0)} for k in dif[:10]]},
                 "municipios": len(muns), "municipios_sem_territorio": sem_territorio,
                 "lacunas_registradas": [{"cargo": CARGOS[(ano, c)], "municipio": m, "motivo": t} for (c, m), t in lacunas.items()],
                 "validos_por_cargo": {CARGOS[(ano, c)]: sum(v for (cc, _), v in validos.items() if cc == c)
                                       for c in sorted({c for c, _ in validos})}, **extra}
        # eleitos
        por_cargo = Counter(e["cargo"] for e in eleitos.values())
        r_ano["eleitos_por_cargo"] = {CARGOS[(ano, c)]: n for c, n in por_cargo.items()}
        if ano in ANOS_MUNICIPAIS:
            prefeitos_mun = Counter(e["municipio"] for e in eleitos.values() if e["cargo"] == "11")
            r_ano["prefeitos"] = {"municipios_com_prefeito_eleito": len(prefeitos_mun),
                                  "municipios_com_mais_de_um": [m for m, n in prefeitos_mun.items() if n > 1],
                                  "municipios_sem_prefeito_eleito": sorted(muns - set(prefeitos_mun)),
                                  "eleitos_no_2o_turno": sorted(e["municipio"] for e in eleitos.values() if e["cargo"] == "11" and e["turno"] == "2"),
                                  "eleitos_em_eleicao_extraordinaria": sorted(e["municipio"] for e in eleitos.values() if e["cargo"] == "11" and e.get("extraordinaria"))}
        else:
            r_ano["deputados_vs_bancada"] = {CARGOS[(ano, c)]: {"eleitos": por_cargo.get(c, 0), "bancada": VAGAS_DEPUTADOS_PI[c]}
                                             for c in ("7", "6")}
        r_ano["partidos_por_grupo"] = {g: sorted(s for s in siglas if grupo_partido[s] == g) for g in GRUPOS}
        relatorio["anos"][ano] = r_ano
        eleicoes[ano] = {"partidos": partidos, "validos": validos, "grupo_partido": grupo_partido,
                         "eleitos": eleitos, "lacunas": lacunas}

    # status
    ok = all(r["conferencia_partidos_x_validos"]["divergencias"] == 0 and not r["municipios_sem_territorio"]
             for r in relatorio["anos"].values())
    ok = ok and relatorio["anos"]["2026"]["conferencia_nominais_secao_x_munzona_2026"]["divergencias"] == 0
    ok = ok and not relatorio["anos"]["2026"]["votos_validos_sem_partido_identificado"]
    ok = ok and all(v["eleitos"] == v["bancada"] for a in ANOS if a not in ANOS_MUNICIPAIS
                    for v in relatorio["anos"][a]["deputados_vs_bancada"].values())
    for a in ANOS_MUNICIPAIS:
        pm = relatorio["anos"][a]["prefeitos"]
        ok = ok and pm["municipios_com_prefeito_eleito"] == 224 and not pm["municipios_com_mais_de_um"]
    relatorio["status_automatizado"] = "sem divergências" if ok else "requer investigação"
    return {"territorios": terr, "eleicoes": eleicoes}, relatorio, linhas_grupos


# ---------------------------------------------------------------- base do produto (EL0005)

NIVEIS = ("municipio", "imediata", "intermediaria", "territorio", "estado")


def _unidade(terr: dict, mun: str, nivel: str) -> str:
    return "Piauí" if nivel == "estado" else (mun if nivel == "municipio" else terr[mun][nivel])


def forca_por_nivel(partidos: Counter, validos: Counter, grupo_partido: dict, terr: dict, cargo: str,
                    sem_candidatos: Iterable[str] = ()) -> dict:
    """I1 + I5/I6 por nível: soma votos e válidos por unidade antes de dividir.

    Grupo sem candidatos no cargo tem participação indefinida (None), não 0% (EL0005).
    """
    sem_candidatos = set(sem_candidatos)
    saida = {}
    for nivel in NIVEIS:
        vp, vg, t = defaultdict(Counter), defaultdict(Counter), Counter()
        for (c, mun), v in validos.items():
            if c == cargo:
                t[_unidade(terr, mun, nivel)] += v
        for (c, mun, sigla), v in partidos.items():
            if c == cargo:
                u = _unidade(terr, mun, nivel)
                vp[u][sigla] += v
                vg[u][grupo_partido[sigla]] += v
        unidades = {}
        for u in sorted(t):
            grupos = {g: vg[u].get(g, 0) for g in GRUPOS}
            unidades[u] = {"validos": t[u], "votos_grupo": grupos,
                           "pct_grupo": {g: (None if g in sem_candidatos else participacao(v, t[u]))
                                         for g, v in grupos.items()},
                           "lider": lider(dict(vp[u]), grupo_partido, grupos, t[u]),
                           "partidos": dict(sorted(vp[u].items(), key=lambda kv: -kv[1]))}
        saida[nivel] = unidades
    return saida


def montar_base(dados: dict, relatorio: dict) -> dict:
    terr, el = dados["territorios"], dados["eleicoes"]
    sem_candidatos = {}   # (ano, cargo) → grupos sem nenhum partido com voto no cargo
    base = {"schema_version": 1, "grupos": list(GRUPOS), "niveis": list(NIVEIS),
            "municipios": sorted(terr.values(), key=lambda m: m["nome"]), "eleicoes": {}}
    for ano, d in el.items():
        cargos = {}
        for (a, c), nome in CARGOS.items():
            if a != ano:
                continue
            com_voto = {d["grupo_partido"][s] for (cc, _, s), v in d["partidos"].items() if cc == c and v > 0}
            sem_candidatos[(ano, c)] = [g for g in GRUPOS if g not in com_voto]
            cargos[c] = {"nome": nome, "grupos_sem_candidatos": sem_candidatos[(ano, c)],
                         "forca": forca_por_nivel(d["partidos"], d["validos"], d["grupo_partido"], terr, c,
                                                  sem_candidatos[(ano, c)])}
            # I2: cadeiras
            eleitos = [e for e in d["eleitos"].values() if e["cargo"] == c]
            cad = Counter(d["grupo_partido"][e["sigla"]] for e in eleitos)
            cargos[c]["eleitos_estado"] = {g: cad.get(g, 0) for g in GRUPOS}
            if c in ("13", "11"):   # vereadores e prefeitos: por município
                por_mun = defaultdict(Counter)
                for e in eleitos:
                    por_mun[e["municipio"]][d["grupo_partido"][e["sigla"]]] += 1
                cargos[c]["eleitos_municipio"] = {m: dict(v) for m, v in por_mun.items()}
            if c == "11":           # I3: grupo e partido do prefeito eleito
                cargos[c]["prefeito"] = {e["municipio"]: {"grupo": d["grupo_partido"][e["sigla"]], "partido": e["sigla"],
                                                          "nome_urna": e["nome_urna"]} for e in eleitos}
        base["eleicoes"][ano] = {"cargos": cargos, "grupo_partido": d["grupo_partido"],
                                 "lacunas": [{"cargo": CARGOS[(ano, c)], "municipio": m, "motivo": t}
                                             for (c, m), t in d["lacunas"].items()]}

    # I4: coesão (mesma eleição: Dep. Estadual × Dep. Federal) e leitura complementar Vereador 2024 × DE 2026
    def pct(ano, cargo, nivel, u, g):
        unid = base["eleicoes"][ano]["cargos"][cargo]["forca"][nivel].get(u)
        if unid is None or g in base["eleicoes"][ano]["cargos"][cargo]["grupos_sem_candidatos"]:
            return None
        return unid["pct_grupo"][g]
    coesao = {}
    for (rotulo, (a1, c1), (a2, c2)) in (("2018", ("2018", "7"), ("2018", "6")),
                                         ("2022", ("2022", "7"), ("2022", "6")), ("2026", ("2026", "7"), ("2026", "6")),
                                         ("estadual_2018_x_2022", ("2018", "7"), ("2022", "7")),
                                         ("federal_2018_x_2022", ("2018", "6"), ("2022", "6")),
                                         ("vereador2020_x_vereador2024", ("2020", "13"), ("2024", "13")),
                                         ("prefeito2020_x_prefeito2024", ("2020", "11"), ("2024", "11")),
                                         ("estadual_2018_x_2026", ("2018", "7"), ("2026", "7")),
                                         ("federal_2018_x_2026", ("2018", "6"), ("2026", "6")),
                                         ("vereador2024_x_estadual2026", ("2024", "13"), ("2026", "7")),
                                         ("estadual_2022_x_2026", ("2022", "7"), ("2026", "7")),
                                         ("federal_2022_x_2026", ("2022", "6"), ("2026", "6"))):
        por_nivel, variacao, variacao_votos = {}, {}, {}
        for nivel in NIVEIS:
            unidades = sorted(set(base["eleicoes"][a1]["cargos"][c1]["forca"][nivel]) & set(base["eleicoes"][a2]["cargos"][c2]["forca"][nivel]))
            por_nivel[nivel] = {u: {g: (None if pct(a1, c1, nivel, u, g) is None or pct(a2, c2, nivel, u, g) is None
                                        else abs(pct(a1, c1, nivel, u, g) - pct(a2, c2, nivel, u, g))) for g in GRUPOS}
                                for u in unidades}
            # variação em votos absolutos (2º − 1º), mesma regra de indefinição
            def votos(ano, cargo, nivel, u, g):
                unid = base["eleicoes"][ano]["cargos"][cargo]["forca"][nivel].get(u)
                if unid is None or g in base["eleicoes"][ano]["cargos"][cargo]["grupos_sem_candidatos"]:
                    return None
                return unid["votos_grupo"][g]
            variacao_votos[nivel] = {u: {g: (None if votos(a1, c1, nivel, u, g) is None or votos(a2, c2, nivel, u, g) is None
                                             else votos(a2, c2, nivel, u, g) - votos(a1, c1, nivel, u, g)) for g in GRUPOS}
                                     for u in unidades}
            # variação com sinal (2º − 1º): no tempo, positivo = ampliação, negativo = redução
            variacao[nivel] = {u: {g: (None if pct(a1, c1, nivel, u, g) is None or pct(a2, c2, nivel, u, g) is None
                                       else pct(a2, c2, nivel, u, g) - pct(a1, c1, nivel, u, g)) for g in GRUPOS}
                               for u in unidades}
        muns = sorted(set(base["eleicoes"][a1]["cargos"][c1]["forca"]["municipio"]) & set(base["eleicoes"][a2]["cargos"][c2]["forca"]["municipio"]))
        correl = {g: pearson([pct(a1, c1, "municipio", m, g) for m in muns], [pct(a2, c2, "municipio", m, g) for m in muns]) for g in GRUPOS}
        coesao[rotulo] = {"cargos": [f"{CARGOS[(a1, c1)]} {a1}", f"{CARGOS[(a2, c2)]} {a2}"],
                          "chaves": [[a1, c1], [a2, c2]],
                          "tipo": "entre_cargos" if a1 == a2 else ("mesmo_cargo_no_tempo" if c1 == c2 else "cargos_e_eleicoes_diferentes"),
                          "mesma_eleicao": a1 == a2, "diferenca_pp": por_nivel, "variacao_pp": variacao, "variacao_votos": variacao_votos, "pearson_municipios": correl}
    base["coesao"] = coesao

    # I5: sequências de liderança por município e fluxos do Sankey
    def lider_mun(ano, cargo, mun):
        if cargo == "11":
            p = base["eleicoes"][ano]["cargos"]["11"]["prefeito"].get(mun)
            return p["grupo"] if p else "sem dados"
        u = base["eleicoes"][ano]["cargos"][cargo]["forca"]["municipio"].get(mun)
        return u["lider"]["grupo"] if u and u["lider"] else "sem dados"
    # cadeias de liderança por município (fluxos, I5): eleições gerais do cargo, intercaladas (ou não) com a
    # etapa municipal (prefeito eleito ou grupo mais votado para vereador). Início em 2022 (chave "<cargo>_<etapa>")
    # ou em 2018 ("<cargo>_<etapa>_2018"); só municipais, 2020 → 2024 ("mun_<cargo municipal>").
    # Peso único: votos válidos do cargo da última etapa no município (2026; nas municipais, 2024).
    def cadeia(cargo: str, etapa: str, inicio: str) -> dict:
        if etapa == "municipais":
            passos = [("2020", cargo), ("2024", cargo)]
        else:
            gerais = ["2018", "2022", "2026"] if inicio == "2018" else ["2022", "2026"]
            passos = []
            for k, a in enumerate(gerais):
                passos.append((a, cargo))
                if etapa != "direto" and k < len(gerais) - 1:
                    passos.append((str(int(a) + 2), etapa))
        ano_peso, cargo_peso = passos[-1]
        seq = {m: [lider_mun(a, c, m) for a, c in passos] for m in terr}
        peso_validos = {m: el[ano_peso]["validos"].get((cargo_peso, m), 0) for m in terr}
        fluxos, fluxos_v = Counter(), Counter()
        for m, s_ in seq.items():
            for k in range(len(passos) - 1):
                fluxos[(k, s_[k], s_[k + 1])] += 1
                fluxos_v[(k, s_[k], s_[k + 1])] += peso_validos[m]
        return {"etapas": [f"{CARGOS[(a, c)]} {a}" for a, c in passos], "sequencias": seq,
                "fluxos": [{"etapa": k, "de": a, "para": b, "municipios": n, "validos_2026": fluxos_v[(k, a, b)]}
                           for (k, a, b), n in sorted(fluxos.items())],
                "peso_validos": f"votos válidos de {CARGOS[(ano_peso, cargo_peso)]} {ano_peso} no município (peso único ao longo da cadeia)",
                "ano_peso": ano_peso, "cargo_peso": cargo_peso}
    sankey = {}
    for cargo in ("7", "6"):
        for etapa in ("13", "11", "direto"):
            sankey[f"{cargo}_{etapa}"] = cadeia(cargo, etapa, "2022")
            sankey[f"{cargo}_{etapa}_2018"] = cadeia(cargo, etapa, "2018")
    for cargo in ("11", "13"):
        sankey[f"mun_{cargo}"] = cadeia(cargo, "municipais", "2020")
    base["sankey"] = sankey

    # I6: distribuição da intensidade da liderança por grupo (municípios), por eleição e cargo
    base["intensidade_resumo"] = {
        ano: {c: {g: resumo_boxplot([u["lider"]["intensidade"] for u in cg["forca"]["municipio"].values()
                                     if u["lider"] and u["lider"]["grupo"] == g])
                  for g in GRUPOS}
              for c, cg in base["eleicoes"][ano]["cargos"].items()}
        for ano in base["eleicoes"]}
    return base


def gravar_tabela_grupos(raiz_lab: Path, linhas: list[dict]) -> None:
    with (raiz_lab / TABELA_GRUPOS).open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ano", "sg_partido", "sg_federacao", "grupo"])
        w.writeheader()
        w.writerows(sorted(linhas, key=lambda l: (l["ano"], GRUPOS.index(l["grupo"]), l["sg_partido"])))


def main() -> None:
    raiz_lab = raiz()
    dados, relatorio, linhas_grupos = montar(raiz_lab)
    gravar_tabela_grupos(raiz_lab, linhas_grupos)
    (raiz_lab / RELATORIO).write_text(json.dumps(relatorio, ensure_ascii=False, indent=1), encoding="utf-8")
    print(relatorio["status_automatizado"])
    if relatorio["status_automatizado"] != "sem divergências":
        raise SystemExit("Base não gerada: conferência com divergências.")
    base = montar_base(dados, relatorio)
    base["meta"] = {"gerado_em": relatorio["gerado_em"], "relatorio_qualidade": str(RELATORIO),
                    "fontes": {"tse": "Portal de Dados Abertos do TSE (arquivos município/zona e por seção) e API de resultados (destino dos votos 2026)",
                               "ibge": "Regiões Geográficas Imediatas e Intermediárias (2017), API de Localidades",
                               "territorios": "Territórios de Desenvolvimento do Piauí — Wikipédia (fonte secundária) + decisões do pesquisador"},
                    "decisoes": ["L0001", "L0002", "EL0002", "EL0003", "EL0004", "EL0005", "EL0006"]}
    destino = raiz_lab / PRODUTO / "data" / "base_forcas_pi.json.gz"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(gzip.compress(json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
    print(f"Base: {destino.relative_to(raiz_lab)} ({destino.stat().st_size / 1e6:.2f} MB)")
    print(f"Relatório: {RELATORIO}")


if __name__ == "__main__":
    main()
