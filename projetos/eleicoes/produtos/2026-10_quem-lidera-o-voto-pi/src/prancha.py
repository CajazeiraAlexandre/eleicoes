#!/usr/bin/env python3
"""Prancha de leitura do roteiro (tipo story): src/roteiro.yaml → roteiro.html.

Preenche os marcadores das frases com os números da base do produto de origem (`deriva_de`:
data/base_forcas_pi.json.gz do "Forças políticas no Piauí") e desenha cada cartão em miniatura, para revisar e
validar o roteiro antes de gerar o produto. Nenhum número do roteiro é escrito à mão (L0002).

    python src/prancha.py
"""
from __future__ import annotations

import gzip
import html
import json
import re
from collections import Counter
from pathlib import Path

import yaml

PRODUTO = Path(__file__).resolve().parents[1]
RAIZ = PRODUTO.parents[3]
CARGO = {"estadual": "7", "federal": "6", "vereador": "13", "prefeito": "11"}
ANO_CARGO = {"estadual": ("2022", "2026"), "federal": ("2022", "2026")}
ARTIGO = {"PT": "PT/PV/PCdoB", "PSD": "o PSD", "MDB": "o MDB", "PP": "a União Progressista", "Outros": "outro partido"}
DE = {"PT": "de PT/PV/PCdoB", "PSD": "do PSD", "MDB": "do MDB", "PP": "da União Progressista", "Outros": "de outro partido"}
NOME = {"PT": "PT/PV/PCdoB", "PSD": "PSD", "MDB": "MDB", "PP": "União Progressista", "Outros": "Outros"}   # = roteiro › grupos
# Preposição contraída de cada Território de Desenvolvimento ("na Serra da Capivara", não "em Serra da Capivara" —
# pesquisador, 2026-10-12). Lista fechada: território novo sem entrada aqui é erro (nada de adivinhar o artigo).
EM_TERRITORIO = {"Carnaubais": "nos", "Chapada das Mangabeiras": "na", "Chapada do Vale do Rio Itaim": "na", "Cocais": "nos",
                 "Entre Rios": "em", "Planície Litorânea": "na", "Serra da Capivara": "na", "Tabuleiros do Alto Parnaíba": "nos",
                 "Vale do Canindé": "no", "Vale do Rio Guaribas": "no", "Vale do Sambito": "no", "Vale dos Rios Piauí e Itaueiras": "no"}
AMOSTRA_T = ["Entre Rios", "Vale do Rio Guaribas", "Serra da Capivara", "Tabuleiros do Alto Parnaíba"]
AMOSTRA = ["Teresina", "Parnaíba", "Picos", "Floriano", "São Raimundo Nonato", "Acauã"]


def slug(txt: str) -> str:
    import unicodedata
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", txt.lower()).strip("-")


def pct(v: float) -> str:
    return f"{v:.1f}".replace(".", ",") + "%"


