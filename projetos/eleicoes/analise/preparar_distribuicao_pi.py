"""Prepara a base e gera o HTML autocontido do produto de distribuição de votos no PI.

Produto: projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi
Decisões: L0001, L0002, EL0002, EL0003.

Python (este script) publica: votos por candidatura × seção, votos válidos por
seção e cargo (EL0003), cadastro de seções/locais/municípios, destino dos votos
de cada candidatura e a malha municipal simplificada. O JS do produto agrega,
calcula percentuais e Pearson com as MESMAS fórmulas das funções de referência
abaixo (`agregar`, `percentual`, `pearson`), conferidas por teste de paridade.

Só gera o produto se o relatório de qualidade estiver sem divergências e se os
arquivos brutos tiverem os mesmos hashes conferidos nele.
"""
from __future__ import annotations

import argparse
import base64
import csv
import gzip
import io
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence

from labdados.catalogo import raiz
from labdados.manifesto import sha256

from projetos.eleicoes.analise import validar_distribuicao_pi as qa

PRODUTO = Path("projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi")
RELATORIO_QA = Path("projetos/eleicoes/analise/relatorio_qualidade_distribuicao_pi.json")
DESIGN = Path("design/padrao/tokens.css")
ELEICOES = (("2018", "1"), ("2018", "2"), ("2022", "1"), ("2022", "2"), ("2026", "1"))
NOMES_CARGO = {"1": "Presidente", "3": "Governador", "5": "Senador",
               "6": "Deputado Federal", "7": "Deputado Estadual"}
MIN_LOCAIS_PEARSON = 10        # produto.yaml: comparacao.niveis.local_votacao
SIMPLIFICACAO_GRAUS = 0.002    # só para desenho; vínculos usam códigos oficiais


# ---------------------------------------------------------------- funções de referência (paridade com nucleo.js)

def agregar(votos_secao: Sequence[float], validos_secao: Sequence[float],
            grupo_secao: Sequence[int], n_grupos: int) -> tuple[list[float], list[float]]:
    """Soma votos e válidos por grupo (município, zona, local) a partir das seções.

    Entrada: vetores alinhados por seção e o índice do grupo de cada seção (-1 = fora).
    Saída: (votos, válidos) por grupo. Percentuais agregados vêm desta soma,
    nunca da média de percentuais (produto.yaml: percentual_em_niveis_agregados).
    """
    votos = [0.0] * n_grupos
    validos = [0.0] * n_grupos
    for v, val, g in zip(votos_secao, validos_secao, grupo_secao):
        if g >= 0:
            votos[g] += v
            validos[g] += val
    return votos, validos


def percentual(votos: float, validos: float) -> float | None:
    """Percentual dos votos válidos; indefinido quando não há válidos."""
    return 100.0 * votos / validos if validos > 0 else None


def pearson(x: Sequence[float | None], y: Sequence[float | None], minimo: int = 3) -> dict:
    """Correlação de Pearson entre pares com os dois valores definidos; peso igual por unidade.

    Saída: {"r": float | None, "n": pares usados}. r é None com menos de `minimo`
    pares ou variância nula. Fonte: Pearson (1895), fórmula de momentos centrados.
    """
    pares = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    n = len(pares)
    if n < minimo:
        return {"r": None, "n": n}
    mx = sum(a for a, _ in pares) / n
    my = sum(b for _, b in pares) / n
    sxy = sum((a - mx) * (b - my) for a, b in pares)
    sxx = sum((a - mx) ** 2 for a, _ in pares)
    syy = sum((b - my) ** 2 for _, b in pares)
    if sxx == 0 or syy == 0:
        return {"r": None, "n": n}
    return {"r": sxy / math.sqrt(sxx * syy), "n": n}


# ---------------------------------------------------------------- verificações de entrada

def _verificar_qa(raiz_lab: Path) -> dict:
    relatorio = json.loads((raiz_lab / RELATORIO_QA).read_text(encoding="utf-8"))
    for ano, r in relatorio["anos"].items():
        if r["status_automatizado"] != "sem divergências de votos":
            raise RuntimeError(f"Relatório de qualidade {ano} não aprovado: {r['status_automatizado']}")
        for nome, fonte in r["fontes"].items():
            atual = sha256(raiz_lab / fonte["arquivo"])
            if fonte["sha256"] != atual:
                raise RuntimeError(f"{fonte['arquivo']} mudou desde o relatório de qualidade; rode a QA de novo.")
    return relatorio


