"""Agrupamento hierárquico de pontos para mapas (componente ``pontos_agrupados`` — repertório experimental, L0016).

Muitos pontos num mapa (ex.: locais de votação) viram grupos que se desfazem ao ampliar. O cálculo é feito aqui, no
Python (L0002), uma vez só: o JS apenas escolhe o nível pelo zoom, desenha e anima a abertura dos grupos.

Método (no estilo do *supercluster*, Agafonkin/Mapbox): os pontos vão para a projeção de Mercator e a área ocupada por
eles é normalizada para 1 (a maior dimensão). No nível ``z``, grupos cujo centro está a menos de ``raio / 2**z`` do
grupo-semente se fundem; o processo vai do nível mais fino para o mais grosso, fundindo os grupos do nível de baixo —
por isso os níveis se aninham (cada grupo pertence a um só grupo do nível acima). A posição de um grupo é o centro
médio dos seus pontos (média ponderada pelo número de pontos dos subgrupos) e o valor é a soma.

Determinístico: a semente de cada fusão é o grupo com mais pontos (empate: ordem de entrada).

Uso (no script que monta a base do produto):

    from labdados.agrupamento import agrupar_pontos
    base["agrupamento"] = agrupar_pontos([{"lat": -5.03, "lon": -42.81, "valor": 4177}, ...])
"""
from __future__ import annotations

import math
from collections import defaultdict


def _mercator(lat: float, lon: float) -> tuple[float, float]:
    """(lat, lon) em graus → (x, y) em [0, 1] (Web Mercator; y cresce para o sul)."""
    s = math.sin(math.radians(max(-85.0, min(85.0, lat))))
    return (lon + 180.0) / 360.0, 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)


def _inverso(x: float, y: float) -> tuple[float, float]:
    """(x, y) de Mercator em [0, 1] → (lat, lon) em graus."""
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y)))), x * 360.0 - 180.0


def _fundir(nos: list[dict], r: float) -> tuple[list[dict], list[int]]:
    """Funde os grupos a menos de ``r`` da semente. Saída: novos grupos e, para cada grupo de entrada, o índice do pai."""
    grade: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, n in enumerate(nos):
        grade[(math.floor(n["x"] / r), math.floor(n["y"] / r))].append(i)
    ordem = sorted(range(len(nos)), key=lambda i: (-nos[i]["n"], i))
    visto, pai, saida = [False] * len(nos), [0] * len(nos), []
    for i in ordem:
        if visto[i]:
            continue
        visto[i] = True
        a = nos[i]
        cx, cy = math.floor(a["x"] / r), math.floor(a["y"] / r)
        membros = [i]
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for j in grade.get((gx, gy), ()):
                    if not visto[j] and math.hypot(nos[j]["x"] - a["x"], nos[j]["y"] - a["y"]) <= r:
                        visto[j] = True
                        membros.append(j)
        n = sum(nos[j]["n"] for j in membros)
        novo = {"x": sum(nos[j]["x"] * nos[j]["n"] for j in membros) / n, "y": sum(nos[j]["y"] * nos[j]["n"] for j in membros) / n,
                "n": n, "soma": sum(nos[j]["soma"] for j in membros), "pontos": sorted(k for j in membros for k in nos[j]["pontos"])}
        for j in membros:
            pai[j] = len(saida)
        saida.append(novo)
    return saida, pai


def agrupar_pontos(pontos: list[dict], raio: float = 0.1, max_niveis: int = 16, casas: int = 4, min_ganho: float = 0.01) -> dict:
    """Níveis aninhados de agrupamento.

    Entrada: ``pontos`` = ``[{"lat", "lon", "valor"?}]`` (valor ausente conta 0 na soma); ``raio`` = distância de fusão
    no nível 0, como fração da maior dimensão da área dos pontos (0,1 ≈ 30 px num mapa de 340 px).
    Saída: ``{"raio", "niveis": [{"lat", "lon", "n", "soma", "pai"?, "pontos"?}]}`` em colunas, do nível 0 (mais
    agrupado) ao último; ``pai`` (a partir do nível 1) é o índice do grupo no nível anterior. O último nível é o
    primeiro ao qual faltam menos de ``min_ganho`` (fração) dos grupos do nível mais fino: os poucos pontos ainda juntos estão
    praticamente no mesmo lugar, e ``pontos`` lista os índices de entrada de cada grupo desse nível (o card os nomeia).
    ``casas``: decimais de lat/lon (4 ≈ 11 m). ``min_ganho=0`` vai até separar todos os pontos de lugares diferentes.
    """
    if not pontos:
        return {"raio": raio, "niveis": []}
    xy = [_mercator(p["lat"], p["lon"]) for p in pontos]
    x0, y0 = min(x for x, _ in xy), min(y for _, y in xy)
    E = max(max(x for x, _ in xy) - x0, max(y for _, y in xy) - y0) or 1e-9
    base = [{"x": (x - x0) / E, "y": (y - y0) / E, "n": 1, "soma": p.get("valor") or 0, "pontos": [i]} for i, ((x, y), p) in enumerate(zip(xy, pontos))]
    # do mais fino para o mais grosso; o nível mais fino só junta os pontos que estão no mesmo lugar
    niveis, pais = [_fundir(base, 1e-12)[0]], []
    for z in range(max_niveis - 1, -1, -1):
        novo, pai = _fundir(niveis[0], raio / 2 ** z)
        niveis.insert(0, novo)
        pais.insert(0, pai)
    # corta a cauda de níveis sem fusão: o último nível útil é o primeiro que já tem os grupos do mais fino
    ultimo = next(z for z, nv in enumerate(niveis) if len(nv) == len(niveis[-1]))
    ultimo = next((z for z in range(ultimo) if len(niveis[-1]) - len(niveis[z]) < min_ganho * len(niveis[-1])), ultimo)   # falta abrir < min_ganho
    niveis, pais = niveis[: ultimo + 1], pais[:ultimo]
    saida = []
    for z, nv in enumerate(niveis):
        lat, lon = zip(*(_inverso(n["x"] * E + x0, n["y"] * E + y0) for n in nv))
        nivel = {"lat": [round(v, casas) for v in lat], "lon": [round(v, casas) for v in lon], "n": [n["n"] for n in nv],
                 "soma": [round(n["soma"], 6) if isinstance(n["soma"], float) else n["soma"] for n in nv]}
        if z:
            nivel["pai"] = pais[z - 1]
        if z == len(niveis) - 1:
            nivel["pontos"] = [sorted(n["pontos"]) for n in nv]
        saida.append(nivel)
    return {"raio": raio, "niveis": saida}

