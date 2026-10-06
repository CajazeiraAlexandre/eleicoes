import pytest

from fontes.tse.baixar import url_arquivo


def test_url_votacao_munzona_2024():
    assert url_arquivo("tse.votacao_candidato_munzona", 2024) == (
        "https://cdn.tse.jus.br/estatistica/sead/odsele/"
        "votacao_candidato_munzona/votacao_candidato_munzona_2024.zip"
    )


def test_url_votacao_secao_exige_e_normaliza_uf():
    assert url_arquivo("tse.votacao_secao", 2022, "pi").endswith(
        "/votacao_secao/votacao_secao_2022_PI.zip"
    )
    with pytest.raises(ValueError):
        url_arquivo("tse.votacao_secao", 2022)


def test_url_detalhe_votacao_secao_nacional():
    assert url_arquivo("tse.detalhe_votacao_secao", 2022) == (
        "https://cdn.tse.jus.br/estatistica/sead/odsele/"
        "detalhe_votacao_secao/detalhe_votacao_secao_2022.zip"
    )
    with pytest.raises(ValueError, match="não aceita filtro"):
        url_arquivo("tse.detalhe_votacao_secao", 2022, "PI")


def test_url_votacao_partido_munzona_2022():
    assert url_arquivo("tse.votacao_partido_munzona", 2022).endswith(
        "/votacao_partido_munzona/votacao_partido_munzona_2022.zip"
    )


def test_url_rejeita_ano_nao_catalogado():
    with pytest.raises(ValueError, match="não declarado"):
        url_arquivo("tse.candidatos", 2025)