# ---------------------------------------------------------------- leitura

def _ler_candidatos(raiz_lab: Path, ano: str) -> dict[str, dict[str, str]]:
    caminho = raiz_lab / f"dados/bruto/tse/candidatos/consulta_cand_{ano}.zip"
    meta: dict[str, dict[str, str]] = {}
    with zipfile.ZipFile(caminho) as zp:
        for membro in zp.namelist():
            if not membro.endswith(("_PI.csv", "_BR.csv")):
                continue
            leitor = csv.DictReader(io.TextIOWrapper(zp.open(membro), encoding="latin-1"), delimiter=";")
            for r in leitor:
                meta[r["SQ_CANDIDATO"]] = {"nome_urna": r["NM_URNA_CANDIDATO"].strip(),
                                           "partido": r["SG_PARTIDO"].strip()}
    return meta


def _rotulo_destino(destino: str) -> str:
    return "valido" if destino in qa.DESTINOS_VALIDOS else destino


def montar_base(raiz_lab: Path, relatorio: dict) -> dict:
    corr = qa.ler_correspondencia(raiz_lab)
    municipios: dict[str, dict] = {}
    anos: dict[str, dict] = {}
    eleicoes: list[dict] = []

    for ano in ("2018", "2022", "2026"):
        fontes = qa.FONTES[int(ano)]

        def ler(nome):
            _, caminho, membro = fontes[nome]
            return qa.linhas_uf(raiz_lab / caminho, membro)

        nomes_votavel: dict[str, tuple[str, str]] = {}

        def votacao():
            for nome in ("votacao_secao_uf", "votacao_secao_br"):
                for linha in ler(nome):
                    if linha["SQ_CANDIDATO"] not in nomes_votavel and \
                            qa.classificar_votavel(linha["CD_CARGO"], linha["NR_VOTAVEL"]) == "nominal":
                        nomes_votavel[linha["SQ_CANDIDATO"]] = (linha["NR_VOTAVEL"], linha["NM_VOTAVEL"])
                    yield linha

        por_secao, por_cand_zona, por_secao_cand, por_secao_leg, _ = qa.somar_votacao_secao(votacao(), int(ano))
        # 2018 (opção B): sem detalhe por seção — as seções vêm da própria votação
        detalhe = qa.detalhe_de_votacao(por_secao) if ano == "2018" else qa.ler_detalhe_secao(ler("detalhe_secao"), int(ano))[0]
        sq_com_voto = {(chave[0], sq) for chave, sq in por_secao_cand}
        if ano == "2018":
            destino, _ = qa.destinos_2018(raiz_lab, por_cand_zona, qa._detalhe_munzona(ler("detalhe_munzona"), 2018))
            legenda_anulada = qa.legendas_anuladas_2022(ler("partido_munzona"), 2018)
        elif ano == "2022":
            destino, _ = qa.destinos_2022(raiz_lab, ler("munzona"), sq_com_voto)
            legenda_anulada = qa.legendas_anuladas_2022(ler("partido_munzona"))
        else:
            destino, _, _, legenda_anulada, _ = qa.ler_api_2026(raiz_lab)
            for chave in sq_com_voto - set(destino):
                destino[chave] = "Nulo técnico (ausente da API)"
        validos = qa.validos_por_secao(por_secao, por_secao_cand, por_secao_leg, destino, legenda_anulada)

        # cadastro de seções e locais (turno 1; QA confirmou o mesmo local em todos os turnos)
        cadastro = qa.ler_locais(ler("locais"))
        locais_qa = relatorio["anos"][ano]["C_locais"]
        fora = {tuple(x["local"]) for x in locais_qa.get("lista_fora_do_municipio", [])}
        chaves_secao = sorted({(k[2], k[3], k[4]) for k in detalhe}, key=lambda k: (int(k[0]), int(k[1]), int(k[2])))
        locais_idx: dict[tuple[str, str, str], int] = {}
        locais: list[list] = []
        secoes = {"municipio": [], "zona": [], "secao": [], "local": []}
        nomes_mun = {}
        for r in cadastro.values():
            nomes_mun[r["CD_MUNICIPIO"].lstrip("0")] = r["NM_MUNICIPIO"]
        for mun, zona, sec in chaves_secao:
            r = cadastro[("1", mun, zona, sec)]
            if mun not in municipios:
                municipios[mun] = {"tse": mun, "nome": nomes_mun[mun], "ibge": corr.get(mun)}
            chave_local = (mun, zona, r["NR_LOCAL_VOTACAO"])
            if chave_local not in locais_idx:
                lat, lon = qa._coordenada(r["NR_LATITUDE"]), qa._coordenada(r["NR_LONGITUDE"])
                situacao = "sem_coordenada" if lat is None else ("fora_do_municipio" if chave_local in fora else "ok")
                locais_idx[chave_local] = len(locais)
                locais.append([mun, zona, r["NR_LOCAL_VOTACAO"], r["NM_LOCAL_VOTACAO"].strip(),
                               r["NM_BAIRRO"].strip(), r["DS_ENDERECO"].strip(),
                               None if lat is None else round(lat, 6), None if lon is None else round(lon, 6),
                               situacao])
            secoes["municipio"].append(mun)
            secoes["zona"].append(int(zona))
            secoes["secao"].append(int(sec))
            secoes["local"].append(locais_idx[chave_local])
        secao_idx = {k: i for i, k in enumerate(chaves_secao)}
        anos[ano] = {"secoes": secoes, "locais": locais,
                     "gerado_tse": _data_geracao(raiz_lab, fontes)}

        meta_cand = _ler_candidatos(raiz_lab, ano)

        for ano_e, turno in ELEICOES:
            if ano_e != ano:
                continue
            cargos = []
            for cargo in sorted({k[1] for k in detalhe if k[0] == turno}, key=int):
                val = [0] * len(chaves_secao)
                for (t, c, mun, zona, sec), v in validos.items():
                    if t == turno and c == cargo:
                        val[secao_idx[(mun, zona, sec)]] = v
                linhas_cand: dict[str, list[tuple[int, int]]] = defaultdict(list)
                for ((t, c, mun, zona, sec), sq), v in por_secao_cand.items():
                    if t == turno and c == cargo:
                        linhas_cand[sq].append((secao_idx[(mun, zona, sec)], v))
                candidaturas, inicio, deltas, votos = [], [], [], []
                ordem = sorted(linhas_cand, key=lambda sq: -sum(v for _, v in linhas_cand[sq]))
                for sq in ordem:
                    pares = sorted(linhas_cand[sq])
                    numero, nome = nomes_votavel[sq]
                    m = meta_cand.get(sq, {})
                    candidaturas.append({"sq": sq, "numero": numero, "nome": nome,
                                         "nome_urna": m.get("nome_urna") or nome,
                                         "partido": m.get("partido", ""),
                                         "destino": _rotulo_destino(destino[(turno, sq)]),
                                         "total": sum(v for _, v in pares)})
                    inicio.append(len(votos))
                    anterior = 0
                    for s, v in pares:
                        deltas.append(s - anterior)
                        anterior = s
                        votos.append(v)
                inicio.append(len(votos))
                cargos.append({"codigo": cargo, "nome": NOMES_CARGO[cargo], "validos": val,
                               "candidaturas": candidaturas,
                               "votos": {"inicio": inicio, "delta_secao": deltas, "votos": votos}})
            eleicoes.append({"id": f"{ano}-{turno}", "ano": ano, "turno": turno,
                             "rotulo": f"{ano} · {turno}º turno", "cargos": cargos})

    return {"schema_version": 1, "municipios": sorted(municipios.values(), key=lambda m: m["nome"]),
            "anos": anos, "eleicoes": eleicoes}


