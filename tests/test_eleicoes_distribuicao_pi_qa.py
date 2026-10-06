"""Testes das regras de classificação e de votos válidos por seção (EL0003)."""
from collections import Counter

import pytest

from projetos.eleicoes.analise.validar_distribuicao_pi import (
    classificar_votavel,
    conferir_categorias_munzona,
    legendas_anuladas_2022,
    validos_por_secao,
)


@pytest.mark.parametrize(
    ("cargo", "votavel", "esperado"),
    [
        ("1", "13", "nominal"),      # Presidente: 2 dígitos é candidatura
        ("3", "22", "nominal"),      # Governador
        ("5", "333", "nominal"),     # Senador
        ("6", "13", "legenda"),      # Dep. Federal: 2 dígitos é legenda
        ("7", "13", "legenda"),
        ("6", "1312", "nominal"),
        ("7", "95", "branco"),
        ("1", "96", "nulo"),
        ("6", "97", "especial"),
    ],
)
def test_classificar_votavel(cargo, votavel, esperado):
    assert classificar_votavel(cargo, votavel) == esperado


def test_validos_por_secao_exclui_anulados_nulos_tecnicos_e_legenda_anulada():
    secao = ("1", "6", "10006", "11", "1")
    por_secao = {secao: Counter()}
    por_candidatura = Counter({
        (secao, "A"): 10,   # válido
        (secao, "B"): 5,    # anulado sub judice
        (secao, "C"): 2,    # válido (legenda)
        (secao, "D"): 1,    # nulo técnico
    })
    por_legenda = Counter({(secao, "13"): 4, (secao, "33"): 3})
    destino = {
        ("1", "A"): "Válido",
        ("1", "B"): "Anulado sub judice",
        ("1", "C"): "Válido (legenda)",
        ("1", "D"): "Nulo técnico (ausente da API)",
    }
    legenda_anulada = {("1", "6", "33")}

    validos = validos_por_secao(por_secao, por_candidatura, por_legenda, destino, legenda_anulada)

    assert validos == {secao: 10 + 2 + 4}


def test_validos_por_secao_exige_destino_de_toda_candidatura():
    secao = ("1", "3", "10006", "11", "1")
    with pytest.raises(KeyError):
        validos_por_secao({secao: Counter()}, Counter({(secao, "X"): 1}), Counter(), {}, set())


def _linha_partido(partido, validos, anulados=0, subjud=0):
    return {
        "ANO_ELEICAO": "2022", "CD_TIPO_ELEICAO": "2", "NR_TURNO": "1", "CD_CARGO": "6",
        "NR_PARTIDO": partido, "QT_VOTOS_LEGENDA_VALIDOS": str(validos),
        "QT_VOTOS_LEGENDA_ANULADOS": str(anulados), "QT_VOTOS_LEGENDA_ANUL_SUBJUD": str(subjud),
    }


def test_legendas_anuladas_2022():
    linhas = [_linha_partido("13", 100), _linha_partido("20", 0, subjud=7), _linha_partido("20", 0, anulados=1)]
    assert legendas_anuladas_2022(linhas) == {("1", "6", "20")}


def test_legendas_anuladas_2022_recusa_anulacao_parcial():
    with pytest.raises(ValueError):
        legendas_anuladas_2022([_linha_partido("13", 100, anulados=1)])


def test_categorias_munzona_2018_nominal_nao_valido_conta_como_nulo():
    """2018 (opção B): votos de candidatura não válida aparecem como nulos no total oficial município/zona."""
    secao = ("1", "6", "100", "1", "10")
    por_secao = {secao: Counter({"nominal": 30, "legenda": 5, "branco": 2, "nulo": 3})}
    por_cand_zona = Counter({("1", "6", "100", "1", "A"): 20, ("1", "6", "100", "1", "B"): 10})
    destino = {("1", "A"): "Válido", ("1", "B"): "Anulado (INAPTO)"}
    zero = dict.fromkeys(["QT_VOTOS_NOMINAIS_ANULADOS", "QT_VOTOS_NOMINAIS_ANUL_SUBJUD", "QT_VOTOS_LEGENDA_ANULADOS",
                          "QT_VOTOS_LEGENDA_ANUL_SUBJUD", "QT_VOTOS_NULOS_TECNICOS"], 0)
    oficial = {("1", "6", "100", "1"): {**zero, "QT_VOTOS_NOMINAIS_VALIDOS": 20, "QT_VOTOS_LEG_VALIDOS": 5,
                                         "QT_VOTOS_BRANCOS": 2, "QT_VOTOS_NULOS": 13}}
    assert conferir_categorias_munzona(por_secao, por_cand_zona, destino, oficial)["divergencias"] == 0
    oficial[("1", "6", "100", "1")]["QT_VOTOS_NULOS"] = 12
    assert conferir_categorias_munzona(por_secao, por_cand_zona, destino, oficial)["divergencias"] == 1
