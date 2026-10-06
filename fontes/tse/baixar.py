"""Baixa arquivos brutos oficiais do TSE e registra a proveniência no manifesto."""
from __future__ import annotations

import argparse
import time
import zipfile
from pathlib import Path

import httpx

from labdados.catalogo import dataset, raiz
from labdados.manifesto import registrar_arquivo

BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele"
PADROES = {
    "tse.votacao_candidato_munzona": (
        "votacao_candidato_munzona",
        "votacao_candidato_munzona_{ano}.zip",
    ),
    "tse.votacao_partido_munzona": (
        "votacao_partido_munzona",
        "votacao_partido_munzona_{ano}.zip",
    ),
    "tse.detalhe_votacao_munzona": (
        "detalhe_votacao_munzona",
        "detalhe_votacao_munzona_{ano}.zip",
    ),
    "tse.votacao_secao": (
        "votacao_secao",
        "votacao_secao_{ano}_{uf}.zip",
    ),
    "tse.detalhe_votacao_secao": (
        "detalhe_votacao_secao",
        "detalhe_votacao_secao_{ano}.zip",
    ),
    "tse.eleitorado_local_votacao": (
        "eleitorado_locais_votacao",
        "eleitorado_local_votacao_{ano}.zip",
    ),
    "tse.candidatos": (
        "consulta_cand",
        "consulta_cand_{ano}.zip",
    ),
}


def url_arquivo(dataset_id: str, ano: int, uf: str | None = None) -> str:
    """Monta a URL TSE e valida ano e recorte conforme o catálogo."""
    if dataset_id not in PADROES:
        raise ValueError(f"Dataset sem padrão de download implementado: {dataset_id}")
    anos = dataset(dataset_id).get("anos", [])
    if ano not in anos:
        raise ValueError(f"Ano {ano} não declarado para {dataset_id}: {anos}")
    pasta, nome = PADROES[dataset_id]
    if "{uf}" in nome:
        if not uf or len(uf) != 2 or not uf.isalpha():
            raise ValueError(f"{dataset_id} exige uma UF de duas letras, por exemplo PI.")
        nome = nome.format(ano=ano, uf=uf.upper())
    else:
        if uf is not None:
            raise ValueError(f"{dataset_id} não aceita filtro por UF.")
        nome = nome.format(ano=ano)
    return f"{BASE}/{pasta}/{nome}"


def _baixar_zip(url: str, destino: Path, sobrescrever: bool = False) -> str | None:
    if destino.exists() and not sobrescrever:
        if not zipfile.is_zipfile(destino):
            raise zipfile.BadZipFile(f"Arquivo existente não é um ZIP válido: {destino}")
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
                timeout=httpx.Timeout(120.0, connect=30.0),
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
                with zipfile.ZipFile(parcial) as arquivo_zip:
                    if not arquivo_zip.namelist():
                        raise zipfile.BadZipFile("Arquivo ZIP sem membros.")
                parcial.replace(destino)
                return resposta.headers.get("last-modified")
        except (httpx.HTTPError, OSError, zipfile.BadZipFile) as erro:
            ultimo_erro = erro
            parcial.unlink(missing_ok=True)
            if tentativa < 2:
                time.sleep(2**tentativa)
    raise RuntimeError(f"Falha ao baixar {url} após 3 tentativas.") from ultimo_erro


def baixar(dataset_id: str, ano: int, uf: str | None = None,
           sobrescrever: bool = False, simular: bool = False) -> Path:
    url = url_arquivo(dataset_id, ano, uf)
    _, padrao = PADROES[dataset_id]
    nome = padrao.format(ano=ano, uf=uf.upper() if uf else "")
    destino = raiz() / "dados" / "bruto" / "tse" / dataset_id.split(".", 1)[1] / nome
    if simular:
        print(f"{url} -> {destino.relative_to(raiz())}")
        return destino
    modificado = _baixar_zip(url, destino, sobrescrever)
    if modificado is not None:
        registrar_arquivo(dataset_id, url, destino, gerado_na_fonte=modificado)
        print(f"Baixado e registrado: {destino.relative_to(raiz())}")
    return destino


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", choices=sorted(PADROES))
    parser.add_argument("--anos", type=int, nargs="+", required=True)
    parser.add_argument("--uf", help="UF exigida por tse.votacao_secao, por exemplo PI (BR = arquivo nacional de Presidente).")
    parser.add_argument("--sobrescrever", action="store_true", help="Substitui arquivos existentes.")
    parser.add_argument("--simular", action="store_true", help="Mostra URLs e destinos sem baixar.")
    args = parser.parse_args()
    for ano in args.anos:
        baixar(args.dataset, ano, args.uf, args.sobrescrever, args.simular)


if __name__ == "__main__":
    main()
