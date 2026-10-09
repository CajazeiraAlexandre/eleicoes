"""Relatório de qualidade do produto "O mapa da virada" (Brasil, município, 2018–2026).

    PYTHONPATH=nucleo:. python projetos/eleicoes/analise/validar_mapa_virada.py

Controles (tolerância zero nas contagens de votos):
  A. por eleição (ano × turno × cargo × município): Σ votos válidos por partido (nominais + legenda) =
     válidos oficiais do detalhe município/zona (2018–2024) ou da API (Presidente 2026);
  B. linhagem e federações (EL0008): toda sigla de cada ano tem agremiação de 2026 e conglomerado;
  C. abstenção = abstenções / eleitorado apto, por município (exterior fora);
  D. bancadas: eleitos para a Câmara (513) e o Senado (54 em 2018 e 2026; 27 em 2022);
  E. municípios: ligação TSE ⇄ IBGE (L0001) e cobertura dos indicadores (Censo 2022, PIB 2022, Bolsa Família).
Só eleições ordinárias (CD_TIPO_ELEICAO = 2); exterior (UF ZZ) fora; Conselho Distrital de Fernando de
Noronha fora. Nada é corrigido ou imputado: divergências e lacunas são contadas e amostradas.
"""
from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterator

import yaml

from labdados.catalogo import raiz

BRUTO = Path("dados/bruto/tse")
CARGOS = {"Presidente": "presidente", "Senador": "senador", "Deputado Federal": "dep_federal",
          "Prefeito": "prefeito", "Vereador": "vereador"}
ELEITO = {"ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA", "ELEITO POR MEDIA"}
REFERENCIA = Path("dados/referencia/conglomerados_2026.yaml")
SAIDA = Path("projetos/eleicoes/analise/relatorio_qualidade_mapa_virada.json")


# ---------------------------------------------------------------- leitura

def linhas_csv(caminho: Path, membro: str, filtro: str | None = None) -> Iterator[dict[str, str]]:
    """Linhas de um CSV do TSE (Latin-1, ';') dentro de um ZIP; `filtro` = texto que a linha precisa conter."""
    with zipfile.ZipFile(caminho) as zp, zp.open(membro) as binario:
        texto = io.TextIOWrapper(binario, encoding="latin-1", newline="")
        cab = next(csv.reader([texto.readline()], delimiter=";"))
        for linha in texto:
            if filtro and filtro not in linha:
                continue
            yield dict(zip(cab, next(csv.reader([linha], delimiter=";"))))


def no_escopo(r: dict[str, str]) -> bool:
    return r["CD_TIPO_ELEICAO"] == "2" and r["SG_UF"] != "ZZ" and r["DS_CARGO"] in CARGOS


def i(v: str) -> int:
    return int(v) if v not in ("", "#NULO#", "#NE#") else 0


# ---------------------------------------------------------------- EL0008

class Agrupamento:
    """Sigla do TSE → partido de 2026 (linhagem) → agremiação (federação ou partido) → conglomerado."""

    def __init__(self, ref: dict):
        self.linhagem = {k.upper(): v for k, v in ref["linhagem"].items()}
        self.federacao = {p: f for f, ps in ref["federacoes"].items() for p in ps}
        self.conglomerado = {a: c for c, d in ref["conglomerados"].items() for a in d["agremiacoes"]}
        self.desconhecidas: Counter = Counter()

    def partido_2026(self, sigla: str) -> str:
        s = sigla.strip().upper()
        return self.linhagem.get(s, s)

    def agremiacao(self, sigla: str) -> str:
        p = self.partido_2026(sigla)
        return self.federacao.get(p, p)

    def conglomerado_de(self, sigla: str, ano: int) -> str | None:
        c = self.conglomerado.get(self.agremiacao(sigla))
        if c is None:
            self.desconhecidas[(ano, sigla)] += 1
        return c


# ---------------------------------------------------------------- A/C. 2018–2024 (arquivos do TSE)