def _data_geracao(raiz_lab: Path, fontes) -> str:
    _, caminho, membro = fontes["votacao_secao_uf"]
    for r in qa.linhas_uf(raiz_lab / caminho, membro):
        return f"{r['DT_GERACAO']} {r['HH_GERACAO']}"
    return ""


def malha_municipal(raiz_lab: Path, municipios: list[dict]) -> dict:
    import geopandas as gpd

    g = gpd.read_file(f"zip://{raiz_lab / qa._MALHA}")
    g = g[g["SIGLA_UF"] == qa.UF][["CD_MUN", "geometry"]].copy()
    g["geometry"] = g.geometry.simplify(SIMPLIFICACAO_GRAUS, preserve_topology=True)
    por_ibge = {m["ibge"]: m["tse"] for m in municipios if m["ibge"]}
    g = g[g["CD_MUN"].isin(por_ibge)]
    g["tse"] = g["CD_MUN"].map(por_ibge)
    texto = g[["tse", "CD_MUN", "geometry"]].to_json()
    texto = re.sub(r"(-?\d+\.\d{4})\d+", r"\1", texto)
    return json.loads(texto)


# ---------------------------------------------------------------- HTML

def _embutir(base: dict) -> str:
    bruto = json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(gzip.compress(bruto, compresslevel=9, mtime=0)).decode("ascii")


