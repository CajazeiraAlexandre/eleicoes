from fontes.ibge.baixar import ARQUIVOS


def test_malhas_ibge_selecionadas_sao_oficiais_e_limitadas():
    assert ARQUIVOS["ibge.malha_ufs_2022"][0].endswith("/BR_UF_2022.zip")
    assert ARQUIVOS["ibge.malha_municipios_2022"][0].endswith("/BR_Municipios_2022.zip")
    assert ARQUIVOS["ibge.setores_censitarios_pi_2022"][0].endswith(
        "/UF/PI_setores_CD2022.zip"
    )
