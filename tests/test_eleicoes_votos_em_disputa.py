"""Piloto "votos em disputa" (2026-10_votos-em-disputa): tabela por município e textos com números."""
from projetos.eleicoes.analise.preparar_votos_em_disputa import COLUNAS, municipio, num

CAMPOS = ["zona", "local", "nome", "bairro", "endereco", "tipo", "lat", "lon", "coord", "secoes", "par", "nome_2022",
          "distancia_2022_m", "t2026", "t2022", "turnos2022"]
TOTAIS = ["aptos", "abstencoes", "validos", "lula", "flavio", "cury", "renan", "outros"]
TURNOS = ["aptos_1t", "abstencoes_1t", "validos_1t", "pt_1t", "pl_1t", "aptos_2t", "abstencoes_2t", "validos_2t", "pt_2t", "pl_2t"]


def local(z, l, tipo, t26, t22, turnos=None, coord="ok"):
    return [z, l, f"ESCOLA {l}", "CENTRO", "RUA A", tipo, -5.0, -42.8, coord, 1, "nome", "", 0, t26, t22, turnos]


def base(linhas):
    return {"m": "9999999", "campos": CAMPOS, "totais": TOTAIS, "turnos": TURNOS, "contorno": None, "l": linhas}


# t2026/t2022: [aptos, abstencoes, validos, lula, flavio, cury, renan, outros]
A = local(1, 10, "C", [1000, 200, 760, 300, 300, 80, 40, 40], [1000, 180, 800, 400, 350, 0, 0, 50],
          [1000, 180, 800, 400, 350, 1000, 170, 815, 430, 385])     # perdeu 9,47 p.p.; disputa 200+40+160 = 400
B = local(1, 20, "C", [500, 50, 430, 250, 150, 10, 10, 10], [500, 60, 420, 200, 200, 0, 0, 20])   # ganhou; disputa 50+20+30 = 100
C = local(1, 30, "V", [100, 10, 85, 40, 40, 1, 1, 3], [100, 10, 85, 40, 40, 0, 0, 5])          # voto em trânsito: fora
D = local(1, 40, "C", [300, 30, 260, 100, 100, 20, 20, 20], None)                               # sem par em 2022: fora


def test_so_locais_convencionais_com_par_e_contas_da_origem():
    tab, conf = municipio(base([A, B, C, D]), "Cidade", "PI")
    assert conf["comparaveis"] == 2 and conf["locais_origem"] == 4 and conf["disputa_fecha"]
    linhas = {r[0]: dict(zip(COLUNAS, r)) for r in tab["linhas"]}
    a, b = linhas["1-10"], linhas["1-20"]
    assert (a["disputa"], a["abstencoes"], a["brancos_nulos"], a["outras"]) == (400, 200, 40, 160)
    assert a["variacao"] == round(100 * 300 / 760 - 100 * 400 / 800, 2)
    assert a["perdas"] == 100 and b["perdas"] == 0
    assert a["fatia"] == 46.2   # ganho PT 30 de 65 somado (PT 30 + PL 35)
    assert b["fatia"] is None   # sem turnos de 2022 no local


def test_destaque_mediana_e_textos():
    tab, conf = municipio(base([A, B]), "Cidade", "PI")
    assert tab["med_y"] == 250                     # mediana tipo 7 de 400 e 100
    dest = [r[0] for r in tab["linhas"] if r[-1]]
    assert dest == ["1-10"] and conf["destaque"] == 1
    t = tab["textos"]
    assert t["subtitulo"].startswith("1 de 2 locais onde Lula perdeu participação desde 2022")
    assert "(250 por local)" in t["subtitulo"]
    assert t["amostra_grafico"] == "N = 2 locais de votação · em cor, o 1 em destaque"
    assert t["mapa_vazio"] == ""
    assert t["anotacao"] == {"alvo": "1-10", "texto": "Maior volume em disputa entre os destacados: 400 votos"}
    assert t["rotulos"] == ["1-10"]
    assert t["legenda_linhas"] == "linhas tracejadas: mediana dos votos em disputa (250 por local) e variação zero"


def test_cidade_sem_locais_comparaveis():
    tab, conf = municipio(base([C, D]), "Cidade", "PI")
    assert conf["comparaveis"] == 0 and tab["linhas"] == [] and tab["textos"]["anotacao"] is None
    assert "Nenhum local de votação" in tab["textos"]["subtitulo"]


def test_formato_pt_br():
    assert num(1721) == "1.721" and num(14.94, 1) == "14,9" and num(454) == "454"
