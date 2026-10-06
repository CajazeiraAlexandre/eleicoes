"""Utilitários para correspondências territoriais auditáveis."""
from __future__ import annotations

import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable


def normalizar_nome(nome: str) -> str:
    """Normaliza caixa, acentos e espaços, preservando pontuação."""
    texto = " ".join(nome.casefold().split())
    decomposto = unicodedata.normalize("NFKD", texto)
    return "".join(
        caractere
        for caractere in decomposto
        if not unicodedata.combining(caractere)
    )


def propor_correspondencias_municipais(
    municipios_tse: Iterable[tuple[str, str, str]],
    municipios_ibge: Iterable[tuple[str, str, str]],
) -> list[dict[str, str]]:
    """Propõe vínculos únicos por UF e nome; tuplas usam código, nome e UF."""
    tse = sorted(
        set(municipios_tse),
        key=lambda item: (item[2], item[0], item[1]),
    )
    ibge = list(municipios_ibge)
    indices_tse: dict[tuple[str, str], list[tuple[str, str, str]]] = defaultdict(list)
    indices_ibge: dict[tuple[str, str], list[tuple[str, str, str]]] = defaultdict(list)

    for municipio in tse:
        codigo, nome, uf = municipio
        indices_tse[(uf, normalizar_nome(nome))].append((codigo, nome, uf))
    for municipio in ibge:
        codigo, nome, uf = municipio
        indices_ibge[(uf, normalizar_nome(nome))].append((codigo, nome, uf))

    propostas: list[dict[str, str]] = []
    for codigo_tse, nome_tse, uf in tse:
        chave = (uf, normalizar_nome(nome_tse))
        codigo_ibge = ""
        nome_ibge = ""
        if uf == "ZZ":
            status = "fora_escopo_uf_zz"
            metodo = "fora do escopo geográfico brasileiro"
        else:
            encontrados = indices_ibge.get(chave, [])
            if len(indices_tse[chave]) == 1 and len(encontrados) == 1:
                codigo_ibge, nome_ibge, _ = encontrados[0]
                status = "pareamento_unico_por_nome_uf"
                metodo = "UF + nome normalizado (caixa, acentos e espaços)"
            elif encontrados or len(indices_tse[chave]) > 1:
                status = "pareamento_ambiguo"
                metodo = "UF + nome normalizado (caixa, acentos e espaços)"
            else:
                status = "sem_pareamento_exato"
                metodo = "UF + nome normalizado (caixa, acentos e espaços)"
        propostas.append(
            {
                "cd_municipio_tse": codigo_tse,
                "nm_municipio_tse": nome_tse,
                "sg_uf": uf,
                "chave_nome_normalizada": normalizar_nome(nome_tse),
                "cd_municipio_ibge": codigo_ibge,
                "nm_municipio_ibge": nome_ibge,
                "metodo": metodo,
                "status": status,
            }
        )

    usos_ibge = Counter(
        item["cd_municipio_ibge"]
        for item in propostas
        if item["cd_municipio_ibge"]
    )
    for item in propostas:
        codigo_ibge = item["cd_municipio_ibge"]
        if codigo_ibge and usos_ibge[codigo_ibge] > 1:
            item["cd_municipio_ibge"] = ""
            item["nm_municipio_ibge"] = ""
            item["status"] = "pareamento_ambiguo"

    return propostas
