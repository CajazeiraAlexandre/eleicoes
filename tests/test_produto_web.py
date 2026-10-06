"""Componentes do design system e montagem de produtos autocontidos (L0002, L0003)."""
from __future__ import annotations

import base64
import gzip
import json
import shutil
from pathlib import Path

import pytest

from labdados import metodologia
from labdados.produto_web import COMPONENTES_PADRAO, codificar_base, gerar_produto, montar_html

RAIZ = Path(__file__).resolve().parents[1]


def test_codificar_base_e_estavel_e_reversivel():
    base = {"a": 1, "texto": "São João", "lista": [1, 2, None]}
    b64 = codificar_base(base)
    assert b64 == codificar_base(base)                       # mtime fixo: saída estável
    assert json.loads(gzip.decompress(base64.b64decode(b64))) == base


def test_componentes_padrao_existem():
    for nome in COMPONENTES_PADRAO:
        assert (RAIZ / "web" / "componentes" / nome).exists(), nome


def test_montar_html_exige_todas_as_marcas():
    with pytest.raises(ValueError, match="__LAB_JS__"):
        montar_html(RAIZ, "<style>/*__TOKENS_CSS__*/</style><style>/*__LAB_CSS__*/</style><script>/*__APP_JS__*/</script>__DADOS_BASE64__",
                    app_js="", base={})


@pytest.mark.skipif(not (RAIZ / "modelos" / "produto").exists(), reason="modelos do laboratório fora deste recorte")
def test_modelo_de_produto_gera_pagina_autocontida(tmp_path):
    destino = tmp_path / "2099-01_teste"
    shutil.copytree(RAIZ / "modelos" / "produto", destino)
    for arq in destino.rglob("*"):
        if arq.is_file() and arq.suffix in {".md", ".yaml", ".html", ".js"}:
            txt = arq.read_text(encoding="utf-8")
            for k, v in {"__ID__": "2099-01_teste", "__TIPO__": "exploratorio", "__TITULO__": "Teste", "__PROJETO__": "teste", "__DS__": "padrao"}.items():
                txt = txt.replace(k, v)
            arq.write_text(txt, encoding="utf-8")
    (destino / "data").mkdir(exist_ok=True)
    (destino / "data" / "base.json").write_text(json.dumps({"meta": {"gerado_em": "2099-01-01T00:00:00-03:00"}}), encoding="utf-8")
    html = gerar_produto(RAIZ, destino).read_text(encoding="utf-8")
    for marca in ("/*__TOKENS_CSS__*/", "/*__LAB_CSS__*/", "/*__LAB_JS__*/", "/*__APP_JS__*/", "__DADOS_BASE64__", "__AUTOR__", "__PORTFOLIO__"):
        assert marca not in html
    assert "window.Lab" in html and "Lab.rodapePagina" in html
    assert "../design/" not in html and "web/componentes/" in html   # só comentários com o nome; nada carregado de fora do arquivo


def test_metodologia_le_adr_do_laboratorio():
    a = metodologia.adr(RAIZ, "L0002")
    assert a and a["id"] == "L0002" and a["arquivo"].startswith("metodologia/decisoes/")
