"""Baixa arquivos estáticos do IBGE (malhas, setores censitários, Favelas e Comunidades Urbanas) e registra a proveniência.

    PYTHONPATH=nucleo:. python fontes/ibge/baixar.py ibge.setores_censitarios_2022
"""
from __future__ import annotations

import argparse
import time
import zipfile
from pathlib import Path

import httpx

from labdados.catalogo import dataset, raiz
from labdados.manifesto import registrar_arquivo

_SETORES = ("https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
            "malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/")
_FCU = "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/"

ARQUIVOS = {
    "ibge.malha_ufs_2022": (
        "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
        "malhas_municipais/municipio_2022/Brasil/BR/BR_UF_2022.zip",
        "BR_UF_2022.zip",
    ),
    "ibge.malha_municipios_2022": (
        "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
        "malhas_municipais/municipio_2022/Brasil/BR/BR_Municipios_2022.zip",
        "BR_Municipios_2022.zip",
    ),
    "ibge.setores_censitarios_pi_2022": (
        "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
        "malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/"
        "setores/shp/UF/PI_setores_CD2022.zip",
        "PI_setores_CD2022.zip",
    ),
    # malha nacional de setores do Censo 2022 (GeoPackage, 1,4 GB) e o dicionário da malha com agregados
    "ibge.setores_censitarios_2022": [
        (_SETORES + "setores/gpkg/BR/BR_setores_CD2022.gpkg", "BR_setores_CD2022.gpkg"),
        (_SETORES + "Dicionario_de_dados_malha_agregados.xlsx", "Dicionario_de_dados_malha_agregados.xlsx"),
    ],
    # Favelas e Comunidades Urbanas 2022: setores que compõem cada FCU, polígonos e FCUs não setorizadas
    "ibge.favelas_comunidades_urbanas_2022": [
        (_FCU + "Anexos/FavelaseComunidadesUrbanas2022Setores_20250417.xlsx", "FavelaseComunidadesUrbanas2022Setores_20250417.xlsx"),
        (_FCU + "arquivos_vetoriais/poligonos_FCUs_shp.zip", "poligonos_FCUs_shp.zip"),
        (_FCU + "arquivos_vetoriais/FCUs_nao_setorizadas_shp_20260410.zip", "FCUs_nao_setorizadas_shp_20260410.zip"),
    ],
}


def _conferir(caminho: Path) -> None:
    """ZIP e XLSX: arquivo ZIP com membros; GeoPackage: cabeçalho SQLite."""
    if caminho.suffix in (".gpkg",) or caminho.name.endswith(".gpkg.part"):
        with caminho.open("rb") as f:
            if f.read(16) != b"SQLite format 3\x00":
                raise OSError(f"GeoPackage sem cabeçalho SQLite: {caminho}")
        return
    with zipfile.ZipFile(caminho) as arquivo_zip:
        if not arquivo_zip.namelist():
            raise zipfile.BadZipFile("Arquivo ZIP sem membros.")


def _baixar_zip(url: str, destino: Path, sobrescrever: bool = False) -> str | None:
    if destino.exists() and not sobrescrever:
        _conferir(destino)
        print(f"Já existe; mantido: {destino.relative_to(raiz())}")
        return None

    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(destino.suffix + ".part")
    ultimo_erro: Exception | None = None
    for tentativa in range(3):
        parcial.unlink(missing_ok=True)
        try:
            with httpx.stream(
                "GET", url, follow_redirects=True,
                timeout=httpx.Timeout(300.0, connect=30.0),
            ) as resposta:
                resposta.raise_for_status()
                esperado = resposta.headers.get("content-length")
                total = 0
                with parcial.open("wb") as arquivo:
                    for bloco in resposta.iter_bytes():
                        arquivo.write(bloco)
                        total += len(bloco)
                if esperado is not None and total != int(esperado):
                    raise OSError(f"Download incompleto: esperados {esperado} bytes, recebidos {total}.")
                _conferir(parcial)
                modificado = resposta.headers.get("last-modified")
            parcial.replace(destino)
            return modificado
        except (httpx.HTTPError, OSError, zipfile.BadZipFile) as erro:
            ultimo_erro = erro
            parcial.unlink(missing_ok=True)
            if tentativa < 2:
                time.sleep(2**tentativa)
    raise RuntimeError(f"Falha ao baixar {url} após 3 tentativas.") from ultimo_erro


def baixar(dataset_id: str, sobrescrever: bool = False, simular: bool = False) -> Path:
    if dataset_id not in ARQUIVOS:
        raise ValueError(f"Base sem padrão de download implementado: {dataset_id}")
    if 2022 not in dataset(dataset_id).get("anos", []):
        raise ValueError(f"Edição 2022 não declarada no catálogo para {dataset_id}.")
    itens = ARQUIVOS[dataset_id]
    itens = [itens] if isinstance(itens, tuple) else itens
    pasta = raiz() / "dados" / "bruto" / "ibge" / dataset_id.split(".", 1)[1]
    for url, nome in itens:
        destino = pasta / nome
        if simular:
            print(f"{url} -> {destino.relative_to(raiz())}")
            continue
        modificado = _baixar_zip(url, destino, sobrescrever)
        if modificado is not None:
            registrar_arquivo(dataset_id, url, destino, gerado_na_fonte=modificado)
            print(f"Baixado e registrado: {destino.relative_to(raiz())}")
    return pasta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", choices=sorted(ARQUIVOS))
    parser.add_argument("--sobrescrever", action="store_true")
    parser.add_argument("--simular", action="store_true")
    args = parser.parse_args()
    baixar(args.dataset, args.sobrescrever, args.simular)


if __name__ == "__main__":
    main()
