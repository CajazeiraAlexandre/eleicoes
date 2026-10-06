"""Gera o HTML autocontido do produto "Forças políticas no Piauí" (L0002).

Lê data/base_forcas_pi.json.gz (gerada por forcas_pi.py — todos os indicadores já
calculados em Python), acrescenta os contornos simplificados por nível (municípios,
Regiões Imediatas/Intermediárias, Territórios de Desenvolvimento — dissolvidos a
partir da malha municipal IBGE 2022), as cores do EL0006 e o bloco de metodologia
(labdados.metodologia), e monta o index.html com os tokens e os componentes do
design system (labdados.produto_web; web/componentes/lab-*, ADR L0003).
O JS só seleciona e desenha.

    PYTHONPATH=nucleo:. python projetos/eleicoes/analise/html_forcas_pi.py
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

import yaml

from labdados import metodologia
from labdados.catalogo import raiz
from labdados.produto_web import montar_html

from projetos.eleicoes.analise import validar_distribuicao_pi as qa

PRODUTO = Path("projetos/eleicoes/produtos/2026-10_forcas-politicas-pi")
BASE = PRODUTO / "data" / "base_forcas_pi.json.gz"
CORES = Path("dados/referencia/cores_grupos_politicos.yaml")
SIMPLIFICACAO = {"municipio": 0.002, "imediata": 0.003, "intermediaria": 0.004, "territorio": 0.003, "estado": 0.004}


def contornos(raiz_lab: Path, municipios: list[dict]) -> dict:
    """GeoJSON por nível; a dissolução só desenha — os vínculos vêm dos códigos oficiais."""
    import geopandas as gpd

    g = gpd.read_file(f"zip://{raiz_lab / qa._MALHA}")
    g = g[g["SIGLA_UF"] == qa.UF][["CD_MUN", "geometry"]].copy()
    por_ibge = {m["ibge"]: m for m in municipios}
    g = g[g["CD_MUN"].isin(por_ibge)].copy()
    for nivel in ("tse", "imediata", "intermediaria", "territorio"):
        g[nivel] = g["CD_MUN"].map(lambda c: por_ibge[c][nivel])
    g["estado"] = "Piauí"
    saida = {}
    for nivel, coluna in (("municipio", "tse"), ("imediata", "imediata"), ("intermediaria", "intermediaria"),
                          ("territorio", "territorio"), ("estado", "estado")):
        camada = g[[coluna, "geometry"]].dissolve(by=coluna, as_index=False) if nivel != "municipio" else g[[coluna, "geometry"]]
        camada = camada.rename(columns={coluna: "id"})
        camada["geometry"] = camada.geometry.simplify(SIMPLIFICACAO[nivel], preserve_topology=True)
        texto = re.sub(r"(-?\d+\.\d{4})\d+", r"\1", camada.to_json())
        saida[nivel] = json.loads(texto)
    return saida


def qualidade(raiz_lab: Path, base: dict) -> tuple[dict, str]:
    """Tabela da conferência de qualidade para o bloco de metodologia (formato de labdados.metodologia)."""
    rel = json.loads((raiz_lab / "projetos/eleicoes/analise/relatorio_qualidade_forcas_pi.json").read_text(encoding="utf-8"))
    nomes = {m["tse"]: m["nome"] for m in base["municipios"]}
    milhar = lambda n: f"{n:,}".replace(",", ".")
    linhas = []
    for ano, r in rel["anos"].items():
        conf = r["conferencia_partidos_x_validos"]
        lacunas = [f"{nomes.get(l['municipio'], l['municipio'])} ({l['cargo']})" for l in r.get("lacunas_registradas", [])]
        linhas.append([ano, milhar(conf["chaves_cargo_municipio"]), milhar(conf["divergencias"]),
                       " · ".join(f"{k}: {milhar(v)}" for k, v in r["eleitos_por_cargo"].items()), ", ".join(lacunas) or "—"])
    return ({"texto": "Tolerância zero: a soma dos partidos é igual aos votos válidos oficiais em cada combinação de município e cargo.",
             "colunas": ["Eleição", "Município × cargo conferidos", "Divergências", "Eleitos", "Lacunas"], "linhas": linhas},
            rel["status_automatizado"])


def gerar(raiz_lab: Path) -> Path:
    from projetos.eleicoes.analise import forcas_pi

    base = json.loads(gzip.decompress((raiz_lab / BASE).read_bytes()))
    base["contornos"] = contornos(raiz_lab, base["municipios"])
    base["cores"] = yaml.safe_load((raiz_lab / CORES).read_text(encoding="utf-8"))
    tabela_q, status_q = qualidade(raiz_lab, base)
    base["metodologia"] = metodologia.montar(raiz_lab, raiz_lab / PRODUTO, gerado_em=base["meta"]["gerado_em"],
                                             funcoes={"forcas_pi": forcas_pi, "validar_distribuicao_pi": qa},
                                             anos=("2018", "2020", "2022", "2024", "2026"), qualidade=tabela_q, status_qualidade=status_q)
    perfil = yaml.safe_load((raiz_lab / "autor/perfil.yaml").read_text(encoding="utf-8"))
    src = raiz_lab / PRODUTO / "src"
    html = montar_html(raiz_lab, (src / "index.template.html").read_text(encoding="utf-8"),
                       app_js=(src / "app.js").read_text(encoding="utf-8"), base=base, design_system="padrao",
                       substituicoes={"__AUTOR__": perfil["nome_curto"],
                                      "__PORTFOLIO__": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "../../../../docs/index.html"})
    destino = raiz_lab / PRODUTO / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


if __name__ == "__main__":
    caminho = gerar(raiz())
    print(f"HTML: {caminho.relative_to(raiz())} ({caminho.stat().st_size / 1e6:.2f} MB)")
