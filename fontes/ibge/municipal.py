"""Referências municipais do IBGE usadas por vários projetos: lista de municípios, população do Censo 2022,
REGIC 2018, Semiárido 2022, Amazônia Legal 2022, terras indígenas e territórios quilombolas (Censo 2022), população
indígena e quilombola, IPCA mensal e classes de porte.

    python fontes/ibge/municipal.py            # consulta as APIs e salva as cópias locais (política "sempre")

Origem: funções do projeto cultura (Eixo 2 — `territorio_pncv.py`, `lpg_perfil.py`, `salic_perfil.py`),
promovidas para `fontes/ibge/` na incorporação (2026-10-07). Bases de API seguem a seção 4.2 do laboratório:
leitura pela cópia local mais recente (`labdados.api.obter`), consulta registrada no manifesto.
"""
from __future__ import annotations

import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from labdados import api
from labdados.catalogo import raiz

PASTA_BRUTO = Path("dados/bruto/ibge")
CAPITAIS = {   # códigos de 7 dígitos das 27 capitais
    "1100205", "1200401", "1302603", "1400100", "1501402", "1600303", "1721000", "2111300", "2211001",
    "2304400", "2408102", "2507507", "2611606", "2704302", "2800308", "2927408", "3106200", "3205309",
    "3304557", "3550308", "4106902", "4205407", "4314902", "5002704", "5103403", "5208707", "5300108",
}
REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"]
# Porte do Boletim SNIIC nº 02 (CN0004) e porte em 5 classes (como na base da LPG)
PORTE_SNIIC = ["Pequeno porte I", "Pequeno porte II", "Médio porte", "Grande porte"]
PORTE_V2 = ["Pequeno porte I", "Pequeno porte II", "Médio porte", "Grande porte", "Mais de 500 mil habitantes"]
HIERARQUIA_REGIC = ["1 - Metrópole", "2 - Capital Regional", "3 - Centro Sub-Regional", "4 - Centro de Zona", "5 - Centro Local"]
CATEGORIA_REGIC = ["Município isolado", "Arranjo Populacional"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
         "outubro", "novembro", "dezembro"]
_AUSENTE_SIDRA = {"...", "-", "..", "x", "", None}


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")


def norm_municipio(s) -> str:
    """Nome de município para junção por nome + UF: minúsculas, sem acento, sem sufixo " - UF" ou " (UF)",
    sem apóstrofo, ponto ou hífen. Vazio para ausente."""
    if s is None or (isinstance(s, float) and np.isnan(s)) or s is pd.NA:
        return ""
    t = sem_acento(s).lower().strip()
    t = t.split(" - ")[0].split("(")[0].strip()
    t = t.replace("'", "").replace("`", "").replace(".", "").replace("-", " ")
    return " ".join(t.split())


def _uf_do_municipio(m: dict) -> dict | None:
    """UF no JSON de localidades, tolerando as duas hierarquias (micro/meso e imediata/intermediária)."""
    for caminho in (("microrregiao", "mesorregiao", "UF"), ("regiao-imediata", "regiao-intermediaria", "UF")):
        no = m
        for k in caminho:
            no = (no or {}).get(k)
        if no:
            return no
    return None


def municipios(modo: str = "auto") -> tuple[pd.DataFrame, str]:
    """Municípios do IBGE: cod_ibge (7), cod6, municipio (nome oficial), municipio_norm, uf, regiao, capital.
    Retorna (tabela, origem)."""
    dados, origem = api.obter("ibge.municipios", modo=modo)
    linhas = []
    for m in dados:
        uf = _uf_do_municipio(m)
        if uf:
            linhas.append({"cod_ibge": str(m["id"]), "municipio": m["nome"], "municipio_norm": norm_municipio(m["nome"]),
                           "uf": uf["sigla"], "regiao": uf["regiao"]["nome"]})
    df = pd.DataFrame(linhas).drop_duplicates("cod_ibge")
    df["cod6"] = df["cod_ibge"].str[:6]
    faltam = CAPITAIS - set(df["cod_ibge"])
    if faltam:
        raise ValueError(f"Capitais ausentes da lista do IBGE: {faltam}")
    df["capital"] = df["cod_ibge"].isin(CAPITAIS)
    return df.reset_index(drop=True), origem


def populacao_censo2022(modo: str = "auto") -> tuple[pd.DataFrame, str]:
    """População residente total por município, Censo 2022 (SIDRA 9514, total de sexo e idade):
    cod_ibge (7), populacao. Retorna (tabela, origem)."""
    dados, origem = api.obter("ibge.populacao_sexo_idade_9514", modo=modo)
    linhas = [{"cod_ibge": r["D1C"], "populacao": int(r["V"])} for r in dados[1:] if r["V"] not in _AUSENTE_SIDRA]
    return pd.DataFrame(linhas), origem


