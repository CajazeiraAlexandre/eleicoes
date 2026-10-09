"""Pareamento de locais de votação 2026 × 2022 no "mapa da virada" (EL0009)."""
import pytest

from projetos.eleicoes.analise.preparar_locais_mapa_virada import distancia_m, normalizar_nome, situacao_par


def test_normalizar_nome_ignora_acento_pontuacao_e_espacos():
    assert normalizar_nome("EE. JARDIM  TANGARÁS") == normalizar_nome("EE JARDIM TANGARAS") == "EE JARDIM TANGARAS"
    assert normalizar_nome("ESCOLA MUNICIPAL CUIABÁ MIRIM") != normalizar_nome("ESCOLA MUNICIPAL DE CUIABÁ-MIRIM")


def test_distancia_m():
    assert distancia_m(-5.0, -42.0, -5.0, -42.0) == 0
    # 0,001° de latitude ≈ 111 m
    assert distancia_m(-5.0, -42.0, -5.001, -42.0) == pytest.approx(111.2, abs=0.5)
    assert distancia_m(None, -42.0, -5.0, -42.0) is None


ANTERIOR = {"nomes": {"EE JARDIM TANGARAS"}, "coords": [(-5.0, -42.0)]}


@pytest.mark.parametrize(("tipo", "nome", "lat", "lon", "anterior", "esperado"), [
    ("C", "EE. Jardim Tangarás", -5.5, -42.5, ANTERIOR, "nome"),             # nome normalizado basta, mesmo longe
    ("C", "ESCOLA ESTADUAL JARDIM TANGARAS", -5.0005, -42.0, ANTERIOR, "distancia"),   # ~56 m
    ("C", "ESCOLA ESTADUAL JARDIM TANGARAS", -5.002, -42.0, ANTERIOR, "sem_par"),      # ~222 m
    ("C", "OUTRA ESCOLA", None, None, ANTERIOR, "sem_par"),                   # sem coordenada e nome diferente
    ("C", "EE JARDIM TANGARAS", -5.0, -42.0, None, "sem_chave"),
    ("V", "EE JARDIM TANGARAS", -5.0, -42.0, ANTERIOR, "especial"),           # trânsito/preso/temporário: fora
    ("T", "EE JARDIM TANGARAS", -5.0, -42.0, ANTERIOR, "especial"),
])
def test_situacao_par(tipo, nome, lat, lon, anterior, esperado):
    assert situacao_par(tipo, nome, lat, lon, anterior)[0] == esperado


# ---- produto "Locais de votação" (colunas da tabela a partir dos grupos de 2026, EL0008)
from projetos.eleicoes.analise.preparar_locais_votacao import bloco_de, saldo_entre_turnos, votos_em_disputa  # noqa: E402


@pytest.mark.parametrize(("conglomerado", "coluna"), [
    ("lula", "lula"), ("flavio", "flavio"), ("cury", "cury"), ("renan", "renan"),
    ("caiado", "outros"), ("demais", "outros"), ("sem_candidatura", "outros"), (None, "outros"),
])
def test_bloco_de(conglomerado, coluna):
    assert bloco_de(conglomerado) == coluna


T26 = {"aptos": 1000, "abstencoes": 150, "validos": 800, "lula": 400, "flavio": 300, "cury": 40, "renan": 30, "outros": 30}
T22 = {"aptos": 950, "abstencoes": 160, "validos": 760, "lula": 450, "flavio": 260, "cury": 0, "renan": 0, "outros": 50}


def test_votos_em_disputa_lula():
    v = votos_em_disputa(T26, "lula", T22)
    assert v == {"abstencoes": 150, "brancos_nulos": 50, "outras": 100, "disputa": 300, "perdas": 50}


def test_votos_em_disputa_simetrica_e_sem_o_proprio_grupo():
    assert votos_em_disputa(T26, "flavio", T22)["perdas"] == 0          # ganhou votos: perda zero
    assert votos_em_disputa(T26, "flavio")["disputa"] == 300            # mesma disputa que Lula
    assert votos_em_disputa(T26, "cury")["outras"] == 60                # sem os votos do próprio grupo
    assert votos_em_disputa(T26, "lula")["perdas"] is None              # sem par em 2022


TT = {"aptos_1t": 1000, "abstencoes_1t": 200, "validos_1t": 760, "pt_1t": 400, "pl_1t": 300,
      "aptos_2t": 1000, "abstencoes_2t": 190, "validos_2t": 780, "pt_2t": 420, "pl_2t": 360}


def test_saldo_entre_turnos_fecha_a_conta_e_e_simetrico():
    s = saldo_entre_turnos(TT, "lula")
    assert (s["outros_1t"], s["ganho_pt"], s["ganho_pl"], s["abstencoes"], s["brancos_nulos"]) == (60, 20, 60, -10, -10)
    assert s["ganho_pt"] + s["ganho_pl"] + s["abstencoes"] + s["brancos_nulos"] == s["outros_1t"]   # mesmo eleitorado
    assert s["fatia"] == 25 and saldo_entre_turnos(TT, "flavio")["fatia"] == 75
    assert saldo_entre_turnos(TT, "cury") is None
