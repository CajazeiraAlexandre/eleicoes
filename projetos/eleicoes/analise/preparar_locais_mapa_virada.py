"""Locais de votação do "mapa da virada": abstenção (Presidente, 1º turno de 2026) por local, com o par de 2022 (EL0009).

Entradas (todas já no manifesto):
  - tse.detalhe_votacao_secao 2026 (`_BR.csv`, Presidente) e 2022 (`_BRASIL.csv`, Presidente): aptos e abstenções por seção;
  - tse.eleitorado_local_votacao 2026 e 2022: local, endereço, tipo e coordenadas de cada seção (no detalhe de 2026 o
    local vem vazio, `-1`; a seção principal do cadastro dá o local — seções agregadas já estão somadas na principal);
  - ibge.malha_municipios_2022: coordenada dentro ou fora do próprio município (reportado, não corrigido);
  - correspondência TSE ⇄ IBGE (L0001 + EL0002, adendo nacional).
Saídas:
  - <produto>/data/locais/<IBGE>.js — um arquivo por município (JSON em gzip + base64), carregado por <script> só quando o município é
    escolhido na página (L0002: abre com duplo clique, sem servidor);
  - analise/relatorio_qualidade_locais_mapa_virada.json — ligação seção → local, conferência dos totais, pareamento.

Uso: python -m projetos.eleicoes.analise.preparar_locais_mapa_virada
"""
from __future__ import annotations

import json
import math
import re
import tempfile
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path

import yaml

from labdados.catalogo import raiz
from projetos.eleicoes.analise import validar_mapa_virada as qa
from projetos.eleicoes.analise.preparar_mapa_virada import MALHA, PRODUTO, _embutir

BRUTO = Path("dados/bruto/tse")
SAIDA = PRODUTO / "data" / "locais"
RELATORIO = Path("projetos/eleicoes/analise/relatorio_qualidade_locais_mapa_virada.json")
DISTANCIA_PAR_M = 100           # EL0009: mesma chave e nome normalizado igual OU coordenadas a até 100 m
TIPOS = {"Convencional": "C", "Temporário": "T", "Preso provisório": "P", "Voto em trânsito": "V"}
CAMPOS = ["zona", "local", "nome", "bairro", "endereco", "tipo", "lat", "lon", "coord", "secoes", "aptos", "abstencoes",
          "par", "aptos_2022", "abstencoes_2022", "nome_2022", "distancia_2022_m"]


# ---------------------------------------------------------------- funções de referência (testadas)