def regic_2018() -> pd.DataFrame:
    """REGIC 2018 por município (5.570): cod_ibge, hierarquia (5 níveis, sem o sufixo de arranjo), categoria
    (isolado × arranjo), região de influência imediata e código do arranjo populacional (`codap`)."""
    arq = sorted((raiz() / PASTA_BRUTO / "regic_2018").glob("*.xlsx"))[-1]
    r = pd.read_excel(arq, sheet_name="Hierarquia e região")
    if r["codmun"].duplicated().any() or len(r) != 5570:
        raise ValueError(f"REGIC 2018 inesperada: {len(r)} linhas ou códigos duplicados.")
    return pd.DataFrame({
        "cod_ibge": r["codmun"].astype(str),
        "hierarquia": r["Hierarquia - grupo"].astype("string")
            .str.replace(r"\s*-\s*Integrante de Arranjo Populacional$", "", regex=True),
        "categoria": r["Categoria"].astype("string"),
        "regiao_influencia": r["Região de influência - vínculação imediata consolidada"].astype("string"),
        "codap": r["codap"],
    })


def semiarido_2022() -> set[str]:
    """Códigos (7 dígitos) dos 1.477 municípios do Semiárido (Resolução CONDEL/SUDENE nº 176/2024)."""
    arq = sorted((raiz() / PASTA_BRUTO / "semiarido_2022").glob("*.xlsx"))[-1]
    cods = set(pd.read_excel(arq, sheet_name="1477 mun")["CD_MUN"].astype(str))
    if len(cods) != 1477:
        raise ValueError(f"Semiárido: {len(cods)} municípios (esperado 1.477).")
    return cods


def amazonia_legal_2022() -> set[str]:
    """Códigos (7 dígitos) dos 772 municípios da Amazônia Legal, edição 2022 do IBGE (Lei Complementar nº 124/2007):
    AC, AP, AM, PA, RO, RR, TO e MT inteiros e 181 municípios do Maranhão (21 deles só em parte)."""
    arq = sorted((raiz() / PASTA_BRUTO / "amazonia_legal_2022").glob("*.xlsx"))[-1]
    cods = set(pd.read_excel(arq, dtype={"CD_MUN": str})["CD_MUN"].dropna())
    if len(cods) != 772:
        raise ValueError(f"Amazônia Legal 2022: {len(cods)} municípios (esperado 772).")
    return cods


TERRITORIOS = {   # polígonos do Censo 2022 (2ª apuração): dataset → (zip, shapefile interno, coluna do código, coluna do nome)
    "ti": ("terras_indigenas_2022/BR_TIs_2a_apuracao_20231222.zip",
           "BR_TIs_2a_apuracao_18102023/BR_TI_Publicacao_CD2022_181023.shp", "COD_TI", "NOM_TI"),
    "tq": ("territorios_quilombolas_2022/BR_TQ_2a_apuracao_20231222.zip",
           "BR_TQ_2apuracao_181023/CD2022_Territorios_Quilombolas_oficialmente_delimitados_181023.shp", "COD_TQ", "NOM_TQ"),
}
CRS_AREA = "ESRI:102033"   # South America Albers Equal Area Conic (áreas em km²)


def territorios_tradicionais(area_min_km2: float = 1.0, fracao_min: float = 0.01) -> pd.DataFrame:
    """Municípios com terra indígena (TI) e com território quilombola (TQ) oficialmente delimitados no Censo 2022 (IBGE).
    Um município "tem" o território se a sobreposição é de ao menos `area_min_km2` km² OU de ao menos `fracao_min` da área
    do território (para não contar faixas de borda criadas pela diferença de traçado entre as bases — CN0011).
    Retorna cod_ibge, n_ti, area_ti_km2, n_tq, area_tq_km2, tem_ti, tem_tq (um registro por município, todos os 5.570)."""
    import geopandas as gpd
    arq_m = raiz() / PASTA_BRUTO / "malha_municipios_2022" / "BR_Municipios_2022.zip"
    mun = gpd.read_file(f"zip://{arq_m}")[["CD_MUN", "geometry"]].to_crs(CRS_AREA)
    saida = pd.DataFrame({"cod_ibge": mun["CD_MUN"].astype(str)})
    for chave, (zipf, interno, cod, _) in TERRITORIOS.items():
        t = gpd.read_file(f"/vsizip/{raiz() / PASTA_BRUTO / zipf}/{interno}")[[cod, "geometry"]].to_crs(CRS_AREA)
        t["geometry"] = t.geometry.make_valid()
        t["area_t"] = t.area / 1e6
        x = gpd.overlay(t, mun, how="intersection", keep_geom_type=True)
        x["area"] = x.area / 1e6
        x = x[(x["area"] >= area_min_km2) | (x["area"] >= fracao_min * x["area_t"])]
        g = x.groupby("CD_MUN").agg(n=(cod, "nunique"), area=("area", "sum"))
        saida[f"n_{chave}"] = saida["cod_ibge"].map(g["n"]).fillna(0).astype(int)
        saida[f"area_{chave}_km2"] = saida["cod_ibge"].map(g["area"]).fillna(0.0)
        saida[f"tem_{chave}"] = saida[f"n_{chave}"] > 0
    return saida


