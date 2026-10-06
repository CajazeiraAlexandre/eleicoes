"""Testes das regras de grupos (EL0004) e dos indicadores (EL0005) do produto de forças políticas."""
import pytest

from projetos.eleicoes.analise.forcas_pi import grupo_de, lider, normalizar_sigla, participacao, pearson, resumo_boxplot


@pytest.mark.parametrize(("ano", "sigla", "federacao", "grupo"), [
    ("2022", "PT", "PT/PC do B/PV", "PT"),
    ("2022", "PV", "PT/PC do B/PV", "PT"),
    ("2026", "PC do B", "PT/PC do B/PV", "PT"),
    ("2024", "PSD", "", "PSD"),
    ("2024", "MDB", "", "MDB"),
    ("2022", "PP", "", "PP"),
    ("2022", "UNIÃO", "", "PP"),              # União no grupo PP em todas as eleições (EL0004 revisto)
    ("2024", "UNIÃO", "", "PP"),
    ("2026", "UNIÃO", "UNIÃO/PP", "PP"),      # Federação União Progressista (EL0004)
    ("2026", "PP", "UNIÃO/PP", "PP"),
    ("2026", "PSOL", "PSOL/REDE", "Outros"),
    # antes das federações (2018, 2020): mesma composição dos grupos (EL0004, revisão de 2026-10-06)
    ("2018", "PT", "", "PT"),
    ("2018", "PC do B", "", "PT"),
    ("2020", "PV", "", "PT"),
    ("2018", "PSL", "", "PP"),
    ("2018", "DEM", "", "PP"),
    ("2020", "PP", "", "PP"),
    ("2020", "PSD", "", "PSD"),
    ("2018", "MDB", "", "MDB"),
    ("2018", "PSOL", "", "Outros"),
    ("2024", "DEM", "", "Outros"),               # regra de 2018–2020 não vaza para depois de 2022
])
def test_grupo_de(ano, sigla, federacao, grupo):
    assert grupo_de(ano, sigla, federacao) == grupo


def test_normalizar_sigla():
    assert normalizar_sigla("PCDOB") == "PC do B"
    assert normalizar_sigla(" MDB ") == "MDB"


def test_participacao():
    assert participacao(25, 100) == 25.0
    assert participacao(1, 0) is None


def test_lider_e_o_grupo_com_mais_votos_somados():
    partidos = {"PT": 30, "PV": 10, "MDB": 35, "PSOL": 5, "PL": 20}
    gp = {"PT": "PT", "PV": "PT", "MDB": "MDB", "PSOL": "Outros", "PL": "Outros"}
    grupos = {"PT": 40, "MDB": 35, "Outros": 25, "PSD": 0, "PP": 0}
    r = lider(partidos, gp, grupos, 100)
    assert r["grupo"] == "PT" and r["partido_mais_votado"] == "MDB"
    assert r["intensidade"] == 40.0 and r["margem"] == 5.0


def test_outros_so_lidera_com_o_partido_mais_votado():
    gp = {"PT": "PT", "PL": "Outros", "PSOL": "Outros"}
    # Outros soma mais (45), mas o partido mais votado é o PT → Outros não é elegível
    r = lider({"PT": 40, "PL": 25, "PSOL": 20}, gp, {"PT": 40, "Outros": 45}, 100)
    assert r["grupo"] == "PT" and r["margem"] == 40.0
    # partido mais votado é de Outros → Outros elegível com a soma
    r = lider({"PT": 30, "PL": 35, "PSOL": 10}, gp, {"PT": 30, "Outros": 45}, 100)
    assert r["grupo"] == "Outros" and r["intensidade"] == 45.0 and r["margem"] == 15.0


def test_lider_empate_e_sem_validos():
    gp = {"A": "PT", "B": "MDB"}
    assert lider({"A": 10, "B": 10}, gp, {"PT": 10, "MDB": 10}, 20)["grupo"] == "empate"
    assert lider({}, gp, {}, 0) is None


def test_pearson():
    assert pearson([1, 2, 3], [2, 4, 6])["r"] == pytest.approx(1.0)
    assert pearson([1, None, 3, 4], [1, 2, None, 4])["n"] == 2


def test_resumo_boxplot_quartis_lineares_e_bigodes_de_tukey():
    import numpy as np
    v = [25, 41, 42, 44, 45, 47, 50, 52, 90]
    r = resumo_boxplot(v)
    assert r["q1"] == pytest.approx(np.quantile(v, 0.25))
    assert r["mediana"] == pytest.approx(np.quantile(v, 0.5))
    assert r["q3"] == pytest.approx(np.quantile(v, 0.75))
    iiq = r["q3"] - r["q1"]
    assert r["bigode_sup"] == 52 and 90 > r["q3"] + 1.5 * iiq       # 90 é discrepante
    assert r["bigode_inf"] == 41 and 25 < r["q1"] - 1.5 * iiq       # 25 é discrepante (limite = 30)
    assert r["discrepantes"] == 2 and r["n"] == 9
    assert resumo_boxplot([]) is None
    assert resumo_boxplot([55])["mediana"] == 55
