"""Bases consultadas via API, com cópia local (snapshot) opcional.

Política (CLAUDE.md, seção 4.2):
- Toda base de API pode ter uma cópia local em dados/snapshots/<dataset>/<AAAA-MM-DD>.json.
- Salvar uma cópia exige CONFIRMAÇÃO do pesquisador, informando o tamanho estimado.
  No código, isso é o parâmetro `confirmado=True`, que só deve ser passado depois do "sim".
- Na leitura, `modo="auto"` usa a cópia local mais recente quando existir e cai para a API
  quando não existir. `modo="api"` força a consulta; `modo="snapshot"` exige a cópia local.
- Toda consulta e toda cópia são registradas em dados/manifesto.json (inventário).

    from labdados import api
    dados, origem = api.obter("ibge.municipios")                 # auto
    tamanho = api.tamanho_estimado(dados)                         # mostrar ao pesquisador
    api.salvar_snapshot("ibge.municipios", dados, confirmado=True) # só após confirmação
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Callable

from . import manifesto
from .catalogo import dataset, raiz

LIMITE_VERSIONAR_MB = 50  # acima disso, a cópia fica fora do git (perguntar ao pesquisador)


def pasta_snapshots(id_: str) -> Path:
    return raiz() / "dados" / "snapshots" / id_


def snapshot_mais_recente(id_: str) -> Path | None:
    arqs = sorted(pasta_snapshots(id_).glob("*.json"))
    return arqs[-1] if arqs else None


def consultar(id_: str, params: dict | None = None,
              buscar: Callable[[str, dict], Any] | None = None) -> Any:
    """Consulta a API do dataset. `buscar(endpoint, params)` permite paginação/autenticação específicas."""
    d = dataset(id_)
    endpoint = d.get("endpoint")
    if not endpoint:
        raise ValueError(f"{id_} não tem `endpoint` no catálogo.")
    if buscar is None:
        try:
            import httpx
            r = httpx.get(endpoint, params=params or {}, timeout=60, follow_redirects=True)
            r.raise_for_status()
            dados = r.json()
        except ImportError:  # sem httpx: biblioteca padrão
            import urllib.parse
            import urllib.request
            url = endpoint + ("?" + urllib.parse.urlencode(params) if params else "")
            with urllib.request.urlopen(url, timeout=60) as r:
                dados = json.loads(r.read().decode("utf-8"))
    else:
        dados = buscar(endpoint, params or {})
    n = len(dados) if hasattr(dados, "__len__") else None
    manifesto.registrar_consulta(id_, endpoint, n_registros=n)
    return dados


def obter(id_: str, modo: str = "auto", params: dict | None = None,
          buscar: Callable[[str, dict], Any] | None = None) -> tuple[Any, str]:
    """Retorna (dados, origem). origem = 'snapshot:<arquivo>' ou 'api:<data>'."""
    snap = snapshot_mais_recente(id_)
    if modo == "snapshot" or (modo == "auto" and snap):
        if not snap:
            raise FileNotFoundError(f"Não há cópia local de {id_}. Use modo='api' ou salve um snapshot.")
        return json.loads(snap.read_text(encoding="utf-8")), f"snapshot:{snap.relative_to(raiz())}"
    return consultar(id_, params, buscar), f"api:{dt.date.today().isoformat()}"


def tamanho_estimado(dados: Any) -> float:
    """Tamanho em MB que a cópia ocuparia (para informar antes de pedir confirmação)."""
    return len(json.dumps(dados, ensure_ascii=False).encode("utf-8")) / 1e6


def salvar_snapshot(id_: str, dados: Any, confirmado: bool = False) -> Path:
    if not confirmado:
        raise PermissionError(
            f"Salvar cópia local de {id_} ({tamanho_estimado(dados):.1f} MB) exige confirmação do pesquisador. "
            "Pergunte antes e chame novamente com confirmado=True.")
    destino = pasta_snapshots(id_) / f"{dt.date.today().isoformat()}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    manifesto.registrar_arquivo(id_, dataset(id_)["endpoint"], destino, tipo="snapshot")
    mb = destino.stat().st_size / 1e6
    if mb > LIMITE_VERSIONAR_MB:
        print(f"Aviso: snapshot com {mb:.0f} MB (> {LIMITE_VERSIONAR_MB} MB). "
              "Pergunte se deve ficar fora do git (adicionar ao .gitignore) ou ser removido.")
    return destino