def qualidade_metodologia(raiz_lab: Path) -> tuple[dict, str]:
    """Tabela da conferência de qualidade para o bloco de metodologia (formato de labdados.metodologia)."""
    rel = json.loads((raiz_lab / RELATORIO_QA).read_text(encoding="utf-8"))
    linhas = [[ano, r["status_automatizado"], str(len(r.get("fontes", {}))), "sim" if all(
        f.get("sha256") for f in r.get("fontes", {}).values()) else "—"] for ano, r in rel["anos"].items()]
    ok = all(r["status_automatizado"] == "sem divergências de votos" for r in rel["anos"].values())
    return ({"texto": "Votos por seção conferidos com os totais oficiais de cada candidatura (tolerância zero); arquivos identificados por hash.",
             "colunas": ["Eleição", "Situação", "Arquivos conferidos", "Hash registrado"], "linhas": linhas},
            "sem divergências" if ok else "requer investigação")


COR_PL = "#3a8fd0"


def grupo_do_partido(sigla: str) -> str:
    """Grupo político do partido (EL0004): federação PT/PCdoB/PV; PP + União (União Progressista) — em 2018,
    PP + DEM + PSL (antecessores do União, EL0004 revista); PSD; MDB; demais = Outros. "UP" é Outros.
    Só neste produto (decisão local do pesquisador, 2026-10-06): PL ganha grupo e cor próprios, em vez de Outros."""
    s = {"PCDOB": "PC do B"}.get(sigla.strip(), sigla.strip())
    if s in ("PT", "PC do B", "PV"):
        return "PT"
    if s in ("PP", "UNIÃO", "DEM", "PSL"):
        return "PP"
    return s if s in ("PSD", "MDB", "PL") else "Outros"


def paleta_grupos(raiz_lab: Path, base: dict) -> dict:
    """Cores dos grupos (EL0006) e grupo de cada partido presente na base, para colorir as candidaturas."""
    import yaml

    cores = yaml.safe_load((raiz_lab / "dados/referencia/cores_grupos_politicos.yaml").read_text(encoding="utf-8"))
    siglas = {c["partido"] for e in base["eleicoes"] for cg in e["cargos"] for c in cg["candidaturas"] if c.get("partido")}
    # PL: cor só deste produto (decisão local), azul mais claro que o da União Progressista;
    # conferida com o validador de paleta (sem novo alerta em relação à EL0006)
    return {"cores": {**cores["claro"], "PL": COR_PL}, "nomes": {"PT": "PT/PV/PCdoB", "PP": "União Progressista"},
            "partido_grupo": {sg: grupo_do_partido(sg) for sg in sorted(siglas)}}