def inteiro(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


class Marcadores:
    """Resolve `{...}` do roteiro a partir da base do Forças políticas; guarda os usados para a conferência."""

    def __init__(self, B: dict):
        self.B, self.E = B, B["eleicoes"]
        self.G = B["grupos"]
        self.usados: dict[str, tuple[str, str]] = {}
        self.por_nome = {m["nome"]: m["tse"] for m in B["municipios"]}

    def grupo(self, g: str) -> str:
        alvo = next((x for x in self.G if x.lower() == g), None)
        if not alvo:
            raise KeyError(f"grupo desconhecido: {g}")
        return alvo

    def cargo(self, ano: str, cargo: str) -> dict:
        return self.E[ano]["cargos"][CARGO[cargo]]

    def lideres(self, ano: str, cargo: str) -> dict[str, str]:
        return {k: m["lider"]["grupo"] for k, m in self.cargo(ano, cargo)["forca"]["municipio"].items() if m.get("lider")}

    def territorios(self, ano: str, cargo: str) -> dict:
        return self.cargo(ano, cargo)["forca"]["territorio"]

    def sequencias(self, cargo: str) -> dict:
        return self.B["sankey"][f"{CARGO[cargo]}_direto"]["sequencias"]

    def coincide(self) -> int:
        lid, pref = self.lideres("2026", "estadual"), self.cargo("2024", "prefeito")["prefeito"]
        return sum(1 for k, g in lid.items() if k in pref and pref[k]["grupo"] == g)

    def valor(self, expr: str, ctx: dict) -> tuple[str, str]:
        tipo, _, resto = expr.partition(".")
        if tipo == "f":
            ano, cargo, g = resto.split(".")
            v = self.cargo(ano, cargo)["forca"]["estado"]["Piauí"]["pct_grupo"][self.grupo(g)]
            if v is None:
                raise KeyError(f"{g} sem candidatos em {ano}")
            return pct(v), f"eleicoes.{ano}.cargos.{CARGO[cargo]}.forca.estado.pct_grupo"
        if tipo == "e":
            ano, cargo, g = resto.split(".")
            el = self.cargo(ano, cargo)["eleitos_estado"]
            return inteiro(sum(el.values()) if g == "total" else el[self.grupo(g)]), f"eleicoes.{ano}.cargos.{CARGO[cargo]}.eleitos_estado"
        if tipo == "l":
            ano, cargo, g = resto.split(".")
            n = Counter(self.lideres(ano, cargo).values())[self.grupo(g)]
            return inteiro(n), f"eleicoes.{ano}.cargos.{CARGO[cargo]}.forca.municipio (contagem do líder)"
        if tipo == "m":
            cargo, chave = resto.split(".", 1)
            seq = self.sequencias(cargo)
            if chave == "mudou":
                n = sum(1 for v in seq.values() if v[0] != v[-1])
            elif chave.startswith(("perdeu.", "ganhou.")):
                acao, g = chave.split(".")
                g = self.grupo(g)
                n = sum(1 for v in seq.values() if ((v[0] == g and v[-1] != g) if acao == "perdeu" else (v[0] != g and v[-1] == g)))
            else:
                de, para = (self.grupo(x) for x in chave.split(">"))
                n = sum(1 for v in seq.values() if v[0] == de and v[-1] == para)
            return inteiro(n), f"sankey.{CARGO[cargo]}_direto (contagem)"
        if tipo == "b":
            ano, cargo, g = resto.split(".")
            F = self.cargo(ano, cargo)["forca"]
            lid = [m for m in F["municipio"].values() if m.get("lider") and m["lider"]["grupo"] == self.grupo(g)]
            return pct(100 * sum(m["validos"] for m in lid) / F["estado"]["Piauí"]["validos"]), f"eleicoes.{ano}.cargos.{CARGO[cargo]}.forca (soma dos válidos onde o grupo lidera)"
        if tipo == "v":
            F = self.cargo("2026", "estadual")["forca"]
            k = next(c for n, c in self.por_nome.items() if slug(n) == resto)
            return pct(100 * F["municipio"][k]["validos"] / F["estado"]["Piauí"]["validos"]), "eleicoes.2026.cargos.7.forca.municipio.validos / estado"
        if tipo == "t":
            F = self.cargo("2026", "estadual")["forca"]
            maiores = sorted((m["validos"] for m in F["municipio"].values()), reverse=True)[: int(resto)]
            return pct(100 * sum(maiores) / F["estado"]["Piauí"]["validos"]), "eleicoes.2026.cargos.7.forca.municipio.validos (maiores)"
        if tipo == "g":
            g, seq = ctx["grupo"], self.sequencias("estadual")
            destinos = Counter(v[-1] for v in seq.values() if v[0] == g and v[-1] != g)
            dest, n_dest = destinos.most_common(1)[0] if destinos else ("—", 0)
            v = {"nome": ARTIGO[g][0].upper() + ARTIGO[g][1:], "nome_min": ARTIGO[g], "perdeu": inteiro(sum(destinos.values())),
                 "de": inteiro(sum(1 for v in seq.values() if v[0] == g)), "destino": ARTIGO.get(dest, dest),
                 "destino_n": inteiro(n_dest), "ganhou": inteiro(sum(1 for v in seq.values() if v[0] != g and v[-1] == g))}[resto]
            return v, "sankey.7_direto (contagem)"
        if tipo == "p":
            return inteiro(self.coincide()), "eleicoes.2026.estadual.lider × eleicoes.2024.prefeito.grupo"
        if tipo == "n":
            if resto == "territorios":
                return inteiro(len({m["territorio"] for m in self.B["municipios"]})), "municipios.territorio (distintos)"
            return inteiro(len(self.B["municipios"])), "municipios"
        if tipo == "lt":
            ano, cargo, g = resto.split(".")
            n = sum(1 for m in self.territorios(ano, cargo).values() if m["lider"]["grupo"] == self.grupo(g))
            return inteiro(n), f"eleicoes.{ano}.cargos.{CARGO[cargo]}.forca.territorio (contagem do líder)"
        if tipo == "tm":
            cargo, _ = resto.split(".")
            a, b = self.territorios("2022", cargo), self.territorios("2026", cargo)
            trocas = [f"{t} ({NOME[a[t]['lider']['grupo']]} → {NOME[b[t]['lider']['grupo']]})" for t in sorted(b) if a[t]["lider"]["grupo"] != b[t]["lider"]["grupo"]]
            return (" e ".join([", ".join(trocas[:-1]), trocas[-1]]) if len(trocas) > 1 else (trocas[0] if trocas else "nenhum")), \
                f"eleicoes.2022/2026.cargos.{CARGO[cargo]}.forca.territorio.lider"
        if tipo == "y":
            nome = ctx["territorio"]
            m26, m22 = self.territorios("2026", "estadual")[nome], self.territorios("2022", "estadual")[nome]
            g = m26["lider"]["grupo"]
            ordem = sorted(((v, k) for k, v in m26["pct_grupo"].items() if v is not None), reverse=True)
            muns = [m["tse"] for m in self.B["municipios"] if m["territorio"] == nome]
            lid = self.lideres("2026", "estadual")
            em = f"{EM_TERRITORIO[nome]} {nome}"
            v = {"nome": nome, "em_nome": em, "Em_nome": em[0].upper() + em[1:], "lider26": ARTIGO[g], "lider26_maiusc": ARTIGO[g][0].upper() + ARTIGO[g][1:],
                 "pct26": pct(m26["lider"]["intensidade"]), "margem": f"{m26['lider']['margem']:.1f}".replace(".", ","),
                 "segundo": DE[ordem[1][1]], "lider22": ARTIGO[m22["lider"]["grupo"]],
                 "municipios": inteiro(len(muns)), "mun_lider": inteiro(sum(1 for k in muns if lid.get(k) == g))}[resto]
            return v, "—"
        if tipo == "x":
            k = self.por_nome[ctx["municipio"]]
            m26 = self.cargo("2026", "estadual")["forca"]["municipio"][k]
            m22 = self.cargo("2022", "estadual")["forca"]["municipio"][k]
            pref = self.cargo("2024", "prefeito")["prefeito"].get(k)
            v = {"nome": ctx["municipio"], "lider26": ARTIGO[m26["lider"]["grupo"]], "pct26": pct(m26["lider"]["intensidade"]),
                 "lider22": ARTIGO[m22["lider"]["grupo"]], "prefeito24": f'{DE[pref["grupo"]]} ({pref["nome_urna"]})' if pref else "—"}[resto]
            return v, "—"
        raise KeyError(f"marcador desconhecido: {expr}")

    def _troca(self, texto, ctx, marca):
        def troca(m):
            v, origem = self.valor(m.group(1), ctx or {})
            if not m.group(1).startswith(("x.", "g.", "y.")):
                self.usados[m.group(1)] = (v, origem)
            return marca(v)
        return re.sub(r"\{([^{}]+)\}", troca, texto or "")

    def texto(self, texto, ctx=None) -> str:
        """Texto puro para o produto: números entre ⟦ ⟧."""
        return self._troca(texto, ctx, lambda v: f"⟦{v}⟧")

    def preencher(self, texto, ctx=None, marcar=True) -> str:
        partes, pos = [], 0
        for m in re.finditer(r"\{([^{}]+)\}", texto or ""):
            partes.append(html.escape(texto[pos:m.start()]))
            try:
                v = self._troca(m.group(0), ctx, lambda v: v)
                partes.append(f"<mark>{html.escape(v)}</mark>" if marcar else html.escape(v))
            except (KeyError, ValueError) as e:
                partes.append(f'<span class="erro">⟨{html.escape(m.group(1))}: {html.escape(str(e))}⟩</span>')
            pos = m.end()
        partes.append(html.escape((texto or "")[pos:]))
        return "".join(partes)


# ---------------------------------------------------------------- miniaturas
def cores() -> dict[str, str]:
    c = yaml.safe_load((RAIZ / "dados" / "referencia" / "cores_grupos_politicos.yaml").read_text(encoding="utf-8"))["claro"]
    return {g: ("#898781" if v.startswith("var(") else v) for g, v in c.items()}


def leg(R, cor, grupos) -> str:
    return '<div class="leg">' + "".join(f'<span><i style="background:{cor[g]}"></i>{html.escape(R["grupos"][g])}</span>' for g in grupos) + "</div>"


def mini_votos(M, R, cor, p, foco=None) -> str:
    est = M.cargo(str(p["ano"]), p["cargo"])["forca"]["estado"]["Piauí"]["pct_grupo"]
    L, h, out = 150, 16, ['<svg viewBox="0 0 230 120" width="100%">']
    for i, g in enumerate(M.G):
        v, y = est[g], i * 23
        op = 1 if not p.get("destaque") or p["destaque"] == g else .35
        out.append(f'<text x="0" y="{y + 12}" class="rot">{html.escape(R["grupos"][g])}</text>')
        if v is None:
            out.append(f'<text x="80" y="{y + 12}" class="rot">sem candidatos</text>')
            continue
        out.append(f'<rect x="80" y="{y}" width="{L * v / 60:.1f}" height="{h}" rx="2" fill="{cor[g]}" opacity="{op}"/>'
                   f'<text x="{84 + L * v / 60:.1f}" y="{y + 12}" class="rot">{pct(v)}</text>')
    return "".join(out) + "</svg>"


def mini_cadeiras(M, R, cor, p) -> str:
    el = M.cargo(str(p["ano"]), p["cargo"])["eleitos_estado"]
    pontos = [g for g in M.G for _ in range(el[g])]
    por_linha = 10 if len(pontos) <= 40 else 20
    r, out = (9 if por_linha == 10 else 4.5), ['<svg viewBox="0 0 230 {} " width="100%">'.format(24 * (len(pontos) // por_linha + 1))]
    for i, g in enumerate(pontos):
        x, y = (i % por_linha) * 2.3 * r + r + 2, (i // por_linha) * 2.3 * r + r + 2
        op = 1 if not p.get("destaque") or p["destaque"] == g else .35
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{cor[g]}" opacity="{op}"/>')
    return "".join(out) + "</svg>" + leg(R, cor, [g for g in M.G if el[g]])


def mini_mapa(M, R, cor, p, ctx=None) -> str:
    """Esquema do mapa: um quadrado por município agrupado pela cor (modo mapa) ou círculos com área ∝ votos válidos
    (modo bolhas). No produto, o mapa do Piauí e o cartograma de Dorling."""
    ano, cargo, modo_cor = str(p["ano"]), p["cargo"], p.get("cor", "lider")
    F = M.cargo(ano, cargo)["forca"]["municipio"]
    CINZA = "#d8d6cf"
    if modo_cor == "eleito":
        itens = [(k, v["grupo"], 1) for k, v in M.cargo(ano, "prefeito")["prefeito"].items()]
    else:
        seq, lid = M.sequencias("estadual"), M.lideres(ano, cargo)
        alvo = (ctx or {}).get("grupo")
        itens = []
        for k, g in lid.items():
            if modo_cor == "mudou":
                itens.append((k, g if seq[k][0] != g else None, 1))
            elif modo_cor == "perdeu":
                antes = seq[k][0]
                itens.append((k, g if antes == alvo and g != alvo else ("contorno" if antes == alvo else None), 1))
            else:
                itens.append((k, g, 1))
    ordem = sorted(itens, key=lambda x: (M.G.index(x[1]) if x[1] in M.G else 9 if x[1] is None else 8))
    pinta = lambda g: cor[g] if g in cor else ("none" if g == "contorno" else CINZA)
    out = ['<svg viewBox="0 0 230 135" width="100%">']
    if p.get("modo") == "bolhas":
        import math
        ordem = sorted(itens, key=lambda x: -F[x[0]]["validos"])
        rmax, vmax, x, y, linha = 26, F[ordem[0][0]]["validos"], 0, 0, 0
        for k, g, _ in ordem:
            r = max(1.2, rmax * math.sqrt(F[k]["validos"] / vmax))
            if x + 2 * r > 230:
                x, y, linha = 0, y + linha + 2, 0
            if y + 2 * r > 135:
                break
            out.append(f'<circle cx="{x + r:.1f}" cy="{y + r:.1f}" r="{r:.1f}" fill="{pinta(g)}" stroke="{cor.get(alvo, "#555") if g == "contorno" else "none"}"/>')
            x, linha = x + 2 * r + 1, max(linha, 2 * r)
        nota = "esquema: círculo ∝ votos válidos (os maiores); no produto, bolhas na posição do município"
    else:
        for i, (k, g, _) in enumerate(ordem):
            out.append(f'<rect x="{(i % 16) * 14.2:.1f}" y="{(i // 16) * 9.4:.1f}" width="12.4" height="7.8" fill="{pinta(g)}"'
                       f'{f' stroke="{cor[alvo]}" stroke-width="1.2"' if g == "contorno" else ""}/>')
        nota = "esquema: 1 quadrado = 1 município; no produto, o mapa"
    presentes = [g for g in M.G if any(i[1] == g for i in itens)]
    extra = ' · cinza: sem troca' if modo_cor in ("mudou", "perdeu") else ""
    extra += f' · contorno: {R["grupos"][alvo]} manteve' if modo_cor == "perdeu" else ""
    return "".join(out) + f'</svg><div class="leg"><i class="cinza">{nota}{extra}</i></div>' + leg(R, cor, presentes)


def mini_fluxo(M, R, cor, p) -> str:
    seq = M.sequencias(p["cargo"])
    lig = Counter((v[0], v[-1]) for v in seq.values())
    G, total = M.G, len(seq)
    destaques = p.get("destaque") or []
    destaques = [destaques] if isinstance(destaques, str) else destaques
    foco = {tuple(M.grupo(x) for x in d.split(">")) for d in destaques}
    L, gap, yT, yB, hn = 230, 5, 14, 130, 7
    esc = (L - gap * (len(G) - 1)) / total

    def pos(i):
        soma = Counter()
        for (a, b), n in lig.items():
            soma[(a, b)[i]] += n
        x, d = 0.0, {}
        for g in G:
            d[g] = x
            x += soma[g] * esc + (gap if soma[g] else 0)
        return d, soma
    (pt, st), (pb, sb) = pos(0), pos(1)
    ct, cb = dict(pt), dict(pb)
    out = [f'<svg viewBox="0 0 {L} {yB + hn + 16}" width="100%">']
    fase = str(p.get("fase", "faixas"))
    for (a, b), n in sorted(lig.items(), key=lambda x: (G.index(x[0][0]), G.index(x[0][1]))) if fase == "faixas" else []:
        w, x0, x1 = n * esc, ct[a], cb[b]
        ct[a] += w
        cb[b] += w
        op = (.85 if (a, b) in foco else .12) if foco else .4
        ym = (yT + hn + yB) / 2
        out.append(f'<path d="M{x0:.1f},{yT + hn} C{x0:.1f},{ym} {x1:.1f},{ym} {x1:.1f},{yB} L{x1 + w:.1f},{yB} C{x1 + w:.1f},{ym} {x0 + w:.1f},{ym} {x0 + w:.1f},{yT + hn} Z" fill="{cor[a]}" opacity="{op}"><title>{a} → {b}: {n}</title></path>')
    for g in G:
        for x0, s, y in ((pt[g], st[g], yT), (pb[g], sb[g], yB)) if fase != "2022" else ((pt[g], st[g], yT),):
            if s:
                out.append(f'<rect x="{x0:.1f}" y="{y}" width="{s * esc:.1f}" height="{hn}" fill="{cor[g]}"/>')
    out.append(f'<text x="0" y="9" class="rot">2022</text><text x="0" y="{yB + hn + 13}" class="rot">2026</text></svg>')
    return "".join(out) + leg(R, cor, [g for g in G if st[g] or sb[g]])


def mini_territorios(M, R, cor, p, foco=None) -> str:
    """Esquema do mapa por território: um bloco por território (largura ∝ nº de municípios), na cor do líder."""
    T = M.territorios(str(p["ano"]), p["cargo"])
    n = Counter(m["territorio"] for m in M.B["municipios"])
    out, x, y = ['<svg viewBox="0 0 230 120" width="100%">'], 0, 0
    for t in sorted(T, key=lambda t: -n[t]):
        w = n[t] * 3.4
        if x + w > 230:
            x, y = 0, y + 40
        op = 1 if not foco or foco == t else .25
        out.append(f'<rect x="{x:.1f}" y="{y}" width="{w - 2:.1f}" height="36" fill="{cor[T[t]["lider"]["grupo"]]}" opacity="{op}"><title>{html.escape(t)}</title></rect>'
                   f'<text x="{x + 3:.1f}" y="{y + 12}" style="font-size:7px;fill:#fff" opacity="{op}">{html.escape(t[:16])}</text>')
        x += w
    return "".join(out) + '</svg><div class="leg"><i class="cinza">esquema: 1 bloco = 1 território (largura ∝ nº de municípios); no produto, o mapa</i></div>' \
        + leg(R, cor, [g for g in M.G if any(m["lider"]["grupo"] == g for m in T.values())])


def mini_barras_2anos(M, R, cor, a, b, rotulo) -> str:
    out = ['<svg viewBox="0 0 230 125" width="100%">']
    for i, g in enumerate(M.G):
        y = i * 24
        out.append(f'<text x="0" y="{y + 11}" class="rot">{html.escape(R["grupos"][g])}</text>')
        if a[g] is not None:
            out.append(f'<rect x="80" y="{y}" width="{1.4 * a[g]:.1f}" height="10" rx="2" fill="{cor[g]}"/><text x="{84 + 1.4 * a[g]:.1f}" y="{y + 9}" class="rot">{pct(a[g])}</text>')
        if b[g] is not None:
            out.append(f'<rect x="80" y="{y + 12}" width="{1.4 * b[g]:.1f}" height="5" fill="{cor[g]}" opacity=".35"/>')
    return "".join(out) + f'</svg><div class="leg"><i class="cinza">{rotulo} · barra cheia: 2026 · barra fina: 2022</i></div>'


def mini_municipio(M, R, cor, nome) -> str:
    k = M.por_nome[nome]
    return mini_barras_2anos(M, R, cor, M.cargo("2026", "estadual")["forca"]["municipio"][k]["pct_grupo"],
                             M.cargo("2022", "estadual")["forca"]["municipio"][k]["pct_grupo"], nome)


def mini_territorio(M, R, cor, nome) -> str:
    p = {"ano": 2026, "cargo": "estadual"}
    return mini_territorios(M, R, cor, p, foco=nome) + mini_barras_2anos(
        M, R, cor, M.territorios("2026", "estadual")[nome]["pct_grupo"], M.territorios("2022", "estadual")[nome]["pct_grupo"], nome)


def desenhar(M, R, cor, p, ctx) -> str:
    if not p:
        return ""
    g = p["grafico"]
    if g == "votos":
        return mini_votos(M, R, cor, p)
    if g == "cadeiras":
        return mini_cadeiras(M, R, cor, p)
    if g == "mapa" and p.get("nivel") == "territorio":
        return mini_territorios(M, R, cor, p)
    if g == "mapa":
        return mini_mapa(M, R, cor, p, ctx)
    if g == "territorio":
        return mini_territorio(M, R, cor, ctx["territorio"])
    if g == "fluxo":
        return mini_fluxo(M, R, cor, p)
    if g == "municipio":
        return mini_municipio(M, R, cor, ctx["municipio"])
    return f'<p class="erro">palco desconhecido: {html.escape(g)}</p>'


# ---------------------------------------------------------------- página
def cartao(R, M, cor, c, ultimo) -> str:
    tipo, ex = c["tipo"], c.get("explorar") or {}
    ctx = ({"municipio": ex.get("inicial")} if ex.get("municipio") else {"grupo": ex.get("inicial")} if ex.get("grupos")
           else {"territorio": ex.get("inicial")} if ex.get("territorio") else {})
    p = c.get("palco")
    esm = bool(p and p.get("esmaecido"))
    if esm:
        p = ultimo.get(p["grafico"])
    elif p:
        ultimo[p["grafico"]] = p
    selo = f'<span class="selo">{tipo}</span>' + (f'<span class="selo tr-{c["transicao"]}">{c["transicao"]}</span>' if c.get("transicao") else "")
    corpo = []
    if tipo == "frase-numero":
        corpo.append(f'<div class="numero">{M.preencher(c.get("numero"), ctx, marcar=False)}</div>')
    corpo.append(f'<div class="{"titulo" if tipo == "capa" else "frase"}">{M.preencher(c.get("frase"), ctx)}</div>')
    if c.get("subtitulo"):
        corpo.append(f'<div class="subt">{M.preencher(c["subtitulo"], ctx)}</div>')
    if ex:
        corpo.append(f'<div class="explorar{" aberto" if tipo == "explore" else ""}">{"✕" if tipo == "explore" else "⇄"} Explorar</div>')
    corpo.append(f'<div style="opacity:{.25 if esm else 1}">{desenhar(M, R, cor, p, ctx)}</div>')
    if c.get("rodape"):
        corpo.append(f'<div class="rodape">{html.escape(c["rodape"])}</div>')
    extras = [f"<p><b>{r}:</b> {M.preencher(c[k], ctx, False)}</p>" for k, r in (("como_ler", "ⓘ Como ler"), ("nota", "✎ Nota")) if c.get(k)]
    if c.get("glossario"):
        extras.append("<p><b>Glossário:</b> " + "; ".join(html.escape(R["glossario"][g]) for g in c["glossario"]) + "</p>")
    cam = (c.get("palco") or {}).get("camera")
    if cam:
        txt = cam if isinstance(cam, str) else ", ".join(f"{k}: {v}" for k, v in cam.items())
        extras.append(f"<p><b>Câmera:</b> <code>{html.escape(str(txt))}</code> <span class='cinza'>(editável sem nova validação — ?editar=1)</span></p>")
    if ex.get("modos"):
        extras.append("<p><b>⇄ Explorar:</b> " + " · ".join(ex["modos"]) + "</p>")
    if ex.get("grupos"):
        extras.append("<p><b>⇄ Explorar:</b> grupo (" + " · ".join(R["grupos"][g] for g in ex["grupos"]) + ")</p><table>" + "".join(
            f"<tr><td>{M.preencher(c['frase'], {'grupo': g}, False)} <span class='cinza'>{M.preencher(c.get('subtitulo'), {'grupo': g}, False)}</span></td></tr>"
            for g in ex["grupos"]) + "</table>")
    if ex.get("territorio"):
        extras.append(f"<p><b>⇄ Explorar:</b> os {len(M.territorios('2026', 'estadual'))} territórios (amostra abaixo)</p><table>" + "".join(
            f"<tr><td>{M.preencher(c['frase'], {'territorio': n}, False)} <span class='cinza'>{M.preencher(c.get('subtitulo'), {'territorio': n}, False)}</span></td></tr>"
            for n in AMOSTRA_T) + "</table>")
    if ex.get("municipio"):
        extras.append("<p><b>⇄ Explorar:</b> busca entre os 224 municípios (amostra abaixo)</p><table>" + "".join(
            f"<tr><td>{M.preencher(c['frase'], {'municipio': n}, False)} <span class='cinza'>{M.preencher(c.get('subtitulo'), {'municipio': n}, False)}</span></td></tr>"
            for n in AMOSTRA if n in M.por_nome) + "</table>")
    return (f'<article class="cartao"><header><b>{c["id"]}</b>{selo}</header><div class="tela">{"".join(corpo)}'
            f'<div class="barra-inf">ⓘ Como ler · ✎ Notas · ◎ Fontes · ↗ Compartilhar</div><div class="autor">por Alexandre Cajazeira</div></div>'
            f'<div class="extras">{"".join(extras)}</div></article>')


def pagina(R, M) -> str:
    cor, ultimo, caps = cores(), {}, []
    for cap in R["capitulos"]:
        n = len(cap["cartoes"])
        caps.append(f'<section><h2>{cap["id"].upper()} · {html.escape(cap["titulo"])} <small>{n} {"cartão" if n == 1 else "cartões"}</small></h2>'
                    f'<div class="trilho">{"".join(cartao(R, M, cor, c, ultimo) for c in cap["cartoes"])}</div></section>')
    validar = "".join(f"<li>{M.preencher(v, marcar=False)}</li>" for v in R.get("para_validar", []))
    conf = "".join(f"<tr><td><code>{{{html.escape(k)}}}</code></td><td>{html.escape(v)}</td><td><code>{html.escape(o)}</code></td></tr>" for k, (v, o) in sorted(M.usados.items()))
    total = sum(len(c["cartoes"]) for c in R["capitulos"])
    st = R["status"]
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roteiro — Quem lidera o voto no Piauí</title><style>
:root {{ --fundo:#f9f9f7; --sup:#fff; --texto:#0b0b0b; --t2:#52514e; --grade:#e1e0d9; --destaque:#2a78d6; }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--fundo); color:var(--texto); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }}
main {{ max-width:1200px; margin:0 auto; padding:28px 16px 64px; }} h1 {{ margin:0 0 4px; font-size:1.7rem; }}
h2 {{ font-size:1.15rem; margin:36px 0 10px; border-top:1px solid var(--grade); padding-top:14px; }} h2 small {{ color:var(--t2); font-weight:400; margin-left:8px; }}
.sub {{ color:var(--t2); margin:0 0 12px; }} .status {{ padding:2px 10px; border-radius:10px; font-weight:700; font-size:.85rem; color:#fff; background:{"#2C7A43" if st == "validado" else "#c0392b"}; }}
.caixa {{ background:var(--sup); border:1px solid var(--grade); border-left:4px solid var(--destaque); border-radius:6px; padding:10px 16px; margin:14px 0; }} .caixa li {{ margin:6px 0; }}
.trilho {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:18px; }}
.cartao header {{ font-size:.8rem; margin-bottom:6px; display:flex; gap:6px; align-items:center; }}
.selo {{ font-size:.7rem; padding:1px 7px; border-radius:8px; background:var(--grade); }} .tr-trocar {{ background:#f28e2b; color:#fff; }} .tr-transformar {{ background:#22508f; color:#fff; }}
.tela {{ background:var(--sup); border:8px solid #222; border-radius:26px; padding:14px 12px 8px; min-height:420px; display:flex; flex-direction:column; gap:6px; }}
.titulo {{ font-size:1.5rem; font-weight:800; line-height:1.15; margin-top:40px; }} .frase {{ font-weight:700; font-size:1rem; line-height:1.3; }}
.numero {{ font-size:2.6rem; font-weight:800; color:var(--destaque); line-height:1; margin-top:20px; }} .subt {{ color:var(--t2); font-size:.82rem; line-height:1.35; }}
mark {{ background:none; color:var(--destaque); font-weight:800; }}
.explorar {{ align-self:flex-start; font-size:.7rem; border:1px solid var(--grade); border-radius:10px; padding:0 8px; }} .explorar.aberto {{ background:var(--texto); color:#fff; }}
svg .rot {{ font-size:9px; fill:var(--t2); }} .leg {{ display:flex; flex-wrap:wrap; gap:3px 9px; font-size:.68rem; color:var(--t2); }}
.leg i {{ display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:3px; }} .leg i.cinza {{ width:auto; height:auto; }}
.rodape {{ margin-top:auto; font-size:.75rem; color:var(--t2); }} .barra-inf {{ margin-top:auto; border-top:1px solid var(--grade); padding-top:6px; font-size:.66rem; color:var(--t2); text-align:center; }}
.autor {{ font-size:.62rem; color:var(--t2); text-align:center; text-decoration:underline dotted; }}
.extras {{ font-size:.8rem; color:var(--t2); margin-top:8px; }} .extras p {{ margin:4px 0; }} .extras b {{ color:var(--texto); }}
table {{ border-collapse:collapse; width:100%; font-size:.78rem; margin:6px 0; }} th, td {{ text-align:left; border-bottom:1px solid var(--grade); padding:4px 6px; vertical-align:top; }}
.cinza {{ color:var(--t2); }} .erro {{ color:#c0392b; font-weight:700; }} .conf td:nth-child(2) {{ font-weight:700; white-space:nowrap; }}
</style></head><body><main>
<p class="sub">Prancha de leitura do roteiro · tipo <b>story</b> · versão {R["versao"]} · <span class="status">{st}</span></p>
<h1>Quem lidera o voto no Piauí</h1>
<p><b>Pergunta:</b> {html.escape(R["pergunta"])}</p>
<p class="sub"><b>Universo:</b> {M.preencher(R["universo"], marcar=False)} · capa + {len(R["capitulos"]) - 1} capítulos, {total} cartões · números em <mark>azul</mark> vêm da base.</p>
<div class="caixa"><b>Para validar neste roteiro</b><ol>{validar}</ol></div>
<p class="sub">Selos: <span class="selo tr-transformar">transformar</span> o mesmo gráfico muda de estado · <span class="selo tr-trocar">trocar</span> entra outro gráfico.
Miniaturas esquemáticas (cores dos grupos do EL0006); o desenho final segue o design system. O produto só é gerado com o roteiro <b>validado</b>.</p>
{"".join(caps)}
<h2>Conferência dos números</h2><p class="sub">Cada marcador, o valor preenchido e de onde vem (base do produto {html.escape(R["_origem"])}).</p>
<table class="conf"><tr><th>Marcador</th><th>Valor</th><th>Origem na base</th></tr>{conf}</table>
<p class="sub">Fonte: {html.escape(R["fonte_padrao"])} · Roteiro preparado com apoio de IA (Claude Code); a validação é do pesquisador.</p>
</main></body></html>"""


def carregar() -> tuple[dict, Marcadores]:
    R = yaml.safe_load((PRODUTO / "src" / "roteiro.yaml").read_text(encoding="utf-8"))
    R["_origem"] = yaml.safe_load((PRODUTO / "produto.yaml").read_text(encoding="utf-8"))["deriva_de"]
    B = json.load(gzip.open(PRODUTO.parent / R["_origem"] / "data" / "base_forcas_pi.json.gz"))
    return R, Marcadores(B)


def main() -> None:
    R, M = carregar()
    (PRODUTO / "roteiro.html").write_text(pagina(R, M), encoding="utf-8")
    print(f"prancha: {(PRODUTO / 'roteiro.html').relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
