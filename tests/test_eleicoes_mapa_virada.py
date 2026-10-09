"""Regras do produto "O mapa da virada": conglomerados e linhagem (EL0008) e correspondência nacional (EL0002)."""
import csv
from pathlib import Path

import pytest
import yaml

from projetos.eleicoes.analise.validar_mapa_virada import Agrupamento, correspondencia

RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def ag():
    return Agrupamento(yaml.safe_load((RAIZ / "dados/referencia/conglomerados_2026.yaml").read_text(encoding="utf-8")))


@pytest.mark.parametrize(("sigla", "agremiacao", "conglomerado"), [
    ("PT", "FE BRASIL", "lula"),
    ("PC do B", "FE BRASIL", "lula"),
    ("PPL", "FE BRASIL", "lula"),           # PPL → PCdoB (2019)
    ("PSOL", "PSOL REDE", "lula"),
    ("PDT", "PDT", "lula"),
    ("PSL", "PL", "flavio"),                # decisão do pesquisador: PSL e PL juntos
    ("PR", "PL", "flavio"),
    ("DEM", "UNIÃO PROGRESSISTA", "sem_candidatura"),
    ("PP", "UNIÃO PROGRESSISTA", "sem_candidatura"),
    ("PROS", "RENOVAÇÃO SOLIDÁRIA", "sem_candidatura"),
    ("PTB", "RENOVAÇÃO SOLIDÁRIA", "sem_candidatura"),
    ("PSC", "PODE", "sem_candidatura"),
    ("PPS", "PSDB CIDADANIA", "sem_candidatura"),
    ("PTC", "AGIR", "cury"),
    ("PSD", "PSD", "caiado"),
    ("MISSÃO", "MISSÃO", "renan"),
    ("PMB", "DEMOCRATA", "demais"),
])
def test_linhagem_federacao_conglomerado(ag, sigla, agremiacao, conglomerado):
    assert ag.agremiacao(sigla) == agremiacao
    assert ag.conglomerado_de(sigla, 2018) == conglomerado


def test_sigla_desconhecida_e_registrada(ag):
    assert ag.conglomerado_de("XYZ", 2030) is None
    assert ag.desconhecidas[(2030, "XYZ")] == 1


def test_correspondencia_nacional_sem_colisao():
    corr = correspondencia(RAIZ)
    ibge = [v[0] for v in corr.values() if v[0]]
    assert len(ibge) == len(set(ibge)), "dois municípios do TSE apontando para o mesmo código IBGE"
    with (RAIZ / "dados/referencia/correspondencia_tse_ibge_excecoes_nacionais.csv").open(encoding="utf-8") as f:
        excecoes = list(csv.DictReader(f))
    assert len(excecoes) == 56
    assert corr["34118"][0] == "2905602"     # Camacã × Camacan
    assert corr["10600"][0] == "2201176"     # EL0002, Piauí
