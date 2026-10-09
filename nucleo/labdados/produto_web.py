"""Montagem de produtos web autocontidos (L0002) com os componentes do design system (L0003).

Um produto é um HTML único: tokens do design system + ``web/componentes/lab.css`` + os
componentes ``web/componentes/lab-*.js`` + o ``app.js`` do produto + a base de dados
(JSON em gzip/base64). Abre com duplo clique, sem servidor.

O modelo HTML do produto (``src/index.template.html``) traz as marcas:

    /*__TOKENS_CSS__*/   tokens do design system escolhido (design/<ds>/tokens.css)
    /*__LAB_CSS__*/      estilos dos componentes
    /*__LAB_JS__*/       componentes (window.Lab)
    /*__APP_JS__*/       código do produto
    __DADOS_BASE64__     base de dados (Lab.decodificar no navegador)

Uso:
    from labdados.produto_web import montar_html
    html = montar_html(raiz, modelo, app_js=..., base=..., substituicoes={"__AUTOR__": "..."})

Os arquivos de ``web/componentes`` usados precisam estar em ``componentes_web`` no produto.yaml
(``COMPONENTES_PADRAO``), para o inventário e a exportação (ferramentas/exportar.py).
"""
from __future__ import annotations

import base64
import gzip
import json
import re
from pathlib import Path

COMPONENTES_JS = ("lab-nucleo.js", "lab-selecao.js", "lab-escalas.js", "lab-mapa.js",
                  "lab-graficos.js", "lab-sankey.js", "lab-metodologia.js")
COMPONENTES_CSS = ("lab.css",)
COMPONENTES_PADRAO = list(COMPONENTES_CSS + COMPONENTES_JS)


def codificar_base(base: dict) -> str:
    """JSON compacto → gzip (mtime fixo, saída estável) → base64."""
    bruto = json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode()
    return base64.b64encode(gzip.compress(bruto, 9, mtime=0)).decode()


def ler_componentes(raiz: Path, nomes: tuple[str, ...] | list[str]) -> str:
    """Concatena arquivos de web/componentes na ordem dada (cada um com o nome em comentário)."""
    partes = []
    for nome in nomes:
        caminho = raiz / "web" / "componentes" / nome
        if not caminho.exists():
            raise FileNotFoundError(f"componente ausente: web/componentes/{nome}")
        partes.append(f"/* ==== web/componentes/{nome} ==== */\n{caminho.read_text(encoding='utf-8')}")
    return "\n".join(partes)


def exigir_flubber(modelo: str, app_js: str) -> None:
    """Produto que usa Lab.mapa precisa carregar flubber 0.4 (transição suave Mapa ⇄ Círculos — design.yaml ›
    padroes.mapa_transicao). Confere uma tag <script> ativa (fora de comentários HTML) no modelo."""
    if "Lab.mapa(" not in app_js:
        return
    sem_comentarios = re.sub(r"<!--.*?-->", "", modelo, flags=re.S)
    if not re.search(r"<script[^>]+src=[^>]*flubber", sem_comentarios):
        raise ValueError("O produto usa Lab.mapa, mas o modelo HTML não carrega o flubber. Inclua "
                         '<script src="https://cdn.jsdelivr.net/npm/flubber@0.4.2/build/flubber.min.js"></script> '
                         "(transição Mapa ⇄ Círculos; design.yaml › padroes.mapa_transicao).")


def autoria(raiz: Path, produto_dir: Path | None) -> dict:
    """GitHub do autor (autor/perfil.yaml › links.github) e repositório do produto para o rodapé de cada gráfico:
    `repositorio` do produto.yaml ({nome, url}); senão o da frente do produto (projeto.yaml › frentes.<frente>.remoto);
    senão `repositorio_publico` do projeto.yaml. Sem repositório, o rodapé não mostra "Projeto"."""
    import yaml

    perfil = yaml.safe_load((raiz / "autor" / "perfil.yaml").read_text(encoding="utf-8")) or {}
    links = perfil.get("links") or {}
    saida = {"autorUrl": links.get("github") or perfil.get("github")}
    if produto_dir is None:
        return saida
    produto_dir = Path(produto_dir)
    prod = yaml.safe_load((produto_dir / "produto.yaml").read_text(encoding="utf-8")) or {}
    arq_proj = produto_dir.parents[1] / "projeto.yaml"
    proj = (yaml.safe_load(arq_proj.read_text(encoding="utf-8")) or {}) if arq_proj.exists() else {}
    repo = prod.get("repositorio")
    if not repo and prod.get("destino") and (frente := (proj.get("frentes") or {}).get(prod["destino"])) and frente.get("remoto"):
        repo = {"nome": frente.get("nome", prod["destino"]), "url": re.sub(r"\.git$", "", frente["remoto"])}
    repo = repo or proj.get("repositorio_publico")
    if repo:
        saida["projeto"] = {"nome": repo["nome"], "url": repo["url"]}
    return saida


