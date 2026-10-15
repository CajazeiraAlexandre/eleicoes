/* app.js — Quem lidera o voto no Piauí (tipo story). Os cartões, os números e as contagens chegam prontos do Python
 * (src/preparar.py, a partir do roteiro validado); aqui só se navega, seleciona e desenha (L0002). Textos: textContent.
 *
 * Motor do story igual ao do piloto (projetos/cultura/produtos/2026-10_rouanet-onde-acontece/src/app.js): trilho de
 * cartões com rolagem lateral nativa + palco persistente que se TRANSFORMA ou é TROCADO; gavetas Como ler, Notas,
 * Fontes, Capítulos; modos celular, embutido e apresentação (?modo=apresentacao).
 * Palcos deste produto: votos (barras por grupo), mapa (Lab.mapa do design system em modo compacto — câmera por
 * cartão, zoom, card, referência e fundo vetorial; L0006), fluxo (Sankey em fases), territorio e municipio (Lab.mapa
 * com a câmera na escolha + barras 2026 × 2022). Cores dos grupos: EL0006. */
(async function () {
  "use strict";
  const { el } = Lab;
  const raiz = document.getElementById("story");
  const base = await Lab.decodificar(document.getElementById("dados").textContent.trim());
  Lab.configurar({ raiz, autor: "__AUTOR__" });
  const D = base.dados, C = base.cartoes, CAPS = base.capitulos, META = base.meta;
  const PORTFOLIO = "__PORTFOLIO__", AUTOR = "__AUTOR__";
  const ANALISE = `../${META.deriva_de}/index.html`;
  const G = D.grupos, NOME = D.nomes, CONT = D.contagens;
  const CARGO = { estadual: "Deputado estadual", federal: "Deputado federal" };

  const pedido = new URLSearchParams(location.search).get("modo");   // ?modo=apresentacao | celular | embutido
  const modo = ["apresentacao", "celular", "embutido"].includes(pedido) ? pedido : window.self !== window.top ? "embutido" : "celular";
  document.body.classList.add(`modo-${modo}`);
  const dur = () => (Lab.semMovimento() ? 0 : 650);
  const fmt = (v) => Lab.fmtPct(v);
  const fmtN = (v) => Lab.fmtInt.format(v || 0);
  const semMarcas = (s) => (s || "").replace(/[⟦⟧]/g, "");
  const capDe = (c) => CAPS.findIndex((k) => k.id === c.capitulo);
  const rotCap = (c) => { const k = capDe(c); return k === 0 ? META.titulo : `${k} · ${CAPS[k].titulo}`; };
  const corG = (g) => { const c = D.cores[g] || ""; return c.startsWith("var(") ? Lab.token(c.slice(6, -1)) : c; };
  // cinza neutro (translúcido) para "fora de destaque" — a cor-grade sólida é reservada a "sem dados" (hachura) no Lab.mapa
  const cinza = () => d3.color(Lab.token("cor-texto-suave")).copy({ opacity: 0.32 }).formatRgb();

  /** Texto com os números (entre ⟦ ⟧, vindos do Python) destacados. */
  const preencher = (no, s) => {
    no.replaceChildren();
    for (const p of (s || "").split(/(⟦[^⟧]*⟧)/)) {
      if (!p) continue;
      // trechos longos (listas de nomes) quebram a linha; números curtos não
      no.append(p.startsWith("⟦") ? el("span", { class: p.length > 20 ? "num longo" : "num", text: p.slice(1, -1) }) : document.createTextNode(p));
    }
    return no;
  };
  const comNumeros = (tag, classe, s) => preencher(el(tag, { class: classe }), s);

  // ---------------------------------------------------------------- estado
  const est = { i: -1, opcao: {}, modo: {}, chipsAbertos: {}, desenhado: null };
  const opcaoDe = (c) => (c.explorar?.tipo ? est.opcao[c.id] ?? c.explorar.inicial : null);

  // ---------------------------------------------------------------- estrutura
  const prog = el("div", { class: "st-prog", "aria-hidden": "true" });
  const btnCap = el("button", { type: "button", class: "st-cap", "aria-haspopup": "dialog", onclick: () => abrirGaveta("capitulos") });
  const cont = el("span", { class: "st-cont" });
  const btnTelaCheia = modo === "apresentacao" ? el("button", { type: "button", "aria-label": "Tela cheia", title: "Tela cheia", text: "⛶",
    onclick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) }) : null;
  const linkTelaCheia = el("a", { class: "st-botao st-tela-cheia", href: location.href.split("#")[0], target: "_blank", rel: "noopener", text: "Tela cheia ↗" });
  const topo = el("header", { class: "st-topo" }, prog, el("div", { class: "st-cab" }, btnCap,
    el("div", { class: "st-dir" }, cont, linkTelaCheia, btnTelaCheia,
      el("button", { type: "button", "aria-label": "Capítulos", title: "Capítulos", text: "☰", onclick: () => abrirGaveta("capitulos") }))));

  const trilho = el("div", { class: "st-trilho" });
  const slides = C.map((c, k) => montarCartao(c, k));
  trilho.append(...slides);

  const btnExplorar = el("button", { type: "button", class: "st-explorar", "aria-expanded": "false", text: "⇄ Explorar",
    onclick: () => { const c = C[est.i]; est.chipsAbertos[c.id] = !chipsAbertos(c); montarChips(c); } });
  const btnVoltar = el("button", { type: "button", class: "st-voltar", hidden: "", text: "↺ Voltar à história",
    onclick: () => { const c = C[est.i]; delete est.opcao[c.id]; delete est.modo[c.id]; aplicarOpcao(c); } });
  const chips = el("div", { class: "st-chips", role: "group", "aria-label": "Explorar o gráfico", hidden: "" });
  const palco = el("div", { class: "st-palco" });
  const leitura = el("div", { class: "st-leitura", "aria-live": "polite" });
  const legenda = el("div");
  const palcoArea = el("div", { class: "st-palco-area oculto" }, el("div", { class: "st-ferramentas" }, btnVoltar, btnExplorar), chips, palco, leitura, legenda);

  const bComo = el("button", { type: "button", text: "ⓘ Como ler", onclick: () => abrirGaveta("como") });
  const bNotas = el("button", { type: "button", text: "✎ Notas", onclick: () => abrirGaveta("notas") });
  const bFontes = el("button", { type: "button", text: "◎ Fontes", onclick: () => abrirGaveta("fontes") });
  const bComp = el("button", { type: "button", "aria-label": "Compartilhar este cartão", title: "Compartilhar", text: "↗ Compartilhar", onclick: () => compartilhar() });
  const baseNav = el("nav", { class: "st-base", "aria-label": "Recursos do cartão" },
    el("div", { class: "st-botoes" }, bComo, bNotas, bFontes, bComp),
    el("div", { class: "st-autor" }, "por ", el("a", { href: PORTFOLIO, target: "_blank", rel: "noopener", text: AUTOR })));
  const anuncio = el("div", { class: "st-so-leitor", "aria-live": "polite" });
  raiz.replaceChildren(topo, trilho, palcoArea, baseNav, anuncio);

  const setaAnt = el("button", { type: "button", class: "st-seta ant", "aria-label": "Cartão anterior", text: "‹", onclick: () => irPara(est.i - 1) });
  const setaProx = el("button", { type: "button", class: "st-seta prox", "aria-label": "Próximo cartão", text: "›", onclick: () => irPara(est.i + 1) });
  const veu = el("div", { class: "st-veu", onclick: () => fecharGaveta() });
  const gavTitulo = el("h2", { id: "st-gaveta-titulo" });
  const gavFechar = el("button", { type: "button", "aria-label": "Fechar", text: "✕", onclick: () => fecharGaveta() });
  const gavCab = el("div", { class: "st-gaveta-cab" }, el("div", { class: "st-alca" }), el("div", { class: "linha" }, gavTitulo, gavFechar));
  const gavCorpo = el("div", { class: "st-gaveta-corpo" });
  const gaveta = el("div", { class: "st-gaveta", role: "dialog", "aria-modal": "true", "aria-labelledby": "st-gaveta-titulo", hidden: "" }, gavCab, gavCorpo);
  const aviso = el("div", { class: "st-aviso", role: "status" });
  document.body.append(setaAnt, setaProx, veu, gaveta, aviso);

  if (base.metodologia) Lab.rodapePagina(base.metodologia, { linkAutor: { href: PORTFOLIO, texto: "Página do autor ↗" } });

  // ---------------------------------------------------------------- cartões
  function montarCartao(c, k) {
    const s = el("section", { class: "st-cartao", id: c.id, role: "group", "aria-roledescription": "cartão", "aria-label": `${k + 1} de ${C.length}` });
    const frase = (tag) => comNumeros(tag, "st-frase", c.frase), sub = () => (c.subtitulo ? comNumeros("p", "st-sub", c.subtitulo) : null);
    if (c.tipo === "capa") {
      s.append(el("div", { class: "st-cheio st-capa" }, frase("h1"), sub(),
        c.rodape ? el("p", { class: "st-meta", text: c.rodape }) : null,
        el("p", { class: "st-dica-inicio" }, modo === "apresentacao" ? "Use as setas do teclado para avançar" : "Toque à direita ou deslize para começar", el("b", { text: "›" }))));
    } else if (c.tipo === "respiro") {
      s.append(el("div", { class: "st-cheio st-respiro" }, frase("h2"), sub()));
    } else if (c.tipo === "fecho") {
      s.append(el("div", { class: "st-cheio st-fecho" }, frase("h2"), sub(),
        el("div", { class: "acoes" },
          el("button", { type: "button", class: "st-botao forte", text: "↗ Compartilhar", onclick: () => compartilhar() }),
          el("a", { class: "st-botao", href: ANALISE, target: "_blank", rel: "noopener", text: META.analise_rotulo }),
          el("button", { type: "button", class: "st-botao", text: "↺ Recomeçar", onclick: () => irPara(0) })),
        el("footer", { id: "rodape" })));
    } else {
      const texto = el("div", { class: "st-texto" });
      if (c.tipo === "frase-numero") { s.classList.add("st-fn"); texto.append(el("div", { class: "st-numero", text: c.numero })); }
      texto.append(frase("h2"));
      if (c.subtitulo) texto.append(sub());
      s.append(texto);
    }
    // toque: terço esquerdo volta, o resto avança (fora de botões, links e do fecho)
    s.addEventListener("click", (ev) => {
      if (ev.target.closest("button, a, select, summary, details, .st-fecho")) return;
      const r = s.getBoundingClientRect();
      ev.clientX - r.left < r.width * 0.3 ? irPara(est.i - 1) : irPara(est.i + 1);
    });
    return s;
  }

  /** Altura da zona de texto = a do maior texto entre os cartões com gráfico (o layout não pula entre cartões). */
  function medirTexto() {
    if (modo === "apresentacao") return;
    let h = 0;
    for (const t of trilho.querySelectorAll(".st-cartao:not(.st-fn) .st-texto")) {
      t.style.height = "auto";
      h = Math.max(h, t.offsetHeight);
      t.style.height = "";
    }
    const lim = raiz.clientHeight * 0.4;
    raiz.style.setProperty("--texto-h", `${Math.round(Math.min(Math.max(h + 6, 120), lim))}px`);
  }

  // ---------------------------------------------------------------- navegação
  function irPara(k, suave = true) {
    k = Math.max(0, Math.min(C.length - 1, k));
    const longe = Math.abs(k - est.i) > 1;
    trilho.scrollTo({ left: k * trilho.clientWidth, behavior: suave && !longe && !Lab.semMovimento() ? "smooth" : "auto" });
    if (!suave || longe) ativar(k);
  }
  let quadro = null;
  trilho.addEventListener("scroll", () => {
    if (quadro) return;
    quadro = requestAnimationFrame(() => { quadro = null; const k = Math.round(trilho.scrollLeft / trilho.clientWidth); if (k !== est.i) ativar(k); });
  }, { passive: true });

  function ativar(k) {
    const c = C[k];
    est.i = k;
    const cap = CAPS[capDe(c)], pos = cap.cartoes.indexOf(c.id);
    prog.replaceChildren(...cap.cartoes.map((_, j) => el("i", { class: j <= pos ? "feito" : null })));
    btnCap.textContent = rotCap(c);
    cont.textContent = `${k + 1}/${C.length}`;
    history.replaceState(null, "", `${location.pathname}${location.search}#${c.id}`);
    setaAnt.disabled = k === 0;
    setaProx.disabled = k === C.length - 1;
    for (const [j, s] of slides.entries()) s.setAttribute("aria-hidden", String(j !== k));
    anuncio.textContent = `${rotCap(c)}. ${semMarcas(c.numero ? `${c.numero} ${c.frase}` : c.frase)}`;
    const p = palcoDe(k);
    bComo.disabled = !p && !c.como_ler;
    bNotas.disabled = !c.nota && !c.glossario.length && !(base.metodologia?.limitacoes || []).length;
    atualizarPalco(c, p);
    if (gaveta.classList.contains("aberta") && gavAtual !== "capitulos") abrirGaveta(gavAtual);
  }

  // ---------------------------------------------------------------- palco: estado, Explorar
  /** Estado do palco de um cartão: o do roteiro com as escolhas do Explorar; esmaecido = último estado do mesmo
   *  gráfico num cartão anterior. */
  function palcoDe(k) {
    const c = C[k], p = c.palco;
    if (!p) return null;
    if (p.esmaecido) {
      for (let j = k - 1; j >= 0; j--) { const q = C[j].palco; if (q && !q.esmaecido && q.grafico === p.grafico) return { ...palcoDe(j), esmaecido: true }; }
      return null;
    }
    const cfg = { ...p }, ex = c.explorar, op = opcaoDe(c);
    if (ex?.modos) cfg.modo = est.modo[c.id] ?? cfg.modo ?? ex.modo_inicial;
    if (op) cfg[ex.tipo] = op;
    return cfg;
  }

  function atualizarPalco(c, cfg) {
    // o card de um município aberto num cartão não segue para o próximo
    const noAnt = est.desenhado?.no, alvoSel = noAnt?.dataset?.escopo ? noAnt : noAnt?.querySelector?.("[data-escopo]");
    if (alvoSel && Lab.selecaoDe(alvoSel)) Lab.selecionar("", alvoSel);
    palcoArea.classList.toggle("oculto", !cfg);
    palcoArea.classList.toggle("esmaecido", !!cfg?.esmaecido);
    btnExplorar.hidden = !c.explorar || !!cfg?.esmaecido;
    btnVoltar.hidden = true;
    montarChips(c);
    if (!cfg) return;
    desenhar(cfg);
  }

  const chipsAbertos = (c) => est.chipsAbertos[c.id] ?? c.tipo === "explore";
  function montarChips(c) {
    const ex = c.explorar, aberto = !!ex && chipsAbertos(c) && !c.palco?.esmaecido;
    btnExplorar.setAttribute("aria-expanded", String(aberto));
    btnExplorar.textContent = aberto ? "✕ Explorar" : "⇄ Explorar";
    chips.hidden = !aberto;
    if (!aberto) { chips.replaceChildren(); return; }
    const partes = [];
    if (ex.modos) {
      const atual = est.modo[c.id] ?? c.palco.modo ?? ex.modo_inicial;
      partes.push(...ex.modos.map((m) => el("button", { type: "button", "aria-pressed": String(m === atual), text: m === "mapa" ? "Mapa" : "Bolhas (votos)",
        onclick: () => { est.modo[c.id] = m; aplicarOpcao(c); } })));
    }
    const atual = opcaoDe(c), escolher = (v) => { est.opcao[c.id] = v; aplicarOpcao(c); };
    if (ex.tipo === "grupo") {
      partes.push(...ex.opcoes.map(([v, r]) => el("button", { type: "button", "aria-pressed": String(v === atual), text: r, onclick: () => escolher(v) })));
    } else if (ex.tipo) {
      const rotulo = ex.tipo === "territorio" ? "Território" : "Município";
      const sel = el("select", { "aria-label": rotulo, onchange: (ev) => escolher(ev.target.value) },
        ...ex.opcoes.map(([v, r]) => { const o = el("option", { value: v, text: r }); o.selected = v === atual; return o; }));
      partes.push(el("span", { class: "nota", text: `${rotulo}:` }), sel);
    }
    chips.replaceChildren(...partes);
  }

  /** Troca no Explorar: nos cartões Explore a frase acompanha (frases prontas do Python); a troca mapa ⇄ bolhas só
   *  muda a representação (a frase continua valendo). */
  function aplicarOpcao(c) {
    const k = C.indexOf(c), s = slides[k], op = opcaoDe(c);
    if (c.frases && op) {
      preencher(s.querySelector(".st-frase"), c.frases[op].frase);
      const sub = s.querySelector(".st-sub");
      if (sub) preencher(sub, c.frases[op].subtitulo);
    }
    montarChips(c);
    desenhar(palcoDe(k));
  }

  // ---------------------------------------------------------------- palco: desenho
  const chaveGrafico = (cfg) => (cfg.grafico === "mapa" ? `mapa:${cfg.nivel || "municipio"}` : cfg.grafico);
  const LEITURA = { votos: "Toque numa barra para ver o valor.", fluxo: "Toque numa faixa para ver quantos municípios.",
    mapa: "Toque num município para ver os números · + − ⟲ ou pinça para ampliar.", territorio: "Toque num município do território · + − ⟲ para ampliar.",
    municipio: "Toque noutro município do mapa para escolhê-lo." };

  function desenhar(cfg, instantaneo = false) {
    const W = palco.clientWidth, H = palco.clientHeight;
    if (!W || !H) return;
    const chave = chaveGrafico(cfg), anterior = est.desenhado, mesmo = anterior && anterior.chave === chave && anterior.no.isConnected;
    const ehMapa = MAPAS.has(cfg.grafico);
    let no;
    if (mesmo) no = anterior.no;
    else {
      if (anterior?.no) d3.select(anterior.no).transition().duration(instantaneo ? 0 : dur() / 2).style("opacity", 0).remove();
      no = (ehMapa ? d3.select(palco).append("div").attr("class", "st-palco-no") : d3.select(palco).append("svg").attr("role", "img")).style("opacity", 0).node();
      d3.select(no).transition().delay(instantaneo ? 0 : dur() / 3).duration(instantaneo ? 0 : dur() / 2).style("opacity", 1);
    }
    if (!ehMapa) d3.select(no).attr("viewBox", `0 0 ${W} ${H}`);
    const t = instantaneo ? 0 : dur();
    leitura.replaceChildren(LEITURA[cfg.grafico] || "");
    const desenho = { votos: palcoVotos, mapa: palcoMapa, fluxo: palcoFluxo, territorio: palcoTerritorio, municipio: palcoMunicipio }[cfg.grafico](d3.select(no), cfg, W, H, t, mesmo ? anterior : null);
    legenda.replaceChildren(desenho.legenda.length ? Lab.legendaCategorias(desenho.legenda, ...(desenho.extras || [])) : "");
    if (!ehMapa) d3.select(no).attr("aria-label", desenho.aria);
    est.desenhado = { cfg, chave, no, api: desenho.api || null, tabela: desenho.tabela };
    const H2 = palco.clientHeight;
    if (Math.abs(H2 - H) > 3 && !desenhar.repetindo) {
      desenhar.repetindo = true;
      requestAnimationFrame(() => { if (!ehMapa) d3.select(no).attr("viewBox", `0 0 ${W} ${H2}`);
        ({ votos: palcoVotos, mapa: palcoMapa, fluxo: palcoFluxo, territorio: palcoTerritorio, municipio: palcoMunicipio })[cfg.grafico](d3.select(no), cfg, W, H2, 0, est.desenhado);
        desenhar.repetindo = false; });
    }
  }

  const mostrar = (titulo, texto) => leitura.replaceChildren(el("b", { text: titulo }), `: ${texto}`);
  const legendaGrupos = (presentes) => G.filter((g) => presentes.has(g)).map((g) => [corG(g), NOME[g]]);

  /** Barras horizontais por grupo (% dos votos válidos no estado), com transição entre cargos. */
  function palcoVotos(svg, cfg, W, H, t) {
    const chave = `${cfg.ano}|${cfg.cargo}`, v = D.votos[chave], eleitos = D.eleitos[chave] || {};
    const max = Math.max(50, d3.max(G, (g) => v[g] ?? 0));
    // nome em cima de cada barra: a barra usa a largura toda (celular)
    const xL = 0, xW = W - 60, y0 = 30, alt = Math.min(78, (H - y0) / G.length), hB = Math.min(28, alt * 0.42);
    svg.selectAll("text.titulo").data([`${CARGO[cfg.cargo]} · ${cfg.ano} · % dos votos válidos`]).join("text")
      .attr("class", "rot-linha titulo").attr("x", 0).attr("y", 14).text((d) => d);
    const op = (g) => (!cfg.destaque || cfg.destaque === g ? 1 : 0.35);
    const lin = svg.selectAll("g.grupo").data(G, (g) => g).join((e) => {
      const n = e.append("g").attr("class", "grupo").attr("data-toque", "");
      n.append("text").attr("class", "rot-linha nome");
      n.append("rect").attr("class", "barra").attr("rx", 3).attr("width", 0);
      n.append("text").attr("class", "valor");
      return n;
    }).attr("transform", (g, i) => `translate(0,${y0 + i * alt})`)
      .on("click", (ev, g) => { ev.stopPropagation(); mostrar(NOME[g], v[g] == null ? "sem candidatos" : `${fmt(v[g])} dos votos válidos${eleitos[g] != null ? ` · ${fmtN(eleitos[g])} eleitos` : ""}`); });
    lin.select("text.nome").attr("x", 0).attr("y", 14).text((g) => NOME[g]);
    lin.select("rect.barra").attr("x", xL).attr("y", 20).attr("height", hB).attr("fill", (g) => corG(g))
      .transition().duration(t).attr("width", (g) => ((v[g] ?? 0) / max) * xW).attr("opacity", op);
    lin.select("text.valor").attr("y", 20 + hB / 2 + 5).text((g) => (v[g] == null ? "sem candidatos" : fmt(v[g])))
      .transition().duration(t).attr("x", (g) => xL + ((v[g] ?? 0) / max) * xW + 6).attr("opacity", op);
    return { aria: `${CARGO[cfg.cargo]} ${cfg.ano}: ${G.map((g) => `${NOME[g]} ${v[g] == null ? "sem candidatos" : fmt(v[g])}`).join(", ")}`,
      legenda: [], tabela: [["Grupo", "% dos válidos", "Eleitos"], ...G.map((g) => [NOME[g], v[g] == null ? "—" : fmt(v[g]), eleitos[g] != null ? fmtN(eleitos[g]) : "—"])] };
  }

  // ---------- mapas: o Lab.mapa do design system em modo compacto (L0006) — câmera, zoom, card, referência e fundo
  const MAPA = D.mapa || {};
  const MAPAS = new Set(["mapa", "territorio", "municipio"]);
  const nomeUnidade = (nivel, id) => (nivel === "territorio" ? id : D.municipios[id]?.nome || id);
  const linhasMun = (id) => { const m = D.municipios[id];
    return [`${NOME[m.l26]} com ${fmt(m.i26)} (margem de ${Lab.fmtPP(m.mg26)})`, `2022: ${NOME[m.l22]}`,
      m.pref ? `Prefeito 2024: ${m.pref.nome} (${m.pref.partido})` : null, `Território: ${m.territorio}`]; };

  /** Câmera do cartão: a do roteiro; {foco: "escolha"} vai até o território ou município escolhido no Explore. */
  function cameraDe(cfg) {
    const c = cfg.camera || "estado";
    if (c === "estado" || !c.foco) return c;
    if (c.foco === "escolha" && cfg.grafico === "territorio")
      return { foco: Object.keys(D.municipios).filter((id) => D.municipios[id].territorio === cfg.territorio), contexto: c.contexto || 1.4 };
    if (c.foco === "escolha" && cfg.grafico === "municipio") return { foco: cfg.municipio, contexto: c.contexto || 6 };
    return c;
  }

  /** Cores, textos e tabela de cada estado do mapa (as contagens vêm prontas do Python). */
  function estadoMapa(cfg) {
    const M = D.municipios, T = D.territorios, g = cfg.grupo;
    if (cfg.nivel === "territorio") {
      return { preencher: (id) => corG(T[id].l26), opacidade: null, foco: null,
        dica: (id) => [`${NOME[T[id].l26]} com ${fmt(T[id].i26)} (margem de ${Lab.fmtPP(T[id].mg26)})`, `lidera em ${fmtN(T[id].nlid)} de ${fmtN(T[id].n)} municípios`],
        legenda: legendaGrupos(new Set(Object.values(T).map((x) => x.l26))), extras: [],
        tabela: [["Grupo", "Territórios em que é o mais votado"], ...G.filter((x) => CONT.territorio26[x]).map((x) => [NOME[x], fmtN(CONT.territorio26[x])])],
        aria: "Mapa dos Territórios de Desenvolvimento pelo grupo mais votado para deputado estadual em 2026." };
    }
    if (cfg.cor === "mudou") return { preencher: (id) => (M[id].l22 !== M[id].l26 ? corG(M[id].l26) : cinza()), opacidade: null, foco: null,
      dica: linhasMun, legenda: [...legendaGrupos(new Set(Object.keys(CONT.mudou26))), [cinza(), "sem troca"]], extras: [],
      tabela: [["Passou a liderar em 2026", "Municípios"], ...G.filter((x) => CONT.mudou26[x]).map((x) => [NOME[x], fmtN(CONT.mudou26[x])]), ["Total que mudou", fmtN(CONT.mudou)]],
      aria: `Mapa dos ${CONT.mudou} municípios que mudaram de grupo mais votado para deputado estadual entre 2022 e 2026.` };
    if (cfg.cor === "perdeu") { const P = CONT.perdeu[g] || {};
      return { preencher: (id) => (M[id].l22 === g ? corG(M[id].l26) : cinza()), opacidade: (id) => (M[id].l22 === g && M[id].l26 === g ? 0.4 : 1),
        foco: (id) => M[id].l22 === g && M[id].l26 === g, dica: linhasMun,
        legenda: [...legendaGrupos(new Set(Object.keys(P))), [cinza(), `não liderado por ${NOME[g]} em 2022`]],
        extras: [el("span", { class: "chave", text: `com contorno, em cor clara: ${NOME[g]} manteve a liderança (${fmtN(CONT.manteve[g])})` })],
        tabela: [[`Onde ${NOME[g]} perdeu, passou a liderar`, "Municípios"], ...G.filter((x) => P[x]).map((x) => [NOME[x], fmtN(P[x])]), [`${NOME[g]} manteve`, fmtN(CONT.manteve[g])]],
        aria: `Mapa dos municípios em que ${NOME[g]} deixou de ser o mais votado entre 2022 e 2026.` }; }
    const eleito = cfg.cor === "eleito", fonte = eleito ? CONT.prefeito24 : CONT.lider26;
    return { preencher: (id) => (eleito ? (M[id].pref ? corG(M[id].pref.grupo) : cinza()) : corG(M[id].l26)), opacidade: null, foco: null,
      dica: eleito ? (id) => [M[id].pref ? `Prefeito 2024: ${M[id].pref.nome} (${M[id].pref.partido} · ${NOME[M[id].pref.grupo]})` : "sem prefeito na base", `Deputado estadual 2026: ${NOME[M[id].l26]}`] : linhasMun,
      legenda: legendaGrupos(new Set(G.filter((x) => fonte[x]))), extras: [],
      tabela: [["Grupo", eleito ? "Prefeitos eleitos em 2024" : "Municípios em que é o mais votado (2026)"], ...G.filter((x) => fonte[x]).map((x) => [NOME[x], fmtN(fonte[x])])],
      aria: eleito ? "Mapa dos municípios pelo grupo do prefeito eleito em 2024." : "Mapa dos municípios pelo grupo mais votado para deputado estadual em 2026." };
  }

  /** Cria o Lab.mapa num contêiner do palco ou, se já existe (mesmo gráfico), muda o estado: cores, forma, câmera. */
  function mapaNoPalco(no, anterior, { nivel = "municipio", W, H, cfg, estado, aoClicar = null, t }) {
    const forma = cfg.modo === "bolhas" ? "bolhas" : "mapa";
    const animar = t > 0;
    const parcial = { preencher: estado.preencher, dica: estado.dica, opacidade: estado.opacidade, foco: estado.foco,
      escalaBolhas: cfg.escala_bolhas === "fiel" ? "fiel" : "ds" };
    if (anterior?.api) {
      const api = anterior.api;
      api.atualizar(parcial, { animar });
      api.forma(forma, animar);
      api.camera(cameraDe(cfg), animar);
      no.querySelector("svg.mapa")?.setAttribute("aria-label", estado.aria);
      return api;
    }
    no.__forma = forma;
    return Lab.mapa(no, { contornos: D.contornos[nivel], compacto: true, dimensoes: [W, H], nome: (id) => nomeUnidade(nivel, id), ...parcial,
      rotuloAria: estado.aria, referencia: MAPA.referencia, rotulos: MAPA.rotulos, fundo: MAPA.fundo || null, camera: cameraDe(cfg),
      tamanho: (id) => (nivel === "territorio" ? D.territorios[id]?.validos : D.municipios[id]?.validos) || 0, rotuloTamanho: "votos válidos para deputado estadual",
      forma: { obter: () => no.__forma, definir: (v) => { no.__forma = v; } }, aoClicar });
  }

  function palcoMapa(sel, cfg, W, H, t, anterior) {
    const no = sel.node(), estado = estadoMapa(cfg);
    no.dataset.escopo = `st-${chaveGrafico(cfg)}`;
    const api = mapaNoPalco(no, anterior, { nivel: cfg.nivel || "municipio", W, H, cfg, estado, t });
    if (cfg.modo === "bolhas") leitura.replaceChildren("Toque numa bolha. A área de cada círculo é proporcional aos votos válidos do município.");
    return { api, aria: estado.aria + (cfg.modo === "bolhas" ? " Representação em bolhas: área proporcional aos votos válidos." : ""),
      legenda: estado.legenda, extras: estado.extras, tabela: estado.tabela };
  }

  /** Barras 2026 (cheia) × 2022 (fina) de cada grupo, num SVG próprio. */
  function barras2anos(svg, ret, p26, p22, t) {
    const xL = Math.min(132, ret.w * 0.36), xW = ret.w - xL - 52, alt = Math.min(36, ret.h / G.length), max = 70;
    const lin = svg.selectAll("g.b2").data(G, (g) => g).join((e) => {
      const n = e.append("g").attr("class", "b2");
      n.append("text").attr("class", "rot-linha nome");
      n.append("rect").attr("class", "a26").attr("rx", 2).attr("width", 0);
      n.append("rect").attr("class", "a22").attr("width", 0).attr("opacity", 0.4);
      n.append("text").attr("class", "valor");
      return n;
    }).attr("transform", (g, i) => `translate(${ret.x},${ret.y + i * alt})`);
    const w = (v) => (Math.min(v ?? 0, max) / max) * xW;
    lin.select("text.nome").attr("y", 11).text((g) => NOME[g]);
    lin.select("rect.a26").attr("x", xL).attr("y", 0).attr("height", 12).attr("fill", (g) => corG(g)).transition().duration(t).attr("width", (g) => w(p26[g]));
    lin.select("rect.a22").attr("x", xL).attr("y", 14).attr("height", 4).attr("fill", (g) => corG(g)).transition().duration(t).attr("width", (g) => w(p22[g]));
    lin.select("text.valor").attr("y", 11).text((g) => (p26[g] == null ? "—" : fmt(p26[g]))).transition().duration(t).attr("x", (g) => xL + w(p26[g]) + 5);
  }
  const tabela2anos = (p26, p22) => [["Grupo", "2026", "2022"], ...G.map((g) => [NOME[g], p26[g] == null ? "—" : fmt(p26[g]), p22[g] == null ? "sem candidatos" : fmt(p22[g])])];
  const legenda2anos = () => [[Lab.token("cor-texto"), "barra cheia: 2026"], [Lab.token("cor-texto-suave"), "barra fina: 2022"]];

  /** Explore com mapa (no alto) e barras do escolhido (embaixo); a câmera vai até a escolha. */
  function palcoMapaEBarras(sel, cfg, W, H, t, anterior, { estado, p26, p22, aoClicar }) {
    const hMapa = Math.round(H * 0.56), hB = H - hMapa - 12;
    let topo = sel.select("div.st-mapa-topo"), svgB = sel.select("svg.st-barras");
    if (topo.empty()) {
      topo = sel.append("div").attr("class", "st-mapa-topo").style("position", "absolute").style("left", 0).style("right", 0).style("top", 0).style("height", `${hMapa}px`);
      svgB = sel.append("svg").attr("class", "st-barras").style("position", "absolute").style("left", 0).style("top", `${hMapa + 12}px`).attr("role", "img");
    }
    topo.style("height", `${hMapa}px`);
    svgB.style("top", `${hMapa + 12}px`).attr("width", W).attr("height", hB).attr("viewBox", `0 0 ${W} ${hB}`);
    topo.node().dataset.escopo = `st-${chaveGrafico(cfg)}`;
    const api = mapaNoPalco(topo.node(), anterior, { W, H: hMapa, cfg, estado, aoClicar, t });
    barras2anos(svgB, { x: 0, y: 0, w: W, h: hB }, p26, p22, t);
    return api;
  }

  function palcoTerritorio(sel, cfg, W, H, t, anterior) {
    const nome = cfg.territorio, T = D.territorios[nome], M = D.municipios;
    const dentro = (id) => M[id].territorio === nome;
    const estado = { preencher: (id) => (dentro(id) ? corG(M[id].l26) : cinza()), opacidade: null, foco: null, dica: linhasMun,
      aria: `${nome}: ${G.map((g) => `${NOME[g]} ${T.p26[g] == null ? "—" : fmt(T.p26[g])}`).join(", ")}.` };
    const api = palcoMapaEBarras(sel, cfg, W, H, t, anterior, { estado, p26: T.p26, p22: T.p22 });
    return { api, aria: estado.aria, legenda: [...legendaGrupos(new Set(Object.values(M).filter((m) => m.territorio === nome).map((m) => m.l26))), ...legenda2anos()],
      tabela: tabela2anos(T.p26, T.p22) };
  }

  function palcoMunicipio(sel, cfg, W, H, t, anterior) {
    const id0 = cfg.municipio, m = D.municipios[id0], c = C[est.i];
    const estado = { preencher: (id) => (id === id0 ? corG(D.municipios[id].l26) : cinza()), opacidade: null, foco: (id) => id === id0, dica: linhasMun,
      aria: `${m.nome}: ${G.map((g) => `${NOME[g]} ${m.p26[g] == null ? "—" : fmt(m.p26[g])}`).join(", ")}.` };
    // tocar noutro município do mapa troca a escolha (a frase do cartão acompanha)
    const api = palcoMapaEBarras(sel, cfg, W, H, t, anterior, { estado, p26: m.p26, p22: m.p22,
      aoClicar: (id) => { if (id !== opcaoDe(c)) { est.opcao[c.id] = id; aplicarOpcao(c); } } });
    return { api, aria: estado.aria, legenda: [[corG(m.l26), `${m.nome}: ${NOME[m.l26]}`], ...legenda2anos()], tabela: tabela2anos(m.p26, m.p22) };
  }

  /** Sankey vertical em fases: blocos de 2022 → blocos de 2026 → faixas (municípios por grupo mais votado). */
  function palcoFluxo(svg, cfg, W, H, t) {
    const F = D.fluxo, fase = String(cfg.fase || "faixas");
    const ordem = G.filter((g) => F.nos22[g] || F.nos26[g]);
    const yT = 34, hN = 12, yB = Math.max(yT + 140, H - 46), gap = 6;
    const lado = (nos) => { const vis = ordem.filter((g) => nos[g]); const esc = (W - gap * (vis.length - 1)) / F.total; let x = 0; const p = {};
      for (const g of vis) { p[g] = { x, w: nos[g] * esc }; x += p[g].w + gap; } return { p, esc }; };
    const L22 = lado(F.nos22), L26 = lado(F.nos26), esc = L22.esc;
    const cT = Object.fromEntries(Object.entries(L22.p).map(([g, v]) => [g, v.x])), cB = Object.fromEntries(Object.entries(L26.p).map(([g, v]) => [g, v.x]));
    const lig = [...F.ligacoes].sort((a, b) => G.indexOf(a.de) - G.indexOf(b.de) || G.indexOf(a.para) - G.indexOf(b.para))
      .map((l) => { const w = l.n * esc, o = { ...l, w, x0: cT[l.de], x1: cB[l.para] }; cT[l.de] += w; cB[l.para] += w; return o; });
    const ym = (yT + hN + yB) / 2;
    const caminho = (l) => `M${l.x0},${yT + hN} C${l.x0},${ym} ${l.x1},${ym} ${l.x1},${yB} L${l.x1 + l.w},${yB} C${l.x1 + l.w},${ym} ${l.x0 + l.w},${ym} ${l.x0 + l.w},${yT + hN} Z`;
    const foco = new Set([].concat(cfg.destaque || []));
    const chaveL = (l) => `${l.de}>${l.para}`.toLowerCase();
    const opac = (l) => (fase !== "faixas" ? 0 : foco.size ? (foco.has(chaveL(l)) ? 0.88 : 0.12) : 0.45);
    svg.selectAll("text.eixo").data([["2022", 14], ["2026", H - 4]]).join("text").attr("class", "rot-linha eixo").attr("x", 0).attr("y", (d) => d[1]).text((d) => d[0])
      .transition().duration(t).attr("opacity", (d) => (d[0] === "2026" && fase === "2022" ? 0 : 1));
    svg.selectAll("path.lig").data(lig, chaveL).join((e) => e.append("path").attr("class", "lig").attr("data-toque", "").attr("opacity", 0))
      .attr("d", caminho).attr("fill", (l) => corG(l.de))
      .on("click", (ev, l) => { ev.stopPropagation(); if (fase === "faixas") mostrar(`${NOME[l.de]} → ${NOME[l.para]}`, `${fmtN(l.n)} municípios`); })
      .transition().duration(t).attr("opacity", opac);
    const nos = [...Object.entries(L22.p).map(([g, v]) => ({ g, lado: "22", ...v, y: yT, n: F.nos22[g] })),
      ...Object.entries(L26.p).map(([g, v]) => ({ g, lado: "26", ...v, y: yB, n: F.nos26[g] }))];
    const visivel = (n) => (n.lado === "22" || fase !== "2022" ? 1 : 0);
    svg.selectAll("rect.no").data(nos, (n) => n.lado + n.g).join((e) => e.append("rect").attr("class", "no").attr("data-toque", "").attr("opacity", 0))
      .attr("x", (n) => n.x).attr("y", (n) => n.y).attr("width", (n) => Math.max(0, n.w)).attr("height", hN).attr("rx", 2).attr("fill", (n) => corG(n.g))
      .on("click", (ev, n) => { ev.stopPropagation(); mostrar(`${NOME[n.g]} em 20${n.lado}`, `mais votado em ${fmtN(n.n)} municípios`); })
      .transition().duration(t).attr("opacity", visivel);
    svg.selectAll("text.rot-no").data(nos.filter((n) => n.w >= 18), (n) => n.lado + n.g).join("text").attr("class", "rot-no")
      .attr("x", (n) => n.x).attr("y", (n) => (n.lado === "22" ? yT - 6 : yB + hN + 14))
      .text((n) => (n.w >= 92 ? `${NOME[n.g]} ${n.n}` : String(n.n)))
      .transition().duration(t).attr("opacity", visivel);
    const presentes = new Set(nos.map((n) => n.g));
    return { aria: `Grupo mais votado para deputado estadual em cada município, 2022 e 2026: ` +
        lig.map((l) => `${NOME[l.de]} para ${NOME[l.para]}, ${l.n} municípios`).join("; "),
      legenda: legendaGrupos(presentes),
      tabela: [["2022 → 2026", "Municípios"], ...lig.map((l) => [`${NOME[l.de]} → ${NOME[l.para]}`, fmtN(l.n)])] };
  }

  // gesto no palco: deslizar para o lado navega; toque fica com o gráfico
  let ini = null;
  palcoArea.addEventListener("pointerdown", (ev) => {
    // mapa ampliado: o dedo é do mapa (arrastar); no enquadramento do cartão, deslizar passa o cartão (L0006)
    const ampliado = ev.target.closest("svg.mapa") && d3.zoomTransform(ev.target.closest("svg.mapa")).k > 1.01;
    if (!ev.target.closest(".st-chips, .st-ferramentas, .mapa-controles, .painel-sel, .mapa-editar") && !ampliado) ini = { x: ev.clientX, y: ev.clientY };
  });
  palcoArea.addEventListener("pointerup", (ev) => {
    if (!ini) return;
    const dx = ev.clientX - ini.x, dy = ev.clientY - ini.y;
    ini = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) irPara(est.i + (dx < 0 ? 1 : -1));
  });

  // ---------------------------------------------------------------- gaveta
  let gavAtual = null, gavOrigem = null;
  const secao = (titulo, ...filhos) => [el("h3", { text: titulo }), ...filhos];
  const COMO_PADRAO = {
    votos: "Cada barra é a parte dos votos válidos do estado que foi para o grupo. Os grupos estão sempre na mesma ordem e cor.",
    mapa: "Cada município tem a cor do grupo indicado no cartão. Toque num município para ver os números. No modo bolhas, a área é proporcional aos votos válidos e a posição é aproximada.",
    fluxo: "Em cima, o grupo mais votado em cada município em 2022; embaixo, em 2026. A largura é o número de municípios.",
    territorio: "O mapa destaca os municípios do território escolhido; as barras mostram cada grupo no território em 2026 (cheia) e 2022 (fina).",
    municipio: "O mapa destaca o município escolhido; as barras mostram cada grupo em 2026 (cheia) e 2022 (fina). Toque noutro município do mapa para trocá-lo.",
  };

  function abrirGaveta(qual) {
    const c = C[est.i], p = palcoDe(est.i);
    gavAtual = qual;
    if (!gaveta.classList.contains("aberta")) gavOrigem = document.activeElement;
    let titulo, corpo = [];
    if (qual === "como") {
      titulo = "Como ler";
      corpo.push(comNumeros("p", "", c.como_ler || (p ? COMO_PADRAO[p.grafico] : "")));
      if (p && est.desenhado) {
        const [cab, ...linhas] = est.desenhado.tabela;
        corpo.push(...secao("Os dados do gráfico", el("div", { class: "rolagem" }, Lab.tabela(cab, linhas))));
      }
      corpo.push(...secao(META.rotulo_universo, comNumeros("p", "", META.universo)));
    } else if (qual === "notas") {
      titulo = "Notas";
      if (c.nota) corpo.push(comNumeros("p", "", c.nota));
      if (c.glossario.length) corpo.push(...secao("Glossário", el("dl", {}, ...c.glossario.flatMap((g) => [el("dt", {}, el("b", { text: g.termo.replaceAll("-", " ") })), el("dd", { text: g.definicao })]))));
      const lim = base.metodologia?.limitacoes || [];
      if (lim.length) corpo.push(...secao("Para ler com cuidado", el("ul", {}, ...lim.map((x) => el("li", { text: x })))));
    } else if (qual === "fontes") {
      titulo = "Fontes";
      corpo.push(el("p", { text: META.fonte }),
        el("p", { class: "nota", text: `${META.nota_fontes} Roteiro validado em ${new Date(`${META.roteiro.validado_em}T12:00`).toLocaleDateString("pt-BR")}. Mapas: malha do IBGE (2022); fundo © OpenFreeMap · © colaboradores do OpenStreetMap.` }),
        el("p", {}, el("button", { type: "button", class: "st-botao forte", text: "Fontes de Dados, Metodologia e Códigos →", onclick: () => { fecharGaveta(); irPara(C.length - 1); } })),
        el("p", {}, el("a", { href: ANALISE, target: "_blank", rel: "noopener", text: `Análise completa: ${META.analise_rotulo} ↗` })));
    } else {
      titulo = "Capítulos";
      const atual = capDe(c);
      corpo.push(el("ul", { class: "indice" }, ...CAPS.map((cap, k) => el("li", {}, el("button", { type: "button", "aria-current": String(k === atual),
        onclick: () => { fecharGaveta(); irPara(C.findIndex((x) => x.id === cap.cartoes[0])); } },
        el("span", { class: "n", text: k === 0 ? "◦" : String(k) }), el("span", { text: k === 0 ? "Capa" : cap.titulo }))))));
    }
    gavTitulo.textContent = titulo;
    gavCorpo.replaceChildren(...corpo);
    gaveta.hidden = false;
    requestAnimationFrame(() => { gaveta.classList.add("aberta"); veu.classList.add("aberto"); });
    gavFechar.focus({ preventScroll: true });
  }
  function fecharGaveta() {
    if (gaveta.hidden) return;
    gaveta.classList.remove("aberta");
    veu.classList.remove("aberto");
    gaveta.style.transform = "";
    setTimeout(() => { if (!gaveta.classList.contains("aberta")) gaveta.hidden = true; }, 320);
    gavOrigem?.focus?.({ preventScroll: true });
  }
  // arrastar a gaveta para baixo fecha
  let arrasto = null;
  gavCab.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) return; arrasto = ev.clientY; gaveta.style.transition = "none"; gavCab.setPointerCapture(ev.pointerId); });
  gavCab.addEventListener("pointermove", (ev) => { if (arrasto !== null) gaveta.style.transform = `translateY(${Math.max(0, ev.clientY - arrasto)}px)`; });
  gavCab.addEventListener("pointerup", (ev) => {
    if (arrasto === null) return;
    const dy = ev.clientY - arrasto;
    arrasto = null;
    gaveta.style.transition = "";
    if (dy > 70) fecharGaveta(); else gaveta.style.transform = "";
  });

  // ---------------------------------------------------------------- compartilhar
  async function compartilhar() {
    const c = C[est.i], url = `${location.href.split("#")[0]}#${c.id}`;
    const dados = { title: META.titulo, text: semMarcas(c.tipo === "capa" || c.tipo === "fecho" ? META.pergunta : `${c.numero ? `${c.numero} ` : ""}${c.frase}`), url };
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share(dados); } catch (e) { /* cancelado */ } return; }
    try { await navigator.clipboard.writeText(url); avisar("Link deste cartão copiado"); } catch (e) { window.prompt("Copie o link deste cartão:", url); }
  }
  let tAviso = null;
  function avisar(txt) { aviso.textContent = txt; aviso.classList.add("visivel"); clearTimeout(tAviso); tAviso = setTimeout(() => aviso.classList.remove("visivel"), 2200); }

  // ---------------------------------------------------------------- teclado e tamanho
  document.addEventListener("keydown", (ev) => {
    if (!gaveta.hidden && gaveta.classList.contains("aberta")) { if (ev.key === "Escape") fecharGaveta(); return; }
    if (ev.target.closest?.("select, input, textarea, summary")) return;
    if (["ArrowRight", "PageDown", " "].includes(ev.key)) { ev.preventDefault(); irPara(est.i + 1); }
    else if (["ArrowLeft", "PageUp"].includes(ev.key)) { ev.preventDefault(); irPara(est.i - 1); }
    else if (ev.key === "Home") irPara(0);
    else if (ev.key === "End") irPara(C.length - 1);
  });
  let tTam = null;
  window.addEventListener("resize", () => {
    clearTimeout(tTam);
    tTam = setTimeout(() => {
      medirTexto();
      trilho.scrollTo({ left: est.i * trilho.clientWidth, behavior: "auto" });
      if (est.desenhado) { est.desenhado.no.remove(); est.desenhado = null; }
      const p = palcoDe(est.i);
      if (p) desenhar(p, true);
    }, 150);
  });

  // ---------------------------------------------------------------- início (cartão do endereço, se houver)
  medirTexto();
  const doEndereco = C.findIndex((c) => `#${c.id}` === location.hash);
  const k0 = Math.max(0, doEndereco);
  requestAnimationFrame(() => { trilho.scrollTo({ left: k0 * trilho.clientWidth, behavior: "auto" }); ativar(k0); });
})().catch((erro) => {
  document.getElementById("story").textContent = `Não foi possível carregar o story: ${erro}. Use um navegador atualizado.`;
});
