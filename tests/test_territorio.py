from labdados.territorio import (
    normalizar_nome,
    propor_correspondencias_municipais,
)


def test_normalizar_nome_preserva_pontuacao_e_remove_acentos():
    assert normalizar_nome("  AGRICOLÂNDIA ") == "agricolandia"
    assert normalizar_nome("Barra D Alcântara") != normalizar_nome(
        "Barra d'Alcântara"
    )


def test_correspondencias_exigem_par_unico_por_uf_e_nome():
    propostas = propor_correspondencias_municipais(
        [
            ("10001", "Agricolândia", "PI"),
            ("10002", "Barra D Alcântara", "PI"),
            ("10003", "Porto Velho", "ZZ"),
        ],
        [
            ("2200103", "AGRICOLÂNDIA", "PI"),
            ("2201004", "Barra d'Alcântara", "PI"),
            ("1100205", "Porto Velho", "RO"),
        ],
    )

    assert [item["status"] for item in propostas] == [
        "pareamento_unico_por_nome_uf",
        "sem_pareamento_exato",
        "fora_escopo_uf_zz",
    ]
    assert propostas[0]["cd_municipio_ibge"] == "2200103"
    assert propostas[1]["cd_municipio_ibge"] == ""
    assert propostas[2]["cd_municipio_ibge"] == ""


def test_correspondencia_ambigua_nao_atribui_codigo_ibge():
    propostas = propor_correspondencias_municipais(
        [("10001", "SANTA MARIA", "PI")],
        [
            ("2200103", "Santa Maria", "PI"),
            ("2200104", "Santa Maria", "PI"),
        ],
    )

    assert propostas[0]["status"] == "pareamento_ambiguo"
    assert propostas[0]["cd_municipio_ibge"] == ""
