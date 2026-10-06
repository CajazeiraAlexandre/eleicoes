"""Confere votos por seção, totais oficiais e locais de votação do Piauí (2018, 2022 e 2026).

Produto: projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi
Decisões: L0001, L0002, EL0002, EL0003; regra "sem linha = 0 votos" (produto.yaml).

Controles (tolerância zero em todas as contagens):
  A. votação por seção × detalhe por seção — nominais, legenda, brancos, nulos;
  B. (2022) soma das seções × votação município/zona por candidatura;
  C. seções × cadastro de locais — vínculo, coordenadas e ponto no próprio município;
  D. votos válidos reconstruídos por seção (EL0003) × válidos oficiais
     (2022: detalhe município/zona; 2026: API de resultados, também por candidatura).

2018 (opção B do pesquisador, EL0003 — adendo 2018): sem o detalhe por seção e sem o arquivo de
candidaturas por município/zona. A vira "seções somadas × detalhe município/zona" por categoria; o
destino vem da situação no cadastro de candidaturas, e candidaturas APTAS cujos votos os totais
oficiais contam como nulos são identificadas pelos próprios totais (votos iguais à diferença em
todas as zonas), nunca por suposição.

Nada é corrigido ou imputado: divergências e lacunas são contadas e amostradas.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator

from labdados.catalogo import raiz

UF = "PI"
CARGOS_PROPORCIONAIS = {"6", "7", "8"}
VOTAVEL_BRANCO = "95"
VOTAVEL_NULO = "96"
VOTAVEIS_ESPECIAIS = {"97", "98"}

_BRUTO = Path("dados/bruto/tse")
FONTES: dict[int, dict[str, tuple[str, Path, str | None]]] = {
    2018: {
        "votacao_secao_uf": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2018_PI.zip", None),
        "votacao_secao_br": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2018_BR.zip", None),
        "locais": ("tse.eleitorado_local_votacao", _BRUTO / "eleitorado_local_votacao/eleitorado_local_votacao_2018.zip", None),
        "partido_munzona": ("tse.votacao_partido_munzona",
                            _BRUTO / "votacao_partido_munzona/votacao_partido_munzona_2018.zip",
                            "votacao_partido_munzona_2018_BRASIL.csv"),
        "detalhe_munzona": ("tse.detalhe_votacao_munzona",
                            _BRUTO / "detalhe_votacao_munzona/detalhe_votacao_munzona_2018.zip",
                            "detalhe_votacao_munzona_2018_BRASIL.csv"),
        "candidatos": ("tse.candidatos", _BRUTO / "candidatos/consulta_cand_2018.zip", None),
    },
    2022: {
        "votacao_secao_uf": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2022_PI.zip", None),
        "votacao_secao_br": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2022_BR.zip", None),
        "detalhe_secao": ("tse.detalhe_votacao_secao", _BRUTO / "detalhe_votacao_secao/detalhe_votacao_secao_2022.zip",
                          "detalhe_votacao_secao_2022_BRASIL.csv"),
        "locais": ("tse.eleitorado_local_votacao", _BRUTO / "eleitorado_local_votacao/eleitorado_local_votacao_2022.zip", None),
        "munzona": ("tse.votacao_candidato_munzona",
                    _BRUTO / "votacao_candidato_munzona/votacao_candidato_munzona_2022.zip",
                    "votacao_candidato_munzona_2022_BRASIL.csv"),
        "partido_munzona": ("tse.votacao_partido_munzona",
                            _BRUTO / "votacao_partido_munzona/votacao_partido_munzona_2022.zip",
                            "votacao_partido_munzona_2022_BRASIL.csv"),
        "detalhe_munzona": ("tse.detalhe_votacao_munzona",
                            _BRUTO / "detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip",
                            "detalhe_votacao_munzona_2022_BRASIL.csv"),
    },
    2026: {
        "votacao_secao_uf": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2026_PI.zip", None),
        "votacao_secao_br": ("tse.votacao_secao", _BRUTO / "votacao_secao/votacao_secao_2026_BR.zip", None),
        "detalhe_secao": ("tse.detalhe_votacao_secao", _BRUTO / "detalhe_votacao_secao/detalhe_votacao_secao_2026.zip",
                          "detalhe_votacao_secao_2026_BRASIL.csv"),
        "locais": ("tse.eleitorado_local_votacao", _BRUTO / "eleitorado_local_votacao/eleitorado_local_votacao_2026.zip",
                   "eleitorado_local_votacao_2026_PI.csv"),
    },
}
_MALHA = Path("dados/bruto/ibge/malha_municipios_2022/BR_Municipios_2022.zip")
_CORRESPONDENCIA = Path("dados/referencia/correspondencia_tse_ibge_municipios_2022.csv")
# EL0002: pares aprovados para os 3 municípios do PI sem vínculo em L0001.
EXCECOES_EL0002 = {"10600": "2201176", "12483": "2207108", "12718": "2207793"}

ChaveSecao = tuple[str, str, str, str, str]   # turno, cargo, município, zona, seção


# ---------------------------------------------------------------- leitura

def _membros_csv(zp: zipfile.ZipFile, membro: str | None) -> list[str]:
    if membro is not None:
        if membro not in zp.namelist():
            raise FileNotFoundError(f"Membro {membro!r} ausente em {zp.filename}.")
        return [membro]
    return [n for n in zp.namelist() if n.lower().endswith(".csv")]


def linhas_uf(caminho: Path, membro: str | None, uf: str = UF) -> Iterator[dict[str, str]]:
    """Lê CSVs TSE (`;`, Latin-1, aspas) de um ZIP e devolve só as linhas da UF.

    Faz um pré-filtro textual (`"PI"`) antes de separar campos, para percorrer
    arquivos nacionais grandes sem carregá-los inteiros.
    """
    marca = f'"{uf}"'
    with zipfile.ZipFile(caminho) as zp:
        for nome in _membros_csv(zp, membro):
            with zp.open(nome) as binario:
                texto = io.TextIOWrapper(binario, encoding="latin-1", newline="")
                cabecalho = next(csv.reader([texto.readline()], delimiter=";"))
                i_uf = cabecalho.index("SG_UF")
                for linha in texto:
                    if marca not in linha:
                        continue
                    valores = next(csv.reader([linha], delimiter=";"))
                    if valores[i_uf] == uf:
                        yield dict(zip(cabecalho, valores))


def _int(valor: str) -> int:
    return int(valor.strip())


def classificar_votavel(cd_cargo: str, nr_votavel: str) -> str:
    """Classifica uma linha de votação por seção.

    Entrada: código do cargo e número votável do TSE.
    Saída: 'branco', 'nulo', 'especial', 'legenda' ou 'nominal'.
    Fonte: leiame do TSE — 95 branco, 96 nulo; em cargos proporcionais
    (6, 7, 8) o número de 2 dígitos é voto de legenda.
    """
    if nr_votavel == VOTAVEL_BRANCO:
        return "branco"
    if nr_votavel == VOTAVEL_NULO:
        return "nulo"
    if nr_votavel in VOTAVEIS_ESPECIAIS:
        return "especial"
    if cd_cargo in CARGOS_PROPORCIONAIS and len(nr_votavel) == 2:
        return "legenda"
    return "nominal"


def _chave_secao(r: dict[str, str]) -> ChaveSecao:
    return (r["NR_TURNO"], r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"),
            r["NR_ZONA"], r["NR_SECAO"])


def _no_escopo(r: dict[str, str], ano: int) -> bool:
    return r["ANO_ELEICAO"] == str(ano) and r["CD_TIPO_ELEICAO"] == "2"


# ---------------------------------------------------------------- A. seção × detalhe

def somar_votacao_secao(linhas: Iterable[dict[str, str]], ano: int):
    """Soma votos por seção e categoria; acumula votos por candidatura × município × zona."""
    por_secao: dict[ChaveSecao, Counter] = defaultdict(Counter)
    por_candidatura_zona: Counter = Counter()
    por_secao_candidatura: Counter = Counter()
    por_secao_legenda: Counter = Counter()
    n = 0
    for r in linhas:
        if not _no_escopo(r, ano):
            continue
        n += 1
        votos = _int(r["QT_VOTOS"])
        tipo = classificar_votavel(r["CD_CARGO"], r["NR_VOTAVEL"])
        chave = _chave_secao(r)
        por_secao[chave][tipo] += votos
        if tipo == "nominal":
            por_candidatura_zona[(r["NR_TURNO"], r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"),
                                  r["NR_ZONA"], r["SQ_CANDIDATO"])] += votos
            por_secao_candidatura[(chave, r["SQ_CANDIDATO"])] += votos
        elif tipo == "legenda":
            por_secao_legenda[(chave, r["NR_VOTAVEL"])] += votos
    return por_secao, por_candidatura_zona, por_secao_candidatura, por_secao_legenda, n


def ler_detalhe_secao(linhas: Iterable[dict[str, str]], ano: int):
    detalhe: dict[ChaveSecao, dict[str, int | str]] = {}
    duplicadas = 0
    for r in linhas:
        if not _no_escopo(r, ano):
            continue
        chave = _chave_secao(r)
        if chave in detalhe:
            duplicadas += 1
        detalhe[chave] = {
            "nominal": _int(r["QT_VOTOS_NOMINAIS"]), "legenda": _int(r["QT_VOTOS_LEGENDA"]),
            "branco": _int(r["QT_VOTOS_BRANCOS"]), "nulo": _int(r["QT_VOTOS_NULOS"]),
            "anulados_apu_sep": _int(r["QT_VOTOS_ANULADOS_APU_SEP"]),
            "aptos": _int(r["QT_APTOS"]), "comparecimento": _int(r["QT_COMPARECIMENTO"]),
            "local": r["NR_LOCAL_VOTACAO"], "instalada": r["ST_SECAO_INSTALADA"],
            "anulada": r["ST_SECAO_ANULADA"],
        }
    return detalhe, duplicadas


def conferir_secoes(por_secao, detalhe) -> dict[str, object]:
    """Compara categorias de voto por seção; tolerância zero."""
    campos = ("nominal", "legenda", "branco", "nulo")
    divergencias = []
    for chave in sorted(set(por_secao) & set(detalhe)):
        soma, oficial = por_secao[chave], detalhe[chave]
        dif = {c: soma[c] - oficial[c] for c in campos if soma[c] != oficial[c]}
        if dif:
            divergencias.append({"chave": dict(zip(("turno", "cargo", "municipio", "zona", "secao"), chave)),
                                 "diferencas": dif})
    so_votacao = sorted(set(por_secao) - set(detalhe))
    so_detalhe = sorted(set(detalhe) - set(por_secao))
    secoes_sem_votos = [k for k in so_detalhe
                        if sum(detalhe[k][c] for c in campos) == 0]
    por_turno_cargo = Counter((k[0], k[1]) for k in detalhe)
    totais = {c: sum(d[c] for d in detalhe.values()) for c in campos + ("anulados_apu_sep",)}
    totais["validos"] = totais["nominal"] + totais["legenda"]
    return {
        "chaves_votacao": len(por_secao), "chaves_detalhe": len(detalhe),
        "chaves_detalhe_por_turno_cargo": {f"{t}/{c}": n for (t, c), n in sorted(por_turno_cargo.items())},
        "so_na_votacao": len(so_votacao), "so_no_detalhe": len(so_detalhe),
        "so_no_detalhe_sem_votos": len(secoes_sem_votos),
        "amostras_so_votacao": [list(k) for k in so_votacao[:10]],
        "amostras_so_detalhe_com_votos": [list(k) for k in so_detalhe if k not in set(secoes_sem_votos)][:10],
        "votos_especiais_97_98": sum(s["especial"] for s in por_secao.values()),
        "divergencias": len(divergencias), "amostras_divergencias": divergencias[:20],
        "totais_detalhe": totais,
        "totais_votacao": {c: sum(s[c] for s in por_secao.values()) for c in campos},
        "secoes_anuladas": sum(1 for d in detalhe.values() if d["anulada"] == "Sim"),
        "secoes_nao_instaladas": sum(1 for d in detalhe.values() if d["instalada"] != "Sim"),
    }


# ---------------------------------------------------------------- B. seções × município/zona (2022)

def conferir_munzona(por_candidatura_zona: Counter, linhas_munzona: Iterable[dict[str, str]], ano: int):
    oficial: Counter = Counter()
    for r in linhas_munzona:
        if not _no_escopo(r, ano):
            continue
        oficial[(r["NR_TURNO"], r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"),
                 r["NR_ZONA"], r["SQ_CANDIDATO"])] += _int(r["QT_VOTOS_NOMINAIS"])
    chaves = set(oficial) | set(por_candidatura_zona)
    sq_oficiais = {k[4] for k in oficial}
    # Candidaturas ausentes do arquivo município/zona são tratadas em D (EL0003).
    ausentes = {k for k in por_candidatura_zona if k[4] not in sq_oficiais}
    # "sem linha = 0 votos": ausência de um lado conta como zero.
    divergentes = [k for k in chaves - ausentes if oficial.get(k, 0) != por_candidatura_zona.get(k, 0)]
    return {
        "chaves_munzona": len(oficial), "chaves_secao_agregadas": len(por_candidatura_zona),
        "chaves_munzona_com_zero_voto": sum(1 for v in oficial.values() if v == 0),
        "so_munzona_com_votos": sum(1 for k in set(oficial) - set(por_candidatura_zona) if oficial[k] > 0),
        "candidaturas_ausentes_do_munzona": sorted({k[4] for k in ausentes}),
        "votos_candidaturas_ausentes": sum(por_candidatura_zona[k] for k in ausentes),
        "divergencias": len(divergentes),
        "amostras_divergencias": [
            {"chave": list(k), "secoes": por_candidatura_zona.get(k, 0), "munzona": oficial.get(k, 0)}
            for k in sorted(divergentes)[:20]],
        "total_votos_munzona": sum(oficial.values()),
        "total_votos_secoes": sum(por_candidatura_zona.values()),
    }


# ---------------------------------------------------------------- C. locais de votação

def _coordenada(valor: str) -> float | None:
    valor = valor.strip()
    if valor in {"", "-1", "#NULO#", "#NE#"}:
        return None
    return float(valor.replace(",", "."))


def ler_locais(linhas: Iterable[dict[str, str]]):
    """Cadastro por seção → local; devolve seções por turno e locais únicos."""
    secoes: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for r in linhas:
        secoes[(r["NR_TURNO"], r["CD_MUNICIPIO"].lstrip("0"), r["NR_ZONA"], r["NR_SECAO"])] = r
    return secoes


def conferir_locais(secoes_cadastro, detalhe, ibge_por_tse: dict[str, str], raiz_lab: Path):
    import geopandas as gpd
    from shapely.geometry import Point

    locais: dict[tuple[str, str, str], dict[str, object]] = {}
    for (_, mun, zona, _secao), r in secoes_cadastro.items():
        chave = (mun, zona, r["NR_LOCAL_VOTACAO"])
        if chave not in locais:
            locais[chave] = {"nome": r["NM_LOCAL_VOTACAO"], "lat": _coordenada(r["NR_LATITUDE"]),
                             "lon": _coordenada(r["NR_LONGITUDE"]), "municipio": mun,
                             "nm_municipio": r["NM_MUNICIPIO"]}

    # vínculo detalhe (seções com voto) → cadastro
    sem_cadastro, local_divergente = [], []
    for (turno, _cargo, mun, zona, secao), d in detalhe.items():
        r = secoes_cadastro.get((turno, mun, zona, secao))
        if r is None:
            sem_cadastro.append((turno, mun, zona, secao))
        elif d["local"] not in ("-1", "#NULO#") and d["local"] != r["NR_LOCAL_VOTACAO"]:
            local_divergente.append((turno, mun, zona, secao, d["local"], r["NR_LOCAL_VOTACAO"]))

    malha = gpd.read_file(f"zip://{raiz_lab / _MALHA}")
    malha = malha[malha["SIGLA_UF"] == UF].set_index("CD_MUN")
    com_coord = {k: v for k, v in locais.items() if v["lat"] is not None}
    fora_do_municipio, sem_ibge, distancias = [], 0, []
    for chave, v in com_coord.items():
        ibge = ibge_por_tse.get(v["municipio"])
        if ibge is None or ibge not in malha.index:
            sem_ibge += 1
            continue
        poligono = malha.loc[ibge, "geometry"]
        ponto = Point(v["lon"], v["lat"])
        if not poligono.covers(ponto):
            d_graus = poligono.distance(ponto)
            distancias.append(d_graus)
            fora_do_municipio.append({"local": list(chave), "nome": v["nome"],
                                      "municipio": v["nm_municipio"], "lat": v["lat"], "lon": v["lon"],
                                      "distancia_km_aprox": round(d_graus * 111, 2)})
    coords = Counter((v["lat"], v["lon"]) for v in com_coord.values())
    repetidas = {f"{k[0]},{k[1]}": n for k, n in coords.items() if n > 1}
    fora_do_municipio.sort(key=lambda x: -x["distancia_km_aprox"])
    return {
        "secoes_cadastro": len(secoes_cadastro), "locais": len(locais),
        "locais_com_coordenada": len(com_coord), "locais_sem_coordenada": len(locais) - len(com_coord),
        "secoes_detalhe_sem_cadastro": len(sem_cadastro), "amostras_sem_cadastro": sem_cadastro[:10],
        "secoes_local_divergente_detalhe_cadastro": len(local_divergente),
        "amostras_local_divergente": local_divergente[:10],
        "locais_com_coordenada_sem_municipio_ibge": sem_ibge,
        "locais_fora_do_proprio_municipio": len(fora_do_municipio),
        "fora_ate_1km": sum(1 for x in fora_do_municipio if x["distancia_km_aprox"] <= 1),
        "fora_mais_de_10km": sum(1 for x in fora_do_municipio if x["distancia_km_aprox"] > 10),
        "amostras_fora_do_municipio": fora_do_municipio[:15],
        "lista_fora_do_municipio": fora_do_municipio,
        "coordenadas_compartilhadas_por_mais_de_um_local": len(repetidas),
        "amostras_coordenadas_compartilhadas": dict(sorted(repetidas.items(), key=lambda x: -x[1])[:10]),
    }


def ler_correspondencia(raiz_lab: Path) -> dict[str, str]:
    """L0001 + exceções EL0002, só para o PI."""
    corr = {}
    with (raiz_lab / _CORRESPONDENCIA).open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["sg_uf"] == UF and r["cd_municipio_ibge"]:
                corr[r["cd_municipio_tse"].lstrip("0")] = r["cd_municipio_ibge"]
    for tse, ibge in EXCECOES_EL0002.items():
        corr.setdefault(tse, ibge)
    return corr


# ---------------------------------------------------------------- D. votos válidos (EL0003)

DESTINOS_VALIDOS = {"Válido", "Válido (legenda)"}
_SNAPSHOT_API = Path("dados/snapshots/tse.resultados_2026_1t/atual.json")
_CANDIDATOS = {2022: Path("dados/bruto/tse/candidatos/consulta_cand_2022.zip")}


def validos_por_secao(por_secao, por_secao_candidatura, por_secao_legenda,
                      destino: dict[tuple[str, str], str],
                      legenda_anulada: set[tuple[str, str, str]]):
    """Votos válidos por seção (EL0003).

    Entrada: seções, votos nominais por seção × candidatura, votos de legenda por
    seção × partido, destino oficial por (turno, SQ_CANDIDATO) e o conjunto de
    legendas anuladas (turno, cargo, número do partido).
    Saída: {chave_secao: válidos} = nominais com destino válido + legendas válidas.
    Fonte: TSE — votos com destino "Anulado", "Anulado sub judice" ou nulo
    técnico não são válidos; "Válido (legenda)" conta para a legenda do partido.
    """
    validos = {chave: 0 for chave in por_secao}
    for (chave, sq), votos in por_secao_candidatura.items():
        if destino[(chave[0], sq)] in DESTINOS_VALIDOS:
            validos[chave] += votos
    for (chave, partido), votos in por_secao_legenda.items():
        if (chave[0], chave[1], partido) not in legenda_anulada:
            validos[chave] += votos
    return validos


def legendas_anuladas_2022(linhas_partido: Iterable[dict[str, str]], ano: int = 2022):
    """Partidos cuja legenda foi anulada (integralmente) no arquivo de partidos do ano (2018 ou 2022)."""
    validos, anulados = Counter(), Counter()
    for r in linhas_partido:
        if not _no_escopo(r, ano):
            continue
        chave = (r["NR_TURNO"], r["CD_CARGO"], r["NR_PARTIDO"])
        validos[chave] += _int(r["QT_VOTOS_LEGENDA_VALIDOS"])
        anulados[chave] += _int(r.get("QT_VOTOS_LEGENDA_ANULADOS", "0")) + _int(r["QT_VOTOS_LEGENDA_ANUL_SUBJUD"])
    parciais = sorted(k for k in anulados if anulados[k] and validos[k])
    if parciais:
        raise ValueError(f"Legendas com votos válidos e anulados ao mesmo tempo: {parciais}")
    return {k for k, v in anulados.items() if v}


def destinos_2022(raiz_lab: Path, linhas_munzona: Iterable[dict[str, str]], sq_com_voto: set[tuple[str, str]]):
    """Destino por (turno, SQ) no arquivo município/zona; ausentes só se INAPTOS no cadastro."""
    destino: dict[tuple[str, str], str] = {}
    inconsistentes = set()
    for r in linhas_munzona:
        if not _no_escopo(r, 2022):
            continue
        chave = (r["NR_TURNO"], r["SQ_CANDIDATO"])
        valor = r["NM_TIPO_DESTINACAO_VOTOS"]
        if destino.setdefault(chave, valor) != valor:
            inconsistentes.add(chave)
    ausentes = sorted(sq_com_voto - set(destino))
    situacao = {}
    if ausentes:
        with zipfile.ZipFile(raiz_lab / _CANDIDATOS[2022]) as zp:
            membro = next(n for n in zp.namelist() if n.endswith(f"_{UF}.csv"))
            leitor = csv.DictReader(io.TextIOWrapper(zp.open(membro), encoding="latin-1"), delimiter=";")
            for r in leitor:
                situacao[(r["NR_TURNO"], r["SQ_CANDIDATO"])] = (r["DS_SITUACAO_CANDIDATURA"], r["NM_URNA_CANDIDATO"], r["CD_CARGO"])
    ausentes_info = []
    for chave in ausentes:
        sit = situacao.get(chave, ("NÃO ENCONTRADO", "", ""))
        if sit[0] != "INAPTO":
            raise ValueError(f"Candidatura com voto ausente do arquivo município/zona e não INAPTA: {chave} {sit}")
        destino[chave] = "Anulado (INAPTO; ausente do arquivo município/zona)"
        ausentes_info.append({"turno": chave[0], "sq_candidato": chave[1], "nome_urna": sit[1], "cargo": sit[2]})
    return destino, {"inconsistentes": len(inconsistentes), "ausentes_tratados_como_anulados": ausentes_info}


def _detalhe_munzona(linhas: Iterable[dict[str, str]], ano: int) -> dict[tuple[str, str, str, str], dict[str, int]]:
    """Totais oficiais por turno × cargo × município × zona (arquivo detalhe município/zona)."""
    campos = ("QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOM_CONVR_LEG_VALIDOS", "QT_VOTOS_NOMINAIS_ANULADOS",
              "QT_VOTOS_NOMINAIS_ANUL_SUBJUD", "QT_VOTOS_LEG_VALIDOS", "QT_VOTOS_LEGENDA_ANULADOS",
              "QT_VOTOS_LEGENDA_ANUL_SUBJUD", "QT_VOTOS_BRANCOS", "QT_VOTOS_NULOS", "QT_VOTOS_NULOS_TECNICOS",
              "QT_TOTAL_VOTOS_VALIDOS")
    out: dict[tuple[str, str, str, str], dict[str, int]] = {}
    for r in linhas:
        if not _no_escopo(r, ano):
            continue
        k = (r["NR_TURNO"], r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"), r["NR_ZONA"])
        d = out.setdefault(k, Counter())
        for c in campos:
            d[c] += _int(r[c])
    return out


def destinos_2018(raiz_lab: Path, por_cand_zona: Counter, oficial: dict) -> tuple[dict, dict]:
    """Destino por (turno, SQ) em 2018 (EL0003, adendo 2018 — opção B do pesquisador).

    Entrada: votos nominais por turno × cargo × município × zona × SQ (seções somadas) e os totais
    oficiais do detalhe município/zona.
    Regra: APTO no cadastro de candidaturas = "Válido"; INAPTO = "Anulado (INAPTO)". Se, num cargo, os
    nominais válidos das seções passam dos oficiais, procura-se a candidatura APTA cujos votos são
    iguais à diferença em TODAS as zonas do cargo; achada uma única, ela é "Anulado (totais oficiais)".
    Qualquer outro caso interrompe (nada é ajustado por aproximação).
    """
    caminho = raiz_lab / FONTES[2018]["candidatos"][1]
    situacao: dict[tuple[str, str], tuple[str, str, str]] = {}
    with zipfile.ZipFile(caminho) as zp:
        for membro in (f"consulta_cand_2018_{UF}.csv", "consulta_cand_2018_BRASIL.csv"):
            for r in csv.DictReader(io.TextIOWrapper(zp.open(membro), encoding="latin-1"), delimiter=";"):
                if membro.endswith("BRASIL.csv") and r["CD_CARGO"] != "1":
                    continue
                situacao[(r["NR_TURNO"], r["SQ_CANDIDATO"])] = (r["DS_SITUACAO_CANDIDATURA"], r["NM_URNA_CANDIDATO"].strip(), r["CD_CARGO"])
    if any(d["QT_VOTOS_NOM_CONVR_LEG_VALIDOS"] for d in oficial.values()):
        raise ValueError("2018: há votos nominais convertidos para a legenda; a regra APTO/INAPTO não cobre esse caso.")
    destino: dict[tuple[str, str], str] = {}
    for (t, _c, _m, _z, sq) in por_cand_zona:
        sit = situacao.get((t, sq)) or situacao.get(("1", sq))
        if sit is None:
            raise ValueError(f"2018: candidatura com voto ausente do cadastro: {(t, sq)}")
        destino[(t, sq)] = "Válido" if sit[0] == "APTO" else f"Anulado ({sit[0]})"
    anulados_totais = []
    for t, c in sorted({(k[0], k[1]) for k in oficial}):
        zonas = [k for k in oficial if k[:2] == (t, c)]
        def lacuna():
            soma = Counter()
            for (tt, cc, m, z, sq), v in por_cand_zona.items():
                if (tt, cc) == (t, c) and destino[(tt, sq)] in DESTINOS_VALIDOS:
                    soma[(tt, cc, m, z)] += v
            return {k: soma[k] - oficial[k]["QT_VOTOS_NOMINAIS_VALIDOS"] for k in zonas}
        dif = lacuna()
        if not any(dif.values()):
            continue
        votos_sq: dict[str, Counter] = defaultdict(Counter)
        for (tt, cc, m, z, sq), v in por_cand_zona.items():
            if (tt, cc) == (t, c) and destino[(tt, sq)] in DESTINOS_VALIDOS:
                votos_sq[sq][(tt, cc, m, z)] += v
        explica = [sq for sq, vz in votos_sq.items() if all(vz.get(k, 0) == dif[k] for k in zonas)]
        if len(explica) != 1:
            raise ValueError(f"2018 {t}/{c}: diferença de nominais válidos sem explicação única ({len(explica)} candidaturas).")
        sq = explica[0]
        destino[(t, sq)] = "Anulado (totais oficiais)"
        anulados_totais.append({"turno": t, "cargo": c, "sq_candidato": sq, "nome_urna": situacao[(t, sq)][1],
                                "situacao_cadastro": situacao[(t, sq)][0], "votos": sum(votos_sq[sq].values()),
                                "zonas_conferidas": len(zonas)})
        if any(lacuna().values()):
            raise ValueError(f"2018 {t}/{c}: diferença persiste após a identificação.")
    inaptos = sorted({sq for (t, sq), d in destino.items() if d.startswith("Anulado (INAPTO")})
    return destino, {"regra": "cadastro APTO/INAPTO + identificação pelos totais oficiais (opção B)",
                     "inaptos_com_voto": len(inaptos), "anulados_pelos_totais_oficiais": anulados_totais}


def conferir_categorias_munzona(por_secao, por_cand_zona: Counter, destino, oficial) -> dict[str, object]:
    """A (2018): seções somadas por turno × cargo × município × zona × detalhe município/zona, por categoria.
    Nominais não válidos (INAPTOS e anulados) aparecem como nulos nos totais oficiais de 2018."""
    soma: dict[tuple, Counter] = defaultdict(Counter)
    for k, c in por_secao.items():
        soma[k[:4]].update(c)
    nao_validos: Counter = Counter()
    for (t, c, m, z, sq), v in por_cand_zona.items():
        if destino[(t, sq)] not in DESTINOS_VALIDOS:
            nao_validos[(t, c, m, z)] += v
    divergencias = []
    for k in sorted(set(soma) | set(oficial)):
        a, o = soma.get(k, Counter()), oficial.get(k)
        if o is None:
            divergencias.append({"chave": list(k), "erro": "sem total oficial"})
            continue
        esperado = {
            "nominal": o["QT_VOTOS_NOMINAIS_VALIDOS"] + nao_validos[k],
            "legenda": o["QT_VOTOS_LEG_VALIDOS"] + o["QT_VOTOS_LEGENDA_ANULADOS"] + o["QT_VOTOS_LEGENDA_ANUL_SUBJUD"],
            "branco": o["QT_VOTOS_BRANCOS"],
            "nulo": o["QT_VOTOS_NULOS"] + o["QT_VOTOS_NOMINAIS_ANULADOS"] + o["QT_VOTOS_NOMINAIS_ANUL_SUBJUD"] - nao_validos[k],
        }
        dif = {c: a[c] - v for c, v in esperado.items() if a[c] != v}
        if dif:
            divergencias.append({"chave": list(k), "diferencas": dif})
    return {
        "nivel": "município × zona (sem detalhe por seção em 2018 — opção B)",
        "chaves_votacao": len(por_secao), "chaves_munzona": len(oficial),
        "chaves_detalhe_por_turno_cargo": {f"{t}/{c}": n for (t, c), n in sorted(Counter(k[:2] for k in por_secao).items())},
        "so_na_votacao": 0, "so_no_detalhe": 0, "so_no_detalhe_sem_votos": 0, "chaves_detalhe_duplicadas": 0,
        "votos_especiais_97_98": sum(s["especial"] for s in por_secao.values()),
        "divergencias": len(divergencias), "amostras_divergencias": divergencias[:20],
        "totais_votacao": {c: sum(s[c] for s in por_secao.values()) for c in ("nominal", "legenda", "branco", "nulo")},
        "nulos_tecnicos_oficiais": sum(o["QT_VOTOS_NULOS_TECNICOS"] for o in oficial.values()),
    }


def ler_api_2026(raiz_lab: Path):
    """Lê o snapshot verificado da API: destino por SQ, votos por candidatura e totais por município."""
    snapshot = json.loads((raiz_lab / _SNAPSHOT_API).read_text(encoding="utf-8"))
    destino: dict[tuple[str, str], str] = {}
    inconsistentes = set()
    votos: Counter = Counter()        # (cargo, município, SQ)
    legenda_anulada: set[tuple[str, str, str]] = set()
    totais: dict[tuple[str, str], dict[str, int]] = {}
    for arq in snapshot["resultados"]:
        if arq["nivel"] != "municipio":
            continue
        cargo = arq["cargo_id"].lstrip("0")
        municipio = arq["municipio_tse"].lstrip("0")
        p = arq["payload"]
        totais[(cargo, municipio)] = {"validos": int(p["v"]["vv"]), "nominais": int(p["v"]["vnom"]),
                                      "legenda": int(p["v"].get("vl", 0)),
                                      "nulos_tecnicos": int(p["v"].get("vnt", 0))}
        for agr in p["carg"][0].get("agr", []):
            for par in agr["par"]:
                if par.get("dvt") and par["dvt"] not in DESTINOS_VALIDOS:
                    legenda_anulada.add(("1", cargo, par["n"]))
                for cand in par.get("cand", []):
                    chave = ("1", cand["sqcand"])
                    if destino.setdefault(chave, cand["dvt"]) != cand["dvt"]:
                        inconsistentes.add(chave)
                    votos[(cargo, municipio, cand["sqcand"])] += int(cand["vap"])
    meta = {"coletado_em": snapshot["coletado_em"], "arquivos_municipais": len(totais),
            "destinos_inconsistentes": len(inconsistentes)}
    return destino, votos, totais, legenda_anulada, meta


def _somar_por(validos: dict[ChaveSecao, int], indices: tuple[int, ...]) -> Counter:
    total: Counter = Counter()
    for chave, v in validos.items():
        total[tuple(chave[i] for i in indices)] += v
    return total


def conferir_validos_2022(validos, linhas_detalhe_munzona, ano: int = 2022):
    oficial: Counter = Counter()
    for r in linhas_detalhe_munzona:
        if _no_escopo(r, ano):
            oficial[(r["NR_TURNO"], r["CD_CARGO"], r["CD_MUNICIPIO"].lstrip("0"), r["NR_ZONA"])] += _int(r["QT_TOTAL_VOTOS_VALIDOS"])
    reconstruido = _somar_por(validos, (0, 1, 2, 3))
    chaves = set(oficial) | set(reconstruido)
    dif = sorted(k for k in chaves if oficial.get(k, 0) != reconstruido.get(k, 0))
    return {"chaves_municipio_zona": len(chaves), "divergencias": len(dif),
            "amostras": [{"chave": list(k), "reconstruido": reconstruido.get(k, 0), "oficial": oficial.get(k, 0)} for k in dif[:20]],
            "validos_reconstruidos": sum(reconstruido.values()), "validos_oficiais": sum(oficial.values())}


def conferir_validos_2026(validos, por_cand_zona: Counter, votos_api: Counter, totais_api,
                          sq_nulos_tecnicos: set[str]):
    reconstruido = _somar_por(validos, (1, 2))
    nulos_tecnicos: Counter = Counter()
    for (_turno, cargo, mun, _zona, sq), v in por_cand_zona.items():
        if sq in sq_nulos_tecnicos:
            nulos_tecnicos[(cargo, mun)] += v
    dif_nt = sorted(k for k in set(totais_api) | set(nulos_tecnicos)
                    if totais_api.get(k, {}).get("nulos_tecnicos", 0) != nulos_tecnicos.get(k, 0))
    dif_validos = sorted(k for k in set(totais_api) | set(reconstruido)
                         if totais_api.get(k, {}).get("validos", 0) != reconstruido.get(k, 0))
    votos_secao: Counter = Counter()
    for (turno, cargo, mun, _zona, sq), v in por_cand_zona.items():
        votos_secao[(cargo, mun, sq)] += v
    # "sem linha = 0 votos" dos dois lados
    dif_votos = sorted(k for k in set(votos_secao) | set(votos_api)
                       if k[2] not in sq_nulos_tecnicos and votos_secao.get(k, 0) != votos_api.get(k, 0))
    return {"municipio_cargo": len(totais_api), "divergencias_validos": len(dif_validos),
            "amostras_validos": [{"chave": list(k), "reconstruido": reconstruido.get(k, 0),
                                  "api": totais_api.get(k, {}).get("validos")} for k in dif_validos[:20]],
            "candidatura_municipio": len(set(votos_secao) | set(votos_api)),
            "divergencias_votos_candidatura": len(dif_votos),
            "amostras_votos": [{"chave": list(k), "secoes": votos_secao.get(k, 0), "api": votos_api.get(k, 0)} for k in dif_votos[:20]],
            "candidaturas_ausentes_da_api_nulo_tecnico": sorted(sq_nulos_tecnicos),
            "divergencias_nulos_tecnicos": len(dif_nt),
            "amostras_nulos_tecnicos": [list(k) for k in dif_nt[:10]],
            "validos_reconstruidos": sum(reconstruido.values()),
            "validos_api": sum(t["validos"] for t in totais_api.values())}


def resumo_destinos(destino, por_secao_candidatura, por_secao):
    votos_por_destino: Counter = Counter()
    cargo_por_sq = {}
    for (chave, sq), v in por_secao_candidatura.items():
        votos_por_destino[(chave[1], destino[(chave[0], sq)])] += v
    return {f"cargo {c} / {d}": v for (c, d), v in sorted(votos_por_destino.items())}


# ---------------------------------------------------------------- relatório

def _fonte_no_manifesto(raiz_lab: Path, dataset_id: str, caminho: Path) -> dict[str, object]:
    manifesto = json.loads((raiz_lab / "dados/manifesto.json").read_text(encoding="utf-8"))
    reg = manifesto.get(dataset_id, {}).get("arquivos", {}).get(str(caminho), {})
    return {"arquivo": str(caminho), "url": reg.get("url"), "sha256": reg.get("sha256"),
            "gerado_na_fonte": reg.get("gerado_na_fonte")}


def validar_ano(raiz_lab: Path, ano: int, corr: dict[str, str]) -> dict[str, object]:
    fontes = FONTES[ano]

    def ler(nome):
        _, caminho, membro = fontes[nome]
        return linhas_uf(raiz_lab / caminho, membro)

    def votacao():
        yield from ler("votacao_secao_uf")
        yield from ler("votacao_secao_br")

    por_secao, por_cand_zona, por_secao_cand, por_secao_leg, n_linhas = somar_votacao_secao(votacao(), ano)
    if "detalhe_secao" not in fontes:
        return _validar_2018(raiz_lab, fontes, ler, corr, por_secao, por_cand_zona, por_secao_cand, por_secao_leg, n_linhas)
    detalhe, duplicadas = ler_detalhe_secao(ler("detalhe_secao"), ano)
    a = conferir_secoes(por_secao, detalhe)
    a["linhas_votacao"] = n_linhas
    a["chaves_detalhe_duplicadas"] = duplicadas
    resultado: dict[str, object] = {
        "fontes": {n: _fonte_no_manifesto(raiz_lab, d, c) for n, (d, c, _) in fontes.items()},
        "A_secao_x_detalhe": a,
    }
    if "munzona" in fontes:
        resultado["B_secoes_x_munzona"] = conferir_munzona(por_cand_zona, ler("munzona"), ano)
    else:
        resultado["B_secoes_x_munzona"] = "arquivo município/zona do ano publicado sem linhas; ver conferência pela API"
    resultado["C_locais"] = conferir_locais(ler_locais(ler("locais")), detalhe, corr, raiz_lab)

    sq_com_voto = {(chave[0], sq) for chave, sq in por_secao_cand}
    if ano == 2022:
        destino, meta = destinos_2022(raiz_lab, ler("munzona"), sq_com_voto)
        legenda_anulada = legendas_anuladas_2022(ler("partido_munzona"))
        validos = validos_por_secao(por_secao, por_secao_cand, por_secao_leg, destino, legenda_anulada)
        d = conferir_validos_2022(validos, linhas_uf(raiz_lab / fontes["detalhe_munzona"][1], fontes["detalhe_munzona"][2]))
        d["fonte_destino"] = "NM_TIPO_DESTINACAO_VOTOS do arquivo município/zona 2022"
    else:
        destino, votos_api, totais_api, legenda_anulada, meta = ler_api_2026(raiz_lab)
        # Ausentes da API: votos tratados pelo TSE como nulos técnicos (conferido com `vnt`).
        faltam = sorted(sq_com_voto - set(destino))
        for chave in faltam:
            destino[chave] = "Nulo técnico (ausente da API)"
        validos = validos_por_secao(por_secao, por_secao_cand, por_secao_leg, destino, legenda_anulada)
        d = conferir_validos_2026(validos, por_cand_zona, votos_api, totais_api,
                                  {sq for _, sq in faltam})
        d["fonte_destino"] = "campo dvt da API de resultados do TSE (snapshot verificado)"
    d.update(meta)
    d["legendas_anuladas"] = sorted("/".join(k) for k in legenda_anulada)
    d["votos_legenda_anulada"] = sum(v for (c, p_), v in por_secao_leg.items() if (c[0], c[1], p_) in legenda_anulada)
    d["votos_nominais_por_destino"] = resumo_destinos(destino, por_secao_cand, por_secao)
    resultado["D_validos_EL0003"] = d
    return resultado


def detalhe_de_votacao(por_secao) -> dict:
    """2018: sem detalhe por seção; as seções vêm da própria votação (local pelo cadastro de locais)."""
    return {k: {"local": "-1"} for k in por_secao}


def _validar_2018(raiz_lab, fontes, ler, corr, por_secao, por_cand_zona, por_secao_cand, por_secao_leg, n_linhas):
    oficial = _detalhe_munzona(ler("detalhe_munzona"), 2018)
    destino, meta = destinos_2018(raiz_lab, por_cand_zona, oficial)
    a = conferir_categorias_munzona(por_secao, por_cand_zona, destino, oficial)
    a["linhas_votacao"] = n_linhas
    legenda_anulada = legendas_anuladas_2022(ler("partido_munzona"), 2018)
    validos = validos_por_secao(por_secao, por_secao_cand, por_secao_leg, destino, legenda_anulada)
    d = conferir_validos_2022(validos, ler("detalhe_munzona"), 2018)
    d["fonte_destino"] = "situação no cadastro de candidaturas 2018 + identificação pelos totais município/zona (opção B)"
    d.update(meta)
    d["legendas_anuladas"] = sorted("/".join(k) for k in legenda_anulada)
    d["votos_nominais_por_destino"] = resumo_destinos(destino, por_secao_cand, por_secao)
    return {
        "fontes": {n: _fonte_no_manifesto(raiz_lab, ds, c) for n, (ds, c, _) in fontes.items()},
        "A_secao_x_detalhe": a,
        "B_secoes_x_munzona": "2018: arquivo de candidaturas por município/zona não baixado (opção B); categorias conferidas em A",
        "C_locais": conferir_locais(ler_locais(ler("locais")), detalhe_de_votacao(por_secao), corr, raiz_lab),
        "D_validos_EL0003": d,
    }


def _status(r: dict[str, object]) -> str:
    a = r["A_secao_x_detalhe"]
    b = r["B_secoes_x_munzona"]
    d = r["D_validos_EL0003"]
    if (d.get("divergencias", 0) or d.get("divergencias_validos", 0)
            or d.get("divergencias_votos_candidatura", 0) or d.get("divergencias_nulos_tecnicos", 0)):
        return "requer investigação (votos válidos)"
    ok = (a["divergencias"] == 0 and a["so_na_votacao"] == 0
          and a["so_no_detalhe"] == a["so_no_detalhe_sem_votos"]
          and a["chaves_detalhe_duplicadas"] == 0
          and (isinstance(b, str) or b["divergencias"] == 0))
    return "sem divergências de votos" if ok else "requer investigação"


def validar(raiz_lab: Path, anos: list[int]) -> dict[str, object]:
    corr = ler_correspondencia(raiz_lab)
    relatorio: dict[str, object] = {
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "escopo": {"uf": UF, "eleicao": "geral ordinária (CD_TIPO_ELEICAO=2)", "anos": anos,
                   "chave_secao": ["NR_TURNO", "CD_CARGO", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO"],
                   "classificacao_votavel": "95 branco; 96 nulo; 97/98 especiais; 2 dígitos em cargos 6/7/8 = legenda",
                   "regra_ausencia": "sem linha = 0 votos",
                   "correspondencia_municipal": f"L0001 + EL0002 ({len(corr)} municípios do PI com código IBGE)",
                   "tolerancia_votos": 0},
        "anos": {},
    }
    for ano in anos:
        r = validar_ano(raiz_lab, ano, corr)
        r["status_automatizado"] = _status(r)
        relatorio["anos"][str(ano)] = r
    relatorio["limites"] = [
        "Não confere percentuais, agregações em JS nem correlações (testes de paridade à parte).",
        "Coordenadas fora do polígono municipal são reportadas, não corrigidas; a malha é IBGE 2022.",
        "2026: dados totalizados de 2026-10-05; conferência com a API do TSE é feita à parte.",
    ]
    return relatorio


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--anos", type=int, nargs="+", default=[2018, 2022, 2026], choices=sorted(FONTES))
    args = parser.parse_args()
    raiz_lab = raiz()
    relatorio = validar(raiz_lab, args.anos)
    destino = raiz_lab / "projetos/eleicoes/analise/relatorio_qualidade_distribuicao_pi.json"
    destino.write_text(json.dumps(relatorio, ensure_ascii=False, indent=1), encoding="utf-8")
    for ano, r in relatorio["anos"].items():
        print(ano, r["status_automatizado"])
    print(f"Relatório: {destino.relative_to(raiz_lab)}")


if __name__ == "__main__":
    main()
