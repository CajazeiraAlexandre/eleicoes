#!/usr/bin/env python3
"""Gera a correspondência municipal nacional TSE–IBGE aprovada."""
from __future__ import annotations

import argparse
import csv
import io
import zipfile
from collections import Counter
from pathlib import Path

from labdados import api
from labdados.catalogo import raiz
from labdados.territorio import propor_correspondencias_municipais

_ARQUIVO_TSE = Path(
    "dados/bruto/tse/detalhe_votacao_munzona/"
    "detalhe_votacao_munzona_2022.zip"
)
_DATASET_IBGE = "ibge.municipios_regiao_imediata"
_SAIDA = Path("dados/referencia/correspondencia_tse_ibge_municipios_2022.csv")
_CAMPOS_TSE = {
    "ANO_ELEICAO",
    "SG_UF",
    "CD_MUNICIPIO",
    "NM_MUNICIPIO",
}
_CAMPOS_SAIDA = [
    "cd_municipio_tse",
    "nm_municipio_tse",
    "sg_uf",
    "chave_nome_normalizada",
    "cd_municipio_ibge",
    "nm_municipio_ibge",
    "metodo",
    "status",
]


def ler_municipios_tse(caminho: Path) -> list[tuple[str, str, str]]:
    """Lê municípios distintos do arquivo oficial TSE por UF e código."""
    municipios: dict[tuple[str, str], str] = {}
    with zipfile.ZipFile(caminho) as arquivo_zip:
        membros = sorted(
            nome
            for nome in arquivo_zip.namelist()
            if nome.lower().endswith(".csv")
        )
        if not membros:
            raise ValueError(f"Nenhum CSV encontrado em {caminho}.")
        for membro in membros:
            with arquivo_zip.open(membro) as bruto:
                leitor = csv.DictReader(
                    io.TextIOWrapper(bruto, encoding="latin-1", newline=""),
                    delimiter=";",
                )
                if leitor.fieldnames is None or not _CAMPOS_TSE.issubset(
                    leitor.fieldnames
                ):
                    raise ValueError(f"Cabeçalho incompleto em {membro}.")
                for registro in leitor:
                    if registro["ANO_ELEICAO"].strip() != "2022":
                        continue
                    uf = registro["SG_UF"].strip()
                    codigo = registro["CD_MUNICIPIO"].strip()
                    nome = registro["NM_MUNICIPIO"].strip()
                    if not uf or not codigo or not nome:
                        raise ValueError(
                            f"Identificador municipal incompleto em {membro}."
                        )
                    chave = (uf, codigo)
                    anterior = municipios.get(chave)
                    if anterior is not None and anterior != nome:
                        raise ValueError(
                            f"Nomes TSE divergentes para {uf} {codigo}: "
                            f"{anterior!r} e {nome!r}."
                        )
                    municipios[chave] = nome
    return [
        (codigo, nome, uf)
        for (uf, codigo), nome in sorted(municipios.items())
    ]


def ler_municipios_ibge(registros: list[dict]) -> list[tuple[str, str, str]]:
    """Extrai código, nome e UF do snapshot da API de Localidades do IBGE."""
    municipios = []
    for registro in registros:
        codigo = str(registro.get("id", "")).strip()
        nome = str(registro.get("nome", "")).strip()
        uf = (
            registro.get("regiao-imediata", {})
            .get("regiao-intermediaria", {})
            .get("UF", {})
            .get("sigla", "")
        )
        if not codigo or not nome or not uf:
            raise ValueError(
                f"Registro municipal IBGE sem código, nome ou UF: {registro!r}."
            )
        municipios.append((codigo, nome, uf))
    return municipios


def gerar(raiz_laboratorio: Path) -> dict[str, int]:
    """Gera CSV auditável usando o snapshot IBGE autorizado e o arquivo TSE."""
    arquivo_tse = raiz_laboratorio / _ARQUIVO_TSE
    if not arquivo_tse.is_file():
        raise FileNotFoundError(f"Arquivo oficial do TSE não encontrado: {arquivo_tse}")
    dados_ibge, origem_ibge = api.obter(_DATASET_IBGE, modo="snapshot")
    if not isinstance(dados_ibge, list):
        raise ValueError("O snapshot IBGE não contém uma lista de municípios.")

    propostas = propor_correspondencias_municipais(
        ler_municipios_tse(arquivo_tse),
        ler_municipios_ibge(dados_ibge),
    )
    destino = raiz_laboratorio / _SAIDA
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=_CAMPOS_SAIDA)
        escritor.writeheader()
        escritor.writerows(propostas)

    contagens = Counter(item["status"] for item in propostas)
    return {
        "municipios_tse": len(propostas),
        "pareamentos_unicos": contagens["pareamento_unico_por_nome_uf"],
        "sem_pareamento_exato": contagens["sem_pareamento_exato"],
        "pareamentos_ambiguos": contagens["pareamento_ambiguo"],
        "fora_escopo_uf_zz": contagens["fora_escopo_uf_zz"],
        "registros_ibge": len(dados_ibge),
        "bytes_csv": destino.stat().st_size,
        "snapshot_ibge": origem_ibge,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    resumo = gerar(raiz())
    for chave, valor in resumo.items():
        print(f"{chave}: {valor}")


if __name__ == "__main__":
    main()
