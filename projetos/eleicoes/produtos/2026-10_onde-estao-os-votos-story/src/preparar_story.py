#!/usr/bin/env python3
"""Base do story-piloto "Onde estão os votos no Piauí" (L0015; pedido do pesquisador em 2026-10-12).

    PYTHONPATH=nucleo:. python projetos/eleicoes/produtos/2026-10_onde-estao-os-votos-story/src/preparar_story.py
    PYTHONPATH=nucleo:. python -m labdados.viz og projetos/eleicoes/produtos/2026-10_onde-estao-os-votos-story

Derivado do produto publicado "Onde estão os votos?" (2026-10_distribuicao-votos-candidato-pi): lê a base dele (votos por
seção conferidos com o TSE, válidos do EL0003) e usa as mesmas funções de referência (agregar, percentual, pearson — com
teste de paridade naquele produto). 1º turno de 2026, por município. Monta para cada cartão o texto e os dados prontos
(L0002): mapa do mais votado ao Senado, mapa do % dos válidos de cada candidatura (5 faixas iguais de 0 ao maior valor,
no tom da cor do grupo — EL0004/EL0006), barras de concentração dos deputados estaduais mais votados e correlações.
Dicas com contexto (Q-087): %, votos, válidos do município, posição entre os 224 e o % no estado.
Saída: data/story.json (base única; textos e dados em `textos`).
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import yaml

PRODUTO = Path(__file__).resolve().parents[1]
RAIZ = PRODUTO.parents[3]
sys.path[:0] = [str(RAIZ / "nucleo"), str(RAIZ)]

from projetos.eleicoes.analise.preparar_distribuicao_pi import _votos_secao, agregar, grupo_do_partido, pearson, percentual  # noqa: E402

ORIGEM = RAIZ / "projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi/data/base_pi.json.gz"
FORCAS = RAIZ / "projetos/eleicoes/produtos/2026-10_forcas-politicas-pi/data/base_forcas_pi.json.gz"   # nomes e contornos dos municípios
ELEICAO = "2026-1"
N_DEP = 15        # deputados estaduais mais votados no capítulo da concentração
NOME_GRUPO = {"PT": "PT/PV/PCdoB", "PSD": "PSD", "MDB": "MDB", "PP": "União Progressista", "Outros": "Outros"}
ROTULOS = ["2211001", "2207702", "2208007", "2203909", "2210607"]   # Teresina, Parnaíba, Picos, Floriano, São Raimundo Nonato (IBGE)


def pct(v: float | None, casas: int = 1) -> str:
    return "—" if v is None else f"{v:.{casas}f}".replace(".", ",") + "%"


def inteiro(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


def r_txt(r: float) -> str:
    return f"{r:.2f}".replace(".", ",").replace("-", "−")


def cores() -> dict:
    return yaml.safe_load((RAIZ / "dados/referencia/cores_grupos_politicos.yaml").read_text(encoding="utf-8"))["claro"]


def tons(hexa: str, n: int = 5) -> list[str]:
    """n tons do claro (12% da cor sobre o branco) ao escuro (a cor um pouco mais escura) — um matiz, como no produto de origem."""
    if not hexa.startswith("#"):
        hexa = "#7a7873"
    r, g, b = (int(hexa[i:i + 2], 16) for i in (1, 3, 5))
    saida = []
    for k in range(n):
        t = 0.12 + 0.88 * k / (n - 1)
        escurecer = 1 - 0.25 * max(0.0, (k - (n - 2)) / 1)   # o último tom escurece um pouco
        mix = [round((255 * (1 - t) + c * t) * escurecer) for c in (r, g, b)]
        saida.append("#" + "".join(f"{min(255, max(0, c)):02x}" for c in mix))
    return saida


class Base:
    def __init__(self) -> None:
        self.B = json.loads(gzip.decompress(ORIGEM.read_bytes()))
        F = json.loads(gzip.decompress(FORCAS.read_bytes()))
        self.mun_forcas = F["municipios"]
        self.nome = {m["tse"]: m["nome"] for m in F["municipios"]}
        self.E = next(e for e in self.B["eleicoes"] if e["id"] == ELEICAO)
        sec = self.B["anos"]["2026"]["secoes"]["municipio"]
        self.codigos = sorted(set(sec))
        idx = {c: i for i, c in enumerate(self.codigos)}
        self.grupo_secao = [idx[c] for c in sec]
        self.n_sec = len(sec)

    def cargo(self, nome: str) -> dict:
        return next(c for c in self.E["cargos"] if c["nome"] == nome)

    def por_municipio(self, cargo: dict, cand: dict) -> dict[str, dict]:
        """{tse: {votos, validos, pct}} — soma das seções antes de dividir (produto de origem)."""
        ci = cargo["candidaturas"].index(cand)
        v, val = agregar(_votos_secao(cargo, ci, self.n_sec), cargo["validos"], self.grupo_secao, len(self.codigos))
        return {c: {"votos": v[i], "validos": val[i], "pct": percentual(v[i], val[i])} for i, c in enumerate(self.codigos)}


def unidades_pct(M: Base, cand: dict, mun: dict[str, dict], estado_pct: float) -> tuple[dict, list[dict], list[float]]:
    """Camada do mapa: % dos válidos em 5 faixas iguais (0 ao maior), no tom do grupo; dica com contexto (Q-087)."""
    validos = {k: x["pct"] for k, x in mun.items() if x["pct"] is not None}
    mx = max(validos.values())
    cortes = [mx * k / 5 for k in range(1, 5)]
    paleta = tons(cores().get(grupo_do_partido(cand["partido"]), "#7a7873"))
    cats = [{"id": f"f{k}", "rotulo": f"{pct(0 if k == 0 else cortes[k - 1], 0)} a {pct(cortes[k] if k < 4 else mx, 0)}", "cor": paleta[k]} for k in range(5)]
    ordem = sorted(validos, key=lambda k: -validos[k])
    pos = {k: i + 1 for i, k in enumerate(ordem)}
    U = {}
    for k, x in mun.items():
        if x["pct"] is None:
            U[k] = {"nome": M.nome[k], "categoria": None, "linhas": ["sem votos válidos para o cargo"]}
            continue
        faixa = sum(1 for c in cortes if x["pct"] >= c)
        U[k] = {"nome": M.nome[k], "categoria": f"f{faixa}", "tamanho": x["votos"],
                "linhas": [f"{pct(x['pct'])} dos votos válidos", f"{inteiro(x['votos'])} votos de {inteiro(x['validos'])} válidos no município",
                           f"{pos[k]}º maior percentual entre {len(validos)} municípios", f"no estado: {pct(estado_pct)}"]}
    return U, cats, [validos[k] for k in ordem]


def top_municipios(M: Base, mun: dict[str, dict], total: float, cor: str, n: int = 5) -> list[dict]:
    """Os n municípios com mais votos da candidatura (barras), com a parte do total dela, na cor do grupo."""
    T = sorted(mun.items(), key=lambda kv: -kv[1]["votos"])[:n]
    return [{"rotulo": M.nome[k], "valor": round(100 * x["votos"] / total, 2), "votos": inteiro(x["votos"]), "cor": cor} for k, x in T]


def concentracao(mun: dict[str, dict], total: float) -> dict:
    """Parte dos votos que vem do município com mais votos e quantos municípios somam metade dos votos."""
    vs = sorted((x["votos"] for x in mun.values()), reverse=True)
    acum, k = 0.0, 0
    while acum < total / 2:
        acum += vs[k]
        k += 1
    return {"maior": 100 * vs[0] / total, "metade": k, "com_voto": sum(1 for v in vs if v > 0)}


def montar(M: Base) -> dict:
    C = cores()
    t: dict = {}
    # ---------------------------------------------------------------- Senado: o mais votado em cada município
    sen = M.cargo("Senador")
    tops = sorted(sen["candidaturas"], key=lambda c: -c["total"])[:3]
    tv_sen = sum(sen["validos"])
    muns = {c["sq"]: M.por_municipio(sen, c) for c in tops}
    lider, n_lid = {}, {c["sq"]: 0 for c in tops}
    for k in M.codigos:
        pcts = {c["sq"]: muns[c["sq"]][k]["pct"] for c in tops}
        if all(p is None for p in pcts.values()):
            continue
        g = max(pcts, key=lambda s: pcts[s] or -1)
        lider[k] = g
        n_lid[g] += 1
    nomecand = {c["sq"]: c["nome_urna"].title().replace("Júlio César O Julim Do Lula", "Júlio César") for c in tops}
    cats_sen = [{"id": c["sq"], "rotulo": f"{nomecand[c['sq']]} ({c['partido']})", "cor": C.get(grupo_do_partido(c["partido"]), "#7a7873")} for c in tops]
    U = {}
    for k, s in lider.items():
        linhas = [f"mais votado: {nomecand[s]}"] + [f"{nomecand[c['sq']]}: {pct(muns[c['sq']][k]['pct'])}" for c in tops] + \
                 [f"{inteiro(muns[s][k]['validos'])} votos válidos (cada eleitor votou em dois)"]
        U[k] = {"nome": M.nome[k], "categoria": s, "tamanho": muns[s][k]["validos"], "linhas": linhas}
    a, b, c = tops
    t["senado"] = {"titulo": f"Para senador no Piauí em 2026, {nomecand[a['sq']]} foi o mais votado em ⟦{n_lid[a['sq']]}⟧ dos 224 municípios; "
                             f"{nomecand[b['sq']]}, em ⟦{n_lid[b['sq']]}⟧; {nomecand[c['sq']]}, em ⟦{n_lid[c['sq']]}⟧",
                   "texto": f"No estado, {nomecand[a['sq']]} teve {pct(100 * a['total'] / tv_sen)} dos votos válidos, {nomecand[b['sq']]} "
                            f"{pct(100 * b['total'] / tv_sen)} e {nomecand[c['sq']]} {pct(100 * c['total'] / tv_sen)}. Eram duas vagas: cada eleitor votou em dois.",
                   "dados": {"malha": "municipios", "unidades": U, "categorias": cats_sen, "referencia": "pi", "rotulos": "pi", "camera": "estado",
                             "rotulo_tamanho": "votos válidos para senador"}}
    t["senador"] = {}
    for cnd in tops:
        mun = muns[cnd["sq"]]
        est_pct = 100 * cnd["total"] / tv_sen
        Ux, cats, ordem = unidades_pct(M, cnd, mun, est_pct)
        mx_k = max((k for k in mun if mun[k]["pct"] is not None), key=lambda k: mun[k]["pct"])
        mn_k = min((k for k in mun if mun[k]["pct"] is not None), key=lambda k: mun[k]["pct"])
        top = top_municipios(M, mun, cnd["total"], C.get(grupo_do_partido(cnd["partido"]), "#7a7873"))
        t["senador"][cnd["sq"]] = {
            "titulo": f"{nomecand[cnd['sq']]} ({cnd['partido']}) para senador no Piauí: de ⟦{pct(mun[mn_k]['pct'])}⟧ dos válidos em {M.nome[mn_k]} a ⟦{pct(mun[mx_k]['pct'])}⟧ em {M.nome[mx_k]}",
            "texto": f"No estado, {pct(est_pct)} dos votos válidos ({inteiro(cnd['total'])} votos). Os cinco municípios com mais votos somam "
                     f"{pct(sum(x['valor'] for x in top))} dos votos dele.",
            "mapa": {"malha": "municipios", "unidades": Ux, "categorias": cats, "referencia": "pi", "rotulos": "pi", "camera": "estado",
                     "rotulo_tamanho": "votos"},
            "barras": top}
    t["opcoes_senador"] = {c["sq"]: nomecand[c["sq"]] for c in tops}
    t["senador_inicial"] = tops[0]["sq"]
    # ---------------------------------------------------------------- deputados estaduais: concentração
    dep = M.cargo("Deputado Estadual")
    deps = [c for c in sorted(dep["candidaturas"], key=lambda c: -c["total"]) if c["destino"] == "valido"][:N_DEP]
    conc, mund = {}, {}
    for cnd in deps:
        mund[cnd["sq"]] = M.por_municipio(dep, cnd)
        conc[cnd["sq"]] = concentracao(mund[cnd["sq"]], cnd["total"])
    nm = lambda c: c["nome_urna"].title()   # noqa: E731
    barras = [{"id": c["sq"], "rotulo": f"{nm(c)} ({c['partido']})", "valor": round(conc[c["sq"]]["maior"], 2),
               "cor": C.get(grupo_do_partido(c["partido"]), "#7a7873")} for c in deps]
    mais = max(deps, key=lambda c: conc[c["sq"]]["maior"])
    menos = min(deps, key=lambda c: conc[c["sq"]]["maior"])
    t["concentracao"] = {
        "titulo": f"Entre os {N_DEP} deputados estaduais mais votados do Piauí em 2026, a parte dos votos que vem de um só município vai de "
                  f"⟦{pct(conc[menos['sq']]['maior'], 0)}⟧ a ⟦{pct(conc[mais['sq']]['maior'], 0)}⟧",
        "texto": f"{nm(mais)} teve {pct(conc[mais['sq']]['maior'])} dos votos no município onde mais foi votado; {nm(menos)}, {pct(conc[menos['sq']]['maior'])} "
                 f"— precisou de {conc[menos['sq']]['metade']} municípios para chegar à metade dos votos.",
        "dados": barras}
    t["deputado"] = {}
    for cnd in deps:
        mun, cc = mund[cnd["sq"]], conc[cnd["sq"]]
        Ux, cats, _ = unidades_pct(M, cnd, mun, 100 * cnd["total"] / sum(dep["validos"]))
        top = top_municipios(M, mun, cnd["total"], C.get(grupo_do_partido(cnd["partido"]), "#7a7873"))
        t["deputado"][cnd["sq"]] = {
            "titulo": f"{nm(cnd)} ({cnd['partido']}), {'o deputado estadual mais votado' if deps.index(cnd) == 0 else f'{deps.index(cnd) + 1}º entre os deputados estaduais mais votados'} do Piauí em 2026: "
                      f"⟦{pct(cc['maior'], 0)}⟧ dos votos vieram de {top[0]['rotulo']}",
            "texto": f"{inteiro(cnd['total'])} votos, com voto em {cc['com_voto']} dos 224 municípios; {cc['metade']} "
                     f"{'município soma' if cc['metade'] == 1 else 'municípios somam'} metade dos votos.",
            "mapa": {"malha": "municipios", "unidades": Ux, "categorias": cats, "referencia": "pi", "rotulos": "pi", "camera": "estado", "rotulo_tamanho": "votos"},
            "barras": top}
    t["opcoes_deputado"] = {c["sq"]: f"{nm(c)} ({c['partido']})" for c in deps}
    t["deputado_inicial"] = deps[0]["sq"]
    # ---------------------------------------------------------------- votos que andam juntos (Pearson por município, peso igual)
    gov, pres = M.cargo("Governador"), M.cargo("Presidente")
    rafa = max(gov["candidaturas"], key=lambda c: c["total"])
    lula = max(pres["candidaturas"], key=lambda c: c["total"])
    pr = lambda cg, cd: [M.por_municipio(cg, cd)[k]["pct"] for k in M.codigos]   # noqa: E731
    x_rafa = pr(gov, rafa)
    r_lula = pearson(x_rafa, pr(pres, lula))
    r_sen = {c["sq"]: pearson(x_rafa, [muns[c["sq"]][k]["pct"] for k in M.codigos]) for c in tops}
    t["juntos"] = {
        "titulo": f"{lula['nome_urna'].title()} (presidente) e {rafa['nome_urna'].title()} (governador) no Piauí em 2026: correlação de ⟦{r_txt(r_lula['r'])}⟧ entre os percentuais nos {r_lula['n']} municípios",
        "texto": f"A correlação vai de −1 a 1: perto de 1, os dois percentuais sobem e descem juntos de um município para outro. "
                 f"Abaixo, a correlação do mapa de {rafa['nome_urna'].title()} com o de cada candidatura:",
        "dados": [{"valor": r_txt(r_lula["r"]), "rotulo": f"{lula['nome_urna'].title()} (presidente)"}] +
                 [{"valor": r_txt(r_sen[c["sq"]]["r"]), "rotulo": f"{nomecand[c['sq']]} (Senado)"} for c in tops],
        "nota": f"Pearson entre os percentuais dos votos válidos por município, cada município com o mesmo peso (n = {r_lula['n']}), como no produto “Onde estão os votos?”."}
    teresina = next(k for k in M.codigos if M.nome[k] == "Teresina")
    val_gov = M.por_municipio(gov, rafa)
    t["leitura"] = {"titulo": "Mapa de percentual mostra onde uma candidatura foi forte, não onde estão mais votos",
                    "texto": f"Teresina tem {pct(100 * val_gov[teresina]['validos'] / sum(x['validos'] for x in val_gov.values()))} dos votos válidos "
                             "do Piauí; muitos municípios grandes no mapa têm poucos eleitores. Por isso cada mapa vem com os municípios que mais deram votos."}
    t["universo"] = "1º turno de 2026 no Piauí, por município; votos por seção conferidos com o total do TSE (EL0003)."
    return t


def main() -> None:
    from labdados.mapa import referencia_ufs, rotulos_municipios
    from projetos.eleicoes.analise.html_forcas_pi import contornos
    M = Base()
    textos = montar(M)
    textos["malhas"] = {"municipios": contornos(RAIZ, M.mun_forcas)["municipio"]}
    textos["referencias"] = {"pi": referencia_ufs(RAIZ, "PI", margem_x=9)}
    textos["rotulos"] = {"pi": rotulos_municipios(RAIZ, ROTULOS)}
    base = {"gerado_em": M.B["meta"]["gerado_em"], "origem": "2026-10_distribuicao-votos-candidato-pi (data/base_pi.json.gz)", "textos": textos}
    destino = PRODUTO / "data" / "story.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(base, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"story: {destino.relative_to(RAIZ)} ({destino.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
