#!/usr/bin/env python3
"""Base do story declarativo "Quem lidera o voto no Piauí" (L0015; extensões de 2026-10-12) a partir do roteiro VALIDADO.

    PYTHONPATH=nucleo:. python projetos/eleicoes/produtos/2026-10_quem-lidera-o-voto-pi/src/preparar_story.py
    PYTHONPATH=nucleo:. python -m labdados.viz og projetos/eleicoes/produtos/2026-10_quem-lidera-o-voto-pi

O roteiro (src/roteiro.yaml, v5) continua sendo a fonte do texto: frases preenchidas pelos mesmos marcadores da prancha
(src/prancha.py), a partir da base do produto de origem (deriva_de: 2026-10_forcas-politicas-pi). Aqui se monta, para
cada cartão, o texto e os dados prontos do componente (L0002): barras de votos, camadas do mapa (cor, dica e tamanho
de cada município, prontos), fluxo 2022 → 2026 e as escolhas do Explore (grupo, território, município). Malha,
camadas do mapa, referência e rótulos ficam uma vez só na base (e.malhas, e.unidades…) e os cartões citam pelo nome.
Saída: data/story.json (base única, sem fatias).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import yaml

PRODUTO = Path(__file__).resolve().parents[1]
RAIZ = PRODUTO.parents[3]
sys.path[:0] = [str(RAIZ / "nucleo"), str(RAIZ), str(Path(__file__).parent)]

from prancha import ARTIGO, NOME, carregar, inteiro, pct  # noqa: E402

G = ["PT", "PSD", "MDB", "PP", "Outros"]
FORA = {"id": "fora", "rotulo": "o grupo não liderava aqui em 2022", "cor": "cor-eixo"}
MANTEVE = {"id": "manteve", "rotulo": "o grupo de 2022 continuou na frente", "cor": "cor-eixo"}


def pp(v: float) -> str:
    return f"{v:.1f}".replace(".", ",") + " p.p."


def categorias() -> list[dict]:
    """Grupos na ordem fixa e com as cores do EL0006 (dados/referencia/cores_grupos_politicos.yaml)."""
    cores = yaml.safe_load((RAIZ / "dados" / "referencia" / "cores_grupos_politicos.yaml").read_text(encoding="utf-8"))["claro"]
    return [{"id": g, "rotulo": NOME[g], "cor": cores[g]} for g in G]


def votos(M, ano: str, cargo: str, ref: tuple[str, str] | None = None, F: dict | None = None) -> list[dict]:
    """Barras: % dos votos válidos de cada grupo (estado, ou a unidade `F`), na ordem fixa; com a comparação de `ref`."""
    cat = {c["id"]: c["cor"] for c in categorias()}
    a = (F or M.cargo(ano, cargo)["forca"]["estado"]["Piauí"])["pct_grupo"]
    b = None
    if ref:
        b = ref[1]["pct_grupo"] if isinstance(ref[1], dict) else M.cargo(ref[0], cargo)["forca"]["estado"]["Piauí"]["pct_grupo"]
    return [{"id": g, "rotulo": NOME[g], "cor": cat[g], "valor": round(a[g], 2),
             **({"ref": round(b[g], 2) if b and b.get(g) is not None else None} if ref else {})} for g in G if a.get(g) is not None]


def p_de(m: dict, g: str) -> str:
    """% dos válidos do grupo `g` na unidade `m` ("sem candidatos" quando o grupo não concorreu — PSD em 2022)."""
    v = m["pct_grupo"].get(g)
    return pct(v) if v is not None else "sem candidatos"


def camadas(M) -> dict:
    """Camadas do mapa, uma vez só: cor (categoria), dica (linhas) e tamanho (válidos) de cada município/território.

    As linhas do card ampliam a visão (design.yaml › padroes.dicas, Q-087): o valor do líder com cargo e ano, o 2º
    colocado e a margem, a comparação com 2022 e o peso da unidade nos válidos do estado — tudo da base de origem.
    """
    F26, F22 = M.cargo("2026", "estadual")["forca"], M.cargo("2022", "estadual")["forca"]
    pref = M.cargo("2024", "prefeito")["prefeito"]
    nome = {m["tse"]: m["nome"] for m in M.B["municipios"]}
    total = F26["estado"]["Piauí"]["validos"]

    def lider(m: dict, m22: dict) -> list[str]:
        g, (v2, g2) = m["lider"]["grupo"], sorted(((v, k) for k, v in m["pct_grupo"].items() if v is not None), reverse=True)[1]
        g22 = m22["lider"]["grupo"]
        return [f"{NOME[g]} lidera com {pct(m['lider']['intensidade'])} dos válidos para deputado estadual em 2026",
                f"2º: {NOME[g2]}, {pct(v2)} (margem de {pp(m['lider']['margem'])})",
                f"em 2022: {NOME[g22]} liderava, com {pct(m22['lider']['intensidade'])}" + (f"; {NOME[g]} tinha {p_de(m22, g)}" if g22 != g else ""),
                f"{inteiro(m['validos'])} votos válidos ({pct(100 * m['validos'] / total)} do estado)"]

    U = {"lider26": {}, "prefeito24": {}, "mudou": {}}
    for k, m in F26["municipio"].items():
        if not m.get("lider"):
            continue
        m22 = F22["municipio"][k]
        g26, g22 = m["lider"]["grupo"], m22["lider"]["grupo"]
        U["lider26"][k] = {"nome": nome[k], "categoria": g26, "tamanho": m["validos"], "linhas": lider(m, m22)}
        p = pref.get(k)
        dep = f"deputado estadual em 2026: {NOME[g26]} é o mais votado ({pct(m['lider']['intensidade'])})"
        U["prefeito24"][k] = {"nome": nome[k], "categoria": p["grupo"] if p else None, "tamanho": m["validos"],
                              "linhas": [f"prefeito eleito em 2024: {p['nome_urna']} ({p['partido']})", f"grupo: {NOME[p['grupo']]}",
                                         dep + (" — o mesmo grupo do prefeito" if p["grupo"] == g26 else " — outro grupo")]
                              if p else ["sem prefeito eleito na base (suplementar)", dep]}
        U["mudou"][k] = {"nome": nome[k], "categoria": g26 if g26 != g22 else "manteve", "tamanho": m["validos"],
                         "linhas": [f"2022: {NOME[g22]}, {pct(m22['lider']['intensidade'])} → 2026: {NOME[g26]}, {pct(m['lider']['intensidade'])}",
                                    f"em 2026, {NOME[g22]} ficou com {p_de(m, g22)}"] if g26 != g22 else
                                   [f"{NOME[g26]} na frente em 2022 ({pct(m22['lider']['intensidade'])}) e em 2026 ({pct(m['lider']['intensidade'])})"]}
    for g in ("PT", "MDB", "PP"):
        U[f"perdeu_{g}"] = {}
        for k, m in F26["municipio"].items():
            if not m.get("lider"):
                continue
            m22 = F22["municipio"][k]
            g26, g22 = m["lider"]["grupo"], m22["lider"]["grupo"]
            if g22 == g and g26 != g:
                u = {"categoria": g26, "linhas": [f"{NOME[g]} liderava em 2022, com {p_de(m22, g)}",
                                                  f"em 2026, {NOME[g26]} lidera com {pct(m['lider']['intensidade'])}; {NOME[g]} ficou com {p_de(m, g)}"]}
            elif g22 == g:
                u = {"categoria": g, "opacidade": 0.3, "foco": True, "linhas": [f"{NOME[g]} manteve a liderança: {p_de(m22, g)} em 2022, {p_de(m, g)} em 2026"]}
            else:
                u = {"categoria": "fora", "opacidade": 0.35, "linhas": [f"em 2022, {NOME[g22]}; em 2026, {NOME[g26]}",
                                                                        f"{NOME[g]}: {p_de(m22, g)} em 2022, {p_de(m, g)} em 2026"]}
            U[f"perdeu_{g}"][k] = {"nome": nome[k], "tamanho": m["validos"], **u}
    t22, lid = M.territorios("2022", "estadual"), M.lideres("2026", "estadual")
    U["territorios26"] = {}
    for t, m in M.territorios("2026", "estadual").items():
        muns = [x["tse"] for x in M.B["municipios"] if x["territorio"] == t]
        g = m["lider"]["grupo"]
        U["territorios26"][t] = {"nome": t, "categoria": g, "tamanho": m["validos"],
                                 "linhas": lider(m, t22[t]) + [f"{NOME[g]} lidera em {inteiro(sum(1 for x in muns if lid.get(x) == g))} dos {inteiro(len(muns))} municípios do território"]}
    return U


def fluxo(M) -> dict:
    seq = M.sequencias("estadual")
    lig = Counter((v[0], v[-1]) for v in seq.values())
    return {"etapas": ["2022", "2026"], "categorias": categorias(), "unidade": "municípios",
            "ligacoes": [{"etapa": 0, "de": a, "para": b, "n": n} for (a, b), n in sorted(lig.items(), key=lambda x: (G.index(x[0][0]), G.index(x[0][1])))]}


def mapa(unidades: str, cats: list[dict], **extra) -> dict:
    """Dados de um cartão de mapa: as peças compartilhadas pelo nome (malha, camada, referência, rótulos)."""
    return {"malha": extra.pop("malha", "municipios"), "unidades": unidades, "categorias": cats, "referencia": "pi", "rotulos": "pi",
            "fundo": "vetorial", "rotulo_tamanho": "votos válidos para deputado estadual (2026)", "camera": "estado", "forma": "mapa", **extra}


def montar(R: dict, M) -> dict:
    cart = {c["id"]: c for cap in R["capitulos"] for c in cap["cartoes"]}
    T = lambda cid, campo, ctx=None: M.texto(cart[cid].get(campo), ctx)   # noqa: E731
    e = {}
    for cid, c in cart.items():
        e[cid.replace("-", "_")] = {"nota": " ".join(x for x in [T(cid, "como_ler"), T(cid, "nota")] if x)}
        if c["tipo"] != "explore":
            e[cid.replace("-", "_")].update(titulo=T(cid, "frase"), texto=T(cid, "subtitulo"))
    k = lambda cid: e[cid.replace("-", "_")]   # noqa: E731
    k("c0-1")["nota"] = cart["c0-1"].get("rodape", "")
    cats = categorias()
    # 1. o retrato de 2026
    k("c1-1")["dados"] = votos(M, "2026", "estadual")
    k("c1-2")["dados"] = votos(M, "2026", "federal")
    k("c1-3")["dados"] = mapa("lider26", cats)
    k("c1-4")["dados"] = mapa("lider26", cats, forma="bolhas", escala_bolhas="fiel")
    # 2. as prefeituras
    k("c2-1")["dados"] = mapa("prefeito24", cats)
    n, coin = len(M.B["municipios"]), M.coincide()
    k("c2-2")["titulo"] = f"{T('c2-2', 'numero')} {T('c2-2', 'frase')}"
    k("c2-2")["dados"] = [{"valor": inteiro(coin), "rotulo": "municípios: prefeito do grupo que lidera para deputado estadual"},
                          {"valor": inteiro(n - coin), "rotulo": "municípios: prefeito de outro grupo"}]
    # 3. como o mapa mudou: o mesmo Sankey, montado em fases
    e["fluxo"] = fluxo(M)
    # 4. onde cada grupo perdeu
    k("c4-1")["dados"] = mapa("mudou", cats + [MANTEVE])
    k("c4-2")["grupo"] = {g: {"titulo": T("c4-2", "frase", {"grupo": g}), "texto": T("c4-2", "subtitulo", {"grupo": g}),
                              "dados": mapa(f"perdeu_{g}", cats + [FORA], rotulo_foco=f"contorno: onde {NOME[g]} manteve a liderança")}
                          for g in ("PT", "MDB", "PP")}
    # 5. seu território, seu município
    k("c5-1")["dados"] = mapa("territorios26", cats, malha="territorios")
    t26, t22 = M.territorios("2026", "estadual"), M.territorios("2022", "estadual")
    muns_t = {t: [m["tse"] for m in M.B["municipios"] if m["territorio"] == t] for t in t26}
    k("c5-2")["territorio"] = {t: {"titulo": T("c5-2", "frase", {"territorio": t}), "texto": T("c5-2", "subtitulo", {"territorio": t}),
                                   "mapa": mapa("lider26", cats, realce=muns_t[t], camera={"foco": muns_t[t], "contexto": 1.4}),
                                   "barras": votos(M, "2026", "estadual", ref=("2022", t22[t]), F=t26[t])} for t in sorted(t26)}
    F26, F22 = M.cargo("2026", "estadual")["forca"]["municipio"], M.cargo("2022", "estadual")["forca"]["municipio"]
    k("c5-3")["municipio"] = {m["tse"]: {"titulo": T("c5-3", "frase", {"municipio": m["nome"]}), "texto": T("c5-3", "subtitulo", {"municipio": m["nome"]}),
                                         "mapa": mapa("lider26", cats, realce=[m["tse"]], camera={"foco": m["tse"], "contexto": 6}),
                                         "barras": votos(M, "2026", "estadual", ref=("2022", F22[m["tse"]]), F=F26[m["tse"]])}
                              for m in M.B["municipios"] if F26.get(m["tse"], {}).get("lider")}
    # peças compartilhadas pelos mapas
    from projetos.eleicoes.analise.html_forcas_pi import contornos
    from labdados.mapa import referencia_ufs, rotulos_municipios   # camadas de referência do Lab.mapa (L0006)
    geo = contornos(RAIZ, M.B["municipios"])
    ibge = {m["nome"]: m["ibge"] for m in M.B["municipios"]}
    e["malhas"] = {"municipios": geo["municipio"], "territorios": geo["territorio"]}
    e["unidades"] = camadas(M)
    e["referencias"] = {"pi": referencia_ufs(RAIZ, "PI", margem_x=9)}
    e["rotulos"] = {"pi": rotulos_municipios(RAIZ, [ibge[x] for x in R["palcos"]["mapa"].get("rotulos", [])])}
    e["opcoes"] = {"territorio": {t: t for t in sorted(t26)},
                   "municipio": {m["tse"]: m["nome"] for m in sorted(M.B["municipios"], key=lambda m: m["nome"])}}
    e["universo"] = M.texto(R["universo"])
    e["glossario"] = R["glossario"]
    e["ref_2022"] = "2022"
    return e


def main() -> None:
    R, M = carregar()
    if R.get("status") != "validado":
        sys.exit("Roteiro não validado (src/roteiro.yaml › status): valide antes de gerar.")
    textos = montar(R, M)
    base = {"gerado_em": (M.B.get("meta") or {}).get("gerado_em"), "roteiro": {"versao": R["versao"], "validado_em": str(R["data_validacao"])}, "textos": textos}
    destino = PRODUTO / "data" / "story.json"
    destino.write_text(json.dumps(base, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{destino.relative_to(RAIZ)} ({destino.stat().st_size / 1e3:.0f} kB) · {len(M.usados)} marcadores preenchidos")
    print("controle municipio (valores para o viz.yaml):", len(textos["opcoes"]["municipio"]))


if __name__ == "__main__":
    main()