def _buscar_populacao_tradicional(endpoint: str, params: dict) -> list[dict]:
    """Pessoas indígenas (SIDRA 9718, var. 350) e quilombolas (SIDRA 10089, var. 4709) por município, Censo 2022."""
    import httpx
    saida = []
    for tabela, var, nome in ((9718, 350, "indigenas"), (10089, 4709, "quilombolas")):
        r = httpx.get(f"{endpoint}/{tabela}/periodos/2022/variaveis/{var}", params={"localidades": "N6[all]"}, timeout=120)
        r.raise_for_status()
        for s in r.json()[0]["resultados"][0]["series"]:
            saida.append({"tabela": tabela, "grupo": nome, "cod_ibge": s["localidade"]["id"], "valor": s["serie"]["2022"]})
    return saida


def populacao_indigena_quilombola(modo: str = "auto") -> tuple[pd.DataFrame, str]:
    """Pessoas indígenas e quilombolas por município (Censo 2022): cod_ibge, pessoas_indigenas, pessoas_quilombolas.
    Retorna (tabela, origem)."""
    dados, origem = api.obter("ibge.populacao_indigena_quilombola_2022", modo=modo, buscar=_buscar_populacao_tradicional)
    df = pd.DataFrame(dados)
    df["valor"] = pd.to_numeric(df["valor"].where(~df["valor"].isin(_AUSENTE_SIDRA)), errors="coerce")
    df = df.pivot_table(index="cod_ibge", columns="grupo", values="valor", aggfunc="sum").reset_index()
    return df.rename(columns={"indigenas": "pessoas_indigenas", "quilombolas": "pessoas_quilombolas"}), origem


def porte(populacao: pd.Series, classes: str = "sniic") -> pd.Series:
    """Classe de porte: "sniic" (4 classes do Boletim SNIIC nº 02 — CN0004) ou "v2" (5 classes, separa > 500 mil)."""
    if classes == "sniic":
        return pd.cut(populacao, [0, 20_000, 50_000, 100_000, np.inf], labels=PORTE_SNIIC).astype("string")
    return pd.cut(populacao, [0, 20_000, 50_000, 100_000, 500_000, np.inf], labels=PORTE_V2).astype("string")


def ipca_mensal(salvar: bool = True) -> dict:
    """Número-índice mensal do IPCA (SIDRA 1737, var. 2266) e o mês de referência (o mais recente publicado).
    Consulta a API para pegar o último mês; política "sempre": salva cópia quando há mês novo. Sem resposta
    da API, usa a cópia local mais recente. Retorna {serie (Series AAAAMM → índice), ref_mes, ref_indice,
    ref_rotulo, origem}."""
    try:
        dados, origem = api.obter("ibge.ipca_mensal", modo="api")
        ultima = api.snapshot_mais_recente("ibge.ipca_mensal")
        if salvar and (ultima is None or _ultimo_mes(dados) != _ultimo_mes(api.obter("ibge.ipca_mensal", modo="snapshot")[0])):
            caminho = api.salvar_snapshot("ibge.ipca_mensal", dados, confirmado=True)   # política "sempre" (2026-10-07)
            origem = f"snapshot:{caminho.relative_to(raiz())}"
        elif ultima is not None and _ultimo_mes(dados) == _ultimo_mes(api.obter("ibge.ipca_mensal", modo="snapshot")[0]):
            # sem mês novo: usa a cópia local (mesmo conteúdo, versionada) para a origem ficar reproduzível
            dados, origem = api.obter("ibge.ipca_mensal", modo="snapshot")
    except Exception:
        dados, origem = api.obter("ibge.ipca_mensal", modo="snapshot")
    serie = pd.Series({r["D3C"]: float(r["V"]) for r in dados[1:] if r["V"] not in _AUSENTE_SIDRA}).sort_index()
    ref = serie.index[-1]
    return {"serie": serie, "ref_mes": ref, "ref_indice": float(serie.iloc[-1]),
            "ref_rotulo": f"{MESES[int(ref[4:]) - 1]} de {ref[:4]}", "origem": origem}


def _ultimo_mes(dados: list) -> str:
    return max(r["D3C"] for r in dados[1:] if r["V"] not in _AUSENTE_SIDRA)


def salvar_copias() -> None:
    """Consulta municípios e população 9514 e salva as cópias locais (política "sempre", autorizada em 2026-10-07)."""
    for id_ in ("ibge.municipios", "ibge.populacao_sexo_idade_9514"):
        dados, _ = api.obter(id_, modo="api")
        print(f"{id_}: {api.salvar_snapshot(id_, dados, confirmado=True).relative_to(raiz())}")
    print(f"ibge.ipca_mensal: referência {ipca_mensal()['ref_rotulo']}")


if __name__ == "__main__":
    salvar_copias()
