"""Visualização declarativa (L0007, L0011, L0013): carregar, validar, compilar e gerar a página de uma peça.

    python -m labdados.viz validar projetos/eleicoes/produtos/2026-10_votos-em-disputa
    python -m labdados.viz gerar   projetos/eleicoes/produtos/2026-10_votos-em-disputa
    python -m labdados.viz og      projetos/eleicoes/produtos/2026-10_votos-em-disputa   (gerar + og.png, com Chrome)

A especificação é `viz.yaml` ou `viz.json`, com o mesmo conteúdo (L0007, D1). A validação tem duas camadas:
- ESTRUTURA, pelo esquema `esquemas/visualizacao.schema.json` (JSON Schema 2020-12);
- REGRAS DO DS, conferidas aqui contra `design/<ds>/componentes.yaml` e `design.yaml › tarefas`:
  componente registrado, papéis obrigatórios ligados, colunas existentes e de tipo compatível, limites de controles.

ERRO bloqueia a geração (integridade: esquema, componente inexistente, papel obrigatório ausente, coluna inexistente
ou de tipo incompatível; ao gerar, componente sem adaptador no hospedeiro da peça — L0016). AVISO não bloqueia
(escolhas de forma: componente experimental no hospedeiro, tarefa fora do contrato, chapéu longo, número no título,
controles além do limite; contexto recomendado ausente, só informativo — L0016, D3) — o DS não é engessado (L0007).
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ESQUEMA = Path(__file__).parent / "esquemas" / "visualizacao.schema.json"
LIMITE_CHAPEU = 32           # L0013 (Q-042)
LIMITES_CONTROLES = {"titulo": 2, "titulo+grafico": 3, "explorar": 5}   # L0011 (Q-031)


@dataclass
class Resultado:
    erros: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.erros


def carregar(caminho: Path) -> dict:
    """viz.yaml ou viz.json (arquivo, ou pasta do produto que contenha um deles) → dicionário."""
    caminho = Path(caminho)
    if caminho.is_dir():
        achados = [caminho / n for n in ("viz.yaml", "viz.json") if (caminho / n).exists()]
        if not achados:
            raise FileNotFoundError(f"nenhum viz.yaml ou viz.json em {caminho}")
        caminho = achados[0]
    texto = caminho.read_text(encoding="utf-8")
    if caminho.suffix == ".json":
        return json.loads(texto)
    # datas do YAML (2026-10-10) viram texto ISO, como no JSON: os dois formatos dão a mesma especificação
    return json.loads(json.dumps(yaml.safe_load(texto), default=str))


def _ds(raiz: Path, nome: str = "padrao") -> tuple[dict, set[str]]:
    """Registro de componentes e lista (aberta) de tarefas do design system."""
    comp = yaml.safe_load((raiz / "design" / nome / "componentes.yaml").read_text(encoding="utf-8")) or {}
    dsy = _yaml(raiz / "design" / nome / "design.yaml")   # ausente no recorte público (L0010): sem conferência de tarefas
    return comp, {t["id"] for t in dsy.get("tarefas", [])}


def _tipos_ok(aceitos, tipo: str | None) -> bool:
    return aceitos == "*" or tipo is None or tipo in aceitos


def _conferir_ligacoes(nome: str, ligacoes: dict, contrato: dict, colunas: dict, r: Resultado, onde: str) -> None:
    papeis = contrato.get("papeis") or {}
    for papel, regra in papeis.items():
        if regra.get("obrigatorio") and papel not in ligacoes:
            r.erros.append(f"{onde}: o componente '{nome}' exige o papel '{papel}'")
    for papel, col in ligacoes.items():
        if papel not in papeis:
            r.erros.append(f"{onde}: o componente '{nome}' não tem o papel '{papel}' (papéis: {', '.join(papeis)})")
            continue
        if isinstance(col, str) and colunas:
            if col not in colunas:
                r.erros.append(f"{onde}: a coluna '{col}' (papel '{papel}') não existe nos dados")
            elif not _tipos_ok(papeis[papel].get("tipo", "*"), (colunas[col] or {}).get("tipo")):
                r.erros.append(f"{onde}: a coluna '{col}' é do tipo '{colunas[col].get('tipo')}', e o papel '{papel}' aceita {papeis[papel].get('tipo')}")


def _hospedeiro(contrato: dict, hosp: str) -> str:
    """Status do componente no hospedeiro (contrato v2, L0016); sem `hospedeiros`, o status geral."""
    return (contrato.get("hospedeiros") or {}).get(hosp) or contrato.get("status", "experimental")


def _conferir_hospedeiro(nome: str, contrato: dict, hosp: str, opcoes: dict, r: Resultado, onde: str, para_gerar: bool) -> None:
    """Contrato v2 (L0016): sem adaptador no hospedeiro = erro ao gerar (aviso ao só validar, ex.: teste de papel);
    experimental = aviso; contexto recomendado ausente = aviso informativo (D3, avaliado caso a caso)."""
    st = _hospedeiro(contrato, hosp)
    if st in ("sem_adaptador", "nao_se_aplica"):
        msg = f"{onde}: o componente '{nome}' não tem adaptador para o hospedeiro '{hosp}' ({st}; L0016) — a peça não desenharia"
        (r.erros if para_gerar else r.avisos).append(msg)
    elif st == "experimental":
        r.avisos.append(f"{onde}: componente '{nome}' é experimental em '{hosp}' (L0007, L0016): pode ser usado; vira estável depois de revisto")
    campo = contrato.get("contexto_opcao")
    if campo and not (opcoes or {}).get(campo):
        r.avisos.append(f"{onde}: contexto (informativo, L0016): '{nome}' recomenda {contrato.get('contexto')} — em opcoes.{campo}; avaliar caso a caso")


def validar(spec: dict, raiz: Path, ds: str = "padrao", para_gerar: bool = False) -> Resultado:
    """Confere a especificação: esquema (estrutura) + regras do DS. Devolve erros (bloqueiam) e avisos.
    `para_gerar`: a geração exige adaptador no hospedeiro da peça (L0016); a validação pura só avisa."""
    import jsonschema
    r = Resultado()
    esquema = json.loads(ESQUEMA.read_text(encoding="utf-8"))
    for e in sorted(jsonschema.Draft202012Validator(esquema).iter_errors(spec), key=lambda e: list(e.path)):
        r.erros.append(f"esquema: {'/'.join(map(str, e.path)) or '(raiz)'}: {e.message}")
    if r.erros:
        return r
    registro, tarefas = _ds(raiz, ds)
    colunas = (spec.get("dados") or {}).get("colunas") or {}
    hosp = "story" if spec.get("tipo") == "story" else "visualizacao"
    # tarefa antes do gráfico (L0008)
    cat = spec["tarefa"]["categoria"]
    if tarefas and cat not in tarefas:
        r.avisos.append(f"tarefa '{cat}' não está na lista do DS ({', '.join(sorted(tarefas))}); se for nova, acrescente em design.yaml › tarefas")
    # componente principal e companheiro. Story só de cartões com componente próprio (ou texto) dispensa o gráfico; com
    # `dados` (marcador do Python), o componente desenha dados prontos e dispensa as ligações (L0015, 2026-10-12)
    g = spec.get("grafico") or {}
    if not g and spec.get("tipo") != "story":
        r.erros.append("grafico: obrigatório fora do story")
    pares = ([(g["componente"], g.get("ligacoes") or {}, "grafico")] if g else []) + (
        [(g["companheiro"]["componente"], g["companheiro"]["ligacoes"], "grafico.companheiro")] if g.get("companheiro") else [])
    for nome, lig, onde in pares:
        contrato = registro.get(nome)
        if not contrato:
            if not g.get("extensao"):
                r.erros.append(f"{onde}: componente '{nome}' não está no registro do DS (design/{ds}/componentes.yaml) e não há extensao")
            continue
        _conferir_hospedeiro(nome, contrato, hosp, (g if onde == "grafico" else g["companheiro"]).get("opcoes"), r, onde, para_gerar)
        if onde == "grafico" and cat not in (contrato.get("tarefas") or []):
            r.avisos.append(f"grafico: o componente '{nome}' não declara a tarefa '{cat}' (declara {contrato.get('tarefas')}); justifique ou troque")
        if not (onde == "grafico" and g.get("dados")):
            _conferir_ligacoes(nome, lig, contrato, colunas, r, onde)
        if "tamanho" in lig and not (spec.get("legenda") or {}).get("tamanho", True):
            r.erros.append(f"{onde}: tamanho variável exige legenda de tamanho (L0013, Q-062)")
    # destaque por coluna booleana calculada no Python (A9)
    if g.get("destaque") and colunas and g["destaque"]["coluna"] not in colunas:
        r.erros.append(f"grafico.destaque: a coluna '{g['destaque']['coluna']}' não existe nos dados")
    for a in g.get("anotacoes") or []:
        if a.get("tipo") == "linha" and not a.get("texto"):
            r.avisos.append(f"grafico.anotacoes: linha em {a.get('eixo')} = {a.get('valor')} sem texto; o DS pede rótulo direto nas linhas de referência")
    # textos (L0013)
    t = spec["texto"]
    if t.get("chapeu") and len(re.sub(r"\{[^}]*\}", "Teresina", t["chapeu"])) > LIMITE_CHAPEU:
        r.avisos.append(f"texto.chapeu: passa de ~{LIMITE_CHAPEU} caracteres (L0013); o resto do recorte vai no título, no subtítulo ou em Notas e fontes")
    if re.search(r"\d", re.sub(r"\{[^}]*\}", "", t["titulo"])):
        r.avisos.append("texto.titulo: tem número; os números vão no subtítulo (design.yaml › padroes.titulos)")
    # controles (L0011)
    ctl = spec.get("controles") or []
    if spec.get("tipo") == "story":   # no story, o seletor citado só num cartão fica naquele cartão: o limite vale para o título geral
        geral = json.dumps([t.get("chapeu"), t.get("titulo"), t.get("subtitulo")], ensure_ascii=False)
        ctl = [c for c in ctl if c.get("local", "explorar") != "titulo" or f"{{c.{c['id']}}}" in geral]
    n = {k: sum(1 for c in ctl if c.get("local", "explorar") == k) for k in ("titulo", "grafico", "explorar")}
    if n["titulo"] > LIMITES_CONTROLES["titulo"]:
        r.avisos.append(f"controles: {n['titulo']} no título (limite {LIMITES_CONTROLES['titulo']})")
    if n["titulo"] + n["grafico"] > LIMITES_CONTROLES["titulo+grafico"]:
        r.avisos.append(f"controles: {n['titulo'] + n['grafico']} em título + gráfico (limite {LIMITES_CONTROLES['titulo+grafico']})")
    if n["explorar"] > LIMITES_CONTROLES["explorar"]:
        r.avisos.append(f"controles: {n['explorar']} em Explorar (limite {LIMITES_CONTROLES['explorar']})")
    # story (Q-066): cada cartão usa a vista do plano ou um componente registrado com dados próprios
    ids_anot = {x.get("id") for x in g.get("anotacoes") or [] if x.get("id")}
    vistos = set()
    for k in spec.get("cartoes") or []:
        onde = f"cartoes/{k['id']}"
        if k["id"] in vistos:
            r.erros.append(f"{onde}: id repetido")
        vistos.add(k["id"])
        for it in ([k] if k.get("componente") else []) + list(k.get("componentes") or []):
            contrato = registro.get(it["componente"])
            if not contrato and g.get("extensao") and it["componente"] == g.get("componente"):
                pass   # componente do próprio produto (A16), declarado em grafico.extensao
            elif not contrato:
                r.erros.append(f"{onde}: componente '{it['componente']}' não está no registro do DS")
            else:
                _conferir_hospedeiro(it["componente"], contrato, "story", it.get("opcoes"), r, onde, para_gerar)
            if not it.get("dados"):
                r.erros.append(f"{onde}: componente sem `dados` (marcador {{e.…}} calculado no Python)")
        if k.get("imagem") and k["imagem"] not in {c.get("id") for c in spec.get("cartoes") or []}:
            r.erros.append(f"{onde}: imagem '{k['imagem']}' não é o id de um cartão")
        if k.get("vista") == "mapa" and not g.get("companheiro"):
            r.erros.append(f"{onde}: vista 'mapa' sem grafico.companheiro")
        for a_ in k.get("anotacoes") or []:
            if a_ not in ids_anot:
                r.erros.append(f"{onde}: anotação '{a_}' não existe em grafico.anotacoes")
        # seletor no cartão: os dados mudam com a opção; o título também precisa mudar (pesquisador, 2026-10-12 — a
        # imagem exportada com outra opção ficava com o título da opção inicial)
        dados_k = " ".join(str(it.get("dados") or "") for it in [k, *(k.get("componentes") or [])])
        if "$" in dados_k and "$" not in str(k.get("titulo") or ""):
            r.avisos.append(f"{onde}: os dados mudam com o seletor do cartão, mas o título não; a imagem com outra opção fica "
                            "com um título que não fala do gráfico — use um título por opção ({e.….$controle.titulo})")
        if k.get("texto") and len(re.sub(r"\{[^}]*\}", "", k["texto"])) > 220:
            r.avisos.append(f"{onde}: texto longo para um cartão de celular (> 220 caracteres)")
    seq = spec.get("sequencia")
    if seq and len(seq.get("passos", [])) > 4:
        r.erros.append("sequencia: até quatro passos (L0008)")
    return r


# ------------------------------------------------------------------ compilação: especificação → plano da página
def _num(v: float) -> str:
    """35 → '35'; 52.5 → '52,5' (pt-BR)."""
    return f"{v:g}".replace(".", ",")


def classes_fatia_de_dois(cortes: list[float], pontas: list[str]) -> tuple[list[str], list[str]]:
    """Rótulos das classes de uma PARTILHA ENTRE DOIS (a fatia de B; a de A é 100 − fatia), com cortes simétricos em
    torno de 50. Ex.: cortes [35, 45, 55, 65], pontas [A, B] → "A ficou com 65% ou mais", "A ficou com 55 a 65%",
    "dividido (45 a 55%)", "B ficou com 55 a 65%", "B ficou com 65% ou mais" e os rótulos curtos (65%+, 55–65%…).
    A classe k vale para fatia em [cortes[k-1], cortes[k]) (d3.bisectRight no navegador)."""
    a, b = pontas
    lim = [None, *cortes, None]
    longas, curtas = [], []
    for k in range(len(cortes) + 1):
        lo, hi = lim[k], lim[k + 1]
        if lo is not None and hi is not None and lo < 50 < hi:
            longas.append(f"dividido ({_num(lo)} a {_num(hi)}%)"); curtas.append(f"{_num(lo)}–{_num(hi)}%")
        elif hi is not None and hi <= 50:      # B com menos da metade: a classe é de A (100 − fatia)
            de, ate = 100 - hi, None if lo is None else 100 - lo
            longas.append(f"{a} ficou com {_num(de)}% ou mais" if ate is None else f"{a} ficou com {_num(de)} a {_num(ate)}%")
            curtas.append(f"{_num(de)}%+" if ate is None else f"{_num(de)}–{_num(ate)}%")
        else:
            longas.append(f"{b} ficou com {_num(lo)}% ou mais" if hi is None else f"{b} ficou com {_num(lo)} a {_num(hi)}%")
            curtas.append(f"{_num(lo)}%+" if hi is None else f"{_num(lo)}–{_num(hi)}%")
    return longas, curtas


def _data_br(iso: str | None) -> str:
    """'2026-10-09' → '09/10/2026'."""
    return "/".join(reversed(iso[:10].split("-"))) if iso else ""


def _yaml(arq: Path) -> dict:
    return (yaml.safe_load(arq.read_text(encoding="utf-8")) or {}) if arq.exists() else {}


def compilar(spec: dict, raiz: Path, produto_dir: Path) -> dict:
    """Especificação validada → PLANO da página (o que lab-viz.js lê): textos com marcadores, dicionário de colunas
    (o dos dados + rótulos da especificação), escalas com os rótulos das classes, índice das fatias, autoria, endereço
    público, edição (data da base) e o bloco de metodologia. Erro se a especificação não passar na validação ou se
    pedir coluna que os dados não têm."""
    r = validar(spec, raiz, para_gerar=True)
    if not r.ok:
        raise ValueError("especificação inválida:\n" + "\n".join(r.erros))
    produto_dir = Path(produto_dir)
    produto = _yaml(produto_dir / "produto.yaml")
    projeto = _yaml(produto_dir.parents[1] / "projeto.yaml")
    perfil = _yaml(raiz / "autor" / "perfil.yaml")
    d = spec["dados"]
    indice = json.loads((produto_dir / d["indice"]).read_text(encoding="utf-8")) if d.get("indice") else {}
    dicionario = indice.get("dicionario") or {}
    colunas = {c: dict(info) for c, info in dicionario.items()}   # todas as colunas dos dados; a especificação acrescenta rótulos
    for c, extra in (d.get("colunas") or {}).items():
        if dicionario and c not in dicionario:
            raise ValueError(f"dados.colunas: '{c}' não está no dicionário dos dados ({d.get('indice')})")
        base = dict(dicionario.get(c) or {})
        if base.get("tipo") and (extra or {}).get("tipo") and base["tipo"] != extra["tipo"]:
            raise ValueError(f"dados.colunas: '{c}' é '{base['tipo']}' nos dados e '{extra['tipo']}' na especificação")
        colunas[c] = {**base, **(extra or {})}
    edicao = spec.get("edicao") or (indice.get("gerado_em") or "")[:10] or None
    escalas = json.loads(json.dumps(spec.get("escalas") or {}))
    cor = escalas.get("cor")
    if cor and cor.get("tipo") == "cortes":
        rot = [p["rotulo"] for p in cor["pontas"]]
        if cor.get("leitura") == "fatia_de_dois":
            cor["classes"], cor["curtas"] = classes_fatia_de_dois(cor["cortes"], rot)
        if len(cor.get("classes", [])) != len(cor["cortes"]) + 1:
            raise ValueError("escalas.cor: declare `leitura` (ex.: fatia_de_dois) ou `classes` e `curtas`, uma por classe")
    pub = produto.get("publicacao") or {}
    base_url, end = (projeto.get("publicacao_url") or "").rstrip("/"), pub.get("endereco")
    endereco = pub.get("url") or (f"{base_url}/{end}/" if base_url and end else None)
    t = spec["texto"]
    plano = {
        "id": spec["id"], "tipo": spec["tipo"], "edicao": edicao, "status": produto.get("status", spec["status"]),
        "teste": bool((produto.get("publicacao") or {}).get("teste")) and produto.get("status") != "publicado",
        # aviso ao lado do selo "Versão de teste" (ex.: dados ilustrativos; pesquisador, 2026-10-15): só em página de teste
        "aviso_teste": (pub.get("aviso") if pub.get("teste") and produto.get("status") != "publicado" else None),
        "chapeu": t.get("chapeu"), "titulo": t["titulo"], "subtitulo": t.get("subtitulo"), "amostra": t.get("amostra"),
        "como_ler": t.get("como_ler"), "notas": t.get("notas", []),
        "fonte": " · ".join(x for x in [t.get("fonte"), f"base de {_data_br(edicao)}" if edicao else None] if x),
        # fonte e data sempre visíveis na barra da peça (L0010, L0014)
        "fonte_curta": " · ".join(x for x in [t.get("fonte_curta") or t.get("fonte"), f"base de {_data_br(edicao)}" if edicao else None] if x) or None,
        "decisoes": d.get("decisoes", []), "autor": perfil.get("nome_curto") or perfil.get("nome", ""),
        "portfolio": perfil.get("pagina_autor") or perfil.get("portfolio_url") or "",
        "endereco": endereco,
        "colunas": colunas, "escalas": escalas, "legenda": spec.get("legenda") or {},
        "grafico": spec.get("grafico") or {"componente": None, "ligacoes": {}, "opcoes": {}},   # story só de cartões próprios
        "cartoes": spec.get("cartoes"),
        "controles": spec.get("controles") or [], "formatos": spec.get("formatos") or {}, "saidas": spec.get("saidas") or {},
    }
    if d.get("fatiar_por"):
        plano["fatias"] = {"campo": d["fatiar_por"], "pasta": d["fonte"]["tabela"], "global": "VIZ_FATIAS",
                           "indice": indice.get("linhas", [])}
    elif d["fonte"].get("base"):   # base única (sem fatias), embutida no plano: {textos, colunas?, linhas?}
        arq = produto_dir / d["fonte"]["base"]
        plano["base"] = json.loads(arq.read_text(encoding="utf-8"))
        edicao = plano["edicao"] = plano["edicao"] or (plano["base"].get("gerado_em") or "")[:10] or None
        plano["fonte"] = " · ".join(x for x in [t.get("fonte"), f"base de {_data_br(edicao)}" if edicao else None] if x)
        plano["fonte_curta"] = " · ".join(x for x in [t.get("fonte_curta") or t.get("fonte"), f"base de {_data_br(edicao)}" if edicao else None] if x) or None
    if (produto_dir / "src" / "metodologia.yaml").exists():
        from labdados import metodologia
        plano["metodologia"] = metodologia.montar(raiz, produto_dir, gerado_em=indice.get("gerado_em") or edicao or "")
    return plano


MODELO = "modelos/visualizacao/index.template.html"
COMPONENTES_JS = ("lab-nucleo.js", "lab-selecao.js", "lab-escalas.js", "lab-mapa.js", "lab-metodologia.js", "lab-viz.js")   # lab-mapa: adaptador do mapa (L0016)
COMPONENTES_CSS = ("lab.css", "lab-viz.css")


def extensao_js(spec: dict, produto_dir: Path) -> str:
    """Componente do próprio produto (A16, adendo à L0007 de 2026-10-14): `grafico.extensao` aponta um arquivo JS da pasta
    do produto (ex.: src/extensao.js) que registra `Lab.viz.adaptadores.<grafico.componente>`; entra depois de lab-viz.js.
    Sem `extensao`, nada muda."""
    caminho = (spec.get("grafico") or {}).get("extensao")
    if not caminho:
        return ""
    arq = Path(produto_dir) / caminho
    if not arq.is_file():
        raise FileNotFoundError(f"grafico.extensao: {caminho} não existe na pasta do produto")
    js = arq.read_text(encoding="utf-8")
    comp = spec["grafico"]["componente"]
    if f"adaptadores.{comp}" not in js and f'adaptadores["{comp}"]' not in js:
        raise ValueError(f"grafico.extensao: {caminho} não registra Lab.viz.adaptadores.{comp}")
    return f"\n/* ==== extensão do produto: {caminho} (A16) ==== */\n{js}"


def gerar(produto_dir: Path, raiz: Path | None = None) -> Path:
    """Gera <produto>/index.html: modelo do tipo + tokens do DS + lab.css/lab-viz.css + componentes + plano (gzip/base64).
    As fatias (data/<tabela>/<chave>.js) ficam fora do HTML e são carregadas sob demanda."""
    from labdados.produto_web import codificar_base, ler_componentes
    raiz = raiz or Path(__file__).resolve().parents[2]
    produto_dir = Path(produto_dir)
    spec = carregar(produto_dir)
    plano = compilar(spec, raiz, produto_dir)
    produto = _yaml(produto_dir / "produto.yaml")
    ds = produto.get("design_system") or _yaml(produto_dir.parents[1] / "projeto.yaml").get("design_system_padrao") or "padrao"
    estilo = (spec.get("estilo") or {}).get("tokens") or {}
    claro = ";".join(f"--{k}:{v[0]}" for k, v in estilo.items())
    escuro = ";".join(f"--{k}:{v[1] if len(v) > 1 else v[0]}" for k, v in estilo.items())
    css_produto = (f":root{{{claro}}}\n@media (prefers-color-scheme: dark){{:root:not([data-theme=\"light\"]){{{escuro}}}}}\n"
                   f":root[data-theme=\"dark\"]{{{escuro}}}") if estilo else ""
    import html as _html
    titulo = re.sub(r"\{[^}]*\}", "", plano["titulo"]).strip()
    descricao = re.sub(r"\{[^}]*\}", "", spec["tarefa"]["pergunta"]).strip()
    marcas = {
        "/*__TOKENS_CSS__*/": (raiz / "design" / ds / "tokens.css").read_text(encoding="utf-8"),
        "/*__LAB_CSS__*/": ler_componentes(raiz, COMPONENTES_CSS),
        "/*__PRODUTO_CSS__*/": css_produto,
        "/*__LAB_JS__*/": ler_componentes(raiz, COMPONENTES_JS) + extensao_js(spec, produto_dir),
        "__PLANO_BASE64__": codificar_base(plano),
        "__TITULO__": _html.escape(titulo), "__DESCRICAO__": _html.escape(descricao),
        "__OG_URL__": _html.escape(plano["endereco"] or ""),
        "__OG_IMAGEM__": _html.escape(f"{plano['endereco']}og.png" if plano["endereco"] and (produto_dir / "og.png").exists() else ""),
    }
    html = (raiz / MODELO).read_text(encoding="utf-8")
    for m, v in marcas.items():
        if m not in html:
            raise ValueError(f"marca {m} ausente de {MODELO}")
        html = html.replace(m, v)
    html = re.sub(r'\s*<meta property="og:(?:url|image)" content="">', "", html)
    tudo = json.dumps([spec, plano.get("base")], ensure_ascii=False)
    if re.search(r'"forma":\s*"bolhas"|"rotulo_tamanho"', tudo):   # círculos padrão ou disponíveis (tamanho declarado)   # Lab.mapa: transição Mapa ⇄ Círculos com morph (flubber)
        html = html.replace("</head>", '<script src="https://cdn.jsdelivr.net/npm/flubber@0.4.2/build/flubber.min.js"></script>\n</head>', 1)
    if re.search(r'"fundo":\s*"vetorial"', tudo):   # Lab.mapa com fundo vetorial (L0006)
        html = html.replace("</head>", '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">\n'
                            '<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>\n</head>', 1)
    if plano["teste"]:   # versão de teste, sem divulgação (Q-018): fora dos buscadores
        html = html.replace('<meta name="viewport"', '<meta name="robots" content="noindex">\n<meta name="viewport"', 1)
    destino = produto_dir / "index.html"
    destino.write_text(html, encoding="utf-8")
    (produto_dir / "dados.md").write_text(dicionario_md(spec, plano), encoding="utf-8")
    return destino


def dicionario_md(spec: dict, plano: dict) -> str:
    """dados.md da publicação (L0010): de onde vêm os dados, como estão gravados e o dicionário das colunas."""
    d = spec["dados"]
    fonte = d["fonte"]
    linhas = [f"# Dados — {re.sub(r'{[^}]*}', '', plano['titulo']).strip()}", "",
              f"Gerado por `labdados.viz` a partir de `viz.yaml`. Edição (data da base): {plano['edicao'] or '—'}. Fonte: {plano['fonte']}.", ""]
    if fonte.get("analise"):
        linhas += [f"Produzidos por `{fonte['analise']}`; conferências:", *[f"- {c}" for c in d.get("conferencias", [])], ""]
    if plano.get("fatias"):
        linhas += [f"Uma tabela por fatia (`{plano['fatias']['campo']}`): `{plano['fatias']['pasta']}/<chave>.js` (JSON em gzip e base64, em "
                   f"`window.{plano['fatias']['global']}[<chave>]`, com `colunas` e `linhas` no formato longo, e os textos com números "
                   f"em `textos`). Índice das chaves em `{d.get('indice')}`. O CSV de cada fatia sai em ↗ Compartilhar "
                   "→ Baixar dados do gráfico; a base completa se refaz com o script acima.", ""]
    linhas += ["| Coluna | Tipo | Unidade | Descrição | Ausência significa |", "|---|---|---|---|---|"]
    for c, info in plano["colunas"].items():
        linhas.append(f"| `{c}` | {info.get('tipo', '')} | {info.get('unidade', '')} | {info.get('descricao') or info.get('rotulo', '')} | {info.get('nulo', '')} |")
    linhas += ["", f"Decisões metodológicas: {', '.join(d.get('decisoes', []))}.", ""]
    return "\n".join(linhas)


def gerar_og(produto_dir: Path, raiz: Path | None = None, chrome: str = "google-chrome") -> Path:
    """Prévia do link (og:image, 1200 × 630) = a imagem paisagem do estado de `saidas.imagens.og`, gerada pelo próprio
    renderizador (?og=1) num Chrome sem janela, a partir do index.html local: a página monta o PNG num canvas e o
    devolve no DOM (sem captura de tela). Grava <produto>/og.png."""
    import subprocess
    from urllib.parse import urlencode
    produto_dir = Path(produto_dir).resolve()
    spec = carregar(produto_dir)
    estado = (((spec.get("saidas") or {}).get("imagens") or {}).get("og") or {}).get("estado") or {}
    import base64
    destino = produto_dir / "og.png"
    url = f"{(produto_dir / 'index.html').as_uri()}?og=1#{urlencode(estado)}"
    r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                        "--virtual-time-budget=20000", "--dump-dom", url], check=True, capture_output=True, timeout=120, text=True)
    m = re.search(r'id="og-png">data:image/png;base64,([A-Za-z0-9+/=]+)<', r.stdout)
    if not m:
        raise RuntimeError("a página não devolveu a imagem (modo ?og=1); abra o index.html e veja o console")
    destino.write_bytes(base64.b64decode(m.group(1)))
    return destino


# Cartão de story autossuficiente (pesquisador, 2026-10-12): a imagem de um cartão circula sozinha, sem o anterior.
# Frase que abre com conector ou retomada ("Mas…", "Também…", "Esse grupo…") só faz sentido depois do outro cartão.
CONECTORES = re.compile(r"^\W*(mas|e|já|também|ainda|isso|esse|essa|esses|essas|este|esta|aqui|lá|além disso|por outro lado|"
                        r"enquanto isso|nos outros|nas outras|os outros|as outras|o mesmo|a mesma|na execução|pela execução)\b", re.I)


def _textos_resolvidos(v, base: dict) -> list[str]:
    """Todas as versões de um texto com marcadores {e.…} (um caminho com $controle expande todas as opções)."""
    if not isinstance(v, str):
        return []
    m = re.search(r"\{e\.([\w.$-]+)\}", v)
    if not m:
        return [v]
    def caminhos(no, partes):
        if not partes:
            return [no]
        if no is None:
            return [None]
        if partes[0].startswith("$"):
            return [x for f in (no.values() if isinstance(no, dict) else []) for x in caminhos(f, partes[1:])]
        return caminhos(no.get(partes[0]) if isinstance(no, dict) else None, partes[1:])
    saida = []
    for valor in caminhos(base, m.group(1).split(".")):
        txt = "" if valor is None or isinstance(valor, (dict, list)) else str(valor)
        saida += _textos_resolvidos(v[:m.start()] + txt + v[m.end():], base)
    return saida


def avisos_narrativa(plano: dict) -> list[str]:
    """Avisos de cartões cujo TÍTULO depende do anterior (abre com conector ou retomada). O texto do cartão pode retomar
    o próprio título ("Essa é a régua…"): fica fora da checagem."""
    bruta = plano.get("base") or {}
    avisos = []
    if bruta and "textos" not in bruta and any(isinstance(v, dict) for v in bruta.values()):
        # a página só lê, da base única, os valores simples do topo e o que estiver em `textos` (lab-viz.js › lerFatia)
        avisos.append("dados.fonte.base: textos e dados dos cartões precisam estar em `textos`; as chaves-objeto do topo "
                      "não chegam à página e o story quebra (achado do piloto de 2026-10-12)")
    base = bruta.get("textos") or bruta
    for k in plano.get("cartoes") or []:
        if k.get("capa") or k.get("fim"):
            continue
        for campo in ("titulo",):
            for t in _textos_resolvidos(k.get(campo), base):
                t = re.sub(r"[⟦⟧]", "", t)
                if CONECTORES.match(t):
                    avisos.append(f"cartoes/{k['id']}: o {campo} abre com “{t.split()[0]}…” e depende do cartão anterior; "
                                  "a imagem do cartão circula sozinha — diga o recorte na própria frase")
                    break
    return avisos


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 2 or argv[0] not in ("validar", "gerar", "og"):
        print("\n".join(__doc__.strip().splitlines()[2:5]))
        return 2
    raiz = Path(__file__).resolve().parents[2]
    alvo = Path(argv[1])
    alvo = alvo if alvo.is_absolute() else raiz / alvo
    if alvo.is_file():   # aceita o viz.yaml ou a pasta do produto
        alvo = alvo.parent
    r = validar(carregar(alvo), raiz, para_gerar=argv[0] in ("gerar", "og"))
    for e in r.erros:
        print(f"ERRO  {e}")
    if r.ok and carregar(alvo).get("tipo") == "story":
        r.avisos += avisos_narrativa(compilar(carregar(alvo), raiz, alvo))
    for a in r.avisos:
        print(f"aviso {a}")
    if not r.ok:
        print(f"{len(r.erros)} erro(s)")
        return 1
    if argv[0] in ("gerar", "og"):
        destino = gerar(alvo, raiz)
        if argv[0] == "og":                       # og.png precisa da página; a página cita o og.png: gera de novo
            print(f"og:image: {gerar_og(alvo, raiz).relative_to(raiz)}")
            destino = gerar(alvo, raiz)
        print(f"HTML: {destino.relative_to(raiz)} ({destino.stat().st_size / 1e6:.2f} MB)")
    else:
        print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
