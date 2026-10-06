/* lab-nucleo.js — núcleo dos componentes de interface do Laboratório de Dados Públicos.
 * Design system padrão (design/padrao/design.yaml, seção `padroes`); ADR L0003.
 *
 * Sem build: os produtos embutem os arquivos lab-*.js no HTML único (L0002), nesta ordem:
 *   lab-nucleo → lab-selecao → lab-escalas → lab-mapa → lab-graficos → lab-sankey → lab-metodologia.
 * Requer D3 v7 global (lab-sankey requer d3-sankey; lab-mapa usa flubber, se presente).
 * Tudo fica em window.Lab. Os componentes só desenham: nenhum cálculo analítico (L0002).
 *
 * Uso mínimo:
 *   Lab.configurar({ raiz: document.getElementById("app"), autor: "Nome", orgaos: { tse: "TSE" } });
 *   sec.append(el("h3", {}, "Votos de ", Lab.seletorTituloLista("Grupo", opcoes, atual, aoMudar)));
 */
(function () {
  "use strict";
  const Lab = (window.Lab = window.Lab || {});

  // ------------------------------------------------------------ configuração do produto
  // raiz: elemento onde a página desenha (seleção e rótulos procuram dentro dele)
  // autor: nome curto do rodapé dos gráficos · orgaos: chave da fonte → órgão (rodapé curto)
  // artigos: forma com artigo quando há um só órgão ("TSE" → "do TSE")
  Lab.cfg = { raiz: document.body, autor: "", orgaos: {}, artigos: {}, ancoraMetodologia: "metodologia", ancoraRodape: "rodape" };
  Lab.configurar = (c) => Object.assign(Lab.cfg, c);

  // ------------------------------------------------------------ formatos (pt-BR)
  const fmtInt = new Intl.NumberFormat("pt-BR");
  const vazio = (v) => v === null || v === undefined;
  Lab.fmtInt = fmtInt;
  Lab.fmtPct = (v, d = 1) => (vazio(v) ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
  Lab.fmtPP = (v) => (vazio(v) ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`);
  Lab.fmtR = (v) => (vazio(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  /** Número grande abreviado: 1,23 mi · 460 mil · 9.876. */
  Lab.fmtCompacto = (v) => (vazio(v) ? "—" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`
    : Math.abs(v) >= 1e4 ? `${Math.round(v / 1000).toLocaleString("pt-BR")} mil` : fmtInt.format(v));
  /** Com sinal explícito (+, −) e o formato do módulo. */
  Lab.comSinal = (v, fmt) => (vazio(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`);

  // ------------------------------------------------------------ elementos e tokens
  /** el("div", {class, text, onclick, "data-x"}, ...filhos) — textos sempre por textContent. */
  Lab.el = (tag, attrs = {}, ...filhos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const f of filhos) if (f !== null && f !== undefined && f !== false) n.append(f);
    return n;
  };
  const el = Lab.el;
  /** Valor de um token do design system (variável CSS --nome). */
  Lab.token = (nome) => getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim();
  const token = Lab.token;
  Lab.semMovimento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Tinta legível sobre uma cor de fundo (pela luminância). */
  Lab.tinta = (c) => (d3.lab(c).l > 62 ? "#111" : "#fff");
  /** Texto sobre cor: tinta pela luminância + contorno contrastante (--halo). */
  Lab.comHalo = (n, fundo) => { const t = Lab.tinta(fundo); n.style.color = t; n.style.setProperty("--halo", t === "#111" ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.45)"); return n; };
  /** Base embutida em gzip+base64 (labdados.produto_web.codificar_base). */
  Lab.decodificar = async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fluxo = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(fluxo).text());
  };

  // ------------------------------------------------------------ dica (tooltip)
  let dica = null;
  const caixaDica = () => dica || (dica = document.getElementById("dica")
    || document.body.appendChild(el("div", { class: "dica", id: "dica", role: "status", "aria-live": "polite" })));
  /** Dica junto ao ponteiro: título em negrito + linhas (as vazias são ignoradas). */
  Lab.mostrarDica = (ev, titulo, linhas) => {
    const d = caixaDica();
    d.replaceChildren(el("b", { text: titulo }), ...linhas.filter(Boolean).map((t) => el("div", { text: t })));
    d.style.display = "block";
    d.style.left = `${Math.min(ev.clientX + 14, innerWidth - d.offsetWidth - 8)}px`;
    d.style.top = `${Math.min(ev.clientY + 14, innerHeight - d.offsetHeight - 8)}px`;
  };
  Lab.esconderDica = () => { if (dica) dica.style.display = "none"; };

  // ------------------------------------------------------------ controles
  /** Botões de alternância; `pequeno` = versão compacta, usada abaixo dos gráficos (Tamanho, Largura). */
  Lab.alternar = (rotuloGrupo, opcoes, atual, aoMudar, pequeno = false) => {
    const a = el("div", { class: pequeno ? "alternar pequeno" : "alternar", role: "group", "aria-label": rotuloGrupo });
    for (const [v, r] of opcoes) a.append(el("button", { "aria-pressed": v === atual, text: r, "data-chave": `${rotuloGrupo}|${v}`, onclick: () => aoMudar(v) }));
    return el("div", { class: pequeno ? "campo compacto" : "campo" }, rotuloGrupo, a);
  };
  /** Seletor dentro do título (poucas opções): as opções fazem parte da frase; a escolhida fica sublinhada. */
  Lab.seletorTitulo = (rotulo, opcoes, atual, aoMudar) => {
    const grupo = el("span", { class: "seletor-titulo", role: "group", "aria-label": rotulo });
    opcoes.forEach(([v, r], i) => {
      if (i) grupo.append(el("span", { class: "sep", "aria-hidden": "true", text: " / " }));
      grupo.append(el("button", { type: "button", "aria-pressed": v === atual, "data-chave": `${rotulo}|${v}`, text: r, onclick: () => aoMudar(v) }));
    });
    return grupo;
  };
  /** Lista dentro do título (muitas opções): parece texto sublinhado com ▾; abre a lista nativa. */
  Lab.seletorTituloLista = (rotulo, opcoes, atual, aoMudar) => {
    const s = el("select", { class: "lista-titulo", "aria-label": rotulo, "data-chave": rotulo, onchange: (e) => aoMudar(e.target.value) });
    for (const [v, r] of opcoes) s.append(el("option", { value: v, text: r }));
    s.value = atual;
    // largura = texto escolhido (o select nativo mediria a opção mais longa)
    requestAnimationFrame(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = getComputedStyle(s).font;
      s.style.width = `${Math.ceil(ctx.measureText(s.selectedOptions[0]?.text || "").width) + 24}px`;
    });
    return s;
  };
  /** Lista com rótulo acima (formulários; nos gráficos, prefira seletorTituloLista). */
  Lab.seletor = (rotuloCampo, opcoes, atual, aoMudar) => {
    const s = el("select", { "data-chave": rotuloCampo, onchange: (e) => aoMudar(e.target.value) });
    for (const [v, r] of opcoes) s.append(el("option", { value: v, text: r }));
    s.value = atual;
    return el("label", { class: "campo" }, rotuloCampo, s);
  };
  /** Botão que troca o modo de uma seção (ex.: "Detalhar distribuição de um único grupo" ⇄ "← Mapa de lideranças"). */
  Lab.botaoModo = (texto, aoClicar, chave = "modo") => el("button", { type: "button", class: "botao-modo", "data-chave": chave, text: texto, onclick: aoClicar });

  // ------------------------------------------------------------ amostras de cor
  const amostra = (cor, classe = "amostra") => { const s = el("span", { class: classe }); s.style.background = cor; return s; };
  /** Item de legenda: amostra + texto. */
  Lab.chave = (cor, texto) => el("span", { class: "chave" }, amostra(cor), texto);
  /** Quadradinho de cor para tabelas e quadros. */
  Lab.chip = (cor) => amostra(cor, "chip");

  // ------------------------------------------------------------ textos de apoio
  /** Orientações de leitura: escondidas num "ⓘ Como ler o gráfico" sutil. Aceita vários parágrafos (ou elementos). */
  Lab.instrucao = (...textos) => el("details", { class: "info" }, el("summary", {}, "ⓘ Como ler o gráfico"),
    ...textos.filter(Boolean).map((t) => (typeof t === "string" ? el("p", { text: t }) : t)));
  /** Subtítulo com os números (curto; o título não leva números). */
  Lab.placar = (texto) => el("p", { class: "placar", text: texto });
  /** Leva ao bloco de metodologia (abre o bloco). */
  Lab.irRodape = (ev) => {
    ev?.preventDefault();
    const bloco = document.getElementById(Lab.cfg.ancoraMetodologia);
    if (bloco) bloco.open = true;
    (bloco || document.getElementById(Lab.cfg.ancoraRodape))?.scrollIntoView({ behavior: Lab.semMovimento() ? "auto" : "smooth" });
  };
  /** Rodapé de cada gráfico: fonte curta (link para a metodologia) + autoria; cobertura e notas num "ⓘ notas" recolhível.
   *  fontes: chaves de Lab.cfg.orgaos. O gráfico se sustenta sozinho num print. */
  Lab.rodape = ({ fontes = [], cobertura = null, nota = null } = {}) => {
    const orgaos = [...new Set(fontes.map((k) => Lab.cfg.orgaos[k] || k))];
    const deQuem = orgaos.length === 1 && Lab.cfg.artigos[orgaos[0]] ? Lab.cfg.artigos[orgaos[0]] : `de ${orgaos.join(", ")}`;
    const f = el("div", { class: "rodape-grafico" },
      el("span", {}, `Fonte: bases oficiais ${deQuem}. `),
      el("a", { href: `#${Lab.cfg.ancoraRodape}`, onclick: Lab.irRodape, text: "Saiba mais ↓" }), " · ", el("span", {}, `Análise e visualização: ${Lab.cfg.autor}`));
    if (cobertura || nota) f.append(el("details", { class: "info info-notas" }, el("summary", {}, "ⓘ notas"),
      ...[cobertura, nota].filter(Boolean).map((t) => el("p", { text: t }))));
    return f;
  };

  // ------------------------------------------------------------ tabelas e quadros
  /** Tabela simples; colunas numéricas alinhadas à direita (detecção automática ou `numericas`).
   *  Célula pode ser texto ou lista de nós (ex.: [chip, "nome"]). */
  Lab.tabela = (cab, linhas, numericas = false) => {
    const ehNum = (c) => typeof c === "string" && /([\d—]|%|p\.p\.)$/.test(c.trim()) && /\d|—/.test(c);
    const num = cab.map((_, i) => i > 0 && (numericas || (linhas.length > 0 && linhas.every((l) => ehNum(l[i])))));
    const t = el("table");
    t.append(el("thead", {}, el("tr", {}, ...cab.map((c, i) => el("th", { class: num[i] ? "n" : null, scope: "col" }, ...(Array.isArray(c) ? c : [c]))))));
    t.append(el("tbody", {}, ...linhas.map((l) => el("tr", {}, ...l.map((c, i) => el("td", { class: num[i] ? "n" : null }, ...(Array.isArray(c) ? c : [c])))))));
    return t;
  };
  /** Quadros com um número grande por item. itens: [{chave, rotulo, cor, valor}].
   *  Com `aoEscolher`, viram botões (o escolhido ganha a borda na cor do item). */
  Lab.quadros = (itens, { atual = null, aoEscolher = null, chaveDado = "Quadro", rotulo = "Escolha" } = {}) =>
    el("div", aoEscolher ? { class: "tiles", role: "group", "aria-label": rotulo } : { class: "tiles" }, ...itens.map((it) => {
      const corpo = [el("div", { class: "rot" }, Lab.chip(it.cor), it.rotulo), el("div", { class: "val", text: it.valor })];
      if (!aoEscolher) return el("div", { class: "tile" }, ...corpo);
      const b = el("button", { type: "button", class: "tile tile-botao", "aria-pressed": it.chave === atual, "data-chave": `${chaveDado}|${it.chave}`, onclick: () => aoEscolher(it.chave) }, ...corpo);
      b.style.setProperty("--cor-grupo", it.cor);
      return b;
    }));

  // ------------------------------------------------------------ barra 100% (composição)
  /** Uma linha de barra empilhada de 100%. segmentos: [{cor, pct, texto, medio, curto, dica: [título, linhas]}].
   *  O rótulo encolhe (texto → medio → curto) ou sai quando não cabe: ver Lab.ajustarRotulos. */
  Lab.linhaBarra100 = ({ rotulo, segmentos, abaixo = null, aria = null }) => {
    const barra = el("div", { class: "barra", role: aria ? "img" : null, "aria-label": aria });
    for (const s of segmentos) {
      if (vazio(s.pct) || s.pct <= 0) continue;
      const sp = el("span"); sp.style.width = `${s.pct}%`; sp.style.background = s.cor;
      if (s.texto) { const b = el("b", { text: s.texto, "data-medio": s.medio || null, "data-curto": s.curto || null }); Lab.comHalo(b, s.cor); sp.append(b); }
      if (s.dica) { sp.addEventListener("pointermove", (ev) => Lab.mostrarDica(ev, s.dica[0], s.dica[1])); sp.addEventListener("pointerleave", Lab.esconderDica); }
      barra.append(sp);
    }
    return el("div", { class: "linha" }, el("span", { class: "rot", text: rotulo }), el("div", {}, barra, abaixo ? el("div", { class: "vazio", text: abaixo }) : null));
  };
  /** Rótulos de barra que não cabem: tenta a forma média, depois a curta; se nada couber, sai (fica na dica e na tabela). */
  Lab.ajustarRotulos = (raiz = Lab.cfg.raiz) => {
    const cabe = (b) => { const t = document.createElement("span"); t.textContent = b.textContent; t.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:600 12px var(--fonte-texto)";
      document.body.append(t); const ok = t.offsetWidth <= b.parentElement.clientWidth - 6; t.remove(); return ok; };
    for (const b of raiz.querySelectorAll(".barra span b")) {
      if (cabe(b)) continue;
      if (b.dataset.medio) { b.textContent = b.dataset.medio; if (cabe(b)) continue; }
      if (b.dataset.curto) b.textContent = b.dataset.curto;
      if (!cabe(b)) b.remove();
    }
  };

  // ------------------------------------------------------------ eixos e atualização
  /** Eixo padronizado: linhas na cor de eixo, rótulos 12px secundários. Uso: g.call(d3.axisBottom(x)).call(Lab.eixo). */
  Lab.eixo = (g) => g.call((x) => x.selectAll("line,path").attr("stroke", token("cor-eixo")))
    .call((x) => x.selectAll("text").style("font-size", "12px").style("fill", token("cor-texto-secundario")));
  /** Atualiza no lugar: mantém altura, posição de rolagem e o foco do controle usado (data-chave). */
  Lab.noLugar = (fazer, raiz = Lab.cfg.raiz) => {
    const y = scrollY;
    const chave = document.activeElement?.dataset?.chave;
    raiz.style.minHeight = `${raiz.offsetHeight}px`;
    fazer();
    scrollTo(0, y);
    if (chave) raiz.querySelector(`[data-chave="${CSS.escape(chave)}"]`)?.focus({ preventScroll: true });
    requestAnimationFrame(() => { raiz.style.minHeight = ""; });
  };
  /** Largura útil de um gráfico na raiz (entre 320 px e `max`). */
  Lab.largura = (max) => Math.max(320, Math.min(max, Lab.cfg.raiz.clientWidth - 34));
  Lab.estreito = () => Lab.cfg.raiz.clientWidth < 600;
})();
