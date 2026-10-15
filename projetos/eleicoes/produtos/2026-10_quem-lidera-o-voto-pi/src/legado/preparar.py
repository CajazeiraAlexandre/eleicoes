#!/usr/bin/env python3
"""Gera o story "Quem lidera o voto no Piauí" a partir do roteiro VALIDADO (tipo story — docs/TIPOS_DE_PRODUTO.md).

    PYTHONPATH=nucleo:. python projetos/eleicoes/produtos/2026-10_quem-lidera-o-voto-pi/src/preparar.py

1. Recusa o roteiro se `status` não for `validado`.
2. Preenche os marcadores das frases (os mesmos da prancha: src/prancha.py) com os números da base do produto de
   origem (`deriva_de`: data/base_forcas_pi.json.gz), inclusive as frases do Explore para cada grupo, território e
   município.
3. Monta os dados dos palcos (votos, municípios, territórios, fluxo 2022 → 2026, contornos IBGE) — tudo pronto;
   o JS só seleciona e desenha (L0002).
4. Grava data/base.json.gz e gera index.html com labdados.produto_web.
"""
from __future__ import annotations

import gzip
import json
import sys
from collections import Counter
from pathlib import Path

import yaml

PRODUTO = Path(__file__).resolve().parents[1]
RAIZ = PRODUTO.parents[3]
sys.path[:0] = [str(RAIZ / "nucleo"), str(RAIZ), str(Path(__file__).parent)]

from prancha import NOME, carregar  # noqa: E402

GRUPOS = ["PT", "PSD", "MDB", "PP", "Outros"]


def dados_palcos(M) -> dict:
    E = M.E
    est = lambda ano, cargo: M.cargo(ano, cargo)["forca"]["estado"]["Piauí"]["pct_grupo"]  # noqa: E731
    m26, m22 = M.cargo("2026", "estadual")["forca"]["municipio"], M.cargo("2022", "estadual")["forca"]["municipio"]
    pref = M.cargo("2024", "prefeito")["prefeito"]
    municipios = {}
    for m in M.B["municipios"]:
        k, a, b = m["tse"], m26[m["tse"]], m22[m["tse"]]
        p = pref.get(k)
        municipios[k] = {"nome": m["nome"], "territorio": m["territorio"], "validos": a["validos"],
                         "l26": a["lider"]["grupo"], "i26": a["lider"]["intensidade"], "mg26": a["lider"]["margem"],
                         "l22": b["lider"]["grupo"], "p26": a["pct_grupo"], "p22": b["pct_grupo"],
                         "pref": {"grupo": p["grupo"], "nome": p["nome_urna"], "partido": p["partido"]} if p else None}
    t26, t22 = M.territorios("2026", "estadual"), M.territorios("2022", "estadual")
    territorios = {}
    for t, a in t26.items():
        muns = [k for k, m in municipios.items() if m["territorio"] == t]
        territorios[t] = {"validos": a["validos"], "l26": a["lider"]["grupo"], "i26": a["lider"]["intensidade"], "mg26": a["lider"]["margem"],
                          "l22": t22[t]["lider"]["grupo"], "p26": a["pct_grupo"], "p22": t22[t]["pct_grupo"],
                          "n": len(muns), "nlid": sum(1 for k in muns if municipios[k]["l26"] == a["lider"]["grupo"])}
    seq = M.sequencias("estadual")
    lig = Counter((v[0], v[-1]) for v in seq.values())
    fluxo = {"nos22": dict(Counter(v[0] for v in seq.values())), "nos26": dict(Counter(v[-1] for v in seq.values())),
             "total": len(seq), "ligacoes": [{"de": a, "para": b, "n": n} for (a, b), n in lig.items()]}
    # contagens das tabelas de "Como ler" (municípios por grupo) — prontas aqui, o JS só mostra
    mun = list(municipios.values())
    perdeu = {g: dict(Counter(m["l26"] for m in mun if m["l22"] == g and m["l26"] != g)) for g in GRUPOS}
    contagens = {"lider26": dict(Counter(m["l26"] for m in mun)), "lider22": dict(Counter(m["l22"] for m in mun)),
                 "prefeito24": dict(Counter(m["pref"]["grupo"] for m in mun if m["pref"])),
                 "mudou26": dict(Counter(m["l26"] for m in mun if m["l22"] != m["l26"])), "mudou": sum(1 for m in mun if m["l22"] != m["l26"]),
                 "perdeu": perdeu, "manteve": {g: sum(1 for m in mun if m["l22"] == g == m["l26"]) for g in GRUPOS},
                 "territorio26": dict(Counter(t["l26"] for t in territorios.values()))}
    votos = {f"{ano}|{cargo}": est(ano, cargo) for ano, cargo in (("2026", "estadual"), ("2026", "federal"), ("2022", "estadual"))}
    eleitos = {f"{ano}|{cargo}": M.cargo(ano, cargo)["eleitos_estado"] for ano, cargo in (("2026", "estadual"), ("2026", "federal"))}
    cores = yaml.safe_load((RAIZ / "dados" / "referencia" / "cores_grupos_politicos.yaml").read_text(encoding="utf-8"))["claro"]
    from projetos.eleicoes.analise.html_forcas_pi import contornos
    from labdados.mapa import referencia_ufs, rotulos_municipios   # camadas de referência do Lab.mapa (L0006)
    geo = contornos(RAIZ, M.B["municipios"])
    R = yaml.safe_load((PRODUTO / "src" / "roteiro.yaml").read_text(encoding="utf-8"))
    cfg_mapa = R["palcos"]["mapa"]
    ibge = {m["nome"]: m["ibge"] for m in M.B["municipios"]}
    mapa = {"fundo": cfg_mapa.get("fundo"), "referencia": referencia_ufs(RAIZ, "PI"),
            "rotulos": rotulos_municipios(RAIZ, [ibge[n] for n in cfg_mapa.get("rotulos", [])])}
    return {"grupos": GRUPOS, "nomes": NOME, "cores": cores, "votos": votos, "eleitos": eleitos,
            "municipios": municipios, "territorios": territorios, "fluxo": fluxo, "contagens": contagens,
            "contornos": {"municipio": geo["municipio"], "territorio": geo["territorio"]}, "mapa": mapa}