def montar_html(raiz: Path, modelo: str, *, app_js: str, base: dict, design_system: str = "padrao",
                componentes_js=COMPONENTES_JS, componentes_css=COMPONENTES_CSS,
                substituicoes: dict[str, str] | None = None, produto_dir: Path | None = None) -> str:
    """Preenche o modelo HTML; erro se faltar alguma marca (nada é inserido às cegas). Com `produto_dir`, injeta a
    autoria do rodapé (GitHub do autor e repositório do projeto) antes do app.js."""
    exigir_flubber(modelo, app_js)
    app_js = f"Lab.configurar({json.dumps(autoria(raiz, produto_dir), ensure_ascii=False)});\n" + app_js
    marcas = {
        "/*__TOKENS_CSS__*/": (raiz / "design" / design_system / "tokens.css").read_text(encoding="utf-8"),
        "/*__LAB_CSS__*/": ler_componentes(raiz, componentes_css),
        "/*__LAB_JS__*/": ler_componentes(raiz, componentes_js),
        "/*__APP_JS__*/": app_js,
        "__DADOS_BASE64__": codificar_base(base),
    }
    html = modelo
    for marca, conteudo in marcas.items():
        if marca not in html:
            raise ValueError(f"Marca {marca} ausente do modelo HTML.")
        html = html.replace(marca, conteudo)
    for marca, conteudo in (substituicoes or {}).items():
        if marca not in html:
            raise ValueError(f"Marca {marca} ausente do HTML montado.")
        html = html.replace(marca, conteudo)
    return html


def gerar_produto(raiz: Path, produto_dir: Path, *, base: dict | None = None, qualidade: dict | None = None,
                  status_qualidade: str = "") -> Path:
    """Gera <produto>/index.html a partir de src/ (modelo, app.js, metodologia.yaml) e da base.

    Sem `base`, lê data/base.json.gz ou data/base.json (produzidos pelo script de análise do produto).
    O design system vem do produto.yaml (`design_system`) ou do projeto (`design_system_padrao`).
    """
    import datetime as dt

    import yaml

    from labdados import metodologia

    produto_dir = Path(produto_dir)
    if base is None:
        gz, js = produto_dir / "data" / "base.json.gz", produto_dir / "data" / "base.json"
        base = json.loads(gzip.decompress(gz.read_bytes())) if gz.exists() else json.loads(js.read_text(encoding="utf-8")) if js.exists() else {}
    produto = yaml.safe_load((produto_dir / "produto.yaml").read_text(encoding="utf-8")) or {}
    projeto = yaml.safe_load((produto_dir.parents[1] / "projeto.yaml").read_text(encoding="utf-8")) if (produto_dir.parents[1] / "projeto.yaml").exists() else {}
    ds = produto.get("design_system") or (projeto or {}).get("design_system_padrao") or "padrao"
    if (produto_dir / "src" / "metodologia.yaml").exists():
        gerado_em = (base.get("meta") or {}).get("gerado_em") or dt.datetime.now().astimezone().isoformat(timespec="seconds")
        base["metodologia"] = metodologia.montar(raiz, produto_dir, gerado_em=gerado_em, qualidade=qualidade, status_qualidade=status_qualidade)
    perfil = yaml.safe_load((raiz / "autor" / "perfil.yaml").read_text(encoding="utf-8")) or {}
    modelo = (produto_dir / "src" / "index.template.html").read_text(encoding="utf-8")
    app_js = (produto_dir / "src" / "app.js").read_text(encoding="utf-8")
    subst = {"__AUTOR__": perfil.get("nome_curto") or perfil.get("nome", ""),
             "__PORTFOLIO__": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "../../../../docs/index.html"}
    texto = modelo + app_js
    html = montar_html(raiz, modelo, app_js=app_js, base=base, design_system=ds, produto_dir=produto_dir,
                       substituicoes={k: v for k, v in subst.items() if k in texto})
    destino = produto_dir / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


if __name__ == "__main__":
    import argparse

    from labdados.catalogo import raiz as raiz_lab

    ap = argparse.ArgumentParser(description="Gera o index.html autocontido de um produto (L0002/L0003).")
    ap.add_argument("produto", type=Path, help="pasta do produto, ex.: projetos/eleicoes/produtos/2026-10_x")
    caminho = gerar_produto(raiz_lab(), raiz_lab() / ap.parse_args().produto)
    print(f"HTML: {caminho.relative_to(raiz_lab())} ({caminho.stat().st_size / 1e6:.2f} MB)")
