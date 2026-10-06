"""Coleta a composição dos Territórios de Desenvolvimento do Piauí na Wikipédia.

Fonte SECUNDÁRIA aceita pelo pesquisador em 2026-10-05 (fontes oficiais
inacessíveis). Usa a API do MediaWiki (action=parse) e fixa o número de revisão
de cada página; o bruto fica em dados/bruto/wikipedia/territorios_pi/ e o
manifesto registra hash e URL. A tabela padronizada é gerada por
padronizar_territorios_pi.py.

    PYTHONPATH=nucleo python fontes/wikipedia/baixar_territorios_pi.py
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from labdados.catalogo import raiz
from labdados.manifesto import registrar_arquivo

DATASET_ID = "pi.territorios_desenvolvimento"
API = "https://pt.wikipedia.org/w/api.php"
PAGINA_PRINCIPAL = "Territórios de Desenvolvimento do Piauí"
CABECALHO = {"User-Agent": "lab-dados/0.1 (pesquisa acadêmica; https://github.com/CajazeiraAlexandre)"}
PAUSA_S = 3.0


def _obter(pagina: str, tentativas: int = 5) -> dict:
    """Wikitext e revisão de uma página; respeita 429 (Retry-After)."""
    url = API + "?" + urllib.parse.urlencode({
        "action": "parse", "page": pagina, "prop": "wikitext|revid", "redirects": 1,
        "format": "json", "formatversion": 2,
    })
    for tentativa in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=CABECALHO), timeout=60) as r:
                dados = json.load(r)
            if "error" in dados:
                raise RuntimeError(f"{pagina}: {dados['error']}")
            return {"pedido": pagina, "titulo": dados["parse"]["title"], "revid": dados["parse"]["revid"],
                    "url_revisao": f"https://pt.wikipedia.org/w/index.php?oldid={dados['parse']['revid']}",
                    "wikitext": dados["parse"]["wikitext"]}
        except urllib.error.HTTPError as erro:
            if erro.code != 429 or tentativa == tentativas - 1:
                raise
            espera = float(erro.headers.get("Retry-After") or 10 * (tentativa + 1))
            time.sleep(espera)
    raise RuntimeError(f"Falha ao obter {pagina}")


def territorios_da_principal(wikitext: str) -> list[str]:
    """Títulos das páginas dos territórios na seção 'Lista dos Territórios' (ordem Norte-Sul)."""
    secao = wikitext.split("== Lista dos Territórios ==", 1)[1].split("==", 1)[0]
    return [m.group(1).strip() for m in re.finditer(r"^\*\s*\[\[([^\]|]+)", secao, flags=re.M)]


def coletar() -> Path:
    principal = _obter(PAGINA_PRINCIPAL)
    titulos = territorios_da_principal(principal["wikitext"])
    if len(titulos) != 12:
        raise ValueError(f"Esperados 12 territórios na página principal; encontrados {len(titulos)}.")
    paginas = []
    for titulo in titulos:
        time.sleep(PAUSA_S)
        paginas.append(_obter(titulo))
    destino = raiz() / "dados/bruto/wikipedia/territorios_pi/paginas.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({
        "coletado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "licenca": "CC BY-SA 4.0 — Wikipédia (atribuição: link de cada revisão)",
        "principal": principal, "territorios": paginas,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    registrar_arquivo(DATASET_ID, principal["url_revisao"], destino)
    return destino


if __name__ == "__main__":
    caminho = coletar()
    print(f"Salvo: {caminho.relative_to(raiz())}")