def votos_partido(raiz_lab: Path, ano: int, ag: Agrupamento):
    """{(turno, cargo, município TSE): Counter(sigla → válidos)} com nominais + legenda válidos."""
    out: dict[tuple, Counter] = defaultdict(Counter)
    for r in linhas_csv(raiz_lab / BRUTO / f"votacao_partido_munzona/votacao_partido_munzona_{ano}.zip",
                        f"votacao_partido_munzona_{ano}_BRASIL.csv"):
        if not no_escopo(r):
            continue
        k = (r["NR_TURNO"], CARGOS[r["DS_CARGO"]], r["CD_MUNICIPIO"].lstrip("0"))
        out[k][r["SG_PARTIDO"]] += i(r["QT_VOTOS_NOMINAIS_VALIDOS"]) + i(r["QT_TOTAL_VOTOS_LEG_VALIDOS"])
        ag.conglomerado_de(r["SG_PARTIDO"], ano)
    return out


def detalhe(raiz_lab: Path, ano: int):
    """{(turno, cargo, município TSE): {validos, aptos, abstencoes, comparecimento}} (soma das zonas)."""
    out: dict[tuple, Counter] = defaultdict(Counter)
    for r in linhas_csv(raiz_lab / BRUTO / f"detalhe_votacao_munzona/detalhe_votacao_munzona_{ano}.zip",
                        f"detalhe_votacao_munzona_{ano}_BRASIL.csv"):
        if not no_escopo(r):
            continue
        k = (r["NR_TURNO"], CARGOS[r["DS_CARGO"]], r["CD_MUNICIPIO"].lstrip("0"))
        for campo, col in (("validos", "QT_TOTAL_VOTOS_VALIDOS"), ("aptos", "QT_APTOS"),
                           ("abstencoes", "QT_ABSTENCOES"), ("comparecimento", "QT_COMPARECIMENTO")):
            out[k][campo] += i(r[col])
    return out


def conferir_validos(partidos: dict, oficial: dict) -> dict:
    por_eleicao: dict[tuple, Counter] = defaultdict(Counter)
    amostras = []
    for k in set(partidos) | set(oficial):
        soma = sum(partidos.get(k, Counter()).values())
        ofi = oficial.get(k, Counter())["validos"]
        e = (k[0], k[1])
        por_eleicao[e]["municipios"] += 1
        por_eleicao[e]["validos"] += ofi
        if soma != ofi:
            por_eleicao[e]["divergencias"] += 1
            if len(amostras) < 15:
                amostras.append({"chave": list(k), "soma_partidos": soma, "validos_oficiais": ofi})
    return {"por_eleicao": {f"{t}º turno · {c}": dict(v) for (t, c), v in sorted(por_eleicao.items())},
            "amostras_divergencias": amostras}


def abstencao(oficial: dict) -> dict:
    por: dict[tuple, Counter] = defaultdict(Counter)
    for (t, c, _m), v in oficial.items():
        if c in ("presidente", "prefeito"):
            por[(t, c)]["aptos"] += v["aptos"]
            por[(t, c)]["abstencoes"] += v["abstencoes"]
            por[(t, c)]["municipios"] += 1
    return {f"{t}º turno · {c}": {**v, "taxa_%": round(100 * v["abstencoes"] / v["aptos"], 2) if v["aptos"] else None}
            for (t, c), v in sorted(por.items())}


# ---------------------------------------------------------------- 2026

def presidente_2026(raiz_lab: Path, ag: Agrupamento):
    snap = json.loads((raiz_lab / "dados/snapshots/tse.resultados_2026_1t_presidente_municipios/atual.json").read_text(encoding="utf-8"))
    partidos, oficial = defaultdict(Counter), defaultdict(Counter)
    for x in snap["resultados"]:
        p = x["payload"]
        k = ("1", "presidente", str(p["cdabr"]).lstrip("0"))
        for agr in p["carg"][0]["agr"]:
            for par in agr["par"]:
                for cand in par["cand"]:
                    if cand.get("dvt") in ("Válido", "Válido (legenda)"):
                        partidos[k][par["sg"]] += int(cand["vap"])
                ag.conglomerado_de(par["sg"], 2026)
        oficial[k].update({"validos": int(p["v"]["vv"]), "aptos": int(p["e"]["te"]),
                           "abstencoes": int(p["e"]["a"]), "comparecimento": int(p["e"]["c"])})
    return partidos, oficial, snap["coletado_em"]


