"""Geocodificação de endereços brasileiros com o geocodebr (Ipea) — interface comum do laboratório (L0005).

O geocodebr compara endereços com o CNEFE 2022 (IBGE) e devolve lat/long e o nível de precisão da correspondência. Há
versões em R e em Python; as duas leem o mesmo cache, que no laboratório fica em `dados/bruto/ipea/geocodebr/` (fora do
git; ~1,2 GB). **Motor padrão: R** (`ferramentas/r/geocodebr.R`, pacote 0.7.0), mais preciso que o Python 0.2.0 — chega
ao número da porta onde o Python para no logradouro (conferência no exemplo do pacote, 2026-10-08; L0005). O Python fica
como alternativa (`motor="python"`). `setores_dos_pontos` liga cada ponto ao setor censitário de 2022.

    PYTHONPATH=nucleo:. python -m labdados.geocodificacao baixar     # baixa (uma vez) os dados e registra no manifesto
    PYTHONPATH=nucleo:. python -m labdados.geocodificacao situacao   # pasta, versão dos dados e arquivos em cache

Uso em um projeto:

    from labdados import geocodificacao as geo
    res = geo.geocodificar(df, estado="uf", municipio="municipio", logradouro="logradouro", numero="numero", cep="cep")

Endereços de pessoas são dados pessoais (L0004): rode em ambiente local, guarde o resultado em `projetos/<p>/dados/`
(fora do git) e publique só agregados. O nível de precisão (`precisao`, `tipo_resultado`) deve acompanhar qualquer uso —
um resultado por CEP ou por município não equivale a um por número de porta.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from labdados.catalogo import raiz

DATASET = "ipea.geocodebr_cnefe"
PASTA_CACHE = Path("dados/bruto/ipea/geocodebr")


def _geocodebr():
    """Importa o geocodebr e fixa a pasta de cache do laboratório (a configuração do pacote é por usuário; aqui ela é
    reafirmada a cada uso para que todos os projetos leiam o mesmo cache)."""
    try:
        import geocodebr
    except ImportError as erro:   # pragma: no cover
        raise ImportError("Instale o extra de geocodificação: pip install -e '.[geocodificacao]'") from erro
    pasta = raiz() / PASTA_CACHE
    pasta.mkdir(parents=True, exist_ok=True)
    if Path(geocodebr.listar_pasta_cache()).resolve() != pasta.resolve():
        geocodebr.definir_pasta_cache(str(pasta), verboso=False)
    return geocodebr


def versao_dados() -> str:
    """Versão (data release) dos dados do CNEFE usada pelo pacote instalado."""
    from geocodebr.constants import DATA_RELEASE
    return DATA_RELEASE


def baixar(verboso: bool = True) -> Path:
    """Baixa todas as tabelas do CNEFE usadas pelo geocodebr (uma vez) e registra cada arquivo no manifesto."""
    from labdados.manifesto import registrar_arquivo
    gb = _geocodebr()
    pasta = Path(gb.download_cnefe("todas", verboso=verboso))
    pasta = pasta if pasta.is_dir() else pasta.parent
    for arq in sorted(pasta.rglob("*.parquet")):
        registrar_arquivo(DATASET, f"https://github.com/ipea/geocodebr (data release {versao_dados()})", arq,
                          gerado_na_fonte=versao_dados())
    return pasta


def situacao() -> dict:
    """Pasta do cache, versão dos dados, arquivos baixados e tamanho total."""
    gb = _geocodebr()
    arqs = [Path(a) for a in gb.listar_dados_cache()]
    return {"pasta": str(raiz() / PASTA_CACHE), "versao_dados": versao_dados(), "arquivos": len(arqs),
            "tamanho_gb": round(sum(a.stat().st_size for a in arqs if a.exists()) / 1e9, 2)}


def geocodificar(enderecos: pd.DataFrame, estado: str, municipio: str, logradouro: str | None = None,
                 numero: str | None = None, cep: str | None = None, localidade: str | None = None,
                 motor: str = "r", resultado_completo: bool = False, h3_res: int | None = None,
                 n_cores: int | None = None, verboso: bool = False) -> pd.DataFrame:
    """Endereço → lat/long. Entrada: tabela com uma coluna por campo (nomes passados nos argumentos; estado e município
    obrigatórios). Saída: a tabela de entrada com `lat`, `lon`, `tipo_resultado` (categoria de correspondência do
    geocodebr, do número de porta ao município), `precisao`, `desvio_metros` e `endereco_encontrado` — e, com
    `resultado_completo`, os campos do CNEFE que casaram. Empates são resolvidos pelo próprio pacote.
    Referência: Pereira, R. H. M. et al., geocodebr (Ipea), https://ipea.github.io/geocodebr/.
    `motor`: "r" (padrão; via Rscript, arquivos intermediários em dados/tmp, apagados ao fim) ou "python"."""
    campos = {"estado": estado, "municipio": municipio, "logradouro": logradouro, "numero": numero, "cep": cep,
              "localidade": localidade}
    if motor == "r":
        return _geocodificar_r(enderecos, {k: v for k, v in campos.items() if v})
    if motor != "python":
        raise ValueError(f"motor desconhecido: {motor}")
    gb = _geocodebr()
    campos = gb.definir_campos(estado=estado, municipio=municipio, logradouro=logradouro, numero=numero, cep=cep,
                               localidade=localidade)
    res = gb.geocode(enderecos, campos_endereco=campos, resultado_completo=resultado_completo, h3_res=h3_res,
                     n_cores=n_cores, verboso=verboso)
    return res.to_pandas() if hasattr(res, "to_pandas") else pd.DataFrame(res)


def _geocodificar_r(enderecos: pd.DataFrame, campos: dict) -> pd.DataFrame:
    """Chama ferramentas/r/geocodebr.R com a tabela em Parquet; os arquivos ficam em dados/tmp (fora do git) e são
    apagados ao fim, porque podem ter dados pessoais (L0004)."""
    import subprocess
    import tempfile
    tmp_raiz = raiz() / "dados" / "tmp"
    tmp_raiz.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=tmp_raiz) as tmp:
        entrada, saida = Path(tmp) / "entrada.parquet", Path(tmp) / "saida.parquet"
        enderecos.astype({c: "string" for c in campos.values()}).to_parquet(entrada, index=False)
        cmd = ["Rscript", "ferramentas/r/geocodebr.R", str(entrada), str(saida), *[f"{k}={v}" for k, v in campos.items()]]
        r = subprocess.run(cmd, cwd=raiz(), capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"geocodebr (R) falhou:\n{r.stderr[-3000:]}")
        return pd.read_parquet(saida)


def setores_dos_pontos(pontos: pd.DataFrame, lat: str = "lat", lon: str = "lon", uf: str | None = None,
                       colunas=("CD_SETOR", "SITUACAO", "CD_SIT", "CD_TIPO", "CD_BAIRRO", "NM_BAIRRO", "CD_FCU", "NM_FCU")) -> pd.DataFrame:
    """Setor censitário de 2022 de cada ponto (ponto no polígono, malha `ibge.setores_censitarios_2022`, EPSG:4674).
    Lê a malha por UF (`uf` = coluna com o código de 2 dígitos da UF, para não carregar o país inteiro). Ponto sem
    coordenada ou fora de qualquer setor fica sem setor. Devolve a tabela de entrada com as `colunas` da malha."""
    import geopandas as gpd
    import pyogrio
    malha = raiz() / "dados/bruto/ibge/setores_censitarios_2022/BR_setores_CD2022.gpkg"
    p = pontos.copy()
    ok = p[lat].notna() & p[lon].notna()
    g = gpd.GeoDataFrame(p[ok], geometry=gpd.points_from_xy(p.loc[ok, lon], p.loc[ok, lat]), crs="EPSG:4674")
    partes = []
    grupos = g.groupby(g[uf].astype(str).str[:2]) if uf else [(None, g)]
    for cod_uf, sub in grupos:
        filtro = f"CD_UF = '{cod_uf}'" if cod_uf else None
        if not filtro:
            xmin, ymin, xmax, ymax = sub.total_bounds
        s = pyogrio.read_dataframe(malha, columns=list(colunas), where=filtro,
                                   bbox=None if filtro else (xmin, ymin, xmax, ymax))
        j = gpd.sjoin(sub, s, how="left", predicate="within").drop(columns=["index_right"])
        partes.append(j[~j.index.duplicated()])   # setor partido em vários polígonos: um só registro por ponto
    res = pd.concat(partes) if partes else pd.DataFrame(columns=list(p.columns) + list(colunas))
    res = pd.DataFrame(res.drop(columns="geometry"))
    return pd.concat([res, p[~ok]]).loc[p.index]


def buscar_cep(ceps, verboso: bool = False) -> pd.DataFrame:
    """CEP → endereços do CNEFE com coordenadas (um CEP pode ter vários logradouros e pontos)."""
    res = _geocodebr().busca_por_cep(list(ceps) if not isinstance(ceps, (str, int)) else ceps, verboso=verboso)
    return res.to_pandas() if hasattr(res, "to_pandas") else pd.DataFrame(res)


def reverso(pontos, dist_max: int = 1000, verboso: bool = False):
    """Coordenadas → endereço mais próximo do CNEFE (até `dist_max` metros). `pontos`: GeoDataFrame de pontos (EPSG:4674)."""
    return _geocodebr().geocode_reverso(pontos, dist_max=dist_max, verboso=verboso)


if __name__ == "__main__":
    acao = sys.argv[1] if len(sys.argv) > 1 else "situacao"
    if acao == "baixar":
        print(baixar())
    print(situacao())