def normalizar_nome(nome: str) -> str:
    """Nome do local para comparação (EL0009): sem acento, maiúsculas, só letras/dígitos, espaços simples."""
    s = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode("ascii").upper()
    return re.sub(r" +", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def distancia_m(lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None) -> float | None:
    """Distância de grande círculo (haversine, raio 6.371 km), em metros; None se faltar coordenada."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    f1, f2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((f2 - f1) / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def situacao_par(tipo: str, nome: str, lat: float | None, lon: float | None, anterior: dict | None) -> tuple[str, float | None]:
    """Par do local de 2026 em 2022 (EL0009), já sabendo que a chave município + zona + nº do local existe ou não.

    `anterior` = {"nomes": {nomes normalizados}, "coords": [(lat, lon), ...]} do local de 2022 com a mesma chave.
    Devolve (situação, distância em m): "especial" (trânsito, preso provisório, temporário: fora da comparação),
    "sem_chave", "nome" (par pelo nome normalizado), "distancia" (par por coordenadas a até 100 m) ou "sem_par".
    """
    if tipo != "C":
        return "especial", None
    if anterior is None:
        return "sem_chave", None
    ds = [d for la, lo in anterior["coords"] if (d := distancia_m(lat, lon, la, lo)) is not None]
    d = min(ds) if ds else None
    if normalizar_nome(nome) in anterior["nomes"]:
        return "nome", d
    if d is not None and d <= DISTANCIA_PAR_M:
        return "distancia", d
    return "sem_par", d


# ---------------------------------------------------------------- leitura (duckdb sobre os CSV extraídos)

def _extrair(zip_: Path, membros: list[str], destino: Path) -> list[Path]:
    with zipfile.ZipFile(zip_) as z:
        nomes = [n for n in z.namelist() if any(re.fullmatch(m, n) for m in membros)]
        for n in nomes:
            z.extract(n, destino)
    return [destino / n for n in nomes]


def ler_secoes(raiz_lab: Path, tmp: Path, con=None):
    """Seções → locais (2026 pelo cadastro; 2022 pelo detalhe). Com `con` (duckdb), deixa nele as tabelas
    d26, d22 (detalhe, Presidente, 1º turno), c26 e c22 (cadastro) para quem precisar de mais colunas."""
    import duckdb

    con = con or duckdb.connect()
    opt = "sep=';', encoding='latin-1', header=true, all_varchar=true, union_by_name=true"
    coord = lambda c: f"case when {c} in ('-1', '', '#NULO#', '#NE#') or {c} is null then null else replace({c}, ',', '.')::double end"
    det26 = _extrair(raiz_lab / BRUTO / "detalhe_votacao_secao/detalhe_votacao_secao_2026.zip", [r"detalhe_votacao_secao_2026_BR\.csv"], tmp)
    det22 = _extrair(raiz_lab / BRUTO / "detalhe_votacao_secao/detalhe_votacao_secao_2022.zip", [r"detalhe_votacao_secao_2022_BRASIL\.csv"], tmp)
    cad26 = _extrair(raiz_lab / BRUTO / "eleitorado_local_votacao/eleitorado_local_votacao_2026.zip", [r"eleitorado_local_votacao_2026_[A-Z]{2}\.csv"], tmp)
    cad22 = _extrair(raiz_lab / BRUTO / "eleitorado_local_votacao/eleitorado_local_votacao_2022.zip", [r"eleitorado_local_votacao_2022\.csv"], tmp)
    lista = lambda ps: "[" + ", ".join(f"'{p}'" for p in ps) + "]"
    con.sql(f"""create table d26 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao,
                QT_APTOS::int aptos, QT_ABSTENCOES::int abst from read_csv({lista(det26)}, {opt})
                where NR_TURNO = '1' and CD_CARGO = '1' and SG_UF <> 'ZZ'""")
    con.sql(f"""create table d22 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao, NR_LOCAL_VOTACAO::int nl,
                NM_LOCAL_VOTACAO nome, QT_APTOS::int aptos, QT_ABSTENCOES::int abst from read_csv({lista(det22)}, {opt})
                where NR_TURNO = '1' and CD_CARGO = '1' and SG_UF <> 'ZZ'""")
    con.sql(f"""create table c26 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao, NR_LOCAL_VOTACAO::int nl,
                NM_LOCAL_VOTACAO nome, NM_BAIRRO bairro, DS_ENDERECO endereco, DS_TIPO_LOCAL tipo, DS_TIPO_SECAO_AGREGADA agregada,
                {coord('NR_LATITUDE')} lat, {coord('NR_LONGITUDE')} lon from read_csv({lista(cad26)}, {opt}) where NR_TURNO = '1'""")
    con.sql(f"""create table c22 as select CD_MUNICIPIO::int mun, NR_ZONA::int zona, NR_SECAO::int secao,
                {coord('NR_LATITUDE')} lat, {coord('NR_LONGITUDE')} lon from read_csv({lista(cad22)}, {opt}) where NR_TURNO = '1'""")
    qa_lig = {
        "2026": dict(zip(["secoes", "ligadas", "ligadas_principal", "aptos", "aptos_ligados"], con.sql(
            """select count(*), count(c.secao), count(*) filter (where c.agregada = 'Principal'), sum(d.aptos), sum(d.aptos) filter (where c.secao is not null)
               from d26 d left join c26 c using (mun, zona, secao)""").fetchone())),
        "2022_coordenadas": dict(zip(["secoes", "com_cadastro"], con.sql(
            "select count(*), count(c.secao) from d22 d left join c22 c using (mun, zona, secao)").fetchone())),
    }
    l26 = con.sql("""select d.mun, d.zona, c.nl, any_value(c.nome) nome, any_value(c.bairro) bairro, any_value(c.endereco) endereco,
                     any_value(c.tipo) tipo, any_value(c.lat) lat, any_value(c.lon) lon, count(*) secoes, sum(d.aptos) aptos, sum(d.abst) abst,
                     count(distinct c.nome) nnomes
                     from d26 d join c26 c using (mun, zona, secao) group by all order by 1, 2, 3""").fetchall()
    l22 = con.sql("""select d.mun, d.zona, d.nl, list(distinct d.nome) nomes, list(distinct [c.lat, c.lon]) filter (where c.lat is not null) coords,
                     sum(d.aptos) aptos, sum(d.abst) abst
                     from d22 d left join c22 c using (mun, zona, secao) group by all""").fetchall()
    return l26, l22, qa_lig


def ler_malha(raiz_lab: Path):
    """Polígonos municipais IBGE 2022 (sem simplificar), indexados pelo código IBGE."""
    import geopandas as gpd

    return gpd.read_file(f"zip://{raiz_lab / MALHA}").set_index("CD_MUN").geometry


def dentro_do_municipio(malha, pontos: list[tuple[str, float, float]]) -> list[bool]:
    """Para cada (IBGE, lat, lon): o ponto está no polígono do próprio município (malha IBGE 2022, sem simplificar)?"""
    import shapely

    return [bool((gm := malha.get(c)) is not None and shapely.covers(gm, shapely.Point(lo, la))) for c, la, lo in pontos]


def contorno(malha, ibge: str) -> dict | None:
    """Contorno do município para o fundo do mapa de pontos: tolerância de ~1 px no mapa de 560 px (1/600 da maior
    dimensão do município, no mínimo 0,0003° ≈ 30 m), anel externo em sentido horário (exigência do d3-geo) e
    coordenadas com 4 casas. Só desenho; a conferência dentro/fora usa a malha cheia."""
    import shapely

    gm = malha.get(ibge)
    if gm is None:
        return None
    x0, y0, x1, y1 = gm.bounds
    tol = max(0.0003, max(x1 - x0, y1 - y0) / 600)
    gm = shapely.orient_polygons(shapely.simplify(gm, tol, preserve_topology=True), exterior_cw=True)
    return json.loads(re.sub(r"(-?\d+\.\d{4})\d+", r"\1", shapely.to_geojson(gm)))


# ---------------------------------------------------------------- montagem

def montar(raiz_lab: Path, tmp: Path) -> tuple[dict[str, dict], dict]:
    l26, l22, rel_lig = ler_secoes(raiz_lab, tmp)
    corr = qa.correspondencia(raiz_lab)
    ant = {(m, z, n): {"nomes": {normalizar_nome(x) for x in nomes}, "coords": [tuple(c) for c in coords or []],
                       "nome": sorted(nomes)[0], "aptos": a, "abst": b}
           for m, z, n, nomes, coords, a, b in l22}

    com_coord = [(corr.get(str(r[0]), ("",))[0], r[7], r[8]) for r in l26 if r[7] is not None]
    malha = ler_malha(raiz_lab)
    dentro = iter(dentro_do_municipio(malha, com_coord))
    por_mun: dict[str, dict] = {}
    cont = Counter()
    aptos_sit = Counter()
    sem_ibge = Counter()
    for mun, zona, nl, nome, bairro, end, tipo, lat, lon, secoes, aptos, abst, nnomes in l26:
        ibge = corr.get(str(mun), ("",))[0]
        coord = "sem" if lat is None else ("ok" if next(dentro) else "fora")
        t = TIPOS.get(tipo, "C")
        if tipo not in TIPOS:
            raise SystemExit(f"tipo de local desconhecido: {tipo!r} ({mun}/{zona}/{nl})")
        if nnomes > 1:
            raise SystemExit(f"local de 2026 com mais de um nome no cadastro: {mun}/{zona}/{nl}")
        a = ant.get((mun, zona, nl))
        par, dist = situacao_par(t, nome, lat, lon, a)
        cont[par] += 1
        aptos_sit[par] += aptos
        cont[f"coord_{coord}"] += 1
        if not ibge:
            sem_ibge[mun] += aptos
            continue
        comparavel = par in ("nome", "distancia")
        if ibge not in por_mun:
            por_mun[ibge] = {"m": ibge, "tse": str(mun), "contorno": contorno(malha, ibge), "campos": CAMPOS, "l": []}
        m = por_mun[ibge]
        m["l"].append([zona, nl, nome.strip(), (bairro or "").strip(), (end or "").strip(), t,
                       None if lat is None else round(lat, 5), None if lon is None else round(lon, 5), coord, secoes, aptos, abst,
                       par, a["aptos"] if comparavel else None, a["abst"] if comparavel else None,
                       a["nome"].strip() if comparavel else None, None if dist is None else round(dist)])

    # conferência (tolerância zero): Σ locais por município = totais oficiais por município
    oficial26 = {k[2]: v for k, v in qa.presidente_2026(raiz_lab, qa.Agrupamento(yaml.safe_load((raiz_lab / qa.REFERENCIA).read_text(encoding="utf-8"))))[1].items()}
    oficial22 = {k[2]: v for k, v in qa.detalhe(raiz_lab, 2022).items() if k[0] == "1" and k[1] == "presidente"}
    soma26, soma22 = Counter(), Counter()
    for r in l26:
        soma26[(str(r[0]), "aptos")] += r[10]
        soma26[(str(r[0]), "abstencoes")] += r[11]
    for m, z, n, nomes, coords, a, b in l22:
        soma22[(str(m), "aptos")] += a
        soma22[(str(m), "abstencoes")] += b

    def conferir(soma, oficial):
        divs = []
        for tse in sorted(set(k[0] for k in soma) | set(oficial), key=int):
            for campo in ("aptos", "abstencoes"):
                s, o = soma[(tse, campo)], oficial.get(tse, Counter())[campo]
                if s != o:
                    divs.append({"municipio_tse": tse, "campo": campo, "soma_locais": s, "oficial": o})
        return {"municipios": len(set(k[0] for k in soma)), "divergencias": len(divs), "amostras": divs[:20],
                "aptos": sum(v for k, v in soma.items() if k[1] == "aptos"), "abstencoes": sum(v for k, v in soma.items() if k[1] == "abstencoes")}

    rel = {
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "decisoes": ["EL0009", "EL0002", "L0001"],
        "ligacao_secao_local": rel_lig,
        "conferencia_2026_api": conferir(soma26, oficial26),
        "conferencia_2022_munzona": conferir(soma22, oficial22),
        "locais_2026": len(l26),
        "locais_2022": len(l22),
        "pareamento": {k: {"locais": cont[k], "aptos_2026": aptos_sit[k]} for k in ("nome", "distancia", "sem_par", "sem_chave", "especial")},
        "coordenadas": {k: cont[f"coord_{k}"] for k in ("ok", "fora", "sem")},
        "municipios_com_arquivo": len(por_mun),
        "fora_do_mapa_sem_ibge": [{"municipio_tse": str(k), "aptos": v} for k, v in sem_ibge.items()],
    }
    return por_mun, rel


def gravar(raiz_lab: Path, por_mun: dict[str, dict]) -> int:
    pasta = raiz_lab / SAIDA
    pasta.mkdir(parents=True, exist_ok=True)
    for antigo in pasta.glob("*.js"):
        antigo.unlink()
    total = 0
    for ibge, m in por_mun.items():
        # JSON compactado (gzip + base64, o mesmo formato da base embutida; a página abre com Lab.decodificar)
        texto = (f'(window.LOCAIS_VIRADA = window.LOCAIS_VIRADA || {{}})["{ibge}"] = "{_embutir(m)}";\n')
        (pasta / f"{ibge}.js").write_text(texto, encoding="utf-8")
        total += len(texto.encode("utf-8"))
    return total


def main() -> None:
    raiz_lab = raiz()
    with tempfile.TemporaryDirectory() as tmp:
        por_mun, rel = montar(raiz_lab, Path(tmp))
    total = gravar(raiz_lab, por_mun)
    rel["tamanho_total_mb"] = round(total / 1e6, 1)
    (raiz_lab / RELATORIO).write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: rel[k] for k in ("pareamento", "coordenadas", "municipios_com_arquivo", "tamanho_total_mb")}, ensure_ascii=False))
    for k in ("conferencia_2026_api", "conferencia_2022_munzona"):
        print(k, rel[k]["divergencias"], "divergências")


if __name__ == "__main__":
    main()