def _normalizar_nome(nome: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", nome.upper())
    return " ".join("".join(ch for ch in s if not unicodedata.combining(ch)).split())


def ligar_candidaturas(raiz_lab: Path, base: dict) -> tuple[list[list[list[int]]], dict]:
    """Mesma pessoa em eleições diferentes (EL0007): nome civil completo normalizado + data de nascimento,
    do arquivo de candidaturas do TSE. Liga só quando a chave é única em cada eleição; o CPF serve apenas
    para conferir a junção (não entra na base nem na página).

    Saída: lista de pessoas, cada uma com as ocorrências [eleição, cargo, candidatura]; relatório da ligação.
    """
    from collections import defaultdict

    meta: dict[str, tuple[str, str, str]] = {}
    for ano in sorted({e["ano"] for e in base["eleicoes"]}):
        with zipfile.ZipFile(raiz_lab / f"dados/bruto/tse/candidatos/consulta_cand_{ano}.zip") as zp:
            for membro in zp.namelist():
                if not membro.endswith(("_PI.csv", "_BR.csv")):
                    continue
                for r in csv.DictReader(io.TextIOWrapper(zp.open(membro), encoding="latin-1"), delimiter=";"):
                    meta[r["SQ_CANDIDATO"]] = (_normalizar_nome(r["NM_CANDIDATO"]), r.get("DT_NASCIMENTO", "").strip(),
                                               r.get("NR_CPF_CANDIDATO", "").strip())
    chaves: dict[tuple[str, str], list[list[int]]] = defaultdict(list)
    cpfs: dict[tuple[str, str], set[str]] = defaultdict(set)
    sem_chave = 0
    for ei, e in enumerate(base["eleicoes"]):
        for k, cg in enumerate(e["cargos"]):
            for j, c in enumerate(cg["candidaturas"]):
                m = meta.get(c["sq"])
                if not m or not m[0] or not m[1] or m[1].startswith("#"):
                    sem_chave += 1
                    continue
                chaves[(m[0], m[1])].append([ei, k, j])
                if m[2].isdigit() and len(m[2]) == 11:
                    cpfs[(m[0], m[1])].add(m[2])
    pessoas, ambiguas, conflito_cpf = [], 0, 0
    for chave, occ in chaves.items():
        eleicoes = [o[0] for o in occ]
        if len(set(eleicoes)) < 2:
            continue
        if len(eleicoes) != len(set(eleicoes)):      # mesma chave duas vezes na mesma eleição: não liga
            ambiguas += 1
            continue
        if len(cpfs[chave]) > 1:                       # nome + nascimento iguais, CPFs diferentes: não liga
            conflito_cpf += 1
            continue
        pessoas.append(sorted(occ))
    return pessoas, {"pessoas_ligadas": len(pessoas), "chaves_ambiguas": ambiguas, "conflitos_cpf": conflito_cpf,
                     "candidaturas_sem_chave": sem_chave}


def gerar_html(raiz_lab: Path, base: dict, dados_b64: str) -> Path:
    """index.html autocontido: tokens + componentes do design system (L0003) + nucleo.js + app.js + base."""
    import yaml

    from labdados import metodologia
    from labdados.produto_web import montar_html
    from projetos.eleicoes.analise import preparar_distribuicao_pi as este
    from projetos.eleicoes.analise import validar_distribuicao_pi as qa

    src = raiz_lab / PRODUTO / "src"
    perfil = yaml.safe_load((raiz_lab / "autor/perfil.yaml").read_text(encoding="utf-8"))
    tabela_q, status_q = qualidade_metodologia(raiz_lab)
    # recortes regionais (L0001/EL0002 + IBGE 2017 + Territórios de Desenvolvimento), como no produto "Forças políticas"
    from projetos.eleicoes.analise.forcas_pi import ler_territorios
    from projetos.eleicoes.analise.html_forcas_pi import contornos
    terr = ler_territorios(raiz_lab)
    muns_reg = [{**m, **{k: terr[m["tse"]][k] for k in ("imediata", "intermediaria", "territorio")}} for m in base["municipios"]]
    contornos_reg = {k: v for k, v in contornos(raiz_lab, muns_reg).items() if k in ("imediata", "intermediaria", "territorio")}
    pessoas, rel_pessoas = ligar_candidaturas(raiz_lab, base)
    print(f"Ligação de candidaturas (EL0007): {rel_pessoas}")
    base_html = {**base, "pessoas": pessoas, "ligacao_candidaturas": rel_pessoas, "municipios": muns_reg, "contornos": contornos_reg, "grupos": paleta_grupos(raiz_lab, base), "metodologia": metodologia.montar(raiz_lab, raiz_lab / PRODUTO, gerado_em=base["meta"]["gerado_em"],
                 funcoes={"preparar_distribuicao_pi": este, "validar_distribuicao_pi": qa}, anos=("2018", "2022", "2026"),
                 qualidade=tabela_q, status_qualidade=status_q)}
    nucleo = (src / "nucleo.js").read_text(encoding="utf-8").replace("export ", "")
    html = montar_html(raiz_lab, (src / "index.template.html").read_text(encoding="utf-8"),
                       app_js=nucleo + "\n" + (src / "app.js").read_text(encoding="utf-8"), base=base_html,
                       substituicoes={"__AUTOR__": perfil["nome_curto"],
                                      "__PORTFOLIO__": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "../../../../docs/index.html"})
    destino = raiz_lab / PRODUTO / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


# ---------------------------------------------------------------- paridade JS × Python

def _votos_secao(cargo: dict, ci: int, n: int) -> list[float]:
    """Reconstrói o vetor de votos por seção a partir da codificação em deltas."""
    vs = [0.0] * n
    ini, fim = cargo["votos"]["inicio"][ci], cargo["votos"]["inicio"][ci + 1]
    s = 0
    for k in range(ini, fim):
        s += cargo["votos"]["delta_secao"][k]
        vs[s] = cargo["votos"]["votos"][k]
    return vs


def casos_paridade(base: dict) -> list[dict]:
    """Resultados esperados (Python) para agregações, percentuais e Pearson sobre a base publicada."""
    casos = []
    muns = [m["tse"] for m in base["municipios"]]
    idx_mun = {m: i for i, m in enumerate(muns)}
    for e_i, eleicao in enumerate(base["eleicoes"]):
        ano = base["anos"][eleicao["ano"]]
        grupo_mun = [idx_mun[m] for m in ano["secoes"]["municipio"]]
        # locais de um município grande (o de mais locais), para o Pearson local
        cont = Counter(ano["locais"][l][0] for l in set(ano["secoes"]["local"]))
        mun_local = cont.most_common(1)[0][0]
        locais_mun = sorted({l for l, m in zip(ano["secoes"]["local"], ano["secoes"]["municipio"]) if m == mun_local})
        idx_local = {l: i for i, l in enumerate(locais_mun)}
        grupo_local = [idx_local.get(l, -1) if m == mun_local else -1
                       for l, m in zip(ano["secoes"]["local"], ano["secoes"]["municipio"])]
        vet_mun, vet_loc = [], []
        for c_i, cargo in enumerate(eleicao["cargos"]):
            for ci in range(min(2, len(cargo["candidaturas"]))):
                vs = _votos_secao(cargo, ci, len(grupo_mun))
                votos, validos = agregar(vs, cargo["validos"], grupo_mun, len(muns))
                pct = [percentual(a, b) for a, b in zip(votos, validos)]
                casos.append({"tipo": "agregar", "eleicao": e_i, "cargo": c_i, "candidatura": ci,
                              "nivel": "municipio", "votos": votos, "validos": validos, "pct": pct})
                lv, lval = agregar(vs, cargo["validos"], grupo_local, len(locais_mun))
                lpct = [percentual(a, b) for a, b in zip(lv, lval)]
                casos.append({"tipo": "agregar", "eleicao": e_i, "cargo": c_i, "candidatura": ci,
                              "nivel": "local", "municipio": mun_local, "locais": locais_mun,
                              "votos": lv, "validos": lval, "pct": lpct})
                vet_mun.append(pct)
                vet_loc.append(lpct)
        for vetores, minimo in ((vet_mun, 3), (vet_loc, MIN_LOCAIS_PEARSON)):
            for a in range(len(vetores)):
                for b in range(a + 1, len(vetores)):
                    casos.append({"tipo": "pearson", "x": vetores[a], "y": vetores[b], "minimo": minimo,
                                  "esperado": pearson(vetores[a], vetores[b], minimo)})
    for x, y in (([1, 2, None, 4], [2, 4, 5, None]), ([1, 1, 1, 1], [1, 2, 3, 4])):
        casos.append({"tipo": "pearson", "x": x, "y": y, "minimo": 3, "esperado": pearson(x, y, 3)})
    return casos


def gerar_paridade(raiz_lab: Path, base: dict, dados_b64: str) -> Path:
    """Página de teste: roda o núcleo JS sobre a base embutida e compara com o Python."""
    nucleo = (raiz_lab / PRODUTO / "src" / "nucleo.js").read_text(encoding="utf-8").replace("export ", "")
    casos = json.dumps(casos_paridade(base), separators=(",", ":"))
    html = f"""<!doctype html><meta charset="utf-8"><title>Paridade JS × Python</title>
<pre id="resultado">pendente</pre>
<script>
{nucleo}
const CASOS = {casos};
const DADOS = "{dados_b64}";
const perto = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const iguais = (a, b) => a.length === b.length && a.every((v, i) => perto(v, b[i]));
(async () => {{
  const falhas = [];
  try {{
    const base = await decodificarBase(DADOS);
    const muns = base.municipios.map(m => m.tse);
    for (const [i, c] of CASOS.entries()) {{
      if (c.tipo === "pearson") {{
        const r = pearson(c.x, c.y, c.minimo);
        if (r.n !== c.esperado.n || !perto(r.r, c.esperado.r)) falhas.push({{i, js: r, py: c.esperado}});
        continue;
      }}
      const e = base.eleicoes[c.eleicao], cargo = e.cargos[c.cargo], ano = base.anos[e.ano];
      const vs = votosPorSecao(cargo, c.candidatura, ano.secoes.municipio.length);
      let grupo, n;
      if (c.nivel === "municipio") {{
        const idx = new Map(muns.map((m, k) => [m, k]));
        grupo = ano.secoes.municipio.map(m => idx.get(m)); n = muns.length;
      }} else {{
        const idx = new Map(c.locais.map((l, k) => [l, k]));
        grupo = ano.secoes.local.map((l, k) => ano.secoes.municipio[k] === c.municipio ? (idx.has(l) ? idx.get(l) : -1) : -1);
        n = c.locais.length;
      }}
      const ag = agregar(vs, cargo.validos, grupo, n);
      const pct = Array.from(ag.votos, (v, k) => percentual(v, ag.validos[k]));
      if (!iguais(Array.from(ag.votos), c.votos) || !iguais(Array.from(ag.validos), c.validos) || !iguais(pct, c.pct))
        falhas.push({{i, tipo: c.tipo, nivel: c.nivel}});
    }}
  }} catch (erro) {{ falhas.push({{erro: String(erro)}}); }}
  document.getElementById("resultado").textContent =
    JSON.stringify({{casos: CASOS.length, n_falhas: falhas.length, falhas: falhas.slice(0, 5)}});
}})();
</script>"""
    destino = raiz_lab / PRODUTO / "src" / "paridade.html"
    destino.write_text(html, encoding="utf-8")
    return destino


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--so-html", action="store_true",
                        help="reaproveita data/base_pi.json.gz e só regenera o HTML e a paridade")
    args = parser.parse_args()
    raiz_lab = raiz()
    arquivo_base = raiz_lab / PRODUTO / "data" / "base_pi.json.gz"
    relatorio = _verificar_qa(raiz_lab)
    if args.so_html:
        base = json.loads(gzip.decompress(arquivo_base.read_bytes()))
        if base["meta"]["qa_gerado_em"] != relatorio["gerado_em"]:
            raise RuntimeError("A base salva é anterior ao relatório de qualidade atual; rode sem --so-html.")
        dados_b64 = _embutir(base)
        print(f"HTML: {gerar_html(raiz_lab, base, dados_b64).relative_to(raiz_lab)}")
        print(f"Paridade: {gerar_paridade(raiz_lab, base, dados_b64).relative_to(raiz_lab)}")
        return
    base = montar_base(raiz_lab, relatorio)
    base["malha"] = malha_municipal(raiz_lab, base["municipios"])
    base["meta"] = {
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "min_locais_pearson": MIN_LOCAIS_PEARSON,
        "qa": {ano: r["status_automatizado"] for ano, r in relatorio["anos"].items()},
        "qa_gerado_em": relatorio["gerado_em"],
        "api_2026_coletada_em": relatorio["anos"]["2026"]["D_validos_EL0003"].get("coletado_em"),
    }
    dados_b64 = _embutir(base)
    arquivo_base.write_bytes(base64.b64decode(dados_b64))
    destino = gerar_html(raiz_lab, base, dados_b64)
    print(f"HTML: {destino.relative_to(raiz_lab)} ({destino.stat().st_size / 1e6:.1f} MB)")
    teste = gerar_paridade(raiz_lab, base, dados_b64)
    print(f"Paridade: {teste.relative_to(raiz_lab)}")


if __name__ == "__main__":
    main()
