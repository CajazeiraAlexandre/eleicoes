"""Paridade JS × Python do produto de distribuição no PI (L0002).

Roda src/paridade.html (gerada por preparar_distribuicao_pi.py) no Chrome headless:
o núcleo JS decodifica a base publicada, agrega, calcula percentuais e Pearson e
compara com os resultados das funções Python de referência.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from projetos.eleicoes.analise.preparar_distribuicao_pi import pearson, percentual, agregar

RAIZ = Path(__file__).resolve().parents[1]
PARIDADE = RAIZ / "projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi/src/paridade.html"
CHROME = next((shutil.which(n) for n in ("google-chrome", "chromium", "chromium-browser") if shutil.which(n)), None)


def test_pearson_referencia():
    assert pearson([1, 2, 3], [2, 4, 6]) == {"r": 1.0, "n": 3}
    assert pearson([1, 2, None, 4], [1, 2, 3, None]) == {"r": None, "n": 2}
    assert pearson([1, 1, 1], [1, 2, 3])["r"] is None


def test_agregar_e_percentual_referencia():
    votos, validos = agregar([1, 2, 3, 4], [10, 10, 10, 10], [0, 1, 0, -1], 2)
    assert votos == [4, 2] and validos == [20, 10]
    assert percentual(4, 20) == 20.0 and percentual(1, 0) is None


@pytest.mark.skipif(CHROME is None or not PARIDADE.exists(), reason="Chrome ou paridade.html ausente")
def test_paridade_js_python():
    saida = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=60000",
         "--dump-dom", PARIDADE.as_uri()],
        capture_output=True, text=True, timeout=180, check=True,
    ).stdout
    resultado = json.loads(re.search(r'<pre id="resultado">([^<]*)</pre>', saida).group(1))
    assert resultado["casos"] > 0
    assert resultado["n_falhas"] == 0, resultado["falhas"]
