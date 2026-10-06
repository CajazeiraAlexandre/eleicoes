"""Registro de downloads e consultas a APIs — alimenta o inventário de bases.

Todo pipeline deve chamar `registrar_arquivo` após baixar um arquivo e
`registrar_consulta` após consultar uma API. O manifesto (dados/manifesto.json)
É versionado no git, mesmo que os dados não sejam.

    from labdados import manifesto
    manifesto.registrar_arquivo("tse.votacao_candidato_munzona", url, caminho_local)
    manifesto.registrar_consulta("ibge.localidades", endpoint, n_registros=5570)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path

from .catalogo import dataset, raiz


def _arquivo() -> Path:
    return raiz() / "dados" / "manifesto.json"


def ler() -> dict:
    p = _arquivo()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _salvar(m: dict) -> None:
    p = _arquivo()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def _agora() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def sha256(caminho: Path, bloco: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        while chunk := f.read(bloco):
            h.update(chunk)
    return h.hexdigest()


def registrar_arquivo(id_: str, url: str, caminho: Path, gerado_na_fonte: str | None = None,
                      tipo: str = "download") -> dict:
    """Registra (ou atualiza) um arquivo baixado (tipo="download") ou cópia local de API (tipo="snapshot")."""
    dataset(id_)  # garante que está no catálogo
    caminho = Path(caminho)
    m = ler()
    reg = m.setdefault(id_, {})
    reg.setdefault("arquivos", {})
    reg["arquivos"][str(caminho.resolve().relative_to(raiz()))] = {
        "url": url, "sha256": sha256(caminho), "bytes": caminho.stat().st_size,
        "baixado_em": _agora(), "gerado_na_fonte": gerado_na_fonte, "tipo": tipo,
    }
    reg["ultima_atualizacao"] = _agora()
    _salvar(m)
    return reg


def registrar_consulta(id_: str, endpoint: str, n_registros: int | None = None) -> dict:
    """Registra uma consulta a API (bases acessadas diretamente, sem arquivo baixado)."""
    dataset(id_)
    m = ler()
    reg = m.setdefault(id_, {"consultas": []})
    reg.setdefault("consultas", []).append({"endpoint": endpoint, "em": _agora(), "n_registros": n_registros})
    reg["consultas"] = reg["consultas"][-20:]  # mantém as 20 últimas
    reg["ultima_atualizacao"] = _agora()
    _salvar(m)
    return reg