def estaduais_2026(raiz_lab: Path, ag: Agrupamento):
    """Senador e Dep. Federal 2026 do arquivo de candidaturas por município/zona (só votos nominais;
    o TSE ainda não publicou os arquivos de partido e de detalhe de 2026)."""
    nominais: dict[tuple, Counter] = defaultdict(Counter)
    eleitos: dict[str, Counter] = defaultdict(Counter)
    vistos: set = set()
    for filtro in ('"Senador"', '"Deputado Federal"'):
        for r in linhas_csv(raiz_lab / BRUTO / "votacao_candidato_munzona/votacao_candidato_munzona_2026.zip",
                            "votacao_candidato_munzona_2026_BRASIL.csv", filtro):
            if not no_escopo(r):
                continue
            c = CARGOS[r["DS_CARGO"]]
            nominais[("1", c, r["CD_MUNICIPIO"].lstrip("0"))][r["SG_PARTIDO"]] += i(r["QT_VOTOS_NOMINAIS_VALIDOS"])
            ag.conglomerado_de(r["SG_PARTIDO"], 2026)
            if r["DS_SIT_TOT_TURNO"].upper() in ELEITO and r["SQ_CANDIDATO"] not in vistos:
                vistos.add(r["SQ_CANDIDATO"])
                eleitos[c][r["SG_PARTIDO"]] += 1
    return nominais, eleitos


# ---------------------------------------------------------------- D. bancadas 2018 e 2022

def eleitos_cadastro(raiz_lab: Path, ano: int) -> dict[str, Counter]:
    out: dict[str, Counter] = defaultdict(Counter)
    vistos = set()
    for r in linhas_csv(raiz_lab / BRUTO / f"candidatos/consulta_cand_{ano}.zip", f"consulta_cand_{ano}_BRASIL.csv"):
        if r["CD_TIPO_ELEICAO"] != "2" or r["DS_CARGO"].upper() not in ("SENADOR", "DEPUTADO FEDERAL"):
            continue
        if r["DS_SIT_TOT_TURNO"].upper() in ELEITO and r["SQ_CANDIDATO"] not in vistos:
            vistos.add(r["SQ_CANDIDATO"])
            out["senador" if r["DS_CARGO"].upper() == "SENADOR" else "dep_federal"][r["SG_PARTIDO"]] += 1
    return out


def bancadas(eleitos: dict[str, Counter], ag: Agrupamento, ano: int) -> dict:
    out = {}
    for cargo, por_sigla in eleitos.items():
        por_cong: Counter = Counter()
        for s, n in por_sigla.items():
            por_cong[ag.conglomerado_de(s, ano) or "?"] += n
        out[cargo] = {"total": sum(por_sigla.values()), "por_conglomerado": dict(por_cong.most_common()),
                      "por_partido": dict(por_sigla.most_common())}
    return out


# ---------------------------------------------------------------- E. municípios e indicadores

# EL0002: pares aprovados para os 3 municípios do PI sem vínculo em L0001
EXCECOES_EL0002 = {"10600": "2201176", "12483": "2207108", "12718": "2207793"}


