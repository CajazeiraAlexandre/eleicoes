"""Bloco "Fontes de Dados, Metodologia e Códigos" — padrão de todos os produtos (ADR L0003).

Junta os textos do produto (``<produto>/src/metodologia.yaml``, modelo em
``modelos/produto/src/metodologia.yaml``) às partes automáticas:

- fontes: datasets do produto.yaml + catálogo + manifesto (arquivos, data na fonte, download, hash);
- passos: ``codigo: modulo.funcao`` vira o trecho de código lido com ``inspect.getsource``
  (``modulo`` = apelido em ``funcoes`` ou na chave ``modulos`` do metodologia.yaml);
- decisões: ADRs citados no produto.yaml (resumo de uma linha em ``decisoes_resumo``);
- qualidade: tabela pronta, montada pelo script do produto ({texto, colunas, linhas});
- versão: data da base, commit e estado do repositório.

O resultado vai na base do produto (``base["metodologia"]``) e é desenhado por
``web/componentes/lab-metodologia.js`` (Lab.blocoMetodologia).
"""
from __future__ import annotations

import inspect
import json
import re
import subprocess
from pathlib import Path
from types import ModuleType

import yaml


def adr(raiz: Path, id_: str) -> dict | None:
    """Título, status, primeiro parágrafo da decisão e caminho de um ADR (lab ou projeto)."""
    arquivos = list((raiz / "metodologia/decisoes").glob(f"{id_}-*.md")) + list((raiz / "projetos").glob(f"*/decisoes/{id_}-*.md"))
    if not arquivos:
        return None
    texto = arquivos[0].read_text(encoding="utf-8")
    titulo = re.search(r"^#\s+(.+)$", texto, re.M).group(1)
    status = (re.search(r"\*\*Status:\*\*\s*(.+)$", texto, re.M) or [None, ""])[1].strip()
    decisao = ""
    m = re.search(r"^## Decis[ãa]o.*?\n(.*?)(?=\n## |\Z)", texto, re.S | re.M)
    if m:
        paragrafos = [p.strip() for p in m.group(1).split("\n\n") if p.strip() and not p.strip().startswith("|")]
        decisao = re.sub(r"[*`]", "", paragrafos[0]).replace("\n", " ")[:420] if paragrafos else ""
    return {"id": id_, "titulo": re.sub(r"^[A-Z]+\d+\s*—\s*", "", titulo), "status": status, "decisao": decisao,
            "arquivo": arquivos[0].relative_to(raiz).as_posix()}


def fontes(raiz: Path, datasets: list[str], anos: tuple[str, ...] | None = None) -> list[dict]:
    """Uma linha por dataset: descrição, órgão, link e arquivos do manifesto (filtrados por ano, se pedido)."""
    catalogo = yaml.safe_load((raiz / "catalogo/datasets.yaml").read_text(encoding="utf-8"))
    orgaos = yaml.safe_load((raiz / "catalogo/fontes.yaml").read_text(encoding="utf-8"))
    manifesto = json.loads((raiz / "dados/manifesto.json").read_text(encoding="utf-8"))
    saida = []
    for id_ in datasets:
        d = catalogo.get(id_, {})
        arqs = []
        for caminho, reg in (manifesto.get(id_, {}).get("arquivos") or {}).items():
            nome = Path(caminho).name
            ano_arq = re.search(r"(20\d\d)", nome)
            if anos and ano_arq and ano_arq.group(1) not in anos:
                continue
            arqs.append({"arquivo": nome, "gerado_na_fonte": reg.get("gerado_na_fonte"), "baixado_em": (reg.get("baixado_em") or "")[:10],
                         "sha256": (reg.get("sha256") or "")[:12]})
        saida.append({"id": id_, "descricao": d.get("descricao", ""), "orgao": (orgaos.get(d.get("fonte"), {}) or {}).get("nome", d.get("fonte", "")),
                      "url": d.get("url_fonte"), "acesso": d.get("acesso"), "arquivos": sorted(arqs, key=lambda a: a["arquivo"])})
    return saida


def versao_git(raiz: Path) -> tuple[str, bool]:
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=raiz, capture_output=True, text=True).stdout.strip()
        # só alterações em arquivos versionados contam; páginas geradas (produtos, paridade, docs, índice) não
        gerados = [":!projetos/*/produtos/*/index.html", ":!projetos/*/produtos/*/src/paridade.html", ":!docs", ":!index.html"]
        sujo = bool(subprocess.run(["git", "status", "--porcelain", "--untracked-files=no", "--", ".", *gerados],
                                   cwd=raiz, capture_output=True, text=True).stdout.strip())
    except OSError:
        return "", False
    return commit, sujo


def montar(raiz: Path, produto_dir: Path, *, gerado_em: str, funcoes: dict[str, ModuleType] | None = None,
           anos: tuple[str, ...] | None = None, qualidade: dict | None = None, status_qualidade: str = "") -> dict:
    """Conteúdo completo do bloco (dicionário serializável para a base do produto)."""
    textos = yaml.safe_load((produto_dir / "src" / "metodologia.yaml").read_text(encoding="utf-8"))
    produto = yaml.safe_load((produto_dir / "produto.yaml").read_text(encoding="utf-8"))
    if funcoes is None:   # módulos declarados no próprio metodologia.yaml (apelido: caminho importável)
        import importlib
        funcoes = {k: importlib.import_module(v) for k, v in (textos.get("modulos") or {}).items()}
    for passo in textos.get("passos", []):
        if passo.get("codigo"):
            mod, fn = passo["codigo"].split(".")
            if not funcoes or mod not in funcoes:
                raise KeyError(f"passo '{passo['titulo']}': módulo {mod} não informado em `funcoes`")
            passo["trecho"] = inspect.getsource(getattr(funcoes[mod], fn))
    adrs = [a for a in (adr(raiz, i) for i in produto.get("decisoes", [])) if a]
    for a in adrs:
        a["decisao"] = (textos.get("decisoes_resumo") or {}).get(a["id"]) or a["decisao"]
    commit, sujo = versao_git(raiz)
    return {**textos, "fontes": fontes(raiz, produto.get("datasets", []), anos), "adrs": adrs,
            "qualidade": qualidade, "status_qualidade": status_qualidade,
            "versao": {"gerado_em": gerado_em, "commit": commit, "alteracoes_nao_commitadas": sujo,
                       "status_produto": produto.get("status"), "numero": produto.get("versao"),
                       "data_versao": str(produto.get("versao_data") or "")}}
