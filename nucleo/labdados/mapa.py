"""Camadas de referência para o componente de mapa (Lab.mapa — ADR L0006).

As camadas vêm das malhas oficiais do IBGE (edição 2022) e entram na base do produto, então o mapa tem contexto
mesmo sem internet e sem fundo de terceiros:

- ``referencia_ufs``: UFs vizinhas (e a própria UF) recortadas num retângulo em volta da UF do produto, desenhadas
  em cinza por baixo das unidades;
- ``rotulos_municipios``: poucas cidades de referência (capital, polos), com o ponto representativo do polígono do
  município (a malha não traz a sede; o ponto fica sempre dentro do município).

Uso (no script que monta a base do produto):

    from labdados.mapa import referencia_ufs, rotulos_municipios
    base["referencia"] = referencia_ufs(raiz, "PI")
    base["rotulos"] = rotulos_municipios(raiz, ["2211001", "2207702"])   # Teresina, Parnaíba

Datasets: ``ibge.malha_ufs_2022`` e ``ibge.malha_municipios_2022`` (declarar no produto.yaml).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

MALHA_UFS = Path("dados/bruto/ibge/malha_ufs_2022/BR_UF_2022.zip")
MALHA_MUNICIPIOS = Path("dados/bruto/ibge/malha_municipios_2022/BR_Municipios_2022.zip")


def _geojson(gdf, colunas: dict[str, str]) -> dict:
    """GeoDataFrame → FeatureCollection com as colunas renomeadas e coordenadas com 4 casas (≈ 10 m)."""
    saida = gdf[list(colunas) + ["geometry"]].rename(columns=colunas)
    texto = re.sub(r"(-?\d+\.\d{4})\d+", r"\1", saida.to_json())
    return json.loads(texto)


def referencia_ufs(raiz: Path, uf: str, margem: float = 2.5, tolerancia: float = 0.02) -> dict:
    """UFs que tocam o retângulo da UF ``uf`` ampliado em ``margem`` graus, recortadas nesse retângulo.

    Entrada: raiz do laboratório, sigla da UF (ex.: "PI"). Saída: FeatureCollection com ``properties.id`` = sigla e
    ``properties.nome``. ``tolerancia`` (graus) simplifica as fronteiras — é só contexto visual, não análise.
    """
    import geopandas as gpd
    from shapely.geometry import box

    g = gpd.read_file(f"zip://{Path(raiz) / MALHA_UFS}")
    alvo = g[g["SIGLA_UF"] == uf]
    if alvo.empty:
        raise ValueError(f"UF não encontrada na malha: {uf}")
    x0, y0, x1, y1 = alvo.total_bounds
    caixa = box(x0 - margem, y0 - margem, x1 + margem, y1 + margem)
    viz = g[g.intersects(caixa)].copy()
    viz["geometry"] = viz.geometry.intersection(caixa).simplify(tolerancia, preserve_topology=True)
    return _geojson(viz, {"SIGLA_UF": "id", "NM_UF": "nome"})


def rotulos_municipios(raiz: Path, codigos_ibge: list[str], nomes: dict[str, str] | None = None) -> list[dict]:
    """Rótulos de cidades de referência: ``[{"nome", "coord": [lon, lat]}]``, na ordem dos códigos IBGE pedidos.

    ``nomes`` substitui o nome do IBGE quando o produto usa outra grafia. Erro se algum código não existir.
    """
    import geopandas as gpd

    g = gpd.read_file(f"zip://{Path(raiz) / MALHA_MUNICIPIOS}")
    g = g[g["CD_MUN"].isin([str(c) for c in codigos_ibge])]
    faltam = set(map(str, codigos_ibge)) - set(g["CD_MUN"])
    if faltam:
        raise ValueError(f"Códigos IBGE ausentes da malha: {sorted(faltam)}")
    por_codigo = {r.CD_MUN: r for r in g.itertuples()}
    saida = []
    for c in map(str, codigos_ibge):
        r = por_codigo[c]
        p = r.geometry.representative_point()
        saida.append({"nome": (nomes or {}).get(c, r.NM_MUN), "coord": [round(p.x, 4), round(p.y, 4)]})
    return saida