def correspondencia(raiz_lab: Path) -> dict[str, tuple[str, str, str]]:
    """Código TSE → (código IBGE, UF, nome): L0001 + exceções EL0002 (Piauí e adendo nacional)."""
    with (raiz_lab / "dados/referencia/correspondencia_tse_ibge_municipios_2022.csv").open(encoding="utf-8") as f:
        corr = {r["cd_municipio_tse"].lstrip("0"): (r["cd_municipio_ibge"], r["sg_uf"], r["nm_municipio_tse"])
                for r in csv.DictReader(f)}
    for tse, ibge in EXCECOES_EL0002.items():
        corr[tse] = (ibge, corr.get(tse, ("", "PI", ""))[1], corr.get(tse, ("", "", ""))[2])
    # adendo nacional do EL0002 (56 pares conferidos pelo pesquisador em 2026-10-07)
    with (raiz_lab / "dados/referencia/correspondencia_tse_ibge_excecoes_nacionais.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            corr[r["cd_municipio_tse"].lstrip("0")] = (r["cd_municipio_ibge"], r["sg_uf"], r["nm_municipio_tse"])
    return corr


def indicadores(raiz_lab: Path) -> dict[str, set]:
    def ultimo(ds):
        return sorted((raiz_lab / "dados/snapshots" / ds).glob("*.json"))[-1]
    censo = json.loads(ultimo("ibge.censo2022_municipios").read_text(encoding="utf-8"))
    pib = json.loads(ultimo("ibge.pib_municipios").read_text(encoding="utf-8"))
    bf = json.loads(ultimo("mds.bolsa_familia_municipios").read_text(encoding="utf-8"))
    out = {k: {m for m, v in c["valores"].items() if v is not None} for k, c in censo["consultas"].items()}
    out["pib"] = {m for m, v in pib["consultas"]["pib_mil_reais"]["valores"].items() if v is not None}
    out["bolsa_familia_6dig"] = {str(d["codigo_ibge"]) for d in bf["municipios"]}
    return out


# ---------------------------------------------------------------- relatório

def validar(raiz_lab: Path) -> dict:
    ag = Agrupamento(yaml.safe_load((raiz_lab / REFERENCIA).read_text(encoding="utf-8")))
    rel: dict = {"gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"), "anos": {}}
    municipios_tse: set = set()
    for ano in (2018, 2020, 2022, 2024):
        partidos, oficial = votos_partido(raiz_lab, ano, ag), detalhe(raiz_lab, ano)
        municipios_tse |= {k[2] for k in oficial}
        rel["anos"][str(ano)] = {"A_validos": conferir_validos(partidos, oficial), "C_abstencao": abstencao(oficial)}
    p26, o26, coletado = presidente_2026(raiz_lab, ag)
    municipios_tse |= {k[2] for k in o26}
    n26, e26 = estaduais_2026(raiz_lab, ag)
    rel["anos"]["2026"] = {"A_validos": conferir_validos(p26, o26), "C_abstencao": abstencao(o26),
                           "api_coletada_em": coletado,
                           "estaduais_nominais": {c: {"municipios": sum(1 for k in n26 if k[1] == c),
                                                      "votos_nominais_validos": sum(sum(v.values()) for k, v in n26.items() if k[1] == c)}
                                                  for c in ("senador", "dep_federal")},
                           "aviso": "Senador e Dep. Federal 2026 só com votos nominais: o TSE ainda não publicou os arquivos de partido (legenda) e de detalhe (válidos) de 2026."}
    rel["D_bancadas"] = {"2018": bancadas(eleitos_cadastro(raiz_lab, 2018), ag, 2018),
                         "2022": bancadas(eleitos_cadastro(raiz_lab, 2022), ag, 2022),
                         "2026": bancadas(e26, ag, 2026)}
    rel["B_siglas_sem_conglomerado"] = [{"ano": a, "sigla": s, "linhas": n} for (a, s), n in sorted(ag.desconhecidas.items())]
    corr = correspondencia(raiz_lab)
    ligados = {m: corr[m][0] for m in municipios_tse if m in corr and corr[m][0]}
    sem = sorted(m for m in municipios_tse if m not in ligados)
    ind = indicadores(raiz_lab)
    rel["E_municipios"] = {
        "municipios_tse_em_alguma_eleicao": len(municipios_tse),
        "ligados_ibge": len(ligados),
        "sem_vinculo_ibge": [{"tse": m, "uf": corr.get(m, ("", "?", ""))[1], "nome": corr.get(m, ("", "", "fora da tabela L0001"))[2]} for m in sem],
        "cobertura_indicadores": {k: sum(1 for ib in ligados.values() if (ib[:6] if k.endswith("6dig") else ib) in v)
                                  for k, v in ind.items()},
    }
    return rel


def main() -> None:
    raiz_lab = raiz()
    rel = validar(raiz_lab)
    (raiz_lab / SAIDA).write_text(json.dumps(rel, ensure_ascii=False, indent=1), encoding="utf-8")
    for ano, r in rel["anos"].items():
        for e, v in r["A_validos"]["por_eleicao"].items():
            print(f"{ano} {e}: {v.get('municipios')} municípios, {v.get('divergencias', 0)} divergências, {v.get('validos'):,} válidos")
    print("siglas sem conglomerado:", rel["B_siglas_sem_conglomerado"][:20])
    print("municípios:", {k: v for k, v in rel["E_municipios"].items() if k != "sem_vinculo_ibge"}, "sem vínculo:", len(rel["E_municipios"]["sem_vinculo_ibge"]))
    print(f"Relatório: {SAIDA}")


if __name__ == "__main__":
    main()