def explorar(c: dict, M, R) -> dict | None:
    ex = c.get("explorar") or {}
    if not ex:
        return None
    saida = {"modos": ex.get("modos"), "modo_inicial": (c.get("palco") or {}).get("modo", "mapa"), "tipo": None}
    if ex.get("grupos"):
        saida.update(tipo="grupo", opcoes=[[g, NOME[g]] for g in ex["grupos"]], inicial=ex["inicial"])
    elif ex.get("territorio"):
        saida.update(tipo="territorio", opcoes=[[t, t] for t in sorted(M.territorios("2026", "estadual"))], inicial=ex["inicial"])
    elif ex.get("municipio"):
        ops = sorted(((m["tse"], m["nome"]) for m in M.B["municipios"]), key=lambda x: x[1])
        saida.update(tipo="municipio", opcoes=[list(o) for o in ops], inicial=M.por_nome[ex["inicial"]])
    return saida


def cartoes(R: dict, M) -> tuple[list, list]:
    lista, capitulos = [], []
    for cap in R["capitulos"]:
        capitulos.append({"id": cap["id"], "titulo": cap["titulo"], "cartoes": [c["id"] for c in cap["cartoes"]]})
        for c in cap["cartoes"]:
            ex = explorar(c, M, R)
            item = {"id": c["id"], "capitulo": cap["id"], "tipo": c["tipo"], "transicao": c.get("transicao"),
                    "palco": c.get("palco"), "explorar": ex, "rodape": c.get("rodape"),
                    "numero": M.texto(c.get("numero")).strip("⟦⟧") if c.get("numero") else None,
                    "como_ler": M.texto(c.get("como_ler")), "nota": M.texto(c.get("nota")),
                    "glossario": [{"termo": g, "definicao": R["glossario"][g]} for g in c.get("glossario", [])]}
            if ex and ex["tipo"]:
                chave = {"grupo": "grupo", "territorio": "territorio", "municipio": "municipio"}[ex["tipo"]]
                nome = {v: r for v, r in ex["opcoes"]}
                ctx = lambda v: {chave: (nome[v] if chave == "municipio" else v)}  # noqa: E731
                item["frases"] = {v: {"frase": M.texto(c.get("frase"), ctx(v)), "subtitulo": M.texto(c.get("subtitulo"), ctx(v))}
                                  for v, _ in ex["opcoes"]}
                item["frase"], item["subtitulo"] = item["frases"][ex["inicial"]]["frase"], item["frases"][ex["inicial"]]["subtitulo"]
            else:
                item["frase"], item["subtitulo"] = M.texto(c.get("frase")), M.texto(c.get("subtitulo"))
            lista.append(item)
    return lista, capitulos


def main() -> None:
    R, M = carregar()
    if R.get("status") != "validado":
        sys.exit("Roteiro não validado (src/roteiro.yaml › status). Gere a prancha (src/prancha.py), revise e valide antes.")
    produto = yaml.safe_load((PRODUTO / "produto.yaml").read_text(encoding="utf-8"))
    lista, capitulos = cartoes(R, M)
    meta_origem = M.B.get("meta") or {}
    base = {
        "schema_version": 1,
        "meta": {"titulo": produto["titulo"], "pergunta": R["pergunta"].strip(), "universo": M.texto(R["universo"]),
                 "fonte": R["fonte_padrao"].strip(), "deriva_de": produto["deriva_de"],
                 "analise_rotulo": "Forças políticas no Piauí", "rotulo_universo": "O que entra",
                 "nota_fontes": "Totalização do 1º turno de 2026 publicada pelo TSE em 05/10/2026.",
                 "roteiro": {"versao": R["versao"], "validado_em": str(R["data_validacao"]), "aprovado_por": R["aprovado_por"]},
                 "gerado_em": meta_origem.get("gerado_em")},
        "capitulos": capitulos,
        "cartoes": lista,
        "dados": dados_palcos(M),
    }
    (PRODUTO / "data").mkdir(exist_ok=True)
    (PRODUTO / "data" / "base.json.gz").write_bytes(gzip.compress(json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0))
    from labdados.produto_web import gerar_produto
    destino = gerar_produto(RAIZ, PRODUTO, base=base)
    print(f"HTML: {destino.relative_to(RAIZ)} ({destino.stat().st_size / 1e6:.2f} MB) · {len(lista)} cartões · "
          f"{len(M.usados)} marcadores preenchidos")


if __name__ == "__main__":
    main()
