"""Acesso ao catálogo do laboratório por ID, com caminhos relativos à raiz.

Funciona tanto no laboratório completo quanto num pacote exportado,
porque a raiz é localizada pelo arquivo `catalogo/datasets.yaml`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml


def raiz() -> Path:
    """Sobe a partir deste arquivo até achar `catalogo/datasets.yaml`."""
    for p in Path(__file__).resolve().parents:
        if (p / "catalogo" / "datasets.yaml").exists():
            return p
    raise FileNotFoundError("catalogo/datasets.yaml não encontrado acima de " + __file__)


@lru_cache
def datasets() -> dict:
    with open(raiz() / "catalogo" / "datasets.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@lru_cache
def fontes() -> dict:
    with open(raiz() / "catalogo" / "fontes.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def dataset(id_: str) -> dict:
    try:
        return datasets()[id_]
    except KeyError:
        raise KeyError(f"Dataset '{id_}' não está no catálogo. Proponha a inclusão antes de usar.") from None


def caminho(id_: str, versao: str | None = None) -> Path:
    """Pasta do dataset padronizado (opcionalmente de uma versão específica)."""
    base = raiz() / dataset(id_)["caminho"]
    return base / versao if versao else base
