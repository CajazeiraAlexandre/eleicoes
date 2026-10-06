"""Gera a correspondência municipal aprovada e a geometria do mapa."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import geopandas as gpd

from labdados.catalogo import raiz
from labdados.territorio import normalizar_nome

_ARQUIVO_TSE = (
    "dados/bruto/tse/votacao_secao/votacao_secao_2022_PI.zip"
)
_ARQUIVO_IBGE = (
    "dados/bruto/ibge/malha_municipios_2022/BR_Municipios_2022.zip"
)
_SAIDA = (
    "projetos/eleicoes/analise/referencias/"
    "correspondencia_tse_ibge_pi_2022.csv"
)
_SAIDA_GEOJSON = (
    "projetos/eleicoes/dados/municipios_pi.geojson"   # antes no produto de convergência (excluído em 2026-10-06)
)
_PARES_PONTUACAO_APROVADOS = {
    "10600": (
        "BARRA D ALCÂNTARA",
        "2201176",
        "Barra D'Alcântara",
    ),
    "12483": (
        "OLHO D ÁGUA DO PIAUÍ",
        "2207108",
        "Olho D'Água do Piauí",
    ),
    "12718": (
        "PAU D ARCO DO PIAUÍ",
        "2207793",
        "Pau D'Arco do Piauí",
    ),
}


def propor_pares(
    municipios_tse: dict[str, str],
    municipios_ibge: list[tuple[str, str, str]],
) -> list[dict[str, str]]:
    """Relaciona códigos somente quando nome normalizado e UF são únicos."""
    indices_ibge: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for codigo, nome, uf in municipios_ibge:
        indices_ibge[(uf, normalizar_nome(nome))].append((codigo, nome))

    indices_tse: dict[tuple[str, str], int] = defaultdict(int)
    for nome in municipios_tse.values():
        indices_tse[("PI", normalizar_nome(nome))] += 1

    usados: dict[str, int] = defaultdict(int)
    propostas: list[dict[str, str]] = []
    for codigo_tse, nome_tse in sorted(municipios_tse.items()):
        chave = ("PI", normalizar_nome(nome_tse))
        correspondencias = indices_ibge.get(chave, [])
        codigo_ibge = ""
        nome_ibge = ""
        metodo = "uf + nome oficial normalizado (caixa, acentos, espaços)"
        if len(correspondencias) == 1 and indices_tse[chave] == 1:
            codigo_ibge, nome_ibge = correspondencias[0]
            usados[codigo_ibge] += 1
            status = "pareamento_unico_por_nome_uf"
        elif codigo_tse in _PARES_PONTUACAO_APROVADOS:
            nome_tse_aprovado, codigo_ibge_aprovado, nome_ibge_aprovado = (
                _PARES_PONTUACAO_APROVADOS[codigo_tse]
            )
            candidatos_aprovados = [
                (codigo, nome)
                for codigo, nome, uf in municipios_ibge
                if uf == "PI"
                and codigo == codigo_ibge_aprovado
                and normalizar_nome(nome) == normalizar_nome(nome_ibge_aprovado)
            ]
            if (
                normalizar_nome(nome_tse) == normalizar_nome(nome_tse_aprovado)
                and len(candidatos_aprovados) == 1
            ):
                codigo_ibge, nome_ibge = candidatos_aprovados[0]
                usados[codigo_ibge] += 1
                status = "pareamento_aprovado_pontuacao"
                metodo = (
                    "diferença de pontuação explicitamente aprovada pelo "
                    "pesquisador em 2026-10-03"
                )
            else:
                status = "sem_pareamento_exato"
        elif correspondencias:
            status = "pareamento_ambiguo"
        else:
            status = "sem_pareamento_exato"
        propostas.append(
            {
                "cd_municipio_tse": codigo_tse,
                "nm_municipio_tse": nome_tse,
                "sg_uf": "PI",
                "chave_nome_normalizado": chave[1],
                "cd_municipio_ibge": codigo_ibge,
                "nm_municipio_ibge": nome_ibge,
                "metodo": metodo,
                "status": status,
            }
        )
    for registro in propostas:
        codigo_ibge = registro["cd_municipio_ibge"]
        if codigo_ibge and usados[codigo_ibge] > 1:
            registro["status"] = "pareamento_ambiguo"
    return propostas


def gerar(raiz_laboratorio: Path, destino: Path | None = None) -> dict[str, int]:
    """Gera a tabela aprovada e malha municipal com códigos TSE."""
    arquivo_tse = raiz_laboratorio / _ARQUIVO_TSE
    municipios_tse: dict[str, str] = {}
    with zipfile.ZipFile(arquivo_tse) as arquivo_zip:
        with arquivo_zip.open("votacao_secao_2022_PI.csv") as bruto:
            leitor = csv.DictReader(
                io.TextIOWrapper(bruto, encoding="latin-1", newline=""),
                delimiter=";",
            )
            campos = {"ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO"}
            if leitor.fieldnames is None or not campos.issubset(leitor.fieldnames):
                raise ValueError("Cabeçalho incompleto em votacao_secao_2022_PI.csv.")
            for registro in leitor:
                if (
                    registro["ANO_ELEICAO"].strip() == "2022"
                    and registro["NR_TURNO"].strip() == "1"
                    and registro["SG_UF"].strip() == "PI"
                ):
                    codigo = registro["CD_MUNICIPIO"].strip()
                    nome = registro["NM_MUNICIPIO"].strip()
                    anterior = municipios_tse.get(codigo)
                    if anterior is not None and anterior != nome:
                        raise ValueError(
                            f"Nome TSE divergente para município {codigo}."
                        )
                    municipios_tse[codigo] = nome

    malha = gpd.read_file(
        raiz_laboratorio / _ARQUIVO_IBGE,
        columns=["CD_MUN", "NM_MUN", "SIGLA_UF"],
    )
    municipios_ibge = [
        (str(registro.CD_MUN), str(registro.NM_MUN), str(registro.SIGLA_UF))
        for registro in malha.itertuples()
        if str(registro.SIGLA_UF) == "PI"
    ]
    propostas = propor_pares(municipios_tse, municipios_ibge)
    destino = destino or raiz_laboratorio / _SAIDA
    destino.parent.mkdir(parents=True, exist_ok=True)
    campos_saida = list(propostas[0]) if propostas else []
    with destino.open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=campos_saida)
        escritor.writeheader()
        escritor.writerows(propostas)
    if any(
        item["status"]
        not in {
            "pareamento_unico_por_nome_uf",
            "pareamento_aprovado_pontuacao",
        }
        for item in propostas
    ):
        raise ValueError(
            "A geometria não foi gerada: há correspondências pendentes ou ambíguas."
        )
    codigo_tse_por_ibge = {
        item["cd_municipio_ibge"]: item["cd_municipio_tse"]
        for item in propostas
    }
    geometria = malha[malha["SIGLA_UF"] == "PI"].copy()
    geojson = json.loads(geometria.to_json(drop_id=True))
    codigos_geometria = {
        str(feature["properties"]["CD_MUN"])
        for feature in geojson["features"]
    }
    if codigos_geometria != set(codigo_tse_por_ibge):
        raise ValueError(
            "A malha não corresponde exatamente aos códigos IBGE da tabela."
        )
    for feature in geojson["features"]:
        codigo_ibge = str(feature["properties"]["CD_MUN"])
        feature["properties"]["CD_MUNICIPIO_TSE"] = codigo_tse_por_ibge[
            codigo_ibge
        ]
    caminho_geojson = raiz_laboratorio / _SAIDA_GEOJSON
    caminho_geojson.parent.mkdir(parents=True, exist_ok=True)
    caminho_geojson.write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return {
        "municipios_tse": len(municipios_tse),
        "municipios_ibge_pi": len(municipios_ibge),
        "pareamentos_unicos": sum(
            item["status"] == "pareamento_unico_por_nome_uf"
            for item in propostas
        ),
        "pareamentos_aprovados_pontuacao": sum(
            item["status"] == "pareamento_aprovado_pontuacao"
            for item in propostas
        ),
        "sem_pareamento_exato": sum(
            item["status"] == "sem_pareamento_exato" for item in propostas
        ),
        "pareamentos_ambiguos": sum(
            item["status"] == "pareamento_ambiguo" for item in propostas
        ),
        "municipios_geojson": len(geojson["features"]),
    }


def main() -> None:
    resumo = gerar(raiz())
    for chave, valor in resumo.items():
        print(f"{chave}: {valor}")


if __name__ == "__main__":
    main()
