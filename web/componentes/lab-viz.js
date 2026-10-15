/* lab-viz.js — renderizador da Visualização declarativa (L0007, L0008, L0011–L0013).
 *
 * Recebe o PLANO compilado em Python (labdados.viz.compilar, a partir do viz.yaml) e desenha a peça: moldura (chapéu,
 * título com controles, subtítulo, abas do companheiro, palco, N, legenda, barra fixa com folhas), cartão de detalhe,
 * legenda interativa, anotações, imagem PNG do estado do momento, CSV e código para embutir. Os gráficos vêm de
 * ADAPTADORES por componente do registro do DS (design/padrao/componentes.yaml): Lab.viz.adaptadores.<id>.
 *
 * Só desenha (L0002): todo número e todo texto com número chega pronto do Python, por estado ({e.…} no plano).
 * Nada de cor ou tamanho fixo: tokens do DS (Lab.token) e cores do produto declaradas no plano (estilo.tokens).
 * Comportamentos decididos na bancada de formatos (docs/bancada.html, fase 0) e registrados na L0013. */
(function () {
  "use strict";
  const { el } = Lab;
  const tok = (n) => Lab.token(n);
  const FORMATOS = { retrato: { w: 360, h: 450, rot: "Retrato 4:5" }, quadrado: { w: 400, h: 400, rot: "Quadrado 1:1" }, paisagem: { w: 640, h: 360, rot: "Paisagem 16:9" } };
  const ANOT_MAX = { retrato: 1, quadrado: 2, paisagem: 3 };       // prioridade máxima visível por formato (L0008)
  const ROTULOS_MAX = { retrato: 3, quadrado: 3, paisagem: 5 };    // rótulos diretos de pontos
  const LIMITE_TEXTO = { retrato: 110, quadrado: 140, paisagem: 200 };   // acima disso, “…” que abre no clique (Q-036)
  const ALTURA_GRAFICO = { retrato: 0.95, quadrado: 0.7, paisagem: 0.5 }; // altura do palco pela largura (altura livre)
  const TAM_IMG = { retrato: [360, 450], quadrado: [400, 400], paisagem: [640, 360] };
  const TETO_IMG = { retrato: 16 / 9, quadrado: 5 / 4, paisagem: 3 / 4 };  // a imagem cresce até 9:16, 4:5, 4:3
  const ESCALA_IMG = 3;
  const formatoFluido = (w) => (w < 480 ? "retrato" : w < 720 ? "quadrado" : "paisagem");
  const formatoQuadro = (w, h) => { const r = w / h; return r < 0.9 ? "retrato" : r <= 1.25 ? "quadrado" : "paisagem"; };
  // ⟦…⟧ = negrito; ⟪…⟫ = frase-chave sublinhada (ex.: "mais que a média do Brasil"); na imagem, só o texto
  const negrito = (t) => String(t).split(/(⟦[^⟧]*⟧|⟪[^⟫]*⟫)/).filter((p) => p !== "")
    .map((p) => (p.startsWith("⟦") ? el("b", { text: p.slice(1, -1) }) : p.startsWith("⟪") ? el("span", { class: "sublinhado", text: p.slice(1, -1) }) : p));
  const semMarcas = (t) => String(t).replace(/[⟦⟧⟪⟫]/g, "");
  const curto = (n, k = 24) => (n.length > k ? `${n.slice(0, k - 1)}…` : n);
  const caixaRelativa = (no, palco) => { const r = no.getBoundingClientRect(), p = palco.getBoundingClientRect(); return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }; };

  // ------------------------------------------------------------------ marcadores do plano
  /** "{e.caminho}" sozinho devolve o valor (número, objeto, null); dentro de um texto, é substituído. "{c.id}" fica
   *  para quem monta o título (controle no lugar). Um trecho "$id" no caminho é o valor atual do controle `id`
   *  ({e.explore.$variavel.dados}): dados e frases de um cartão variam com o seletor, todos calculados no Python. */
  const pegar = (obj, caminho) => caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k.startsWith("$") ? obj?.$?.[k.slice(1)] : k]), obj);
  function resolver(v, e) {
    if (typeof v !== "string") return Array.isArray(v) ? v.map((x) => resolver(x, e)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolver(x, e)])) : v;
    const so = v.match(/^\{e\.([\w.$]+)\}$/);
    if (so) return pegar(e, so[1]);
    return v.replace(/\{e\.([\w.$]+)\}/g, (_, c) => { const x = pegar(e, c); return x == null ? "" : String(x); });
  }

  // ------------------------------------------------------------------ peça
  /** Monta a Visualização em `alvo`. opcoes: { host: "pagina" | "embed", carregarFatia(chave) → Promise<fatia> }. */
  function montar(alvo, P, opcoes = {}) {
    const host = opcoes.host || "pagina";
    const est = { aba: "principal", sel: null, legFixa: null, anotAberta: false, cam: null };
    for (const c of P.controles || []) est[c.id] = c.inicial;
    // estado inicial pelo endereço: #municipio=2211001&aba=mapa (um link reproduz a vista)
    try {
      const q = new URLSearchParams(location.hash.slice(1));
      for (const c of P.controles || []) if (q.has(c.id)) est[c.id] = q.get(c.id);
      if (q.get("aba") === "mapa") est.aba = "mapa";
      if (q.has("cartao")) est.cartao = q.get("cartao");
    } catch (erro) { /* mantém o padrão */ }
    const ctl = Object.fromEntries((P.controles || []).map((c) => [c.id, c]));
    const fatiador = (P.controles || []).find((c) => c.tipo === "busca" && P.fatias && c.campo === P.fatias.campo);
    let fatia = null, e = {}, linhas = [];
    const indice = P.fatias ? new Map(P.fatias.indice.map(([k, nome, uf]) => [k, { nome, uf, rotulo: uf ? `${nome} (${uf})` : nome }])) : null;

    let reuso = null;   // estado entre cartões: {componente, inst, palco} do cartão anterior (irCartao → desenharPalco)
    // ---------------------------------------------------------------- story (Q-066): cartões sobre o mesmo plano
    const story = Array.isArray(P.cartoes) && P.cartoes.length > 0;
    /** Condição do cartão, calculada no Python (textos da fatia); "!" inverte. */
    const condicao = (se) => { if (!se) return true; const v = Boolean(e[se.replace(/^!/, "")]); return se.startsWith("!") ? !v : v; };
    const cartoesVisiveis = () => (story ? P.cartoes.filter((k) => condicao(k.se)) : []);
    const cartaoAtual = () => { if (!story) return null; const ks = cartoesVisiveis(); return ks.find((k) => k.id === est.cartao) || ks[0]; };

    const lerFatia = (f) => {
      const L = (f.linhas || []).map((r) => Object.fromEntries((f.colunas || []).map((c, i) => [c, r[i]])));
      const esc = Object.fromEntries(Object.entries(f).filter(([, v]) => v === null || typeof v !== "object"));
      const ee = { ...esc, ...(f.textos || {}) };
      Object.defineProperty(ee, "$", { value: est, enumerable: false });   // marcadores com "$controle"
      return { linhas: L, e: ee };
    };
    async function irPara(chave) {
      const f = await opcoes.carregarFatia(chave);
      fatia = f; ({ linhas, e } = lerFatia(f));
      est.sel = null; est.legFixa = null; est.anotAberta = false; est.cam = null;
      // troca de recorte (ex.: outra cidade): o desenho velho esmaece e o novo surge, como na troca de cartão
      const atual = alvoRaiz.querySelector("article.viz");
      if (atual?._palco && host !== "embed") trocarCartao(atual, () => {}); else render();
    }
    function guardarEndereco() {
      const q = new URLSearchParams();
      if (fatiador) q.set(fatiador.id, est[fatiador.id]);
      if (est.aba === "mapa" && !story) q.set("aba", "mapa");
      if (story && est.cartao) q.set("cartao", est.cartao);
      try { history.replaceState(null, "", `${location.pathname}${location.search}#${q}`); } catch (erro) { /* sem âncora */ }
    }
    const enderecoAtual = (embed = false) => {
      const base = P.endereco || `${location.origin}${location.pathname}`;
      const q = new URLSearchParams();
      if (fatiador) q.set(fatiador.id, est[fatiador.id]);
      if (est.aba === "mapa" && !story) q.set("aba", "mapa");
      return `${base}${embed ? "?embed=1" : ""}#${q}`;
    };

    // ---------------------------------------------------------------- escalas
    const pontaCor = (p) => (p.cor.startsWith("#") ? p.cor : tok(p.cor));
    function escalaCor() {
      const c = P.escalas?.cor;
      if (!c) return { cores: [], cor: () => tok("cor-texto-secundario"), classe: () => "0" };
      const sup = tok("cor-superficie"), [a, b] = c.pontas.map(pontaCor), n = c.cortes.length + 1, meio = (n - 1) / 2;
      const neutro = d3.lab(sup).l < 50 ? 0.8 : 0.55;   // tema escuro: o neutro afasta-se do cinza de fora do destaque (Q-064)
      // divergente pelas pontas: intensidade cresce para fora; a classe do meio é neutra (L0013, escala em quadrados)
      const cores = d3.range(n).map((k) => (k === meio ? d3.interpolateLab(sup, tok("cor-texto-secundario"))(neutro)
        : d3.interpolateLab(sup, k < meio ? a : b)(Math.abs(k - meio) >= meio ? 0.95 : 0.5)));
      const classe = (v) => (v === null || v === undefined ? null : d3.bisectRight(c.cortes, v));
      return { cores, cor: (v) => { const k = classe(v); return k === null ? null : cores[k]; }, classe };
    }

    // ---------------------------------------------------------------- moldura
    function moldura({ fmt, rep, hostQ, fixo = false, tamanho = null, largura = null, legendaRec = false, cartao = "sobre" }) {
      if (story) return molduraStory({ fmt, rep, hostQ, fixo, tamanho, largura });
      const f = el("article", { class: `viz fmt-${fmt} rep-${rep} host-${hostQ}${fixo ? " fixo" : ""}`, tabindex: "0", "aria-label": semMarcas(P.titulo) });
      if (fixo) { f.style.setProperty("--w", `${tamanho.w}px`); f.style.setProperty("--h", `${tamanho.h}px`); }
      if (!fixo && largura) f.style.maxWidth = `${largura}px`;   // fluida: acompanha o contêiner
      Object.assign(f.dataset, { fmt, rep, host: hostQ });
      f._opc = { cartao };
      const interativa = rep === "interativa";
      if (P.chapeu) f.append(el("div", { class: "viz-topo" }, el("p", { class: "viz-chapeu" }, ...textoComControles(P.chapeu, interativa, f))));
      f.append(el("h3", { class: "viz-titulo" }, ...textoComControles(P.titulo, interativa, f)));
      const sub = resolver(P.subtitulo, e);
      if (sub) f.append(el("p", { class: "viz-sub" }, ...textoLimitado(sub, LIMITE_TEXTO[fmt], interativa)));
      const comp = P.grafico.companheiro;
      const lado = Boolean(comp) && fmt === "paisagem";
      if (comp && interativa && !lado && linhas.length) f.append(el("div", { class: "viz-abas so-interativo", role: "tablist" },
        ...[["principal", P.grafico.rotulo_aba || "Gráfico"], ["mapa", comp.rotulo_aba || "Mapa"]].map(([k, r]) => el("button", { type: "button", role: "tab", "aria-pressed": est.aba === k, onclick: () => trocarAba(f, k) }, r))));
      const corpo = el("div", { class: "viz-corpo" }), palco = el("div", { class: "viz-palco" });
      corpo.append(palco);
      let palcoCompa = null;
      if (comp && interativa && lado) { palcoCompa = el("div", { class: "viz-palco compa" }); corpo.append(palcoCompa); }
      f.append(corpo, el("p", { class: "viz-n" }), el("ol", { class: "viz-anot-lista", hidden: "" }));
      if (!linhas.length && !P.grafico.dados) f.append(el("div", { class: "viz-legenda", hidden: "" }));   // sem dados, sem legenda
      else if (legendaRec && interativa) f.append(el("details", { class: "viz-legenda-rec so-interativo" }, el("summary", {}, "◧ Legenda"), el("div", { class: "viz-legenda" })));
      else f.append(el("div", { class: "viz-legenda" }));
      f.append(interativa ? barraBase(f, fmt, hostQ) : rodapeMinimo());
      f._palco = palco; f._palcoCompa = palcoCompa; f._lado = lado;
      if (est.buscando && interativa && fatiador) abrirBusca(f, fatiador, false);   // continua aberta depois de um redesenho
      return f;
    }
    /** Story: barra de progresso, chapéu com a cidade, título e texto do cartão, palco (se o cartão tiver vista ou
     *  componente), navegação (toque nos botões, deslizar, setas do teclado) e a mesma barra fixa da Visualização. */
    function molduraStory({ fmt, rep, hostQ, fixo = false, tamanho = null, largura = null }) {
      const ks = cartoesVisiveis(), K = cartaoAtual(), i = ks.indexOf(K), interativa = rep === "interativa";
      est.cartao = K.id;
      const soTexto = !K.capa && !K.fim && !(K.vista || K.componente || K.componentes);   // cartão só de texto: tipografia maior (pesquisador, 2026-10-12)
      const f = el("article", { class: `viz story fmt-${fmt} rep-${rep} host-${hostQ}${fixo ? " fixo" : ""}${K.capa ? " capa" : ""}${K.fim ? " fim" : ""}${soTexto ? " so-texto" : ""}${K.capa && K.imagem ? " com-imagem" : ""}`, tabindex: "0",
        "aria-label": `${semMarcas(textoPlano(K.titulo))} — cartão ${i + 1} de ${ks.length}` });
      if (fixo) { f.style.setProperty("--w", `${tamanho.w}px`); f.style.setProperty("--h", `${tamanho.h}px`); }
      if (!fixo && largura) f.style.maxWidth = `${largura}px`;
      Object.assign(f.dataset, { fmt, rep, host: hostQ, cartao: K.id });
      f._opc = { cartao: "abaixo" };
      f.append(el("div", { class: "story-progresso", "aria-hidden": "true" }, ...ks.map((k, j) => el("span", { class: j < i ? "lido" : j === i ? "atual" : "" }))));
      const chapeu = K.capitulo || P.chapeu;   // o capítulo do cartão, quando houver, faz as vezes do chapéu
      if (chapeu) f.append(el("div", { class: "viz-topo" }, el("p", { class: "viz-chapeu" }, ...textoComControles(chapeu, interativa, f))));
      if (soTexto || (K.capa && !K.imagem)) f.append(el("div", { class: "story-vao antes" }));   // centra o texto na altura
      f.append(el(K.capa ? "h2" : "h3", { class: "viz-titulo" }, ...textoComControles(K.titulo, interativa, f).flatMap((x) => (typeof x === "string" ? negrito(x) : [x]))));
      const tx = resolver(K.texto, e);
      if (tx) f.append(el("p", { class: "viz-sub story-texto" }, ...textoComControles(tx, interativa, f).flatMap((x) => (typeof x === "string" ? negrito(x) : [x]))));
      const temPalco = Boolean(K.vista || K.componente || K.componentes);
      const palco = el("div", { class: "viz-palco" });
      const nota = resolver(K.nota, e);
      if (temPalco) f.append(el("div", { class: "viz-corpo" }, palco), el("p", { class: "viz-n" }), el("ol", { class: "viz-anot-lista", hidden: "" }), el("div", { class: "viz-legenda" }),
        ...(nota ? [el("p", { class: "story-nota" }, ...negrito(nota))] : []));
      else f.append(K.capa && K.imagem ? el("div", { class: "capa-imagem", "aria-hidden": "true" }) : el("div", { class: "story-vao" }), ...(nota ? [el("p", { class: "story-nota" }, ...negrito(nota))] : []));
      if (K.fim) f.append(el("div", { class: "story-fim" }, ...(K.links || []).map((l) => el("a", { href: resolver(l.href, e), target: "_blank", rel: "noopener" }, `${resolver(l.rotulo, e)} ↗`)),
        interativa && fatiador ? el("button", { type: "button", onclick: () => abrirBusca(f, fatiador) }, "Trocar de cidade") : null,
        interativa ? el("button", { type: "button", onclick: () => irCartao(0) }, "↺ Ver de novo") : null));
      if (interativa) f.append(el("div", { class: "story-nav so-interativo" },
        el("button", { type: "button", class: "ant", disabled: i === 0 ? "" : null, "aria-label": "Cartão anterior", onclick: () => irCartao(i - 1) }, "‹"),
        el("span", { class: "pos", "aria-live": "polite", text: `${i + 1} de ${ks.length}` }),
        el("button", { type: "button", class: "prox", disabled: i === ks.length - 1 ? "" : null, "aria-label": "Próximo cartão", onclick: () => irCartao(i + 1) }, K.capa ? "Começar ›" : "›")));
      f.append(interativa ? barraBase(f, fmt, hostQ) : rodapeMinimo());
      f._palco = temPalco ? palco : null; f._palcoCompa = null; f._lado = false;
      if (interativa) gestos(f, i);
      if (est.buscando && interativa && fatiador) abrirBusca(f, fatiador, false);
      return f;
    }
    /** Deslizar para o lado (fora dos botões, campos e folhas) e setas do teclado trocam de cartão. */
    function gestos(f, i) {
      let x0 = null, y0 = 0;
      // mapa com zoom no palco (vista de mapa ou cartão de mapa): o gesto é do mapa; segundo dedo (pinça) cancela
      const mapaNoPalco = (n) => { const pal = n.closest(".viz-palco"); return pal && (f.dataset.vista === "mapa" || pal.querySelector(".zoom-pontos, .mapa-moldura")); };
      f.addEventListener("pointerdown", (ev) => { x0 = !ev.isPrimary || ev.target.closest("button, a, input, .viz-folha, .viz-busca, .viz-cartao") || mapaNoPalco(ev.target) ? null : ev.clientX; y0 = ev.clientY; });
      f.addEventListener("pointerup", (ev) => {
        if (x0 === null) return;
        const dx = ev.clientX - x0, dy = ev.clientY - y0; x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) irCartao(i + (dx < 0 ? 1 : -1));
      });
      f.addEventListener("pointercancel", () => { x0 = null; });
      f.addEventListener("keydown", (ev) => {
        if (ev.target.closest("input, textarea") || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        if (ev.key === "ArrowRight") { ev.preventDefault(); irCartao(i + 1); }
        if (ev.key === "ArrowLeft") { ev.preventDefault(); irCartao(i - 1); }
      });
    }
    function irCartao(j) {
      const ks = cartoesVisiveis();
      if (j < 0 || j >= ks.length) return;
      const a = cartaoAtual(), b = ks[j];
      if (a === b) return;
      const f = alvoRaiz.querySelector("article.viz");
      const mudar = () => { est.cartao = b.id; est.sel = null; est.anotAberta = false; est.legFixa = null; };
      // gráfico ⇄ mapa entre cartões: os mesmos pontos se movem (como a troca de aba, L0013)
      // mapa → mapa (sozinho ou na pilha, mesma malha ou não): o mesmo mapa segue e a câmera voa (Q-093, em teste)
      // demais pares: TROCA da matriz (design.yaml › padroes.transicoes, L0016) — esmaece e surge; o título fica
      if (a.vista && b.vista && f?._palco) animarTroca(f, mudar);
      else if (temMapa(a) && temMapa(b) && f?._mapa?.inst?.atualizar && !Lab.semMovimento()) seguirMapa(f, mudar);
      else if (a.componente && a.componente === b.componente && f?._palco && !Lab.semMovimento()) {
        if (f._inst?.atualizar) { reuso = { componente: a.componente, inst: f._inst, palco: f._palco }; const y = scrollY; mudar(); guardarEndereco(); render(); scrollTo(0, y); }
        else animarEstado(f, mudar);
      } else {
        if (temMapa(b) && !temMapa(a)) est.voarMapa = true;   // o mapa que chega parte do recorte inteiro e voa até a câmera do cartão
        trocarCartao(f, mudar);
        est.voarMapa = false;   // lido pelo adaptador no desenho (inclusive no redesenho na altura certa)
      }
      alvoRaiz.querySelector("article.viz")?.focus({ preventScroll: true });
    }
    /** Texto com marcadores e controles como texto puro (imagem, aria). */
    /** Opções de um controle: no plano, ou da base do Python ("{e.opcoes.municipio}", para listas longas). */
    const valoresDe = (c) => (typeof c?.valores === "string" ? resolver(c.valores, e) : c?.valores) || {};
    // valores: {valor: rótulo} ou, para listas longas, grupos [{grupo, opcoes: [[valor, rótulo], …]}] (optgroup; a ordem
    // é a do Python — 2026-10-15, escolha de cidade ou região no story da rede federal)
    const opcoesDe = (c) => { const v = valoresDe(c); return Array.isArray(v) ? v : Object.entries(v); };
    const rotuloDe = (c, x) => { const v = valoresDe(c); return Array.isArray(v) ? v.flatMap((o) => (Array.isArray(o) ? [o] : o.opcoes)).find((o) => String(o[0]) === String(x))?.[1] : v[x]; };
    const textoPlano = (t) => resolver(t || "", e).replace(/\{c\.(\w+)\}/g, (_, id) => (ctl[id]?.tipo === "busca" ? rotuloFatia() : rotuloDe(ctl[id], est[id]) ?? ""));
    function textoLimitado(t, lim, interativa) {
      const puro = semMarcas(t);
      if (!interativa || puro.length <= lim) return negrito(t);
      const k = puro.lastIndexOf(" ", lim - 1);
      const span = el("span", {}, puro.slice(0, k > lim * 0.6 ? k : lim - 1),
        el("button", { type: "button", class: "mais-texto", "aria-label": "Ler o texto inteiro", onclick: () => span.replaceWith(el("span", {}, ...negrito(t))) }, "…"));
      return [span];
    }
    /** Texto do chapéu ou do título com {c.id} no lugar do controle (L0011: o seletor faz parte da frase). */
    function textoComControles(t, interativa, f) {
      return resolver(t, e).split(/(\{c\.\w+\})/).filter(Boolean).map((p) => {
        const m = p.match(/^\{c\.(\w+)\}$/);
        return m ? controleNaFrase(ctl[m[1]], interativa, f) : p;
      });
    }
    const rotuloFatia = () => indice?.get(est[fatiador?.id])?.rotulo || e.nome || "";
    function controleNaFrase(c, interativa, f) {
      if (!c) return "";
      if (c.tipo === "busca") {
        if (!interativa) return el("span", { text: rotuloFatia() });
        return el("button", { type: "button", class: "viz-busca-botao", "aria-label": `${c.rotulo || "Escolher"}: ${rotuloFatia()}. Trocar`, onclick: () => abrirBusca(f, c) }, `${rotuloFatia()} ▾`);
      }
      const ops = opcoesDe(c);
      const atual = est[c.id];
      if (!interativa) return el("span", { text: rotuloDe(c, atual) ?? String(atual) });
      const mudar = (v) => trocarSuave(() => { est[c.id] = v; });
      return ops.length <= 3 && ops.every(Array.isArray) ? Lab.seletorTitulo(c.rotulo || c.id, ops, atual, mudar) : Lab.seletorTituloLista(c.rotulo || c.id, ops, atual, mudar);
    }
    /** Busca de lugar (5.570 cidades): campo com lista; Enter ou escolha na lista troca a fatia. */
    function abrirBusca(f, c, focar = true) {
      if (f.querySelector(".viz-busca")) { f.querySelector(".viz-busca input").focus(); return; }
      est.buscando = true;
      const idLista = `lista-${P.id}-${c.id}`;
      if (!document.getElementById(idLista)) document.body.append(el("datalist", { id: idLista }, ...[...indice.values()].map((m) => el("option", { value: m.rotulo }))));
      const campo = el("input", { type: "search", list: idLista, placeholder: "Digite o nome da cidade", "aria-label": c.rotulo || "Cidade", autocomplete: "off" });
      const fechar = () => { est.buscando = false; caixa.remove(); };
      const escolher = () => {
        const v = campo.value.trim().toLowerCase();
        if (!v) return;
        const hit = [...indice].find(([, m]) => m.rotulo.toLowerCase() === v) || [...indice].find(([, m]) => m.nome.toLowerCase() === v);
        if (!hit) { campo.setCustomValidity("Escolha uma cidade da lista."); campo.reportValidity(); return; }
        campo.setCustomValidity("");
        est[c.id] = hit[0]; est.buscando = false; guardarEndereco();
        irPara(hit[0]).catch(falhou);
      };
      campo.addEventListener("change", escolher);
      campo.addEventListener("keydown", (ev) => { if (ev.key === "Enter") escolher(); if (ev.key === "Escape") fechar(); });
      const caixa = el("div", { class: "viz-busca so-interativo" }, campo, el("button", { type: "button", onclick: fechar }, "Cancelar"));
      campo.value = est.buscaTexto || "";
      campo.addEventListener("input", () => { est.buscaTexto = campo.value; });
      (f.querySelector(".viz-titulo") || f.firstChild).after(caixa);
      if (focar) campo.focus();
    }

    // ---------------------------------------------------------------- barra fixa e folhas (padrão do story piloto, L0013)
    function barraBase(f, fmt, hostQ) {
      const folha = el("div", { class: "viz-folha so-interativo", role: "dialog", "aria-modal": "false", hidden: "" });
      const fechar = () => { folha.hidden = true; };
      f.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fechar(); });
      const abrir = (titulo, ...corpo) => {
        folha.replaceChildren(el("div", { class: "alca", "aria-hidden": "true" }),
          el("div", { class: "cab" }, el("h4", { text: titulo }), el("button", { type: "button", "aria-label": "Fechar", onclick: fechar }, "✕")), ...corpo);
        folha.hidden = false;
        folha.querySelector(".cab button").focus();
      };
      const explorar = (P.controles || []).filter((c) => (c.local || "explorar") === "explorar" || c.explorar);
      const valorControle = (c) => est[c.id] ?? opcaoAtual(c.opcao, (est.aba === "mapa" ? P.grafico.companheiro : P.grafico)?.opcoes?.[c.opcao]);
      const botoes = el("div", { class: "botoes" },
        el("button", { type: "button", onclick: () => abrir("Como ler", ...(P.como_ler ? [el("p", {}, ...negrito(P.como_ler))] : []), tabelaAlternativa()) }, "ⓘ Como ler"),
        // ✎ Notas e fontes = a metodologia inteira, em camadas: notas, fonte e data em cima; o bloco recolhido embaixo (L0014)
        el("button", { type: "button", onclick: () => abrir("Notas e fontes", ...(P.notas || []).map((t) => el("p", {}, ...negrito(resolver(t, e)))),
          el("p", {}, el("b", { text: "Fonte: " }), P.fonte),
          P.metodologia ? Lab.metodologiaEmCamadas(P.metodologia, { endereco: P.endereco, linkAutor: { href: P.portfolio, texto: "Página do autor ↗" } })
            : P.decisoes?.length ? el("p", { class: "fraco", text: `Decisões metodológicas: ${P.decisoes.join(", ")}` }) : null) }, "✎ Notas e fontes"),
        explorar.length ? el("button", { type: "button", onclick: () => abrir("Explorar", ...explorar.map((c) => Lab.seletor(c.rotulo || c.id, opcoesDe(c), valorControle(c), (v) => { est[c.id] = v; render(); }))) }, "⇄ Explorar") : null);
      const compartilhar = el("button", { type: "button", class: "comp", onclick: () => abrirCompartilhar(abrir, fechar, fmt) }, "↗ Baixar ou Compartilhar");
      const linha2 = el("div", { class: "linha2" },
        el("span", { class: "assina" }, el("span", {}, "por ", el("a", { href: P.portfolio, target: "_blank", rel: "noopener", text: P.autor })),
          P.fonte_curta ? el("span", { class: "fonte-curta", text: P.fonte_curta }) : null),   // fonte e data sempre visíveis (L0010, L0014)
        hostQ === "embed" ? el("span", {}, el("a", { href: enderecoAtual(), target: "_blank", rel: "noopener" }, "tela cheia ↗"), " · ", compartilhar) : compartilhar);
      f.append(folha);
      return el("nav", { class: "viz-base", "aria-label": "Recursos da visualização" }, botoes, linha2);
    }
    function abrirCompartilhar(abrir, fechar, fmt) {
      const url = enderecoAtual(), titulo = semMarcas(P.titulo), lugar = rotuloFatia();
      const texto = `${titulo}${lugar ? ` — ${lugar}` : ""}`;
      const copiar = async (t, botao, ok = "Copiado") => { try { await navigator.clipboard.writeText(t); botao.lastChild.textContent = ok; } catch (erro) { mostrarTexto("Copie o texto", t); } };
      const mostrarTexto = (cab, t) => { const a = el("textarea", { class: "viz-texto", readonly: "", rows: "5", "aria-label": cab }); a.value = t; abrir(cab, a); a.select(); };
      const bLink = el("button", { type: "button" }, el("span", { class: "ic", text: "🔗" }), el("span", { text: fatiador ? "Copiar link (com a cidade e a vista atuais)" : story ? "Copiar link (deste cartão)" : "Copiar link (com a vista atual)" }));
      bLink.onclick = () => copiar(url, bLink, "Link copiado");
      const emb = P.saidas?.embed || { largura: 400, altura: 640 };
      const codigo = `<iframe src="${enderecoAtual(true)}" width="${emb.largura}" height="${emb.altura}" loading="lazy" title="${titulo.replaceAll('"', "&quot;")}" style="border:0;max-width:100%"></iframe>`;
      abrir("Baixar ou Compartilhar", el("div", { class: "opcoes-comp" },
        bLink,
        el("a", { href: `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, target: "_blank", rel: "noopener" }, el("span", { class: "ic", text: "💬" }), "WhatsApp"),
        el("a", { href: `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(`${texto}\n${url}`)}` }, el("span", { class: "ic", text: "✉" }), "E-mail"),
        el("button", { type: "button", onclick: () => mostrarTexto("Código para embutir", codigo) }, el("span", { class: "ic", text: "</>" }), "Código para embutir"),
        el("button", { type: "button", onclick: () => { fechar(); abrirImagem(story ? "story" : fmt === "paisagem" ? "paisagem" : fmt === "quadrado" ? "quadrado" : "retrato"); } }, el("span", { class: "ic", text: "⤓" }), story ? "Baixar imagem deste cartão (9:16)" : "Baixar imagem (o que está na tela)"),
        (P.saidas?.dados || ["csv"]).includes("csv") && (linhas.length || cartaoAtual()?.componente || cartaoAtual()?.componentes || (!story && P.grafico.dados)) ? el("button", { type: "button", onclick: () => baixarCSV() }, el("span", { class: "ic", text: "▦" }), "Baixar dados do gráfico (CSV)") : null));
    }
    function rodapeMinimo() {   // estática: fonte + assinatura (L0008, Q-022)
      return el("footer", { class: "viz-rodape" }, `Fonte: ${P.fonte}`, el("br"), el("b", { text: P.autor }), " · Saiba mais em ", el("b", { text: dominio() }));
    }
    const dominio = () => (P.endereco || P.portfolio || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    /** Assinatura da imagem “nome · Saiba mais em <endereço>” em quantas linhas couber; endereço longo quebra nas
     *  barras (nada sai cortado na borda). Cada linha: [[texto, negrito?], …]. */
    function linhasAssinatura(iw) {
      const dom = dominio(), A = P.autor;
      if (medir(`${A} · Saiba mais em ${dom}`, 11, 700) <= iw) return [[[`${A} · `, 1], ["Saiba mais em ", 0], [dom, 1]]];
      if (medir(`Saiba mais em ${dom}`, 11, 700) <= iw) return [[[A, 1]], [["Saiba mais em ", 0], [dom, 1]]];
      const ls = [[[A, 1]], [["Saiba mais em", 0]]];
      let atual = "";
      for (const pd of dom.split(/(?<=\/)/)) { if (atual && medir(atual + pd, 11, 700) > iw) { ls.push([[atual, 1]]); atual = pd; } else atual += pd; }
      if (atual) ls.push([[atual, 1]]);
      return ls;
    }
    const escreverAssinatura = (svg, ls, x, y) => {
      const t = svg.append("text").attr("font-size", 11).attr("fill", tok("cor-texto"));
      ls.forEach((l, k) => l.forEach(([tx, b], j) => { const sp = t.append("tspan").text(tx); if (b) sp.attr("font-weight", 700); if (!j) sp.attr("x", x).attr("y", y + k * 14); }));
    };

    // ---------------------------------------------------------------- valores e detalhe
    const col = (c) => P.colunas[c] || {};
    function fmtCol(c, v) {
      const d = col(c);
      if (v === null || v === undefined || v === "") return "—";
      if (d.tipo === "booleano") return v ? "sim" : "não";
      if (d.unidade === "p.p.") return Lab.comSinal(v, Lab.fmtPP);
      if (d.unidade === "%") return Lab.fmtPct(v, d.casas ?? 1);
      if (d.tipo === "medida") return Number.isInteger(v) ? Lab.fmtInt.format(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: d.casas ?? 1 });
      return String(v);
    }
    function linhasDetalhe(l) {
      const D = P.grafico.detalhe || {};
      const ctx = [].concat(D.contexto || []).map((c) => l[c]).filter(Boolean).join(" · ");
      const ls = (D.linhas || []).map((it) => {
        if (typeof it === "string") return l[it] === null || l[it] === undefined ? null : `${col(it).rotulo || it}: ${fmtCol(it, l[it])}`;
        if (it.grupo) return `· ${it.grupo.map((c) => `${col(c).curto || col(c).rotulo || c} ${fmtCol(c, l[c])}`).join(" · ")}`;
        if (it.de) return `${col(it.campo).rotulo || it.campo}: ${fmtCol(it.campo, l[it.campo])} de ${fmtCol(it.de, l[it.de])} ${col(it.de).curto || col(it.de).rotulo || it.de}`;
        return null;
      });
      return [l[D.titulo || "id"], ctx, ls];
    }
    function cartaoDetalhe(frame, palco) {
      const abaixo = frame._opc?.cartao === "abaixo";
      const c = el("div", { class: `viz-cartao so-interativo${abaixo ? " abaixo" : ""}`, role: "status", "aria-live": "polite", hidden: "" });
      if (abaixo) frame.querySelector(".viz-corpo").after(c); else palco.append(c);
      let fixo = false;
      const fechar = () => { fixo = false; c.hidden = true; frame.querySelectorAll(".realce").forEach((n) => n.classList.remove("realce")); est.sel = null; };
      frame.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fechar(); });
      return {
        mostrar(l, a, fixar = false) {
          if (fixo && !fixar) return;
          fixo = fixar;
          const [titulo, contexto, linhas] = linhasDetalhe(l);
          c.replaceChildren(el("button", { type: "button", class: "x", "aria-label": "Fechar", onclick: (ev) => { ev.stopPropagation(); fechar(); } }, "✕"),
            el("b", { text: titulo }), contexto ? el("div", { class: "ctx", text: contexto }) : null, ...linhas.filter(Boolean).map((t) => el("div", { text: t })));
          c.hidden = false;
          if (abaixo) return;
          const W = palco.clientWidth, H = palco.clientHeight;
          const doca = frame.dataset.fmt === "retrato" || W < 420;   // celular: encaixa no palco, do lado oposto ao toque
          c.classList.toggle("doca", doca);
          if (doca) { c.style.left = ""; c.style.right = ""; if (a.y + a.h / 2 > H / 2) { c.style.top = "0px"; c.style.bottom = ""; } else { c.style.top = ""; c.style.bottom = "0px"; } return; }
          c.style.bottom = "";
          const cw = c.offsetWidth, ch = c.offsetHeight;
          let x = a.x + a.w + 10;
          if (x + cw > W) x = a.x - cw - 10;
          c.style.left = `${Math.max(0, Math.min(W - cw, x))}px`; c.style.top = `${Math.max(0, Math.min(H - ch, a.y + a.h / 2 - ch / 2))}px`;
        },
        esconder() { if (!fixo) c.hidden = true; },
        fechar,
      };
    }

    // ---------------------------------------------------------------- legenda (L0013)
    function legendaInterativa(frame, itens) {
      const interativa = frame.dataset.rep === "interativa";
      const aplicar = (chave) => {
        frame.querySelectorAll(".viz-palco [data-chave]").forEach((n) => {
          if (n.dataset.op0 === undefined) n.dataset.op0 = n.getAttribute("opacity") ?? "";
          const op = chave === null ? n.dataset.op0 : n.dataset.chave === chave ? "1" : "0.15";
          esmaecer(d3.select(n)).attr("opacity", op || 1);
        });
        frame.querySelectorAll(".item-leg[data-chave]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chave === est.legFixa)));
      };
      frame.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && est.legFixa !== null) { est.legFixa = null; aplicar(null); } });
      if (interativa && est.legFixa !== null) requestAnimationFrame(() => aplicar(est.legFixa));
      return itens.map((it) => {
        const forma = it.forma === "circulo" ? " circ" : it.forma === "quadro" ? " quadro" : "";
        const amostra = el("i", { class: `amostra-leg${forma}`, "aria-hidden": "true" });
        amostra.style.background = it.cor;
        if (!interativa || it.chave === undefined) return el("span", { class: `item-leg${it.forma === "quadro" ? " quadro" : ""}` }, amostra, it.rotulo);
        return el("button", { type: "button", class: `item-leg${it.forma === "quadro" ? " quadro" : ""}`, "data-chave": it.chave, "aria-pressed": "false", "aria-label": it.aria || null, title: it.aria || null,
          onpointerenter: () => { if (est.legFixa === null) aplicar(it.chave); }, onpointerleave: () => { if (est.legFixa === null) aplicar(null); },
          onfocus: () => { if (est.legFixa === null) aplicar(it.chave); }, onblur: () => { if (est.legFixa === null) aplicar(null); },
          onclick: () => { est.legFixa = est.legFixa === it.chave ? null : it.chave; aplicar(est.legFixa); } }, amostra, it.rotulo);
      });
    }
    function itemExtra(tipo, texto) {   // elemento que não é dado (linha de referência, cinza de fora do destaque)
      const sv = d3.create("svg").attr("width", 22).attr("height", 10).attr("aria-hidden", "true").style("vertical-align", "middle");
      if (tipo === "cinza") sv.append("circle").attr("cx", 11).attr("cy", 5).attr("r", 4).attr("fill", tok("cor-grade"));
      else sv.append("line").attr("x1", tipo === "pontilhada" ? 11 : 1).attr("x2", tipo === "pontilhada" ? 11 : 21).attr("y1", tipo === "pontilhada" ? 0 : 5).attr("y2", tipo === "pontilhada" ? 10 : 5)
        .attr("stroke", tok("cor-texto")).attr("stroke-dasharray", tipo === "pontilhada" ? "2 2" : "4 3");
      return el("span", { class: "item-extra" }, sv.node(), texto);
    }
    const extras = (vista) => (P.legenda?.extras || []).filter((x) => !x.vistas || x.vistas.includes(vista)).map((x) => ({ tipo: x.tipo, texto: resolver(x.texto, e) })).filter((x) => x.texto);
    function preencherLegenda(frame, vista, escC) {
      const leg = frame.querySelector(".viz-legenda"), c = P.escalas?.cor;
      if (c) {
        const itens = legendaInterativa(frame, escC.cores.map((cor, k) => ({ chave: String(k), cor, rotulo: c.curtas[k], forma: "quadro", aria: c.classes[k] })));
        const q = el("div", { class: "quadros" }, ...itens); q.style.setProperty("--n", String(escC.cores.length));
        leg.append(el("div", { class: "leg-escala" }, el("span", { class: "leg-titulo", text: c.titulo }),
          el("div", { class: "pontas" }, el("span", { text: `← ${c.pontas[0].rotulo}` }), el("span", { text: `${c.pontas.at(-1).rotulo} →` })), q));
      }
      const d = P.grafico.destaque, K = cartaoAtual();
      if (d && K?.destaque !== false) leg.append(...legendaInterativa(frame, [
        ...(c ? [] : [{ chave: "dado", cor: tok(P.grafico.opcoes?.cor || "cor-cat-1"), rotulo: d.rotulo_dentro || "em destaque", forma: "circulo" }]),
        { chave: "fora", cor: tok("cor-grade"), rotulo: d.rotulo || "fora do destaque", forma: "circulo" }]));
      leg.append(...extras(vista).map((x) => itemExtra(x.tipo, x.texto)));
    }

    // ---------------------------------------------------------------- anotações (L0008, L0013)
    function buscarLugar({ W, H, cx, cy, bw, bh, obst, folga = 3 }) {
      const dirs = [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
      const colide = (x, y) => obst.some((o) => x - folga < o.x + o.w && x + bw + folga > o.x && y - folga < o.y + o.h && y + bh + folga > o.y);
      for (const r of [14, 24, 36, 52, 72, 96, 124]) for (const [dx, dy] of dirs) {
        const px = cx + dx * r * (dy ? 0.75 : 1), py = cy + dy * r * (dx ? 0.75 : 1);
        const x = dx > 0 ? px : dx < 0 ? px - bw : px - bw / 2, y = dy > 0 ? py : dy < 0 ? py - bh : py - bh / 2;
        if (x >= 0 && y >= 0 && x + bw <= W && y + bh <= H && !colide(x, y)) return { x, y, lx: px, ly: py };
      }
      return null;
    }
    /** lista: [{texto, prioridade, estilo, a: {x,y,w,h}}] em coordenadas do palco. */
    function anotar(frame, palco, lista, obstaculos = []) {
      const fmt = frame.dataset.fmt, interativa = frame.dataset.rep === "interativa";
      const camada = el("div", { class: "viz-anot", "aria-hidden": "true" });
      palco.append(camada);
      const ol = frame.querySelector(".viz-anot-lista"), ocupadas = [...obstaculos];
      const W = palco.clientWidth, H = palco.clientHeight;
      const sv = d3.select(camada).append("svg").attr("width", W).attr("height", H).style("position", "absolute").style("inset", 0).style("overflow", "visible");
      const anel = (cx, cy) => sv.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 8).attr("fill", "none").attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2);
      const guia = (x1, y1, x2, y2) => sv.append("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2).attr("stroke", tok("cor-texto")).attr("stroke-width", 0.8);
      let n = 0;
      const numerar = (an, a) => {
        n += 1;
        const m = el("span", { class: "marcador num-anot", text: String(n) });
        m.style.left = `${Math.min(W - 8, a.x + a.w)}px`; m.style.top = `${Math.max(8, a.y)}px`;
        camada.append(m);
        ol.append(el("li", {}, el("span", { class: "num-anot", text: String(n) }), an.texto)); ol.hidden = false;
      };
      for (const an of lista.filter((x) => (x.prioridade || 1) <= ANOT_MAX[fmt])) {
        const a = an.a, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
        const estilo = an.estilo === "toque" && !interativa ? "rotulo" : an.estilo || "rotulo";
        if (estilo === "toque") {   // ⓘ discreto; o texto abre no toque, com ✕ (Q-047)
          const lugar = buscarLugar({ W, H, cx, cy, bw: 20, bh: 20, obst: ocupadas });
          if (!lugar) { numerar(an, a); continue; }
          anel(cx, cy);
          const b = el("button", { type: "button", class: "anot-toque", "aria-label": "Ver anotação", "aria-expanded": "false", text: "i" });
          b.style.left = `${lugar.x}px`; b.style.top = `${lugar.y}px`;
          const fecharB = () => { balao.hidden = true; b.setAttribute("aria-expanded", "false"); est.anotAberta = false; };
          const balao = el("div", { class: "balao balao-toque", role: "status", hidden: "" }, el("span", { text: an.texto }),
            el("button", { type: "button", class: "x-anot", "aria-label": "Fechar anotação", onclick: (ev) => { ev.stopPropagation(); fecharB(); } }, "✕"));
          balao.onclick = fecharB;
          b.onclick = (ev) => {
            ev.stopPropagation();
            if (!balao.hidden) return fecharB();
            balao.hidden = false; b.setAttribute("aria-expanded", "true"); est.anotAberta = true;
            const p = buscarLugar({ W, H, cx, cy, bw: balao.offsetWidth, bh: balao.offsetHeight, obst: obstaculos }) || { x: Math.max(0, Math.min(W - balao.offsetWidth, cx - 60)), y: 0 };
            balao.style.left = `${p.x}px`; balao.style.top = `${p.y}px`;
          };
          document.addEventListener("pointerdown", (ev) => { if (frame.isConnected && !balao.hidden && !balao.contains(ev.target) && ev.target !== b) fecharB(); });
          frame.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharB(); });
          camada.append(b, balao);
          if (est.anotAberta) requestAnimationFrame(() => b.click());
          continue;
        }
        const b = el("div", { class: estilo === "balao" ? "balao" : "rotulo-anot", text: an.texto });
        camada.append(b);
        const lugar = buscarLugar({ W, H, cx, cy, bw: b.offsetWidth, bh: b.offsetHeight, obst: ocupadas });
        if (!lugar) { b.remove(); numerar(an, a); continue; }
        b.style.left = `${lugar.x}px`; b.style.top = `${lugar.y}px`;
        ocupadas.push({ x: lugar.x, y: lugar.y, w: b.offsetWidth, h: b.offsetHeight });
        anel(cx, cy);
        const ang = Math.atan2(lugar.ly - cy, lugar.lx - cx);
        guia(cx + 8 * Math.cos(ang), cy + 8 * Math.sin(ang), lugar.lx, lugar.ly);
      }
    }

    // ---------------------------------------------------------------- palco: componente principal ou companheiro
    /** Valor atual de uma opção de componente: o controle que a declara (`opcao`) ou o padrão do plano. */
    const opcaoAtual = (op, padrao) => { const c = (P.controles || []).find((x) => x.opcao === op); return c && est[c.id] != null ? est[c.id] : padrao; };
    /** Contexto comum aos adaptadores: dados, ligações, cores, destaque e interação. */
    function contexto(frame, alvo, espec) {
      const interativa = frame.dataset.rep === "interativa", naImagem = frame.dataset.host === "imagem";
      const escC = escalaCor(), campoCor = P.escalas?.cor?.campo, dest = P.grafico.destaque?.coluna;
      const semDestaque = cartaoAtual()?.destaque === false, corFixa = espec.opcoes?.cor || P.grafico.opcoes?.cor || "cor-cat-1";
      const emDestaque = (l) => (semDestaque || !dest ? true : Boolean(l[dest]));
      const cor = (l) => (!emDestaque(l) ? tok("cor-grade") : semDestaque ? tok("cor-texto-secundario") : campoCor ? escC.cor(l[campoCor]) : tok(corFixa));
      const chave = (l) => (semDestaque ? "dado" : !emDestaque(l) ? "fora" : campoCor ? String(escC.classe(l[campoCor]) ?? "sem") : "dado");
      const cartao = interativa && alvo === frame._palco ? (frame._cartao ||= cartaoDetalhe(frame, frame._palco)) : interativa ? frame._cartao : null;
      const realcar = (id) => frame.querySelectorAll("circle[data-id]").forEach((c) => c.classList.toggle("realce", c.dataset.id === id));
      const ligar = (sel) => sel
        .on("pointerenter", (ev, l) => { realcar(l.id); cartao?.mostrar(l, caixaRelativa(ev.currentTarget, frame._palco)); })
        .on("pointerleave", () => cartao?.esconder())
        .on("click", (ev, l) => { realcar(l.id); est.sel = l.id; cartao?.mostrar(l, caixaRelativa(ev.currentTarget, frame._palco), true); });
      const ordenadas = [...linhas].sort((a, b) => emDestaque(a) - emDestaque(b));   // destacados por cima
      return { P, e, est, frame, alvo, espec, lig: espec.ligacoes, opc: { ...(espec.opcoes || {}) }, linhas: ordenadas, todas: linhas, interativa, naImagem,
        fmt: frame.dataset.fmt, cor, chave, emDestaque, ligar, escC, render, trocar: trocarSuave, fmtCol, col, resolver: (v) => resolver(v, e), osm: opcoes.osm,
        opcao: (op) => opcaoAtual(op, espec.opcoes?.[op]) };
    }
    function desenharPalco(frame) {
      const naImagem = frame.dataset.host === "imagem", interativa = frame.dataset.rep === "interativa";
      const comp = P.grafico.companheiro, K = cartaoAtual();
      if (K && !frame._palco) return null;
      const comDados = K?.componente || K?.componentes ? K : !K && P.grafico.dados ? P.grafico : null;   // story, ou Visualização com dados próprios
      if (comDados) {   // componente(s) com dados próprios do Python (quadros, linhas, barras, mapa…)
        const pilha = comDados.componentes || [{ componente: comDados.componente, dados: comDados.dados, opcoes: comDados.opcoes }];
        const legenda = naImagem ? null : frame.querySelector(".viz-legenda");
        const contextoDe = (it, alvo) => ({ P, e, est, frame, alvo, espec: { ...it, id: `${comDados.id || "grafico"}${pilha.length > 1 ? `-${pilha.indexOf(it)}` : ""}` },
          dados: resolver(it.dados, e), opc: resolver(it.opcoes || {}, e), naImagem, interativa, fmt: frame.dataset.fmt, legenda });
        // estado entre cartões (L0016, matriz: ESTADO): o mesmo componente segue de um cartão para o outro e só muda
        if (reuso && !reuso.mapa && !naImagem && pilha.length === 1 && reuso.componente === pilha[0].componente && reuso.inst?.atualizar) {
          const r0 = reuso; reuso = null;
          frame._palco.replaceWith(r0.palco); frame._palco = r0.palco;
          const Cc = contextoDe(pilha[0], r0.palco);
          if (r0.inst.atualizar(Cc)) { frame._comp = pilha[0].componente; return r0.inst; }
          r0.palco.replaceChildren();
        }
        const rMapa = reuso?.mapa && !naImagem ? reuso.mapa : null;   // o mesmo mapa segue (seguirMapa)
        reuso = null;
        const alvos = pilha.length === 1 ? [frame._palco] : pilha.map((it) => {
          const a = el("div", { class: "viz-palco-pilha" }); a.style.flex = `${it.altura || 1} 1 0`; frame._palco.append(a);
          if (!it.rotulo) return a;
          // rótulo do gráfico na pilha (ex.: "2022" e "2026"): sem ele, dois gráficos iguais só se distinguem pela legenda
          const dentro = el("div", { class: "pilha-alvo" });
          a.classList.add("com-rotulo");
          a.append(el("p", { class: "pilha-rotulo", text: semMarcas(textoPlano(it.rotulo)) }), dentro);
          return dentro;
        });
        if (pilha.length > 1) frame._palco.classList.add("pilha");
        let r = null, reusou = false;
        pilha.forEach((it, j) => {
          const ad = Lab.viz.adaptadores[it.componente];
          if (!ad) { alvos[j].append(el("div", { class: "viz-vazio", text: `Componente “${it.componente}” sem adaptador em lab-viz.js.` })); return; }
          if (rMapa && it.componente === "mapa" && !reusou) {   // o nó do mapa anterior toma o lugar do alvo novo (mesmas classes e medidas)
            const velho = rMapa.alvo, novo = alvos[j];
            velho.className = novo.className; velho.style.cssText = novo.style.cssText;
            novo.replaceWith(velho); alvos[j] = velho;
            if (novo === frame._palco) frame._palco = velho;
            reusou = rMapa.inst.atualizar(contextoDe(it, velho));
            if (reusou) { frame._mapa = { inst: rMapa.inst, alvo: velho }; if (!r) r = rMapa.inst; return; }
            velho.replaceChildren();
          }
          const Cc = contextoDe(it, alvos[j]);
          const rj = ad(Cc) || {};
          if (it.componente === "mapa" && !naImagem) frame._mapa = { inst: rj, alvo: alvos[j] };
          if (naImagem && Cc.itensImagem?.length && !rj.legendaImagem) rj.legendaImagem = Cc.itensImagem;   // legenda de categorias na imagem
          if (!r) r = rj; else if (rj.legendaImagem) r.legendaImagem = [...(r.legendaImagem || []), ...rj.legendaImagem];
        });
        frame._comp = pilha.length === 1 ? pilha[0].componente : null;
        // a legenda e a nota, preenchidas depois do desenho, podem encolher o palco (story): redesenha uma vez na altura certa
        if (!naImagem && !frame._redesenhado && frame._palco && !reusou) {
          // o palco cresce com o desenho: mede a altura que sobra com o desenho escondido por um instante
          const filhos = [...frame._palco.children], vis = filhos.map((n) => n.style.display);
          filhos.forEach((n) => { n.style.display = "none"; });
          const h = frame._palco.clientHeight, hs = Math.max(0, ...filhos.map((n, j) => { n.style.display = vis[j]; return n.getBoundingClientRect().height; }));
          if (pilha.length === 1 && h > 120 && Math.abs(hs - h) > 6) {
            frame._redesenhado = true;
            const corpo = frame._palco.closest(".viz-corpo") || frame._palco;   // a legenda volta igual: a altura fica a medida
            Object.assign(corpo.style, { height: `${corpo.clientHeight}px`, flex: "0 0 auto" });
            frame._palco.replaceChildren(); legenda?.replaceChildren();
            return desenharPalco(frame);
          }
        }
        return r;
      }
      const vista = K ? (K.vista === "mapa" ? "mapa" : "principal") : comp && (interativa || naImagem) && !frame._lado && est.aba === "mapa" ? "mapa" : "principal";
      frame.dataset.vista = vista;
      const palco = frame._palco;
      const n = frame.querySelector(".viz-n");
      if (n && !naImagem) {
        const tn = resolver(typeof P.amostra === "string" ? P.amostra : P.amostra?.[vista === "mapa" ? "mapa" : "grafico"], e) || "";
        n.textContent = K?.destaque === false ? tn.split(" · ")[0] : tn;   // cartão sem destaque: só o N
      }
      if (!linhas.length) { palco.append(el("div", { class: "viz-vazio", text: resolver(P.subtitulo, e) || "Sem dados para esta escolha." })); return null; }
      const escC = escalaCor();
      if (!naImagem || frame.querySelector(".viz-legenda")) preencherLegenda(frame, vista, escC);
      const rodar = (alvo, espec) => {
        const ad = Lab.viz.adaptadores[espec.componente];
        if (!ad) { alvo.append(el("div", { class: "viz-vazio", text: `Componente “${espec.componente}” sem adaptador em lab-viz.js.` })); return null; }
        return ad(contexto(frame, alvo, espec));
      };
      const principal = vista === "mapa" ? rodar(palco, comp) : rodar(palco, P.grafico);
      const cTam = (P.controles || []).find((c) => c.opcao === "forma" && (c.local || "explorar") === "grafico");
      if (story && interativa && vista === "principal" && cTam && P.grafico.ligacoes.tamanho) {
        const forma = opcaoAtual("forma", P.grafico.opcoes?.forma);
        palco.append(el("div", { class: "fundo-mini so-interativo dir", role: "group", "aria-label": cTam.rotulo || "Tamanho" }, el("span", { class: "rot-mini", text: `${cTam.rotulo || "Tamanho"}:` }),
          ...Object.entries(cTam.valores).map(([v, r]) => el("button", { type: "button", "aria-pressed": forma === v, onclick: () => trocarSuave(() => { est[cTam.id] = v; }) }, r))));
      }
      if (frame._palcoCompa) rodar(frame._palcoCompa, comp);
      // anotações do componente principal (âncoras que o adaptador sabe posicionar)
      const anots = anotacoesVisiveis();
      if (principal?.posicao && (vista === "principal" || K) && !naImagem) {
        const desenharAnots = () => {   // o mapa avisa quando o zoom muda: a anotação acompanha o ponto
          palco.querySelector(":scope > .viz-anot")?.remove();
          const ol = frame.querySelector(".viz-anot-lista");
          if (ol) { ol.replaceChildren(); ol.hidden = true; }
          const obst = principal.obstaculos ? principal.obstaculos() : [];
          anotar(frame, palco, anots.map((a) => { const p = principal.posicao(a.alvo); return p && { ...a, a: { x: p[0] - 4, y: p[1] - 4, w: 8, h: 8 } }; }).filter(Boolean), obst);
        };
        desenharAnots();
        principal.aoZoom?.(desenharAnots);
      }
      if (interativa && est.sel) requestAnimationFrame(() => palco.querySelector(`circle[data-id="${CSS.escape(est.sel)}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      return principal;
    }

    /** Anotações com âncora (não as linhas): todas na Visualização; no story, só as que o cartão pede. */
    const anotacoesVisiveis = () => {
      const K = cartaoAtual();
      return (P.grafico.anotacoes || []).filter((a) => a.tipo !== "linha" && (!K || (K.anotacoes || []).includes(a.id))).map((a) => resolver(a, e)).filter((a) => a.texto && a.alvo);
    };

    // ---------------------------------------------------------------- troca gráfico ⇄ mapa com transição (L0013, Q-059)
    function trocarAba(f, k) {
      if (est.aba === k) return;
      animarTroca(f, () => { est.aba = k; });
    }
    /** TROCA (matriz de transições, L0016): o gráfico que sai esmaece (0,3 s) e o que entra surge (0,3 s, após 0,1 s);
     *  textos e título são redesenhados no lugar (âncora). Sem animação com prefers-reduced-motion. */
    /** Troca de estado com transição: cartão com componente próprio esmaece e surge; vista desloca os círculos. */
    function trocarSuave(fazer) {
      const f0 = alvoRaiz.querySelector("article.viz");
      if (!f0?._palco) { fazer(); render(); return; }
      if (story && f0._mapa?.inst?.atualizar && !Lab.semMovimento()) { seguirMapa(f0, fazer); return; }   // outra escolha no Explorar: a câmera voa
      if (cartaoAtual()?.componente) trocarCartao(f0, fazer); else animarTroca(f0, fazer);
    }
    const temMapa = (k) => k?.componente === "mapa" || (k?.componentes || []).some((c) => c.componente === "mapa");
    /** O mesmo mapa segue para o cartão seguinte ou para outra escolha do Explorar (proposta 2026-10-14, Q-093, em teste):
     *  o nó do mapa passa para o palco novo — sozinho ou numa pilha, com outra altura — e muda de estado (cores, realce,
     *  malha, forma e câmera, na coreografia do adaptador); o resto do palco (ex.: as barras) surge. */
    function seguirMapa(f, mudar) {
      reuso = { mapa: f._mapa };
      const y = scrollY;
      mudar(); guardarEndereco(); render(); scrollTo(0, y);
      const nf = alvoRaiz.querySelector("article.viz"), no = nf?._mapa?.alvo;
      if (!nf?._palco || !no || Lab.semMovimento()) return;
      [...nf._palco.children].filter((n) => n.classList.contains("viz-palco-pilha") && n !== no && !n.contains(no))
        .forEach((n) => d3.select(n).style("opacity", 0).transition().delay(150).duration(350).ease(d3.easeCubicOut).style("opacity", 1)
          .on("end interrupt", function () { this.style.opacity = ""; }));
    }
    /** ESTADO (matriz de transições, L0016): mesmo componente em cartões seguidos. As marcas com a mesma chave
     *  (data-k) saem da posição e do tamanho antigos e vão para os novos; as novas surgem; as que saem esmaecem. */
    function animarEstado(f, mudar) {
      const velho = f._palco?.querySelector("svg")?.cloneNode(true);
      const antes = new Map();
      velho?.querySelectorAll("[data-k]").forEach((n) => antes.set(n.dataset.k, Object.fromEntries(["x", "y", "width", "height", "cx", "cy", "r", "opacity"].map((a) => [a, n.getAttribute(a)]))));
      const y = scrollY;
      mudar(); guardarEndereco(); render(); scrollTo(0, y);
      const np = alvoRaiz.querySelector("article.viz")?._palco, svgN = np?.querySelector("svg");
      if (!svgN) return;
      const D = 550;
      // poucas marcas em comum (ex.: outra variável, outras categorias): o desenho antigo esmaece por cima
      const novas = [...svgN.querySelectorAll("[data-k]")], comuns = novas.filter((n) => antes.has(n.dataset.k)).length;
      if (velho && comuns < 0.5 * Math.max(novas.length, antes.size)) {
        const c = velho.cloneNode(true);
        Object.assign(c.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
        np.append(c);
        d3.select(c).transition("estado").duration(D * 0.6).style("opacity", 0).remove();
      }
      svgN.querySelectorAll("[data-k]").forEach((n) => {
        const a = antes.get(n.dataset.k), s = d3.select(n);
        if (!a) { s.style("opacity", 0).transition("estado").delay(D * 0.4).duration(D * 0.6).style("opacity", 1).on("end interrupt", function () { this.style.opacity = ""; }); return; }
        const fim = {};
        for (const [k, v] of Object.entries(a)) if (v !== null && n.getAttribute(k) !== null && n.getAttribute(k) !== v) { fim[k] = n.getAttribute(k); n.setAttribute(k, v); }
        const t = s.transition("estado").duration(D).ease(d3.easeCubicInOut);
        for (const [k, v] of Object.entries(fim)) t.attr(k, v);
      });
      // o que não tem chave (eixos, rótulos) surge depois, para não piscar no lugar errado
      [...svgN.children].filter((n) => !n.matches("[data-k]") && !n.querySelector("[data-k]")).concat([...svgN.querySelectorAll("text:not([data-k])")]).forEach((n) => d3.select(n).style("opacity", 0).transition("estado").delay(D * 0.7).duration(250).style("opacity", 1)
        .on("end interrupt", function () { this.style.opacity = ""; }));
    }
    function trocarCartao(f, mudar) {
      const velho = f?._palco?.querySelector("svg")?.cloneNode(true);
      const y = scrollY;
      mudar(); guardarEndereco(); render(); scrollTo(0, y);
      if (Lab.semMovimento()) return;
      const np = alvoRaiz.querySelector("article.viz")?._palco;
      if (!np) return;
      const novos = [...np.children];
      if (velho) {
        Object.assign(velho.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
        np.append(velho);
        d3.select(velho).transition().duration(300).ease(d3.easeCubicOut).style("opacity", 0).remove();
      }
      // transição do d3 (e não CSS): termina sempre no estado final, mesmo se um quadro for pulado
      novos.forEach((n) => d3.select(n).style("opacity", 0).transition().delay(100).duration(300).ease(d3.easeCubicOut)
        .style("opacity", 1).on("end interrupt", function () { this.style.opacity = ""; }));
    }
    function animarTroca(f, mudar) {
      const palco = f._palco, pr = palco.getBoundingClientRect();
      const antes = new Map([...palco.querySelectorAll("circle[data-id]")].map((c) => { const r = c.getBoundingClientRect(); return [c.dataset.id, { x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2, r: r.width / 2 }]; }));
      const velho = palco.querySelector("svg")?.cloneNode(true);
      const y = scrollY;
      mudar(); guardarEndereco(); render(); scrollTo(0, y);
      if (Lab.semMovimento()) return;
      const nf = alvoRaiz.querySelector("article.viz");
      const np = nf?._palco, svgN = np?.querySelector("svg");
      if (!svgN) return;
      const npr = np.getBoundingClientRect(), DUR = 1000;
      if (velho) {
        velho.querySelectorAll("circle[data-id]").forEach((c) => c.remove());
        Object.assign(velho.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
        np.append(velho);
        d3.select(velho).transition().duration(DUR * 0.6).ease(d3.easeCubicOut).style("opacity", 0).remove();
      }
      const circulos = [...svgN.querySelectorAll("circle[data-id]")], ancestrais = new Set();
      circulos.forEach((c) => { for (let n = c.parentNode; n && n !== svgN.parentNode; n = n.parentNode) ancestrais.add(n); });
      const surgir = [];
      ancestrais.forEach((a) => [...a.children].forEach((ch) => { if (!ancestrais.has(ch) && !ch.matches("circle[data-id]")) surgir.push(ch); }));
      surgir.forEach((n) => d3.select(n).style("opacity", 0).transition().delay(DUR * 0.35).duration(DUR * 0.65).style("opacity", 1));
      [...np.children].filter((n) => n !== svgN && n.tagName !== "svg" && !n.classList.contains("viz-cartao") && !n.classList.contains("viz-anot"))
        .forEach((n) => { n.style.opacity = "0"; n.style.transition = `opacity ${DUR * 0.6}ms ease ${DUR * 0.4}ms`; requestAnimationFrame(() => { n.style.opacity = ""; }); });
      for (const c of circulos) {
        const a = antes.get(c.dataset.id);
        if (!a) continue;
        const r = c.getBoundingClientRect(), k2 = c.parentNode.getCTM()?.a || 1;
        const dx = (a.x - (r.left - npr.left + r.width / 2)) / k2, dy = (a.y - (r.top - npr.top + r.height / 2)) / k2;
        const rFim = c.getAttribute("r");
        d3.select(c).attr("transform", `translate(${dx},${dy})`).attr("r", a.r / k2)
          .transition().duration(DUR).ease(d3.easeCubicInOut).attr("transform", "translate(0,0)").attr("r", rFim);
      }
    }

    // ---------------------------------------------------------------- tabela alternativa e CSV
    function colunasTabela() {
      const lig = P.grafico.ligacoes, D = P.grafico.detalhe || {};
      return [...new Set([D.titulo || "id", lig.y, lig.x, P.escalas?.cor?.campo, P.grafico.destaque?.coluna].filter(Boolean))];
    }
    function tabelaAlternativa() {
      if (!linhas.length) return "";
      const cols = colunasTabela(), lig = P.grafico.ligacoes;
      const ord = [...linhas].sort((a, b) => (b[lig.y] ?? -Infinity) - (a[lig.y] ?? -Infinity));
      const t = el("table", {}, el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { scope: "col", class: col(c).tipo === "medida" ? "n" : null, text: col(c).curto || col(c).rotulo || c })))),
        el("tbody", {}, ...ord.map((l) => el("tr", {}, ...cols.map((c) => el("td", { class: col(c).tipo === "medida" ? "n" : null, text: fmtCol(c, l[c]) }))))));
      return el("div", {}, el("p", { class: "fraco", text: `Os dados do gráfico em tabela (${Lab.fmtInt.format(linhas.length)} linhas, do maior para o menor em “${col(lig.y).rotulo || lig.y}”):` }), el("div", { class: "tabela-alt" }, t));
    }
    /** Tabela dos dados prontos de um componente de cartão (o que o Python preparou; o JS só põe em linhas). */
    function tabelaDe(d) {
      if (Array.isArray(d)) {
        const cols = [...new Set(d.flatMap((x) => Object.keys(x).filter((k) => k !== "cor" && (x[k] == null || typeof x[k] !== "object"))))];
        return d.length ? { cols, linhas: d.map((x) => cols.map((c) => x[c])) } : null;
      }
      if (!d || typeof d !== "object") return null;
      const nome = Object.fromEntries((d.categorias || []).map((k) => [k.id, k.rotulo]));
      if (d.linhas && d.categorias) return { cols: ["linha", ...d.categorias.map((k) => k.rotulo)], linhas: d.linhas.map((l) => [l.rotulo, ...d.categorias.map((k) => l.valores?.[k.id] ?? "")]) };
      if (d.ligacoes) return { cols: ["de", "para", d.formato === "pct" ? "% do total" : d.unidade || "n"], linhas: d.ligacoes.map((l) => [`${d.etapas?.[l.etapa] ?? ""}: ${nome[l.de] ?? l.de}`, `${d.etapas?.[l.etapa + 1] ?? ""}: ${nome[l.para] ?? l.para}`, l.n]) };
      if (d.unidades) {
        const U = (typeof d.unidades === "string" ? e.unidades?.[d.unidades] : d.unidades) || {};
        const R = d.realce ? new Set([].concat(d.realce)) : null;   // cartão de um território ou município: só as unidades realçadas
        return { cols: ["id", "nome", "categoria", d.rotulo_tamanho || "tamanho"], linhas: Object.entries(U).filter(([id]) => !R || R.has(id)).map(([id, u]) => [id, u.nome, nome[u.categoria] ?? u.categoria ?? "", u.tamanho ?? ""]) };
      }
      if (d.niveis) {   // mapa em níveis: uma linha por unidade de cada nível, com o nível de cima
        const nomeCat = Object.fromEntries((d.categorias || []).map((k) => [k.id, k.rotulo]));
        return { cols: ["nivel", "id", "nome", "pertence_a", d.rotulo_valor || "valor", d.titulo_escala ? "classe" : "categoria", d.rotulo_tamanho || "tamanho"],
          linhas: d.niveis.flatMap((n) => Object.entries((typeof n.unidades === "string" ? e.unidades?.[n.unidades] : n.unidades) || {})
            .map(([id, u]) => [n.rotulo_um || n.id, id, u.nome, u.pai ?? "", u.valor ?? "", nomeCat[u.categoria] ?? "", u.tamanho ?? ""])) };
      }
      if (d.grupos?.[0]?.itens) return { cols: ["grupo", "item", "valor"], linhas: d.grupos.flatMap((g) => g.itens.map((i) => [g.rotulo, i.rotulo, i.valor])) };
      if (d.series) { const T = d.tempo || d.anos || d.grupos || []; return { cols: ["série", ...T], linhas: d.series.map((x) => [x.rotulo, ...T.map((_, i) => x.valores?.[i] ?? "")]) }; }
      if (d.itens) return { cols: ["categoria", "n", "valor"], linhas: d.itens.map((i) => [i.rotulo, i.n, i.valor_rotulo ?? ""]) };
      if (d.pontos && !d.niveis) return tabelaDe(d.pontos);
      return null;
    }
    function baixarCSV() {   // separador “;”, decimal com vírgula, UTF-8 com BOM (abre no Excel)
      const q = (t) => `"${String(t ?? "").replaceAll('"', '""')}"`;
      const K = cartaoAtual();
      let corpo;
      if (K?.componente || K?.componentes || (!K && P.grafico.dados)) {   // cartão com dados próprios: as tabelas dos componentes
        const its = K ? (K.componentes || [K]) : [P.grafico];
        const num = (x) => (x === null || x === undefined ? "" : typeof x === "number" ? String(x).replace(".", ",") : q(x));
        corpo = its.map((it) => tabelaDe(resolver(it.dados, e))).filter(Boolean).map((t) => [t.cols.map(q).join(";"), ...t.linhas.map((l) => l.map(num).join(";"))].join("\n")).join("\n\n");
      } else {
        const cols = fatia.colunas || [];
        const v = (c, x) => (x === null || x === undefined ? "" : col(c).tipo === "booleano" ? (x ? "sim" : "nao") : typeof x === "number" ? String(x).replace(".", ",") : q(x));
        corpo = [cols.join(";"), ...linhas.map((l) => cols.map((c) => v(c, l[c])).join(";"))].join("\n");
      }
      const texto = `\ufeff${corpo}\n`;
      const nome = `${P.id}${fatiador ? `-${est[fatiador.id]}` : ""}${story && K ? `-${K.id}` : ""}.csv`;
      const a = el("a", { href: URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" })), download: nome });
      document.body.append(a); a.click(); a.remove();
    }

    // ---------------------------------------------------------------- imagem do leitor: SVG único → PNG (L0012, L0013)
    const FONTE = () => getComputedStyle(document.documentElement).getPropertyValue("--fonte-texto").trim() || "system-ui, sans-serif";
    const ctxMedida = document.createElement("canvas").getContext("2d");
    const medir = (t, px, peso = 400) => { ctxMedida.font = `${peso} ${px}px ${FONTE()}`; return ctxMedida.measureText(t).width; };
    function quebrar(texto, px, largura, peso = 400) {
      const ls = []; let l = "";
      for (const p of String(texto).split(/\s+/)) { const t = l ? `${l} ${p}` : p; if (l && medir(t, px, peso) > largura) { ls.push(l); l = p; } else l = t; }
      if (l) ls.push(l);
      return ls;
    }
    /** Imagem do estado do momento: chapéu, título (controles como texto), subtítulo inteiro, gráfico (com zoom, aba,
     *  destaque, local selecionado com número, anotação se aberta), N, legenda (item marcado), fonte e assinatura. */
    async function gerarImagem(fmt, forcarMargem = false) {
      if (story) return gerarImagemStory(fmt);
      const [W, H0] = TAM_IMG[fmt], pad = 16, iw = W - 2 * pad;
      let H = H0;
      const svg = d3.create("svg").attr("xmlns", "http://www.w3.org/2000/svg").attr("width", W).attr("height", H).attr("font-family", FONTE());
      const fundo = svg.append("rect").attr("width", W).attr("height", H).attr("fill", tok("cor-superficie"));
      const escrever = (ls, x, y, px, { peso = 400, cor = "cor-texto", lh = 1.3 } = {}) => {
        const t = svg.append("text").attr("x", x).attr("y", y).attr("font-size", px).attr("font-weight", peso).attr("fill", tok(cor));
        ls.forEach((l, k) => t.append("tspan").attr("x", x).attr("dy", k ? px * lh : px).text(l));
        return y + ls.length * px * lh;
      };
      const textoPlano = (t) => resolver(t, e).replace(/\{c\.(\w+)\}/g, (_, id) => (ctl[id]?.tipo === "busca" ? rotuloFatia() : rotuloDe(ctl[id], est[id]) ?? ""));
      let y = pad - 2;
      if (P.chapeu) y = escrever([textoPlano(P.chapeu)], pad, y, 11.5, { peso: 600, cor: "cor-texto-secundario" }) + 3;
      const tt = fmt === "paisagem" ? 19 : 18;
      y = escrever(quebrar(semMarcas(textoPlano(P.titulo)), tt, iw, 700), pad, y, tt, { peso: 700, lh: 1.22 }) + 4;
      const sub = resolver(P.subtitulo, e);
      if (sub) y = escrever(quebrar(semMarcas(sub), 12.5, iw), pad, y, 12.5, { cor: "cor-texto-secundario" }) + 4;
      const vista = P.grafico.companheiro && est.aba === "mapa" ? "mapa" : "principal";
      // rodapé mínimo: fonte e assinatura “nome · Saiba mais em <endereço>” (Q-022)
      const rod = quebrar(`Fonte: ${P.fonte}`, 10, iw);
      // assinatura em quantas linhas couber: “nome · Saiba mais em <endereço>”
      const ass = linhasAssinatura(iw), hAss = 16 + (ass.length - 1) * 14, hRod = rod.length * 13 + hAss + 6;
      // anotação: “ao tocar” só sai se estiver aberta (Q-057); na imagem vira rótulo leve
      const anot = (P.grafico.anotacoes || []).filter((a) => a.tipo !== "linha").map((a) => resolver(a, e)).find((a) => a.texto && a.alvo && (a.estilo !== "toque" || est.anotAberta));
      const estiloImg = forcarMargem ? "margem" : "rotulo";
      const linhasAnot = anot && vista === "principal" ? quebrar(anot.texto, 11, estiloImg === "margem" ? iw : Math.min(170, iw * 0.55)) : [];
      const escC = escalaCor(), c = P.escalas?.cor;
      const lSel = est.sel ? linhas.find((l) => l.id === est.sel) : null;
      const contextoSel = lSel ? (P.grafico.destaque && !lSel[P.grafico.destaque.coluna] ? "fora" : String(escC.classe(lSel[c?.campo]) ?? "sem")) : null;
      const marcada = est.legFixa ?? contextoSel;
      const itensLeg = P.grafico.destaque ? [[tok("cor-grade"), P.grafico.destaque.rotulo || "fora do destaque", "fora"]] : [];
      // paisagem do mapa: legenda numa coluna à direita, para o mapa ganhar altura (Q-065)
      const lado = fmt === "paisagem" && vista === "mapa", lw = lado ? 200 : iw, lx = lado ? W - pad - lw : pad;
      const textoN = resolver(typeof P.amostra === "string" ? P.amostra : P.amostra?.[vista === "mapa" ? "mapa" : "grafico"], e) || "";
      const linhasN = lado ? quebrar(textoN, 10.5, lw, 600) : [textoN];
      const ext = extras(vista).map((x) => [x.tipo, quebrar(x.texto, 10, lw - 22)]);
      // legenda de tamanho no zoom do momento (mapa com tamanho por valor)
      const compM = P.grafico.companheiro;
      let tamImg = null;   // preenchida depois de desenhar o palco (a escala é a do componente, no zoom do momento)
      const linhasTitEsc = c ? quebrar(c.titulo_curto || c.titulo, 10, lw) : [];
      const hEscala = (c ? 52 + (linhasTitEsc.length - 1) * 12 : 0) + 16 + (linhasN.length - 1) * 13;   // N e título da escala, quebrados
      const espV = vista === "mapa" ? compM : P.grafico, formaV = opcaoAtual("forma", espV?.opcoes?.forma);
      const hTam = formaV === "bolhas" && espV?.ligacoes?.tamanho ? 2 * 11 * Math.sqrt(est.cam?.k || 1) + 30 : 0;   // reserva; a medida exata vem do componente
      // gráfico com dados próprios (ex.: mapa em níveis): a legenda curta vem do componente (legendaImagem), como no story;
      // um desenho de ensaio, fora da tela, diz quais itens ela tem (classes presentes, forma, recorte)
      let rowsD = [];
      if (P.grafico.dados && !linhas.length) {
        const ensaio = el("div", { style: "position:fixed;left:-10000px;top:0" }), f0 = el("div");
        Object.assign(f0.dataset, { fmt, rep: "estatica", host: "imagem" });
        const p0 = el("div", { style: `width:${iw}px;height:200px;position:relative` });
        f0._palco = p0; f0._palcoCompa = null; f0._lado = false; f0.append(p0); ensaio.append(f0); document.body.append(ensaio);
        const itensD = (desenharPalco(f0)?.legendaImagem || []).flatMap((it) => (!it.cor && medir(it.rotulo, 10.5) > lw ? quebrar(it.rotulo, 10.5, lw).map((r, j) => ({ rotulo: r, quebra: j > 0 })) : [it]));
        ensaio.remove();
        let xc = 0;
        rowsD = itensD.length ? [[]] : [];
        for (const it of itensD) {
          const w = (it.cor ? 13 : 0) + medir(it.rotulo, 10.5) + 12;
          if ((xc + w > lw || it.quebra || (!it.cor && rowsD.at(-1).some((x) => x.cor))) && rowsD.at(-1).length) { rowsD.push([]); xc = 0; }
          rowsD.at(-1).push({ ...it, x: xc }); xc += w;
        }
      }
      const hLeg = hEscala + (itensLeg.length ? 15 : 0) + d3.sum(ext, ([, ls]) => ls.length * 13 + 2) + hTam + rowsD.length * 15;
      if (linhasAnot.length && estiloImg === "margem") y = escrever(linhasAnot, pad, y + 2, 11, { peso: 600 }) + 2;
      const graficoMin = lado ? Math.max(hLeg + 12, (iw - lw - 12) * 0.7) : vista === "mapa" ? iw * 0.95 : Math.max(230, iw * 0.62);
      H = Math.round(Math.min(W * TETO_IMG[fmt], Math.max(H0, y + 4 + graficoMin + 12 + (lado ? 0 : hLeg) + 10 + hRod + pad)));
      const yRod = H - pad + 2 - rod.length * 13 - hAss;
      escrever(rod, pad, yRod, 10, { cor: "cor-texto-secundario" });
      escreverAssinatura(svg, ass, pad, yRod + rod.length * 13 + 3 + 11);
      svg.append("line").attr("x1", pad).attr("x2", W - pad).attr("y1", yRod - 4).attr("y2", yRod - 4).attr("stroke", tok("cor-grade"));
      const gy = y + 4, yLeg = lado ? gy : yRod - 10 - hLeg;
      const gx = pad, gw = lado ? iw - lw - 12 : iw, gh = Math.max(60, (lado ? yRod - 10 : yLeg - 6) - gy);
      // gráfico: desenhado fora da tela no tamanho exato e copiado como SVG
      const fora = el("div", { style: "position:fixed;left:-10000px;top:0" });
      const ff = el("div"); Object.assign(ff.dataset, { fmt, rep: "estatica", host: "imagem" });
      const pal = el("div", { style: `width:${gw}px;height:${gh}px;position:relative` });
      ff._palco = pal; ff._palcoCompa = null; ff._lado = false;
      ff.append(pal); fora.append(ff); document.body.append(fora);
      const principal = desenharPalco(ff);
      if (principal?.tamanho) { const { sc, rotulo } = principal.tamanho, ref = d3.ticks(0, sc.domain()[1], 3).filter((v) => v > 0).slice(-3); tamImg = { sc, ref, h: 2 * sc(d3.max(ref)) + 30, rotulo }; }
      const sv = pal.querySelector("svg");
      let obst = [], ancora = null, selImg = null;
      if (sv) {
        const pr = pal.getBoundingClientRect();
        const centro = (no) => { const r = no.getBoundingClientRect(); return { cx: gx + r.left - pr.left + r.width / 2, cy: gy + r.top - pr.top + r.height / 2, r: r.width / 2 }; };
        const dentro = (p) => p.cx >= gx && p.cx <= gx + gw && p.cy >= gy && p.cy <= gy + gh;
        const alvoA = anot && linhasAnot.length ? sv.querySelector(`circle[data-id="${CSS.escape(anot.alvo)}"]`) : null;
        if (alvoA) { const p = centro(alvoA); if (dentro(p)) ancora = p; }
        if (est.legFixa != null) sv.querySelectorAll("[data-chave]").forEach((nn) => nn.setAttribute("opacity", nn.getAttribute("data-chave") === est.legFixa ? 1 : 0.15));
        const selNo = lSel ? sv.querySelector(`circle[data-id="${CSS.escape(lSel.id)}"]`) : null;
        if (selNo) { const p = centro(selNo); if (dentro(p)) selImg = p; }
        obst = [...sv.querySelectorAll("text, circle")].filter((nn) => nn.tagName === "text" || nn.getAttribute("fill") !== tok("cor-grade"))
          .map((nn) => { const r = nn.getBoundingClientRect(); return { x: gx + r.left - pr.left, y: gy + r.top - pr.top, w: r.width, h: r.height }; });
        const copia = sv.cloneNode(true); copia.setAttribute("x", gx); copia.setAttribute("y", gy);
        await embutirImagens(copia);
        svg.node().append(copia);
      } else escrever(quebrar(sub || "Sem dados", 12, gw), gx, gy + gh / 2, 12, { cor: "cor-texto-secundario" });
      fora.remove();
      if (selImg) {   // local selecionado: anel, nome e o número que ele representa (Q-057)
        const lig = vista === "mapa" ? compM.ligacoes : P.grafico.ligacoes, ly = lig.y || lig.tamanho, lx = lig.x;
        const nome = curto(String(lSel[P.grafico.detalhe?.titulo || "id"] || ""), 30);
        const valor = [ly ? `${fmtCol(ly, lSel[ly])} ${col(ly).curto_valor || col(ly).rotulo?.toLowerCase() || ""}` : null, lx ? `${col(lx).curto || lx} ${fmtCol(lx, lSel[lx])}` : null].filter(Boolean).join(" · ");
        svg.append("circle").attr("cx", selImg.cx).attr("cy", selImg.cy).attr("r", selImg.r + 4).attr("fill", "none").attr("stroke", tok("cor-texto")).attr("stroke-width", 2.2);
        const bw = Math.max(medir(nome, 11, 700), medir(valor, 10.5)) + 6;
        const lugar = buscarLugar({ W: gx + gw, H: gy + gh, cx: selImg.cx, cy: selImg.cy, bw, bh: 29, obst: [{ x: 0, y: 0, w: W, h: gy }] }) || { x: Math.max(gx, Math.min(gx + gw - bw, selImg.cx - bw / 2)), y: Math.max(gy, selImg.cy - selImg.r - 34) };
        const t = svg.append("text").attr("font-size", 11).attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3.5);
        t.append("tspan").attr("x", lugar.x + 3).attr("y", lugar.y + 11.5).attr("font-weight", 700).text(nome);
        t.append("tspan").attr("x", lugar.x + 3).attr("y", lugar.y + 25).attr("font-size", 10.5).text(valor);
        obst.push({ x: lugar.x, y: lugar.y, w: bw, h: 29 });
      }
      if (ancora && estiloImg !== "margem") {
        const bw = d3.max(linhasAnot, (l) => medir(l, 11)) + 4, bh = linhasAnot.length * 14 + 2;
        const lugar = buscarLugar({ W: gx + gw, H: gy + gh, cx: ancora.cx, cy: ancora.cy, bw, bh, obst: [...obst, { x: 0, y: 0, w: W, h: gy }] });
        if (!lugar) return gerarImagem(fmt, true);   // sem lugar livre: a nota vai para cima do gráfico
        svg.append("circle").attr("cx", ancora.cx).attr("cy", ancora.cy).attr("r", 8).attr("fill", "none").attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2);
        const ang = Math.atan2(lugar.ly - ancora.cy, lugar.lx - ancora.cx);
        svg.append("line").attr("x1", ancora.cx + 8 * Math.cos(ang)).attr("y1", ancora.cy + 8 * Math.sin(ang)).attr("x2", lugar.lx).attr("y2", lugar.ly).attr("stroke", tok("cor-texto")).attr("stroke-width", 0.8);
        const t = svg.append("text").attr("font-size", 11).attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3);
        linhasAnot.forEach((l, k) => t.append("tspan").attr("x", lugar.x + 2).attr("y", lugar.y + 11 + k * 14).text(l));
      } else if (ancora) {
        svg.append("circle").attr("cx", ancora.cx).attr("cy", ancora.cy).attr("r", 8).attr("fill", "none").attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2);
        svg.append("line").attr("x1", ancora.cx).attr("x2", ancora.cx).attr("y1", gy - 2).attr("y2", ancora.cy - 8).attr("stroke", tok("cor-texto")).attr("stroke-width", 0.8);
      }
      // N, escala em quadrados (o item marcado ganha contorno), fora do destaque, extras, tamanho
      escrever(linhasN, lx, yLeg - 1, 10.5, { peso: 600 });
      let yA = yLeg + 16 + (linhasN.length - 1) * 13;
      if (c) {
        const nC = escC.cores.length, qw = Math.min(56, (Math.min(lw, 320) - 8) / nC);
        linhasTitEsc.forEach((t, k) => svg.append("text").attr("x", lx).attr("y", yA + 9 + k * 12).attr("font-size", 10).attr("fill", tok("cor-texto-secundario")).text(t));
        yA += (linhasTitEsc.length - 1) * 12;
        svg.append("text").attr("x", lx).attr("y", yA + 22).attr("font-size", 10).attr("font-weight", 600).attr("fill", tok("cor-texto")).text(`← ${c.pontas[0].rotulo}`);
        svg.append("text").attr("x", lx + (qw + 2) * nC - 2).attr("y", yA + 22).attr("text-anchor", "end").attr("font-size", 10).attr("font-weight", 600).attr("fill", tok("cor-texto")).text(`${c.pontas.at(-1).rotulo} →`);
        escC.cores.forEach((cor, k) => {
          const marc = marcada === String(k), apagado = marcada != null && !marc;
          svg.append("rect").attr("x", lx + k * (qw + 2)).attr("y", yA + 27).attr("width", qw).attr("height", 10).attr("fill", cor).attr("opacity", apagado ? 0.35 : 1)
            .attr("stroke", marc ? tok("cor-texto") : "none").attr("stroke-width", marc ? 2 : 0);
          svg.append("text").attr("x", lx + k * (qw + 2) + qw / 2).attr("y", yA + 48).attr("text-anchor", "middle").attr("font-size", 9.5).attr("font-weight", marc ? 700 : 400)
            .attr("fill", tok(marc ? "cor-texto" : "cor-texto-secundario")).text(c.curtas[k]);
        });
        yA += 52;
      }
      for (const [cor, t, chave] of itensLeg) {
        const marc = marcada === chave, apagado = marcada != null && !marc;
        svg.append("rect").attr("x", lx).attr("y", yA + 2).attr("width", 10).attr("height", 10).attr("rx", 5).attr("fill", cor).attr("opacity", apagado ? 0.35 : 1).attr("stroke", marc ? tok("cor-texto") : "none").attr("stroke-width", marc ? 2 : 0);
        svg.append("text").attr("x", lx + 14).attr("y", yA + 11).attr("font-size", 10.5).attr("font-weight", marc ? 700 : 400).attr("fill", tok(marc ? "cor-texto" : "cor-texto-secundario")).text(t);
        yA += 15;
      }
      for (const ln of rowsD) {   // legenda curta do componente (dados próprios)
        for (const it of ln) {
          if (it.cor) svg.append("rect").attr("x", lx + it.x).attr("y", yA + 3).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", it.cor);
          svg.append("text").attr("x", lx + it.x + (it.cor ? 13 : 0)).attr("y", yA + 12).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(it.rotulo);
        }
        yA += 15;
      }
      if (tamImg) {
        escrever([`Área ∝ ${tamImg.rotulo}`], lx, yA + 2, 10, { cor: "cor-texto-secundario" });
        let x = lx;
        const base = yA + tamImg.h - 4;
        for (const v of tamImg.ref) {
          const r = tamImg.sc(v), cx = x + Math.max(r, 22);
          svg.append("circle").attr("cx", cx).attr("cy", base - r).attr("r", r).attr("fill", "none").attr("stroke", tok("cor-texto-secundario"));
          svg.append("text").attr("x", cx).attr("y", base - 2 * r - 3).attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", tok("cor-texto-secundario")).text(Lab.fmtInt.format(v));
          x += Math.max(2 * r, 44) + 8;
        }
        yA += tamImg.h;
      }
      for (const [tipo, ls] of ext) {
        const yy = yA + 4; yA += ls.length * 13 + 2;
        if (tipo === "pontilhada") svg.append("line").attr("x1", lx + 8).attr("x2", lx + 8).attr("y1", yy - 2).attr("y2", yy + 8).attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "2 2");
        else svg.append("line").attr("x1", lx).attr("x2", lx + 16).attr("y1", yy + 3).attr("y2", yy + 3).attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "4 3");
        escrever(ls, lx + 22, yy - 2, 10, { cor: "cor-texto-secundario" });
      }
      svg.attr("height", H).attr("viewBox", `0 0 ${W} ${H}`); fundo.attr("height", H);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg.node()))}`;
      await img.decode();
      const cv = document.createElement("canvas"); cv.width = W * ESCALA_IMG; cv.height = H * ESCALA_IMG;
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      return { cv, url: cv.toDataURL("image/png"), W, H };
    }
    /** Imagem de um cartão do story: 9:16 (360 × 640, para stories) ou paisagem (640 × 360, prévia do link). Chapéu,
     *  título e texto do cartão, o palco do momento (copiado como SVG), legenda curta, fonte e assinatura. */
    async function gerarImagemStory(fmt) {
      const K = cartaoAtual(), paisagem = fmt === "paisagem", [W, H] = paisagem ? [640, 360] : [360, 640], pad = 18, iw = W - 2 * pad;
      const svg = d3.create("svg").attr("xmlns", "http://www.w3.org/2000/svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("font-family", FONTE());
      svg.append("rect").attr("width", W).attr("height", H).attr("fill", tok("cor-superficie"));
      const escrever = (ls, x, y, px, { peso = 400, cor = "cor-texto", lh = 1.3 } = {}) => {
        const tx = svg.append("text").attr("x", x).attr("y", y).attr("font-size", px).attr("font-weight", peso).attr("fill", tok(cor));
        ls.forEach((l, k) => tx.append("tspan").attr("x", x).attr("dy", k ? px * lh : px).text(l));
        return y + ls.length * px * lh;
      };
      const temPalco = Boolean(K.vista || K.componente || K.componentes);
      const colW = paisagem && temPalco ? 230 : iw;
      // rodapé: fonte e assinatura
      const ass = linhasAssinatura(iw);   // nome e endereço em quantas linhas couber
      const rod = quebrar(`Fonte: ${P.fonte}`, 10, iw), yRod = H - pad - rod.length * 13 - ass.length * 14;
      svg.append("line").attr("x1", pad).attr("x2", W - pad).attr("y1", yRod - 6).attr("y2", yRod - 6).attr("stroke", tok("cor-grade"));
      escrever(rod, pad, yRod - 2, 10, { cor: "cor-texto-secundario" });
      escreverAssinatura(svg, ass, pad, yRod + rod.length * 13 + 10);
      // textos do cartão
      let y = pad - 2;
      // chapéu: recorte do story, ou o nome dele, e o capítulo — a imagem circula sem os outros cartões (pesquisador, 2026-10-12)
      const chapeuImg = [P.chapeu ? textoPlano(P.chapeu) : K.capa ? null : textoPlano(P.titulo), K.capa ? null : K.capitulo].filter(Boolean).map(semMarcas).join(" · ");
      if (chapeuImg) y = escrever(quebrar(chapeuImg, 11.5, colW, 600).slice(0, 2), pad, y, 11.5, { peso: 600, cor: "cor-texto-secundario" }) + 6;
      const tt = K.capa ? 26 : paisagem ? 18 : 20;
      y = escrever(quebrar(semMarcas(textoPlano(K.titulo)), tt, colW, 700), pad, y, tt, { peso: 700, lh: 1.18 }) + 6;
      const tx = textoPlano(K.texto);
      if (tx) y = escrever(quebrar(semMarcas(tx), paisagem ? 12.5 : 13.5, colW), pad, y, paisagem ? 12.5 : 13.5, { cor: "cor-texto-secundario", lh: 1.38 }) + 8;
      // item escolhido pelo leitor (ponto tocado): entra como "em foco", com os números do card — o título narrativo
      // sozinho deixava de explicar a imagem (pesquisador, 2026-10-12)
      const lSelImg = est.sel && K.vista ? linhas.find((l) => l.id === est.sel) : null;
      if (lSelImg) {
        const [nm, ctx, ls] = linhasDetalhe(lSelImg), px = paisagem ? 11.5 : 12;
        const corpo = [ctx, ...ls.filter(Boolean).slice(0, 2)].filter(Boolean).flatMap((t) => quebrar(t, px - 1, colW - 10));
        const y0 = y;
        y = escrever(quebrar(`Em foco: ${nm}`, px, colW - 10, 700), pad + 10, y, px, { peso: 700 });
        y = escrever(corpo, pad + 10, y + 1, px - 1, { cor: "cor-texto-secundario", lh: 1.32 }) + 4;
        svg.append("rect").attr("x", pad).attr("y", y0 + 1).attr("width", 3).attr("height", y - y0 - 4).attr("rx", 1.5).attr("fill", tok("cor-texto"));
        y += 4;
      }
      if (K.fim) for (const l of K.links || []) y = escrever(quebrar(`→ ${resolver(l.rotulo, e)}`, 12.5, colW, 600), pad, y + 4, 12.5, { peso: 600 }) + 4;
      if (temPalco) {
        // legenda curta: destaque (gráfico e mapa) e área (mapa)
        const legs = K.vista && K.destaque !== false && P.grafico.destaque ? [[tok(P.grafico.opcoes?.cor || "cor-cat-1"), P.grafico.destaque.rotulo_dentro || "em destaque"], [tok("cor-grade"), P.grafico.destaque.rotulo || "fora do destaque"]] : [];
        if (K.vista === "mapa" && P.grafico.companheiro?.ligacoes?.tamanho) legs.push([null, `área ∝ ${col(P.grafico.companheiro.ligacoes.tamanho).rotulo_tamanho || "valor"}`]);
        // legenda curta em linhas (o que não cabe desce), acima do rodapé
        const x0L = paisagem ? pad + colW + 16 : pad, linhasLeg = [[]];
        let xw = 0;
        for (const [cor, rot] of legs) { const w = (cor ? 13 : 0) + medir(rot, 10.5) + 14; if (xw + w > W - pad - x0L && linhasLeg.at(-1).length) { linhasLeg.push([]); xw = 0; } linhasLeg.at(-1).push([cor, rot, xw]); xw += w; }
        const yLeg = yRod - 16 - (legs.length ? 14 * linhasLeg.length : 0);
        linhasLeg.forEach((ln, r) => ln.forEach(([cor, rot, dx]) => {
          let xl = x0L + dx;
          const yy = yLeg + r * 14;
          if (cor) { svg.append("circle").attr("cx", xl + 5).attr("cy", yy + 6).attr("r", 4.5).attr("fill", cor); xl += 13; }
          svg.append("text").attr("x", xl).attr("y", yy + 10).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(rot);
        }));
        const gx = paisagem ? pad + colW + 16 : pad, gy = paisagem ? pad : y + 2, gw = W - pad - gx;
        const desenharEm = (gh) => {
          const fora = el("div", { style: "position:fixed;left:-10000px;top:0" });
          const ff = el("div"); Object.assign(ff.dataset, { fmt: paisagem ? "paisagem" : "retrato", rep: "estatica", host: "imagem" });
          const pal = el("div", { class: "viz-palco", style: `width:${gw}px;height:${gh}px;position:relative` });   // a pilha usa o flex do palco
          ff._palco = pal; ff._palcoCompa = null; ff._lado = false;
          ff.append(pal); fora.append(ff); document.body.append(fora);
          return { fora, pal, principal: desenharPalco(ff) };
        };
        let gh = Math.max(80, (legs.length ? yLeg - 6 : yRod - 12) - gy);
        let { fora, pal, principal } = desenharEm(gh);
        // componente com séries sem rótulo direto (ex.: linhas): legenda curta, em linhas, acima do rodapé
        const itensC = principal?.legendaImagem || [];
        if (itensC.length) {
          const larg = gw, linhasL = [[]];
          let xc = 0;
          const itensQ = itensC.flatMap((it) => (!it.cor && !it.linha && medir(it.rotulo, 10.5) > larg ? quebrar(it.rotulo, 10.5, larg).map((r, j) => ({ rotulo: r, quebra: j > 0 })) : [it]));
          for (const it of itensQ) { const w = (it.linha ? 22 : it.cor ? 13 : 0) + medir(it.rotulo, 10.5) + 12; if ((xc + w > larg || it.quebra) && linhasL.at(-1).length) { linhasL.push([]); xc = 0; } linhasL.at(-1).push({ ...it, x: xc }); xc += w; }
          const yL0 = (legs.length ? yLeg - 6 : yRod - 12) - linhasL.length * 15;
          linhasL.forEach((ln, r) => ln.forEach((it) => {
            const yy = yL0 + r * 15 + 8, x0 = gx + it.x;
            if (it.linha) svg.append("line").attr("x1", x0).attr("x2", x0 + 18).attr("y1", yy).attr("y2", yy).attr("stroke", it.cor).attr("stroke-width", 2.5).attr("stroke-dasharray", it.tracejado ? "4 3" : null);
            else if (it.cor) svg.append("rect").attr("x", x0).attr("y", yy - 5).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", it.cor);
            svg.append("text").attr("x", x0 + (it.linha ? 22 : it.cor ? 13 : 0)).attr("y", yy + 3.5).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(it.rotulo);
          }));
          fora.remove();
          gh = Math.max(80, yL0 - 4 - gy);
          ({ fora, pal, principal } = desenharEm(gh));
        }
        // pilha de componentes (mapa + barras…): cada desenho no seu lugar dentro do palco
        const pr0 = pal.getBoundingClientRect();
        for (const sub of K.componentes ? [...pal.querySelectorAll(".viz-palco-pilha")].slice(1) : []) {
          const s2 = sub.querySelector("svg");
          if (!s2) continue;
          const r2 = s2.getBoundingClientRect(), c2 = s2.cloneNode(true);
          c2.setAttribute("x", gx + r2.left - pr0.left); c2.setAttribute("y", gy + r2.top - pr0.top);
          if (!c2.getAttribute("width")) c2.setAttribute("width", r2.width);
          await embutirImagens(c2);
          svg.node().append(c2);
        }
        for (const rl of K.componentes ? pal.querySelectorAll(".pilha-rotulo") : []) {   // rótulos da pilha
          const r = rl.getBoundingClientRect();
          svg.append("text").attr("x", gx + r.left - pr0.left).attr("y", gy + r.top - pr0.top + 11).attr("font-size", 11).attr("font-weight", 700)
            .attr("fill", tok("cor-texto-secundario")).text(rl.textContent);
        }
        const sv = pal.querySelector("svg");
        if (sv) {
          const pr = pal.getBoundingClientRect();
          const r1 = (sv.closest(".pilha-alvo") || sv.closest(".viz-palco-pilha") || pal).getBoundingClientRect();
          const copia = sv.cloneNode(true); copia.setAttribute("x", gx + r1.left - pr.left); copia.setAttribute("y", gy + r1.top - pr.top);
          if (!copia.getAttribute("viewBox") && !copia.getAttribute("width")) copia.setAttribute("width", gw);
          await embutirImagens(copia);
          svg.node().append(copia);
          // anotação do cartão: anel e rótulo no lugar livre
          for (const an of principal?.posicao ? anotacoesVisiveis() : []) {
            const no = sv.querySelector(`circle[data-id="${CSS.escape(an.alvo)}"]`);
            if (!no) continue;
            const r = no.getBoundingClientRect(), cx = gx + r.left - pr.left + r.width / 2, cy = gy + r.top - pr.top + r.height / 2;
            if (cx < gx || cx > gx + gw || cy < gy || cy > gy + gh) continue;   // fora do quadro da imagem: sem anel nem rótulo
            const obst = [...sv.querySelectorAll("text")].map((nn) => { const q = nn.getBoundingClientRect(); return { x: gx + q.left - pr.left, y: gy + q.top - pr.top, w: q.width, h: q.height }; });
            const bw = medir(an.texto, 11, 700) + 4;
            const lugar = buscarLugar({ W: gx + gw, H: gy + gh, cx, cy, bw, bh: 15, obst: [...obst, { x: 0, y: 0, w: W, h: gy }] }) || { x: Math.max(gx, Math.min(gx + gw - bw, cx - bw / 2)), y: Math.max(gy, cy - 30), lx: cx, ly: cy - 15 };
            svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r.width / 2 + 5).attr("fill", "none").attr("stroke", tok("cor-texto")).attr("stroke-width", 1.6);
            svg.append("text").attr("x", lugar.x + 2).attr("y", lugar.y + 11.5).attr("font-size", 11).attr("font-weight", 700).attr("fill", tok("cor-texto"))
              .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3.5).text(an.texto);
          }
        }
        fora.remove();
      }
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg.node()))}`;
      await img.decode();
      const cv = document.createElement("canvas"); cv.width = W * ESCALA_IMG; cv.height = H * ESCALA_IMG;
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      return { cv, url: cv.toDataURL("image/png"), W, H };
    }
    /** Um SVG convertido em imagem não busca arquivos de fora: os tiles do fundo entram como data URI (o OSM libera
     *  CORS); o tile que falhar sai da imagem, e o resto continua. */
    const tilesEmbutidos = new Map();   // um pedido por tile na vida da página (política de uso do OSM)
    const comoDataURL = (href) => {
      if (!tilesEmbutidos.has(href)) tilesEmbutidos.set(href, fetch(href, { mode: "cors" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then((b) => new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = falha; fr.readAsDataURL(b); }))
        .catch((erro) => { tilesEmbutidos.delete(href); throw erro; }));
      return tilesEmbutidos.get(href);
    };
    async function embutirImagens(no) {
      await Promise.all([...no.querySelectorAll("image")].map(async (im) => {
        const href = im.getAttribute("href") || "";
        if (!/^https?:/.test(href)) return;
        try { im.setAttribute("href", await comoDataURL(href)); } catch (erro) { im.remove(); }
      }));
    }
    async function abrirImagem(fmt) {
      const { cv, url, W, H } = await gerarImagem(fmt);
      const nome = `${P.id}${fatiador ? `-${est[fatiador.id]}` : ""}${story ? `-${cartaoAtual().id}` : ""}-${fmt}.png`;
      const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
      const arquivo = blob && typeof File === "function" ? new File([blob], nome, { type: "image/png" }) : null;
      const podeCompartilhar = arquivo && navigator.canShare?.({ files: [arquivo] });
      const veu = el("div", { class: "veu-imagem", onclick: (ev) => { if (ev.target === veu) veu.remove(); } },
        el("div", { class: "caixa-imagem", role: "dialog", "aria-label": "Imagem do que está na tela" },
          el("img", { src: url, alt: `Imagem: ${semMarcas(P.titulo)} — ${rotuloFatia()}`, style: `width:${W}px` }),
          el("p", {}, el("a", { href: url, download: nome }, `⤓ Baixar PNG (${W * ESCALA_IMG}×${H * ESCALA_IMG})`),
            podeCompartilhar ? el("button", { type: "button", onclick: () => navigator.share({ files: [arquivo], title: semMarcas(P.titulo) }).catch(() => {}) }, "↗ Enviar a imagem") : null,
            el("button", { type: "button", onclick: () => veu.remove() }, "Fechar")),
          el("p", { class: "fraco" }, "No celular, também dá para tocar e segurar a imagem para salvar.")));
      document.body.append(veu);
    }

    // ---------------------------------------------------------------- render
    const alvoRaiz = alvo;
    function render() {
      if (!fatia) return;
      Lab.esconderDica?.();
      if (host === "embed") {
        const W = innerWidth, H = innerHeight, fmt = formatoQuadro(W, H);
        const f = moldura({ fmt, rep: "interativa", hostQ: "embed", fixo: true, tamanho: { w: W, h: H }, legendaRec: fmt !== "paisagem" });
        alvo.replaceChildren(f); f._inst = desenharPalco(f);
        return;
      }
      const largura = Math.min(story ? 520 : 760, alvo.clientWidth || document.documentElement.clientWidth - 16);
      wAnt = alvo.clientWidth;
      if (story) {   // cartão em pé; o palco ocupa o que sobra da tela (mín. 260 px)
        const f = moldura({ fmt: "retrato", rep: "interativa", hostQ: "pagina", largura });
        alvo.replaceChildren(f);
        f._inst = desenharPalco(f);   // altura: o cartão ocupa a tela e o palco, o que sobra (lab-viz.css)
        capaImagem(f);
        return;
      }
      const fmt = formatoFluido(largura);
      const f = moldura({ fmt, rep: "interativa", hostQ: "pagina", largura, cartao: fmt === "retrato" ? "abaixo" : "sobre", legendaRec: Boolean(P.legenda?.recolhida) && fmt !== "paisagem" });
      alvo.replaceChildren(f);
      // grafico.opcoes.altura: fator sobre a altura padrão do formato (ex.: 1.4 para um mapa do país em retrato)
      f.querySelector(".viz-corpo").style.height = `${Math.round(largura * ALTURA_GRAFICO[fmt] * (+P.grafico.opcoes?.altura || 1))}px`;
      desenharPalco(f);
    }
    /** Capa com `imagem: <id de cartão>`: o gráfico daquele cartão, estático e esmaecido, ilustra a capa (proposta,
     *  pesquisador 2026-10-12: "capa atraente, instigante; pode ter uma imagem que remeta à visualização principal"). */
    function capaImagem(f) {
      const alvoI = f.querySelector(".capa-imagem"), K = cartaoAtual(), ref = K?.imagem && P.cartoes.find((k) => k.id === K.imagem);
      if (!alvoI || !ref) return;
      const w = alvoI.clientWidth, h = alvoI.clientHeight;
      if (w < 60 || h < 60) return;
      const ff = el("div"); Object.assign(ff.dataset, { fmt: "retrato", rep: "estatica", host: "imagem" });
      const pal = el("div", { class: "viz-palco", style: `width:${w}px;height:${h}px;position:relative` });
      ff._palco = pal; ff._palcoCompa = null; ff._lado = false;
      ff.append(pal); alvoI.append(ff);
      const antes = est.cartao;
      est.cartao = ref.id;
      try { desenharPalco(ff); } catch (erro) { alvoI.replaceChildren(); } finally { est.cartao = antes; }
    }
    function falhou(erro) {
      alvo.replaceChildren(el("p", { class: "viz-vazio", text: `Não foi possível carregar os dados desta escolha (${erro.message || erro}).` }));
    }
    // redesenha quando a largura do contêiner muda (girar o celular, barra de rolagem que aparece); a altura não conta,
    // porque no celular ela muda ao rolar a página
    let tRes = null, wAnt = 0;
    const mudouLargura = () => { const w = host === "embed" ? `${innerWidth}x${innerHeight}` : alvo.clientWidth; if (w === wAnt) return; wAnt = w; clearTimeout(tRes); tRes = setTimeout(render, 150); };
    if (typeof ResizeObserver === "function" && host !== "embed") new ResizeObserver(mudouLargura).observe(alvo); else addEventListener("resize", mudouLargura);
    const inicial = fatiador ? (indice.has(est[fatiador.id]) ? est[fatiador.id] : fatiador.inicial) : null;
    if (fatiador) est[fatiador.id] = inicial;
    // a fonte da página pode chegar depois do primeiro desenho e mudar a altura dos textos: redesenha uma vez
    const pronto = irPara(inicial).then(() => document.fonts?.ready).then(() => { if (fatia) render(); }).catch(falhou);
    return { pronto, gerarImagem, render, estado: est };
  }

  // ==================================================================== adaptadores (contrato: componentes.yaml)
  const adaptadores = {};

  /** dispersao — relação entre duas medidas (x, y); cor e destaque pelo plano; linhas de referência com rótulo direto. */
  adaptadores.dispersao = (C) => {
    const { alvo, lig, linhas, todas, frame, fmt } = C;
    const W = alvo.clientWidth, H = C.naImagem ? alvo.clientHeight : Math.max(150, alvo.clientHeight), m = { t: 14, r: 10, b: 30, l: 42 };
    const linhasRef = (C.P.grafico.anotacoes || []).filter((a) => a.tipo === "linha").map((a) => C.resolver(a)).filter((a) => typeof a.valor === "number");
    const refX = linhasRef.filter((a) => a.eixo === "x"), refY = linhasRef.filter((a) => a.eixo === "y");
    const sx = d3.scaleLinear().domain(d3.extent([...todas.map((l) => l[lig.x]), ...refX.map((a) => a.valor), -1, 1])).nice().range([m.l, W - m.r]);
    const sy = d3.scaleLinear().domain([0, d3.max([...todas.map((l) => l[lig.y]), ...refY.map((a) => a.valor)])]).nice().range([H - m.b, m.t]);
    const nDest = todas.filter(C.emDestaque).length;
    const svg = d3.select(alvo).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", `Dispersão de ${todas.length} pontos: ${C.col(lig.x).rotulo || lig.x} × ${C.col(lig.y).rotulo || lig.y}; ${nDest} em destaque. A tabela com os dados está em Como ler.`);
    svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(sx).ticks(W < 420 ? 4 : 7).tickFormat((v) => Lab.comSinal(v, (x) => `${x}`))).call(Lab.eixo);
    svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(sy).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(Lab.fmtInt.format))
      .call((x) => x.select(".domain").remove()).call((x) => x.selectAll("line").attr("stroke", tok("cor-grade"))).call((x) => x.selectAll("text").style("font-size", "11px").style("fill", tok("cor-texto-secundario")));
    if (C.opc.titulo_x) svg.append("text").attr("x", W - m.r).attr("y", H - 2).attr("text-anchor", "end").style("font-size", "10.5px").style("fill", tok("cor-texto-secundario")).text(C.resolver(C.opc.titulo_x));
    if (C.opc.titulo_y) svg.append("text").attr("x", m.l).attr("y", m.t - 3).style("font-size", "10.5px").style("fill", tok("cor-texto-secundario")).text(C.resolver(C.opc.titulo_y));
    const rotRef = (x, y, anc, t) => svg.append("text").attr("x", x).attr("y", y).attr("text-anchor", anc).style("font-size", "10px").style("font-style", "italic")
      .style("fill", tok("cor-texto-secundario")).style("paint-order", "stroke").style("stroke", tok("cor-superficie")).style("stroke-width", 3).text(t);
    for (const a of refX) { svg.append("line").attr("x1", sx(a.valor)).attr("x2", sx(a.valor)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", tok("cor-texto-secundario")).attr("stroke-dasharray", "4 3"); if (a.texto) rotRef(sx(a.valor) - 4, H - m.b - 6, "end", a.texto); }
    for (const a of refY) { svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", sy(a.valor)).attr("y2", sy(a.valor)).attr("stroke", tok("cor-texto-secundario")).attr("stroke-dasharray", "4 3"); if (a.texto) rotRef(W - m.r, sy(a.valor) + 12, "end", a.texto); }
    // tamanho: fixo, ou área proporcional (mesmo controle do companheiro; um só estado — L0011, L0014)
    const bolhas = C.opcao("forma") === "bolhas" && lig.tamanho, rMaxB = W < 420 ? 7 : 9;
    const sR = bolhas ? d3.scaleSqrt().domain([0, Lab.escalaArea(todas.map((l) => l[lig.tamanho]), 1).teto]).range([0, rMaxB]).clamp(true) : null;
    const r = (l) => (bolhas ? Math.max(1.6, sR(l[lig.tamanho] || 0)) : W < 420 ? 3.2 : 4);
    if (bolhas && !C.naImagem) frame.querySelector(".viz-legenda")?.append(el("div", { class: "leg-tamanho" }, Lab.legendaTamanho(sR, C.col(lig.tamanho).rotulo_tamanho || C.col(lig.tamanho).rotulo || lig.tamanho)));
    const pts = svg.append("g").selectAll("circle").data(linhas.filter((l) => l[lig.x] !== null && l[lig.y] !== null)).join("circle")
      .attr("data-id", (l) => l.id).attr("data-chave", C.chave).attr("cx", (l) => sx(l[lig.x])).attr("cy", (l) => sy(l[lig.y])).attr("r", r)
      .attr("fill", (l) => C.cor(l) ?? "none").attr("stroke", (l) => (C.cor(l) ? tok("cor-superficie") : tok("cor-texto-secundario"))).attr("stroke-width", 0.8)
      .attr("fill-opacity", bolhas ? 0.85 : null);
    if (C.interativa) C.ligar(pts);
    // rótulos diretos: ids e ordem vêm do Python ({e.rotulos}); o formato limita quantos cabem
    const R = C.P.grafico.rotulos;
    const ids = R ? (C.resolver(R.ids) || []).slice(0, ROTULOS_MAX[fmt] || 3) : [];
    const porId = new Map(todas.map((l) => [l.id, l]));
    const rot = ids.map((id) => porId.get(id)).filter(Boolean).map((l) => ({ l, x: sx(l[lig.x]) + 6, y: sy(l[lig.y]) + 4 })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < rot.length; k++) if (rot[k].y - rot[k - 1].y < 12) rot[k].y = rot[k - 1].y + 12;
    for (const q of rot) {
      const t = svg.append("text").attr("x", q.x).attr("y", q.y).style("font-size", "10.5px").style("font-weight", 600).style("fill", tok("cor-texto"))
        .style("paint-order", "stroke").style("stroke", tok("cor-superficie")).style("stroke-width", 3).text(curto(String(q.l[R.coluna] ?? ""), fmt === "paisagem" ? 26 : 20));
      if (q.x + t.node().getComputedTextLength() > W - 4) t.attr("x", q.x - 12).attr("text-anchor", "end");
    }
    return {
      tamanho: bolhas ? { sc: sR, rotulo: C.col(lig.tamanho).rotulo_tamanho || C.col(lig.tamanho).rotulo } : null,
      posicao: (id) => { const l = porId.get(id); return l ? [sx(l[lig.x]), sy(l[lig.y])] : null; },
      obstaculos: () => [...alvo.querySelectorAll("svg text, svg circle")].filter((n) => n.tagName === "text" || C.emDestaque(porId.get(n.dataset.id) || {})).map((n) => caixaRelativa(n, frame._palco)),
    };
  };

  /** mapa_pontos (EXPERIMENTAL, L0011) — pontos ou círculos de área proporcional (Dorling), fundo OSM em mapas de
   *  cidade (L0013), zoom pelos botões, Ctrl/⌘ + roda e pinça; um dedo nunca move o mapa (rola a página). */
  adaptadores.mapa_pontos = (C) => {
    const { alvo, lig, linhas, todas, est, frame } = C;
    const W = alvo.clientWidth, H = C.naImagem ? alvo.clientHeight : Math.max(150, alvo.clientHeight);
    const com = linhas.filter((l) => l[lig.lat] !== null && l[lig.lon] !== null);
    if (!com.length) { alvo.append(el("div", { class: "viz-vazio", text: C.resolver(C.espec.vazio) || "Nenhum ponto tem coordenada." })); return null; }
    const qq = (f, p) => d3.quantile(com.map(f).sort(d3.ascending), p);
    // área urbana (3% a 97% das coordenadas), com um mínimo de ~1,5 km para cidades com um ou dois pontos
    let [x0, x1, y0, y1] = [qq((l) => l[lig.lon], 0.03), qq((l) => l[lig.lon], 0.97), qq((l) => l[lig.lat], 0.03), qq((l) => l[lig.lat], 0.97)];
    const MIN = 0.014, cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
    if (x1 - x0 < MIN) [x0, x1] = [cx0 - MIN / 2, cx0 + MIN / 2];
    if (y1 - y0 < MIN) [y0, y1] = [cy0 - MIN / 2, cy0 + MIN / 2];
    const caixaUrb = { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[x0, y0], [x1, y1]] } };
    const proj = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], caixaUrb);
    const svg0 = d3.select(alvo).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", `Mapa de ${com.length} pontos de ${C.e.nome || ""}, nas mesmas cores do gráfico. A tabela com os dados está em Como ler.`);
    const fundo = C.opcao("fundo") ?? "nenhum";
    const comOSM = fundo === "osm" && C.osm?.disponivel?.();
    let gRuas = null;
    if (comOSM) {
      gRuas = svg0.append("g").attr("class", "ruas");
      if (C.naImagem) {   // na imagem o CSS não vale: cinza e esmaecido por filtro do próprio SVG
        svg0.insert("defs", ":first-child").append("filter").attr("id", "cinza-osm").append("feColorMatrix").attr("type", "saturate").attr("values", 0);
        gRuas.attr("filter", "url(#cinza-osm)").attr("opacity", 0.6);
      }
    }
    // sem o OSM (página aberta do arquivo, para revisar): fundo cinza da Esri, que funciona fora do servidor (L0006)
    const esri = fundo === "osm" && !comOSM && !C.naImagem && Lab.fundoRaster ? svg0.append("g").attr("class", "tiles") : null;
    const desenharRuas = comOSM ? C.osm.camada(gRuas, proj, W, H, C.naImagem)
      : esri ? (t) => { esri.attr("transform", t); Lab.fundoRaster.desenhar(esri, proj, W, H, t); } : () => {};
    const cena = svg0.append("g");
    if (C.e.contorno) cena.append("path").attr("d", d3.geoPath(proj)({ type: "Feature", geometry: C.e.contorno })).attr("fill", comOSM || esri ? "none" : tok("cor-fundo"))
      .attr("stroke", tok(comOSM ? "cor-texto-secundario" : "cor-eixo")).attr("vector-effect", "non-scaling-stroke");
    const forma = C.opcao("forma") ?? "pontos", bolhas = forma === "bolhas" && lig.tamanho;
    const nos = com.map((l) => { const [x, y] = proj([l[lig.lon], l[lig.lat]]); return { l, x, y, x0: x, y0: y }; });
    const rMax = W < 420 ? 8 : 11;
    const ea = bolhas ? Lab.escalaArea(nos.map((n) => n.l[lig.tamanho]), 1) : null, sR = bolhas ? d3.scaleSqrt().domain([0, ea.teto]).range([0, rMax]).clamp(true) : null;
    for (const n of nos) n.r = bolhas ? Math.max(1.8, sR(n.l[lig.tamanho])) : (W < 300 ? 2.6 : 3.4);
    if (bolhas) { const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => n.x0).strength(0.2)).force("y", d3.forceY((n) => n.y0).strength(0.2)).force("c", d3.forceCollide((n) => n.r + 0.5)).stop(); for (let i = 0; i < 160; i++) sim.tick(); }
    const porId = new Map(nos.map((n) => [n.l.id, n]));
    // legenda de tamanho: obrigatória quando o tamanho codifica um valor (L0013, Q-062); acompanha o zoom
    const rotTam = C.col(lig.tamanho).rotulo_tamanho || C.col(lig.tamanho).rotulo || lig.tamanho;
    const zonaTam = bolhas && !C.naImagem ? el("div", { class: "leg-tamanho" }) : null;
    const escTam = (k = 1) => d3.scaleSqrt().domain([0, ea.teto]).range([0, rMax * Math.sqrt(k)]);   // raio na tela: r ÷ √k × k
    const legTam = (k = 1) => Lab.legendaTamanho(escTam(k), rotTam);
    if (zonaTam) { frame.querySelector(".viz-legenda")?.append(zonaTam); zonaTam.replaceChildren(legTam(est.cam?.k || 1)); }
    const camT = (cam) => { const [px, py] = proj(cam.centro); return d3.zoomIdentity.translate(W / 2, H / 2).scale(cam.k).translate(-px, -py); };
    const pts = cena.append("g").selectAll("circle").data(com).join("circle")
      .attr("data-id", (l) => l.id).attr("data-chave", C.chave).attr("cx", (l) => porId.get(l.id).x).attr("cy", (l) => porId.get(l.id).y).attr("r", (l) => porId.get(l.id).r)
      .attr("fill", (l) => C.cor(l) ?? "none").attr("stroke", comOSM ? tok("cor-texto") : tok("cor-superficie")).attr("stroke-width", comOSM ? 0.8 : 0.6).attr("vector-effect", "non-scaling-stroke");
    let tAtual = d3.zoomIdentity, rafZoom = 0;
    const aoZoom = [];   // quem acompanha o zoom (anotações presas aos pontos)
    const aplicarT = (t) => {
      tAtual = t; cena.attr("transform", t); pts.attr("r", (l) => porId.get(l.id).r / Math.sqrt(t.k)); desenharRuas(t);
      if (aoZoom.length && !rafZoom) rafZoom = requestAnimationFrame(() => { rafZoom = 0; aoZoom.forEach((f) => f()); });
    };
    if (C.interativa) {
      C.ligar(pts);
      const aviso = el("div", { class: "aviso-roda", hidden: "" });
      let tAv = null;
      const avisar = (t) => { aviso.textContent = t; aviso.hidden = false; clearTimeout(tAv); tAv = setTimeout(() => { aviso.hidden = true; }, 1400); };
      const zoom = d3.zoom().scaleExtent([1, 16]).translateExtent([[0, 0], [W, H]])
        .filter((ev) => {
          const k = d3.zoomTransform(svg0.node()).k;
          if (ev.type === "wheel") { if (ev.ctrlKey || ev.metaKey) return true; avisar("Use Ctrl + roda (⌘ no Mac) para ampliar o mapa"); return false; }
          if (ev.type.startsWith("touch")) return ev.touches.length > 1;
          return !ev.button && k > 1;
        })
        .on("end", (ev) => zonaTam?.replaceChildren(legTam(ev.transform.k)))
        .on("zoom", (ev) => {
          aplicarT(ev.transform);
          const [cx, cy] = ev.transform.invert([W / 2, H / 2]);   // câmera em coordenadas geográficas: vale para a imagem também
          est.cam = ev.transform.k === 1 && !ev.transform.x && !ev.transform.y ? null : { centro: proj.invert([cx, cy]), k: ev.transform.k };
        });
      svg0.call(zoom).on("dblclick.zoom", null);
      svg0.style("touch-action", "pan-x pan-y");
      svg0.node().addEventListener("touchmove", (ev) => { if (ev.touches.length === 1 && d3.zoomTransform(svg0.node()).k > 1.01) avisar("Use dois dedos para mover o mapa"); }, { passive: true });
      alvo.style.position = "relative";
      alvo.append(aviso);
      if (est.cam) svg0.call(zoom.transform, camT(est.cam));
      alvo.append(el("div", { class: "zoom-pontos so-interativo", role: "group", "aria-label": "Zoom do mapa" },
        el("button", { type: "button", "aria-label": "Ampliar", text: "+", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1.8) }),
        el("button", { type: "button", "aria-label": "Reduzir", text: "−", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1 / 1.8) }),
        el("button", { type: "button", "aria-label": "Voltar ao enquadramento inicial", text: "⟲", onclick: () => svg0.transition().duration(300).call(zoom.transform, d3.zoomIdentity) })));
      if (comOSM) alvo.append(el("div", { class: "mapa-atribuicao-mini" }, "© ", el("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener", text: "OpenStreetMap" })));
      else if (esri) alvo.append(el("div", { class: "mapa-atribuicao-mini", text: Lab.fundoRaster.atribuicao }));
      const cTam = (C.P.controles || []).find((c) => c.opcao === "forma" && (c.local || "explorar") === "grafico");
      if (cTam && lig.tamanho) alvo.append(el("div", { class: "fundo-mini so-interativo", role: "group", "aria-label": cTam.rotulo || "Tamanho" },
        el("span", { class: "rot-mini", text: `${cTam.rotulo || "Tamanho"}:` }),
        ...Object.entries(cTam.valores).map(([v, r]) => el("button", { type: "button", "aria-pressed": forma === v, onclick: () => C.trocar(() => { est[cTam.id] = v; }) }, r))));   // vale também para o gráfico
      if (!est.cam) desenharRuas(d3.zoomIdentity);
    } else {   // a imagem sai com o enquadramento do momento; com um local escolhido, centrada nele (o recorte da imagem é outro)
      const nSel = est.cam && est.sel ? porId.get(est.sel) : null;
      aplicarT(est.cam ? camT(nSel ? { centro: proj.invert([nSel.x, nSel.y]), k: est.cam.k } : est.cam) : d3.zoomIdentity);
    }
    if (C.naImagem && comOSM) svg0.append("text").attr("x", W - 4).attr("y", H - 4).attr("text-anchor", "end").attr("font-size", 9).attr("fill", tok("cor-texto-secundario"))
      .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text("© colaboradores do OpenStreetMap");
    return { posicao: (id) => {   // na tela, com o zoom do momento; fora do quadro, sem anotação
        const n = porId.get(id);
        if (!n) return null;
        const [x, y] = tAtual.apply([n.x, n.y]);
        return x < 0 || y < 0 || x > W || y > H ? null : [x, y];
      },
      aoZoom: (f) => aoZoom.push(f),
      tamanho: bolhas ? { sc: escTam(est.cam?.k || 1), rotulo: rotTam } : null };
  };

  // ---------------------------------------------------------------- componentes de cartão (story, Q-066): dados prontos do Python
  /** Quebra aproximada de texto em SVG (sem medir): ~0,55 em por caractere. */
  const quebrarAprox = (txt, px, largura) => {
    const max = Math.max(8, Math.floor(largura / (px * 0.55))), ls = [];
    let l = "";
    for (const p of String(txt || "").split(/\s+/)) { const t = l ? `${l} ${p}` : p; if (l && t.length > max) { ls.push(l); l = p; } else l = t; }
    if (l) ls.push(l);
    return ls;
  };
  /** lab.css fixa cor e tamanho de todo `svg text`; aqui o atributo vale (e a imagem, sem CSS, sai igual à tela). */
  const fixarTexto = (svg) => svg.selectAll("text").each(function () {
    const f = this.getAttribute("fill"), fs = this.getAttribute("font-size");
    if (f) this.style.fill = f;
    if (fs) this.style.fontSize = `${fs}px`;
  });
  const corTok = (c, padrao = "cor-texto") => (String(c || "").startsWith("#") ? c : tok(c || padrao));

  /** quadros — números grandes lado a lado (rótulo embaixo) e uma nota de comparação. dados: [{rotulo, valor, cor}]. */
  adaptadores.quadros = (C) => {
    const { alvo } = C, itens = (C.dados || []).filter(Boolean), W = alvo.clientWidth, H = Math.max(160, alvo.clientHeight);
    const svg = d3.select(alvo).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", [...itens.map((q) => `${q.rotulo}: ${q.valor}`), C.opc.nota].filter(Boolean).join("; "));
    const n = Math.max(1, itens.length), cw = W / n, px = Math.min(58, cw * 0.3);
    // bloco compacto e centrado na altura: número, rótulo (até 2 linhas) e, logo abaixo, a nota de comparação (contexto)
    const linhasRot = Math.max(1, ...itens.map((q) => quebrarAprox(q.rotulo, 13, cw - 12).length));
    const notaLs = C.opc.nota ? quebrarAprox(C.opc.nota, 12.5, W - 16) : [];
    const altBloco = px * 0.8 + 26 + (linhasRot - 1) * 16 + (notaLs.length ? 34 + notaLs.length * 17 : 0);
    const yN = Math.max(px * 0.85, (H - altBloco) / 2 + px * 0.8);
    itens.forEach((q, k) => {
      const x = k * cw + cw / 2;
      svg.append("text").attr("x", x).attr("y", yN).attr("text-anchor", "middle").style("font-size", `${px}px`).attr("font-size", px).attr("font-weight", 700)
        .attr("fill", corTok(q.cor)).style("fill", corTok(q.cor)).style("font-variant-numeric", "tabular-nums").text(q.valor);
      quebrarAprox(q.rotulo, 13, cw - 12).forEach((l, j) => svg.append("text").attr("x", x).attr("y", yN + 26 + j * 16).attr("text-anchor", "middle")
        .style("font-size", "13px").attr("font-size", 13).attr("fill", tok("cor-texto-secundario")).text(l));
    });
    if (notaLs.length) {
      const y0 = yN + 26 + (linhasRot - 1) * 16 + 34;
      svg.append("line").attr("x1", W * 0.15).attr("x2", W * 0.85).attr("y1", y0 - 20).attr("y2", y0 - 20).attr("stroke", tok("cor-grade"));
      notaLs.forEach((l, j) => svg.append("text").attr("x", W / 2).attr("y", y0 + j * 17).attr("text-anchor", "middle").style("font-size", "12.5px").attr("font-size", 12.5).attr("fill", tok("cor-texto")).text(l));
    }
    fixarTexto(svg);
    return {};
  };

  /** linhas — evolução em poucas pontas (anos), com valor no início e valor + nome no fim (rótulo direto, sem legenda).
   *  dados: {anos, series: [{id, rotulo, cor, valores, tracejado}]}, valores em %. Mesma leitura de Lab.linhasPontas. */
  adaptadores.linhas = (C) => {
    const { alvo } = C, D = C.dados;
    if (!D?.series) { alvo.append(el("div", { class: "viz-vazio", text: "Sem série histórica para esta escolha." })); return null; }
    const S = D.series.filter((s) => s.valores.some((v) => v !== null && v !== undefined));
    let svg = null;
    // legenda: uma amostra por série (traço cheio = candidatura; tracejado = não é candidatura); tocar destaca a série
    if (C.legenda) {
      let fixa = null;
      const destacar = (id) => { const a = id ?? fixa; if (!svg) return; esmaecer(svg.selectAll("[data-serie]")).attr("opacity", function () { return !a || this.dataset.serie === a ? 1 : 0.15; });
        C.legenda.querySelectorAll("button[data-serie]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.serie === fixa))); };
      C.legenda.append(...S.map((s) => {
        const am = d3.create("svg").attr("width", 22).attr("height", 10).attr("aria-hidden", "true").style("vertical-align", "middle");
        am.append("line").attr("x1", 1).attr("x2", 21).attr("y1", 5).attr("y2", 5).attr("stroke", corTok(s.cor)).attr("stroke-width", 2.5).attr("stroke-dasharray", s.tracejado ? "4 3" : null);
        return el("button", { type: "button", class: "item-leg", "data-serie": s.id, "aria-pressed": "false",
          onpointerenter: () => destacar(s.id), onpointerleave: () => destacar(null), onclick: () => { fixa = fixa === s.id ? null : s.id; destacar(null); } }, am.node(), s.rotulo);
      }), C.opc?.legenda_extra ? el("span", { class: "item-extra", text: C.opc.legenda_extra }) : null);
    }
    const W = alvo.clientWidth, H = Math.max(160, alvo.clientHeight), anos = D.anos, n = anos.length;
    const tem = (v) => v !== null && v !== undefined;
    const fmt = (v) => Lab.fmtPct(v, 1);
    const m = { t: 24, b: 10, l: 46, r: Math.min(150, W * 0.42) };
    const max = d3.max(S.flatMap((s) => s.valores).filter(tem)) || 1;
    const sy = d3.scaleLinear().domain([0, Math.ceil(max / 10) * 10]).range([H - m.b, m.t]);
    const sx = (i) => (n === 1 ? (m.l + W - m.r) / 2 : m.l + ((W - m.r - m.l) * i) / (n - 1));
    svg = d3.select(alvo).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", `Linhas de ${anos.join(", ")}: ${S.map((s) => `${s.rotulo} ${s.valores.map((v) => (tem(v) ? fmt(v) : "—")).join(", ")}`).join("; ")}.`);
    ativarInteracao(C, svg);
    anos.forEach((a, i) => {
      svg.append("line").attr("x1", sx(i)).attr("x2", sx(i)).attr("y1", m.t - 6).attr("y2", H - m.b).attr("stroke", tok("cor-grade"));
      svg.append("text").attr("x", sx(i)).attr("y", 13).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 700).attr("fill", tok("cor-texto")).text(a);
    });
    const afastar = (itens) => { itens.sort((a, b) => a.y - b.y); for (let k = 1; k < itens.length; k++) if (itens[k].y - itens[k - 1].y < 13) itens[k].y = itens[k - 1].y + 13; return itens; };
    const grupos = new Map();
    for (const s of S) {
      const c = corTok(s.cor), g = svg.append("g").attr("data-serie", s.id);
      grupos.set(s.id, g);
      for (let i = 1; i < n; i++) if (tem(s.valores[i - 1]) && tem(s.valores[i]))
        g.append("line").attr("x1", sx(i - 1)).attr("y1", sy(s.valores[i - 1])).attr("x2", sx(i)).attr("y2", sy(s.valores[i]))
          .attr("stroke", c).attr("stroke-width", 2.2).attr("stroke-linecap", "round").attr("stroke-dasharray", s.tracejado ? "5 4" : null);
      s.valores.forEach((v, i) => { if (tem(v)) titulo(g.append("circle").attr("cx", sx(i)).attr("cy", sy(v)).attr("r", 4).attr("fill", c), [s.rotulo, `${anos[i]}: ${fmt(v)}`]); });
    }
    const rotulo = (x, y, txt, anc) => svg.append("text").attr("x", x).attr("y", y + 4).attr("text-anchor", anc).attr("font-size", 11).attr("font-weight", 600)
      .attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(txt);
    // borda "muitos" (contrato): cabem ~(altura útil ÷ 14) rótulos; rotula as maiores no fim, e as menores só se couberem
    const vagas = Math.max(2, Math.floor((H - m.t - m.b) / 15));
    const porValor = S.filter((s) => tem(s.valores[n - 1])).sort((a, b) => b.valores[n - 1] - a.valores[n - 1]);
    const rotuladas = new Set(porValor.slice(0, vagas).filter((s, i) => i < 3 || s.valores[n - 1] >= 0.08 * porValor[0].valores[n - 1]).map((s) => s.id));
    for (const { s, y } of afastar(S.filter((s) => tem(s.valores[0]) && (rotuladas.has(s.id) || !tem(s.valores[n - 1]))).map((s) => ({ s, y: sy(s.valores[0]) })))) rotulo(sx(0) - 7, y, fmt(s.valores[0]), "end");
    // nome longo em duas linhas (ex.: "Flávio / Bolsonaro"), sem cortar; a linha extra conta no afastamento
    const cabe = Math.max(8, Math.floor((m.r - 48) / 6.2));
    const dir = S.filter((s) => tem(s.valores[n - 1]) && rotuladas.has(s.id)).map((s) => ({ s, y: sy(s.valores[n - 1]), duas: s.rotulo.length > cabe && s.rotulo.includes(" ") }));
    dir.sort((a, b) => a.y - b.y);
    for (let k = 1; k < dir.length; k++) { const min = dir[k - 1].duas ? 25 : 13; if (dir[k].y - dir[k - 1].y < min) dir[k].y = dir[k - 1].y + min; }
    // se a pilha passa do fundo, sobe de baixo para cima mantendo o espaço
    if (dir.length && dir.at(-1).y > H - 8) { dir.at(-1).y = H - 8; for (let k = dir.length - 2; k >= 0; k--) { const min = dir[k].duas ? 25 : 13; if (dir[k + 1].y - dir[k].y < min) dir[k].y = dir[k + 1].y - min; } }
    for (const { s, y, duas } of dir) {
      const tx = rotulo(sx(n - 1) + 7, y, "", "start"), i0 = s.rotulo.lastIndexOf(" ");
      tx.append("tspan").text(`${fmt(s.valores[n - 1])} ${duas ? s.rotulo.slice(0, i0) : s.rotulo}`);
      if (duas) tx.append("tspan").attr("x", sx(n - 1) + 7 + 6).attr("dy", 12).text(s.rotulo.slice(i0 + 1));
      tx.attr("data-serie", s.id);
    }
    fixarTexto(svg);
    // na imagem não há legenda interativa: as séries sem rótulo direto vão para a legenda curta da imagem
    return { legendaImagem: S.filter((s) => !dir.some((d) => d.s.id === s.id)).map((s) => ({ cor: corTok(s.cor), rotulo: s.rotulo, tracejado: Boolean(s.tracejado), linha: true })) };
  };

  /** barras (EXPERIMENTAL) — barras horizontais, valor no fim da barra e uma nota por linha (ordem do Python).
   *  dados: lista de objetos; opcoes: rotulo, valor, nota_valor, nota_rotulo, titulo_valor, cor (token; ou o campo
   *  `cor` de cada item, ex.: a cor do grupo), formato (int | pct | pp | brl | dec1), destaque (rótulo em destaque: os
   *  demais esmaecem), valor_ref + rotulo_ref (barra fina de comparação, ex.: 2022). */
  adaptadores.barras = (C) => {
    const { alvo, opc } = C, kR = opc.rotulo || "rotulo", kV = opc.valor || "valor", kN = opc.nota_valor, kRef = opc.valor_ref;
    // ordem (pesquisador, 2026-10-12): da maior para a menor por padrão; `ordem: crescente`, ou `dados` (a ordem do Python)
    const L0 = (C.dados || []).filter(Boolean), ordem = opc.ordem || "decrescente";
    const L = ordem === "dados" ? L0 : [...L0].sort((a, b) => (ordem === "crescente" ? 1 : -1) * ((a[kV] ?? -Infinity) - (b[kV] ?? -Infinity)));
    if (!L.length) { alvo.append(el("div", { class: "viz-vazio", text: "Sem dados para esta escolha." })); return null; }
    const comEixo = opc.eixo !== false, hEixo = comEixo ? 22 : 0;   // eixo dos valores no pé, por padrão (`eixo: false` tira)
    const W = alvo.clientWidth, H = Math.max(160, alvo.clientHeight);
    const fmt = fmtNum(opc.formato), passo = Math.min(kRef ? 44 : 40, (H - (opc.titulo_valor ? 18 : 2) - 4 - hEixo) / L.length), bh = Math.max(6, Math.min(26, passo * (kRef ? 0.5 : 0.62)));
    const topo = Math.max(opc.titulo_valor ? 18 : 2, (H - hEixo - L.length * passo) / 2);   // poucas barras: bloco no meio do palco
    const xl = Math.min(140, W * 0.38), dirTxt = kN ? 92 : kRef ? 78 : 52;
    const max = d3.max(L, (d) => Math.max(d[kV] || 0, kRef ? d[kRef] || 0 : 0)) || 1;
    // valores negativos (ex.: queda num governo; 2026-10-15): a escala vai do menor ao maior e a barra sai do zero
    const min = Math.min(0, d3.min(L, (d) => d[kV] || 0));
    const sx = d3.scaleLinear().domain([min, Math.max(max, 0)]).range([0, Math.max(30, W - xl - 8 - dirTxt)]);
    const x0 = (v) => sx(Math.min(0, v || 0)), larg = (v) => Math.abs(sx(v || 0) - sx(0));
    const corPadrao = corTok(opc.cor || C.P.grafico?.opcoes?.cor, "cor-cat-1"), corDo = (d) => (d.cor ? corDe(d.cor) : corPadrao);
    const dest = opc.destaque != null ? String(opc.destaque) : null, apagado = (d) => dest !== null && String(d[kR]) !== dest && String(d.id) !== dest;
    const svg = svgDe(C, W, H, `${opc.titulo_valor || "Barras"}: ${L.map((d) => `${d[kR]} ${fmt(d[kV])}${kRef && d[kRef] != null ? ` (${opc.rotulo_ref || "antes"}: ${fmt(d[kRef])})` : ""}${kN ? ` (${d[kN]} ${opc.nota_rotulo || ""})` : ""}`).join("; ")}.`);
    if (opc.titulo_valor) svg.append("text").attr("x", 0).attr("y", topo - 7).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(opc.titulo_valor);
    if (comEixo) {   // grade leve atrás das barras e números no pé
      const yb = topo + L.length * passo, ge = svg.append("g").attr("class", "eixo-barras");
      for (const t of sx.ticks(W < 360 ? 3 : 4)) {
        ge.append("line").attr("x1", xl + sx(t)).attr("x2", xl + sx(t)).attr("y1", topo - 2).attr("y2", yb + 2).attr("stroke", tok("cor-grade"));
        ge.append("text").attr("x", xl + sx(t)).attr("y", yb + 14).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(fmtEixo(opc.formato)(t));
      }
      ge.append("line").attr("x1", xl + sx(0)).attr("x2", xl + sx(0)).attr("y1", topo - 2).attr("y2", yb + 2).attr("stroke", tok("cor-eixo"));
    }
    L.forEach((d, i) => {
      const y = topo + i * passo + (passo - bh - (kRef ? 6 : 0)) / 2, cy = y + bh / 2 + 4, c = corDo(d), op = apagado(d) ? 0.35 : 1;
      const k = String(d.id ?? d[kR]);
      svg.append("text").attr("x", xl - 6).attr("y", cy).attr("text-anchor", "end").attr("font-size", 11.5).attr("font-weight", dest !== null && !apagado(d) ? 700 : 400)
        .attr("fill", tok("cor-texto")).text(curto(String(d[kR]), Math.max(10, Math.floor(xl / 6.4))));
      titulo(svg.append("rect").attr("data-k", k).attr("x", xl + x0(d[kV])).attr("y", y).attr("width", Math.max(1, larg(d[kV]))).attr("height", bh).attr("rx", 2).attr("fill", c).attr("opacity", (d[kV] || 0) < 0 ? op * 0.55 : op),
        [String(d[kR]), `${opc.titulo_valor || kV}: ${fmt(d[kV])}`, kRef && d[kRef] != null ? `${opc.rotulo_ref || "antes"}: ${fmt(d[kRef])}` : null, kN ? `${Lab.fmtInt.format(d[kN])} ${opc.nota_rotulo || ""}` : null]);
      if (kRef && d[kRef] != null) svg.append("rect").attr("data-k", `${k}|ref`).attr("x", xl + x0(d[kRef])).attr("y", y + bh + 2).attr("width", Math.max(1, larg(d[kRef]))).attr("height", 3.5).attr("rx", 1.5)
        .attr("fill", c).attr("opacity", op * 0.55).attr("pointer-events", "none");
      const t = svg.append("text").attr("x", xl + sx(Math.max(0, d[kV] || 0)) + 5).attr("y", cy).attr("font-size", 11.5).attr("fill", tok("cor-texto")).attr("opacity", op);
      t.append("tspan").attr("font-weight", 700).text(fmt(d[kV]));
      if (kN) t.append("tspan").attr("fill", tok("cor-texto-secundario")).text(` · ${Lab.fmtInt.format(d[kN])} ${d[kN] === 1 ? "local" : "locais"}`);
      else if (kRef && d[kRef] != null) t.append("tspan").attr("fill", tok("cor-texto-secundario")).attr("font-size", 10.5).text(` (${fmt(d[kRef])})`);
    });
    if (C.legenda) {
      const proprias = L.some((d) => d.cor);
      const am = el("i", { class: "amostra-leg", "aria-hidden": "true" }); am.style.background = corPadrao;   // "quadro" é das escalas em faixas (100% da largura)
      C.legenda.append(...[proprias ? null : el("span", { class: "item-leg" }, am, opc.titulo_valor || kV),
        kRef && L.some((d) => d[kRef] != null) ? el("span", { class: "item-extra", text: `barra fina e número entre parênteses: ${opc.rotulo_ref || "comparação"}` }) : null,
        kN ? el("span", { class: "item-extra", text: `depois do ponto: ${opc.nota_rotulo || kN}` }) : null].filter(Boolean));
    } else if (C.naImagem && kRef && L.some((d) => d[kRef] != null)) C.itensImagem = [{ rotulo: `barra fina e número entre parênteses: ${opc.rotulo_ref || "comparação"}` }];
    fixarTexto(svg);
    return {};
  };

  // ==================================================================== fase C (L0016): componentes que só existiam na forma clássica
  // Todos recebem os dados prontos do Python (cartão de story ou ficha da bancada), desenham em SVG (a imagem é a tela),
  // têm legenda com amostra e destaque ao passar ou tocar (Q-046) e mensagem para o caso vazio. Contrato: componentes.yaml.
  const corDe = (c) => { const s = String(c || ""); return s.startsWith("var(") ? tok(s.slice(6, -1)) : corTok(s); };
  /** Escala divergente contínua (dados.escala.tipo = "continua"): mudança v em [−max, +max] → cor interpolada (Lab)
   *  nos tokens da escala (do roxo ao verde-azulado, cinza no zero). O máximo vem do Python, por indicador. */
  const escalaContinua = (E) => {
    const f = d3.piecewise(d3.interpolateLab, (E.tokens || []).map(corDe));
    return (v) => (v == null ? tok("cor-grade") : f(Math.max(0, Math.min(1, (v + E.max) / (2 * E.max)))));
  };
  /** Legenda da escala contínua: barra em degradê com os valores nas pontas e o zero no meio. */
  function legendaContinua(C, E) {
    if (!C.legenda) {
      if (C.naImagem) C.itensImagem = [...(C.itensImagem || []), { rotulo: `${E.titulo}: ${E.rot_min} … ${E.rot_max}` }];
      return;
    }
    const barra = el("span", { class: "leg-continua-barra", "aria-hidden": "true" });
    barra.style.background = `linear-gradient(90deg, ${E.tokens.map(corDe).join(", ")})`;
    C.legenda.append(el("span", { class: "leg-continua", role: "img", "aria-label": `${E.titulo}: de ${E.rot_min} a ${E.rot_max}` },
      el("span", { class: "leg-continua-tit", text: E.titulo }),
      el("span", { class: "leg-continua-linha" }, el("span", { text: E.rot_min }), el("span", { class: "leg-continua-barra-caixa" }, barra, el("span", { class: "leg-continua-zero", text: "0" })), el("span", { text: E.rot_max }))));
  }
  const semDados = (C, txt) => { C.alvo.append(el("div", { class: "viz-vazio", text: txt || "Sem dados para esta escolha." })); return null; };
  const svgDe = (C, W, H, aria) => { const s = d3.select(C.alvo).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", aria); ativarInteracao(C, s); return s; };
  /** Legenda de categorias: amostra + nome; passar o mouse destaca, tocar fixa, tocar de novo desfaz (Q-046).
   *  `aoFixar(id | null)`: o componente reage à categoria fixada (ex.: barras e colunas alinham a categoria na base). */
  function legendaCategorias(C, cats, destacar, extras = [], aoFixar = null) {
    if (!C.legenda) {   // imagem: sem legenda interativa — os itens vão para a legenda curta da imagem do cartão
      if (C.naImagem) C.itensImagem = [...cats.map((k) => ({ cor: corDe(k.cor), rotulo: k.rotulo })), ...extras.filter(Boolean).map((t) => ({ rotulo: t }))];
      return;
    }
    let fixa = null;
    const aplicar = (id) => { destacar(id ?? fixa); C.legenda.querySelectorAll("button[data-cat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === fixa))); };
    C.realcarCat = aplicar;   // a marca sob o mouse pode destacar a categoria inteira (C.passarDestaca)
    C.legenda.append(...cats.map((k) => {
      const am = el("i", { class: "amostra-leg", "aria-hidden": "true" });
      am.style.background = corDe(k.cor);
      return el("button", { type: "button", class: "item-leg", "data-cat": k.id, "aria-pressed": "false",
        onpointerenter: () => aplicar(k.id), onpointerleave: () => aplicar(null), onclick: () => { fixa = fixa === k.id ? null : k.id; aplicar(null); aoFixar?.(fixa); } }, am, k.rotulo);
    }), ...extras.filter(Boolean).map((t) => el("span", { class: "item-extra", text: t })));
  }
  // ---------------------------------------------------------------- interação comum dos componentes de cartão
  // Card informativo (a mesma .viz-cartao das vistas): passar o mouse mostra; clicar ou tocar fixa e contorna a marca
  // (✕, Esc, tocar fora ou na mesma marca fecha). Toque ou palco estreito: o card encaixa no alto ou no pé do palco,
  // do lado oposto à marca. A marca guarda o conteúdo em `__dica` ([título, ...linhas]); ao passar por ela, o item da
  // legenda da mesma categoria (data-cat) acende. A legenda esmaece com transição curta (sem ela, se o leitor pedir).
  const titulo = (sel, txt) => sel.each(function (d) { const t = typeof txt === "function" ? txt(d) : txt; this.__dica = Array.isArray(t) ? t : [t]; }).style("cursor", "pointer");
  const dicaDe = (n, raiz) => { for (; n && n !== raiz; n = n.parentNode) if (n.__dica) return n; return null; };
  // Esc fecha o que foi aberto por último (card fixo, nível do treemap…), sem depender do foco estar no palco
  const pilhaEsc = [];
  const empilharEsc = (f, no) => { const it = { f, no }; pilhaEsc.push(it); return () => { const i = pilhaEsc.indexOf(it); if (i >= 0) pilhaEsc.splice(i, 1); }; };
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    while (pilhaEsc.length) { const it = pilhaEsc.pop(); if (it.no.isConnected) { it.f(); return; } }   // componente redesenhado: ignora
  });
  const esmaecer = (sel) => (Lab.semMovimento() ? sel : sel.transition("leg").duration(220).ease(d3.easeCubicOut));
  function ativarInteracao(C, svg) {
    if (!C.interativa || C.naImagem) return;
    const alvo = C.alvo, raiz = svg.node();
    if (getComputedStyle(alvo).position === "static") alvo.style.position = "relative";
    const c = el("div", { class: "viz-cartao so-interativo", role: "status", "aria-live": "polite", hidden: "" });
    alvo.append(c);
    let fixa = null, tirarEsc = null;
    let catAcesa = null;
    const acender = (cat) => {
      C.legenda?.querySelectorAll("button[data-cat]").forEach((b) => b.classList.toggle("ativo", cat !== null && b.dataset.cat === cat));
      if (C.passarDestaca && !fixa && cat !== catAcesa) { catAcesa = cat; C.realcarCat?.(cat); }
    };
    const esconder = () => { c.hidden = true; acender(null); };
    const fechar = () => { fixa?.classList.remove("marca-sel"); fixa = null; tirarEsc?.(); tirarEsc = null; esconder(); };
    const mostrar = (n, ev, fixar) => {
      const [t, ...ls] = n.__dica;
      c.replaceChildren(...(fixar ? [el("button", { type: "button", class: "x", "aria-label": "Fechar", onclick: (e) => { e.stopPropagation(); fechar(); } }, "✕")] : []),
        el("b", { text: t }), ...ls.filter(Boolean).map((x) => el("div", { text: x })));
      c.classList.toggle("fixo", fixar);
      c.hidden = false;
      acender(n.closest("[data-cat]")?.dataset.cat ?? null);
      const W = alvo.clientWidth, H = alvo.clientHeight, a = alvo.getBoundingClientRect(), r = n.getBoundingClientRect();
      const doca = ev.pointerType !== "mouse";
      c.classList.toggle("doca", doca);
      if (doca) { c.style.left = ""; const meio = r.top + r.height / 2 - a.top; c.style.top = meio > H / 2 ? "0px" : ""; c.style.bottom = meio > H / 2 ? "" : "0px"; return; }
      c.style.bottom = "";
      const cw = c.offsetWidth, ch = c.offsetHeight, px = ev.clientX - a.left, py = ev.clientY - a.top;
      let x = px + 14;
      if (x + cw > W) x = px - cw - 14;
      c.style.left = `${Math.max(0, Math.min(W - cw, x))}px`; c.style.top = `${Math.max(0, Math.min(H - ch, py - ch / 2))}px`;
    };
    svg.on("pointermove.dica", (ev) => { if (fixa || ev.pointerType !== "mouse") return; const n = dicaDe(ev.target, raiz); if (n) mostrar(n, ev, false); else esconder(); })
      .on("pointerleave.dica", () => { if (!fixa) esconder(); })
      .on("click.dica", (ev) => {
        const n = dicaDe(ev.target, raiz);
        if (!n || n === fixa) { fechar(); return; }
        fixa?.classList.remove("marca-sel"); fixa = n; n.classList.add("marca-sel");
        tirarEsc?.(); tirarEsc = empilharEsc(() => { tirarEsc = null; fechar(); }, raiz);
        mostrar(n, ev, true);
      });
    C.fecharDica = fechar;
  }
  /** Eixo horizontal no pé: números sem unidade (pt-BR) e, acima deles à direita, o nome do eixo com a unidade. */
  function eixoX(svg, sx, W, H, m, nome) {
    const nT = Math.max(3, Math.floor(W / 80)), passoT = d3.tickStep(...sx.domain(), nT);
    const casas = Math.max(0, Math.min(3, -Math.floor(Math.log10(passoT || 1))));   // índices como o Gini (0,46…0,55) pedem mais casas
    const fmtTick = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: Math.max(1, casas) });
    svg.append("g").attr("transform", `translate(0,${H - m.b + 4})`).call(d3.axisBottom(sx).ticks(nT).tickFormat(fmtTick))
      .call((g) => { g.selectAll("line,path").attr("stroke", tok("cor-eixo")); g.selectAll("text").attr("fill", tok("cor-texto-secundario")).attr("font-size", 10.5); });
    if (nome) svg.append("text").attr("x", W - m.r).attr("y", H - m.b - 2).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario"))
      .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(nome);
  }

  /** Imagem (PNG) do mapa: a imagem não leva o CSS da página — tamanho, traços e cores vão inline no SVG. */
  function svgMapaParaImagem(alvo, W, H) {
    const sv = alvo.querySelector("svg.mapa");
    if (sv) {   // a imagem não leva o CSS da página: tamanho, traços e cores inline
      sv.setAttribute("width", W); sv.setAttribute("height", H); sv.style.width = ""; sv.style.height = "";
      sv.querySelectorAll("path").forEach((p) => p.setAttribute("vector-effect", "non-scaling-stroke"));   // traço fino com qualquer zoom
      sv.querySelectorAll("path.u").forEach((p) => { p.setAttribute("stroke", tok("cor-superficie")); p.setAttribute("stroke-width", "0.6"); });
      sv.querySelectorAll(".referencia path, rect.fundo-ref").forEach((p) => { p.setAttribute("fill", tok("cor-grade")); p.setAttribute("fill-opacity", "0.55");
        p.setAttribute("stroke", tok("cor-eixo")); p.setAttribute("stroke-opacity", "0.55"); p.setAttribute("stroke-width", "0.6"); p.style.cssText = ""; });
      // rótulos: o tamanho que o mapa calculou para o zoom do momento (no estilo), não um valor fixo
      sv.querySelectorAll(".rotulos-ref text").forEach((t) => { t.setAttribute("fill", tok("cor-texto")); t.setAttribute("font-size", parseFloat(t.style.fontSize) || 11); t.setAttribute("font-weight", 700);
        t.setAttribute("paint-order", "stroke"); t.setAttribute("stroke", tok("cor-superficie")); t.setAttribute("stroke-width", parseFloat(t.style.strokeWidth) || 3); t.removeAttribute("style"); });
      sv.querySelectorAll(".rotulos-ref circle").forEach((c) => c.setAttribute("fill", tok("cor-texto")));
      sv.querySelectorAll("path.u.foco").forEach((p) => { p.setAttribute("stroke", tok("cor-texto")); p.setAttribute("stroke-width", "1.6"); });
      sv.querySelectorAll("text:not(.rotulos-ref text)").forEach((t) => { if (!t.getAttribute("font-size")) t.setAttribute("font-size", parseFloat(t.style.fontSize) || 11); });
    }
  }
  /** mapa em NÍVEIS (piloto 2026-10-14, Q-094; generaliza o protótipo `subnivel` da Q-080). dados.niveis = [{id, rotulo,
   *  rotulo_um, malha, unidades}], do mais amplo ao mais detalhado (ex.: região → UF → município); cada unidade traz
   *  `pai` (id no nível de cima), categoria (classe da escala), valor, tamanho, linhas (dica) e resumo — tudo pronto no
   *  Python (L0002). Tocar numa unidade que tem filhos abre o nível de baixo: a malha troca no lugar (as outras unidades
   *  do nível de cima viram contorno de contexto) e a câmera desce (coreografia da Q-093); a trilha (Brasil › Nordeste ›
   *  Piauí) e "‹ Voltar" sobem afastando e só então trocam a malha. "Ver por" escolhe o nível do país inteiro;
   *  Mapa | Círculos (área ∝ tamanho, relativa ao nível) vale em todos os níveis; no último nível, tocar abre o card.
   *  O estado (nível de partida, caminho aberto, forma) fica em C.est: a imagem PNG sai no nível e no recorte da tela. */
  function mapaNiveis(C) {
    const alvo = C.alvo, D = C.dados, est = C.est || {}, chave = `mapa-niveis:${C.espec?.id || ""}`;
    const ref = (v, col) => (typeof v === "string" ? C.e?.[col]?.[v] : v);
    const N = (D.niveis || []).map((n) => ({ ...n, fc: ref(n.malha, "malhas"), U: ref(n.unidades, "unidades") || {} }));
    if (!N.length || !N[0].fc?.features?.length) return semDados(C);
    // quantos filhos cada unidade tem no nível de baixo (só abre quem tem)
    const filhos = N.map((_, k) => { const c = {}; if (N[k + 1]) for (const u of Object.values(N[k + 1].U)) if (u.pai != null) c[u.pai] = (c[u.pai] || 0) + 1; return c; });
    const cats = D.categorias || [], corCat = Object.fromEntries(cats.map((k) => [k.id, corDe(k.cor)]));
    const st = (est[chave] ||= { base: Math.min(D.nivel_inicial || 0, N.length - 1), caminho: [], forma: D.forma === "bolhas" ? "bolhas" : "mapa" });
    const nivel = () => st.base + st.caminho.length;
    const paiAtual = () => st.caminho[st.caminho.length - 1] ?? null;
    const unidadesDe = (k, p) => ({ type: "FeatureCollection", features: N[k].fc.features.filter((f) => N[k].U[f.properties.id] && (p == null || N[k].U[f.properties.id].pai === p)) });
    const refD = ref(D.referencia, "referencias");
    // contexto: as outras unidades do nível de cima (ex.: as outras UFs, aberto o Piauí), em cinza, com a referência
    const contextoDe = (k, p) => {
      const fs = [...(refD?.features || []), ...(p == null ? [] : N[k - 1].fc.features.filter((f) => f.properties.id !== p))];
      return fs.length ? { type: "FeatureCollection", features: fs } : null;
    };
    const cameraDe = (fc, p) => (p == null ? "estado" : { foco: fc.features.map((f) => f.properties.id), contexto: 1.15 });
    const nomeDe = (k, id) => N[k]?.U[id]?.nome || id;
    let U = N[nivel()].U, fc = unidadesDe(nivel(), paiAtual());
    alvo.dataset.escopo ||= `viz-mapa-${Math.random().toString(36).slice(2, 8)}`;
    const interativo = C.interativa && !C.naImagem;
    // faixas acima (trilha, resumo, abrir) e abaixo (ver por, forma) do mapa: nada cobre o desenho nem o card
    alvo.classList.add("mapa-niveis-palco");
    const cab = interativo ? el("div", { class: "mapa-cabeca so-interativo" }) : null, area = el("div", { class: "mapa-area" }), pe = interativo ? el("div", { class: "mapa-pe so-interativo" }) : null;
    alvo.append(...[cab, area, pe].filter(Boolean));
    let api = null, agendados = [];
    const agendar = (f, ms) => { agendados.push(setTimeout(() => { if (alvo.isConnected) f(); }, ms)); };
    const abrir = (id) => { if (!interativo || !filhos[nivel()]?.[id]) return false; ir([...st.caminho, id]); return true; };
    moldura();   // as faixas primeiro: o mapa toma a altura que sobra
    const W = area.clientWidth || alvo.clientWidth, H = Math.max(160, area.clientHeight || alvo.clientHeight);
    api = Lab.mapa(area, { contornos: fc, ajuste: N[0].fc, compacto: true, dimensoes: [W, H], zoom: !C.naImagem,
      nome: (id) => U[id]?.nome || id, preencher: (id) => corCat[U[id]?.categoria] || tok("cor-grade"), dica: (id) => U[id]?.linhas || [],
      referencia: contextoDe(nivel(), paiAtual()), rotulos: ref(D.rotulos, "rotulos"), fundo: C.naImagem ? null : C.opc.fundo || D.fundo || null,
      camera: cameraDe(fc, paiAtual()), cameraBolhas: cameraDe(fc, paiAtual()), tamanho: (id) => U[id]?.tamanho || 0, rotuloTamanho: D.rotulo_tamanho || "tamanho",
      forma: { obter: () => st.forma, definir: (v) => { st.forma = v; } }, escalaBolhas: "ds", tocar: abrir,
      rotuloAria: C.opc.aria || `Mapa de ${D.titulo_escala || "valores"} por ${N[nivel()].rotulo_um || N[nivel()].id}. Tocar numa unidade abre o nível de baixo.` });
    // o palco pode encolher depois do desenho (legenda preenchida): o mapa toma a medida final, sem faixas
    if (!C.naImagem) requestAnimationFrame(() => {
      if (alvo.isConnected && api.dimensoes([area.clientWidth, Math.max(160, area.clientHeight)])) api.camera(cameraDe(fc, paiAtual()), false);
    });
    const trilhaTexto = () => [D.raiz?.nome || "Tudo", ...st.caminho.map((id, i) => nomeDe(st.base + i, id))].join(" › ");
    // ------------------------------------------------ legenda: classes presentes no nível + o que o toque faz
    const legenda = () => {
      C.legenda?.replaceChildren();
      const k = nivel(), presentes = new Set(fc.features.map((f) => U[f.properties.id]?.categoria));
      legendaCategorias(C, cats.filter((c) => presentes.has(c.id)), (id) => api.atualizar({ opacidade: id ? (u) => (U[u]?.categoria === id ? 1 : 0.18) : null }),
        [fc.features.some((f) => U[f.properties.id]?.categoria == null) ? "hachura: sem dados" : null,
          st.forma === "bolhas" ? `círculos: área proporcional a ${D.rotulo_tamanho || "tamanho"}, relativa às unidades na tela; ${api?.circulosSobrepostos?.() ? "no centro de cada unidade (se sobrepõem)" : "posição aproximada"}` : null,
          // concordância declarada no nível (Python): num/numa, os seus/as suas
          C.naImagem ? null : N[k + 1] ? `tocar ${N[k].num || "numa"} ${N[k].rotulo_um || "unidade"} mostra ${N[k + 1].seus || "as suas"} ${N[k + 1].rotulo}` : `tocar ${N[k].num || "numa"} ${N[k].rotulo_um || "unidade"} mostra os números`,
          C.naImagem ? `recorte: ${trilhaTexto()}` : null]);
      if (D.titulo_escala && C.legenda) C.legenda.prepend(el("span", { class: "item-extra leg-titulo", text: `${D.titulo_escala}:` }));
      if (C.naImagem && D.titulo_escala && C.itensImagem) C.itensImagem.unshift({ rotulo: `${D.titulo_escala}:` });
      area.querySelector(".leg-tamanho-sobre")?.remove();
      const esc = api?.escalaTamanho?.();
      if (st.forma === "bolhas" && esc && !C.naImagem) area.append(el("div", { class: "leg-tamanho-sobre dir" }, Lab.legendaTamanho(esc, D.rotulo_tamanho || "tamanho")));
    };
    // ------------------------------------------------ moldura sobre o mapa: trilha, resumo, abrir pela lista, ver por, forma
    function moldura() {
      if (!interativo) return;
      const k = nivel(), p = paiAtual();
      const trilha = el("nav", { class: "mapa-trilha", "aria-label": "Onde você está no mapa" });
      if (st.caminho.length) trilha.append(el("button", { type: "button", class: "voltar", onclick: () => ir(st.caminho.slice(0, -1)) }, "‹ Voltar"));
      const passos = [D.raiz?.nome || "Tudo", ...st.caminho.map((id, i) => nomeDe(st.base + i, id))];
      passos.forEach((nm, i) => {
        if (i) trilha.append(el("span", { class: "sep", "aria-hidden": "true", text: "›" }));
        trilha.append(i === passos.length - 1 ? el("b", { text: nm, "aria-current": "location" }) : el("button", { type: "button", onclick: () => ir(st.caminho.slice(0, i)) }, nm));
      });
      const resumo = p == null ? D.raiz?.resumo : N[k - 1].U[p]?.resumo;
      const linha = el("div", { class: "mapa-linha" }, resumo ? el("p", { class: "mapa-resumo" }, ...negrito(resumo)) : null);
      cab.replaceChildren(trilha, linha);
      // abrir pela lista (teclado, leitor de tela, e quem não acha a unidade no mapa)
      const abriveis = fc.features.map((f) => f.properties.id).filter((id) => filhos[k]?.[id]).sort((a, b) => nomeDe(k, a).localeCompare(nomeDe(k, b), "pt-BR"));
      if (abriveis.length) linha.append(el("select", { class: "mapa-abrir", "aria-label": `Abrir: escolha ${N[k].rotulo_um || "a unidade"}`, onchange: (ev) => ev.target.value && abrir(ev.target.value) },
        el("option", { value: "", text: `Abrir ${N[k].rotulo_um || "unidade"}… ▾` }), ...abriveis.map((id) => el("option", { value: id, text: nomeDe(k, id) }))));
      const grupoVer = el("div", { class: "fundo-mini", role: "group", "aria-label": "Ver o todo por" }, el("span", { class: "rot-mini", text: "Ver por:" }),
        ...N.map((n, b) => el("button", { type: "button", "aria-pressed": String(!st.caminho.length && st.base === b), onclick: () => ir([], b) }, n.rotulo)));
      const grupoForma = el("div", { class: "fundo-mini", role: "group", "aria-label": "Forma do mapa" },
        ...[["mapa", "Mapa"], ["bolhas", "Círculos"]].map(([v, r]) => el("button", { type: "button", "aria-pressed": String(st.forma === v), onclick: () => trocarForma(v) }, r)));
      pe.replaceChildren(grupoVer, D.alternar_forma === false ? el("span") : grupoForma);
    }
    const trocarForma = (v) => {
      if (st.forma === v) return;
      api.forma(v, !Lab.semMovimento());
      legenda(); moldura();
    };
    // ------------------------------------------------ navegação: abre no alto e desce; volta subindo e só então troca
    function ir(novo, base = st.base) {
      agendados.forEach(clearTimeout); agendados = [];
      st.caminho = novo; st.base = base;
      const k = nivel(), p = paiAtual(), fcN = unidadesDe(k, p), cam = cameraDe(fcN, p);
      Lab.selecionar("", alvo);   // o card da unidade fecha
      const trocar = () => { U = N[k].U; fc = fcN; api.contornos(fcN, { referencia: contextoDe(k, p), cameraBolhas: cam }); legenda(); moldura(); };
      moldura();   // a trilha já mostra para onde se vai
      if (Lab.semMovimento() || !interativo) { trocar(); api.camera(cam, false); return; }
      const pl = api.planoCamera(cam, fcN);
      if (!pl.move) trocar();
      else if (pl.k1 >= pl.k0) { trocar(); agendar(() => api.camera(cam, true, { malha: fcN }), 450); }    // abrir: troca com o todo na tela e desce
      else { const d = api.camera(cam, true, { malha: fcN }); agendar(trocar, d * 0.92); }                   // voltar: sobe e depois troca
    }
    legenda();
    if (C.naImagem) svgMapaParaImagem(area, W, H);
    return { api };
  }

  /** mapa (coroplético) — o Lab.mapa do DS (L0006) em modo compacto: a implementação única do mapa de polígonos.
   *  dados: {contornos (FeatureCollection, properties.id) ou malha (nome de uma malha em e.malhas, compartilhada entre
   *          cartões), unidades: {id: {nome, categoria, linhas: [dica], tamanho, opacidade?, foco?}},
   *          categorias: [{id, rotulo, cor}], camera?, forma?, referencia?, rotulos?, rotulo_tamanho?, destaque?,
   *          subnivel?: {rotulo: "municípios", rotulo_pai: "territórios", contornos, unidades: {id: {…, pai}}}}
   *  opcoes: camera, forma (mapa | bolhas), escala_bolhas (ds | fiel), fundo (vetorial | esri-cinza), destaque (id de
   *          categoria: começa fixada na legenda, as demais esmaecidas — a "seleção de legenda" feita pelo roteiro).
   *  Estado entre cartões (proposta 2026-10-14, Q-093, em teste): o MESMO mapa segue de um cartão com mapa para o
   *  outro — sozinho ou numa pilha, com outra malha ou outro tamanho de palco — e `atualizar` troca cores, realce,
   *  forma, malha e câmera numa coreografia: o conteúdo muda no ponto mais aberto do voo (antes de aproximar, depois de
   *  afastar, no meio de um voo lateral). Chegando de um cartão sem mapa, a câmera parte do recorte inteiro e voa. */
  adaptadores.mapa = (C) => {
    if (C.dados?.niveis) return mapaNiveis(C);   // mapa em níveis (Q-094)
    const alvo = C.alvo;
    let D = C.dados;
    // peças grandes ficam uma vez só na base e os cartões citam pelo nome: malha (e.malhas), camada de unidades
    // (e.unidades), referência (e.referencias) e rótulos (e.rotulos)
    const ref = (v, colecao) => (typeof v === "string" ? C.e?.[colecao]?.[v] : v);
    const malhaDe = (Dx) => Dx?.contornos || (Dx?.malha ? C.e?.malhas?.[Dx.malha] : null) || null;
    let MALHA = malhaDe(D);
    if (!MALHA?.features?.length) return semDados(C);
    // aninhamento (Q-080, protótipo): com `dados.subnivel`, o card da unidade oferece abrir o nível de baixo (ex.:
    // território → municípios); a câmera aproxima a unidade e o mapa troca para as unidades dela; "‹ Todos" volta
    const SUB = D.subnivel?.contornos?.features?.length ? D.subnivel : null, est = C.est || {}, chave = `mapa-nivel:${C.espec?.id || ""}`;
    const pai = SUB && est[chave] && MALHA.features.some((f) => f.properties.id === est[chave]) ? est[chave] : null;
    let U = {}, cats = [], corCat = {}, realce = null, dest = null;
    // o estado de um cartão é lido sem aplicar: no story, o mesmo mapa só troca de estado no tempo da coreografia
    const lerEstado = (Dx, o) => {
      const cs = Dx.categorias || [];
      return { U: (pai ? SUB.unidades : ref(Dx.unidades, "unidades")) || {}, cats: cs, corCat: Object.fromEntries(cs.map((k) => [k.id, corDe(k.cor)])),
        realce: Dx.realce ? new Set([].concat(Dx.realce)) : null,   // unidades em destaque (ex.: as do território escolhido); as demais esmaecem
        dest: o?.destaque ?? Dx.destaque ?? null };                 // categoria fixada pelo roteiro (seleção de legenda)
    };
    const aplicarEstado = (s) => { ({ U, cats, corCat, realce, dest } = s); };
    aplicarEstado(lerEstado(D, C.opc));
    let contornos = pai ? { type: "FeatureCollection", features: SUB.contornos.features.filter((f) => SUB.unidades[f.properties.id]?.pai === pai) } : MALHA;
    // no nível de baixo, as outras unidades de cima viram contexto (contorno cinza), junto com a referência
    const refD = ref(D.referencia, "referencias");
    const referencia = pai ? { type: "FeatureCollection", features: [...(refD?.features || []), ...MALHA.features.filter((f) => f.properties.id !== pai)] } : refD;
    const W = alvo.clientWidth, H = Math.max(180, alvo.clientHeight);
    alvo.dataset.escopo ||= `viz-mapa-${Math.random().toString(36).slice(2, 8)}`;
    const formaDe = (Dx, o) => ((o.forma || Dx.forma) === "bolhas" ? "bolhas" : "mapa");
    let forma = formaDe(D, C.opc);
    const temTamanho = Object.values(U).some((u) => u.tamanho);
    const opBase = (id) => U[id]?.opacidade ?? (realce ? (realce.has(id) ? 1 : 0.22) : 1);
    const comOpacidade = () => Boolean(realce) || Object.values(U).some((u) => u.opacidade != null);
    // opacidade com uma categoria fixada (pela legenda ou pelo roteiro): as outras esmaecem
    const opacidadeCom = (id) => (id ? (u) => (U[u]?.categoria === id ? opBase(u) : 0.18) : comOpacidade() ? opBase : null);
    const focoDe = (id) => Boolean(U[id]?.foco) || Boolean(realce?.has(id) && realce.size === 1);
    const camera = pai ? { foco: contornos.features.map((f) => f.properties.id), contexto: 1.12 } : est[`${chave}:volta`] ? { foco: est[`${chave}:volta`], contexto: 1.12 } : D.camera || C.opc.camera;
    // chegada de um cartão sem mapa (est.voarMapa, marcado pela troca de cartão): parte do recorte inteiro e voa
    const voarAoEntrar = C.interativa && !C.naImagem && !pai && est.voarMapa && camera && camera !== "estado";
    let api = null;
    const abrir = SUB && !pai && C.interativa && !C.naImagem ? (id) => {
      if (!contornos.features.some((f) => f.properties.id === id) || !Object.values(SUB.unidades).some((u) => u.pai === id)) return;
      Lab.selecionar("", alvo);
      api.camera({ foco: id, contexto: 1.12 });   // aproxima a unidade; depois o mapa troca de nível no mesmo enquadramento
      setTimeout(() => { est[chave] = id; redesenhar(); }, Lab.semMovimento() ? 0 : 900);
    } : null;
    const redesenhar = () => { alvo.replaceChildren(); C.legenda?.replaceChildren(); adaptadores.mapa(C); };
    api = Lab.mapa(alvo, { contornos, compacto: true, dimensoes: [W, H], zoom: !C.naImagem,
      nome: (id) => U[id]?.nome || id, preencher: (id) => (D.escala?.tipo === "continua" ? escalaContinua(D.escala)(U[id]?.mud) : corCat[U[id]?.categoria] || tok("cor-grade")), dica: (id) => U[id]?.linhas || [],
      opacidade: opacidadeCom(dest), foco: focoDe,
      rotuloAria: C.opc.aria || `Mapa por ${cats.map((k) => k.rotulo).join(", ")}${pai ? ` — ${SUB.rotulo} de ${D.unidades?.[pai]?.nome || pai}` : ""}.`,
      referencia, rotulos: pai ? null : ref(D.rotulos, "rotulos"), fundo: C.naImagem ? null : C.opc.fundo || D.fundo || null, camera: voarAoEntrar ? "estado" : camera,
      tamanho: temTamanho ? (id) => U[id]?.tamanho || 0 : null, rotuloTamanho: D.rotulo_tamanho || "tamanho",
      forma: { obter: () => forma, definir: (v) => { forma = v; } }, escalaBolhas: (C.opc.escala_bolhas || D.escala_bolhas) === "fiel" ? "fiel" : "ds",
      abrir, rotuloAbrir: SUB ? `Abrir ${SUB.rotulo} ›` : undefined });
    // o palco pode encolher depois do desenho (legenda e nota preenchidas): o mapa toma a medida final, sem faixas
    if (!C.naImagem) requestAnimationFrame(() => {
      if (alvo.isConnected && api.dimensoes([alvo.clientWidth, Math.max(180, alvo.clientHeight)]) && !voarAoEntrar) api.camera(camera || "estado", false);
    });
    if (voarAoEntrar) setTimeout(() => { if (alvo.isConnected) api.camera(camera); }, 380);   // depois do cartão surgir (0,4 s)
    if (est[`${chave}:volta`]) {   // voltando do nível de baixo: começa na unidade e afasta até o enquadramento do cartão
      est[`${chave}:volta`] = null;
      requestAnimationFrame(() => api.camera(C.opc.camera || "estado"));
    }
    if (pai && C.interativa && !C.naImagem) {
      const voltar = () => { est[`${chave}:volta`] = pai; est[chave] = null; redesenhar(); };
      alvo.append(el("div", { class: "fundo-mini so-interativo", role: "group", "aria-label": "Nível do mapa" },
        el("button", { type: "button", onclick: voltar }, `‹ Todos os ${SUB.rotulo_pai || "níveis"}`),
        el("span", { class: "rot-mini", text: D.unidades?.[pai]?.nome || pai })));
    }
    // legenda do estado `s` (o que vai valer no cartão; no story, montada antes da coreografia para o palco ter a altura certa)
    const legenda = (Cx, s = { U, cats, contornos, forma, D }) => {
      const presentes = new Set(s.contornos.features.map((f) => s.U[f.properties.id]?.categoria));
      const continua = s.D.escala?.tipo === "continua";
      legendaCategorias(Cx, continua ? [] : s.cats.filter((k) => presentes.has(k.id)), (id) => api.atualizar({ opacidade: opacidadeCom(id) }),
        [s.contornos.features.some((f) => s.U[f.properties.id]?.categoria == null) ? "hachura: sem dados" : null,
          s.forma === "bolhas" ? `círculos: área proporcional a ${s.D.rotulo_tamanho || "tamanho"}; posição aproximada` : null,
          Object.values(s.U).some((u) => u.foco) ? s.D.rotulo_foco || "contorno: em destaque" : null,
          abrir ? `tocar num ${s.D.rotulo_unidade || "território"} e em “Abrir ${SUB.rotulo}” mostra o nível de baixo` : null]);
      if (continua) legendaContinua(Cx, s.D.escala);
    };
    // legenda de tamanho (Q-062) dentro do mapa, no canto: não rouba altura do palco
    const legendaTamanho = () => {
      alvo.querySelector(".leg-tamanho-sobre")?.remove();
      const esc = api.escalaTamanho?.();
      if (forma === "bolhas" && esc && !C.naImagem) alvo.append(el("div", { class: "leg-tamanho-sobre" }, Lab.legendaTamanho(esc, D.rotulo_tamanho || "tamanho")));
    };
    // a categoria fixada pelo roteiro aparece pressionada na legenda (o leitor solta com um toque)
    const fixarDestaque = (Cx) => { if (dest != null) Cx.legenda?.querySelector(`button[data-cat="${CSS.escape(String(dest))}"]`)?.click(); };
    legenda(C);
    legendaTamanho();
    fixarDestaque(C);
    if (C.naImagem) svgMapaParaImagem(alvo, W, H);
    let agendados = [];
    const MORPH_MS = 1400;   // troca círculos ⇄ geometrias do Lab.mapa (design.yaml › padroes.mapa_transicao)
    const agendar = (f, ms) => { agendados.push(setTimeout(() => { if (alvo.isConnected) f(); }, ms)); };
    return {
      api,
      /** Próximo cartão (ou outra escolha no Explorar) com mapa: o mesmo mapa muda de estado, sem ser redesenhado do zero.
       *  Coreografia (proposta 2026-10-14, Q-093): quem aproxima muda o conteúdo antes de descer; quem afasta sobe e
       *  depois muda; num voo lateral, a cor muda no meio (o ponto mais alto do voo). Malha e forma redesenham o
       *  desenho: nunca no meio de um voo. Sem animação com prefers-reduced-motion. */
      atualizar(Cn) {
        const Dn = Cn.dados;
        if (pai || SUB || Dn?.subnivel || !Dn) return false;
        const malhaN = malhaDe(Dn);
        if (!malhaN?.features?.length) return false;
        agendados.forEach(clearTimeout); agendados = [];
        const s = lerEstado(Dn, Cn.opc), nova = formaDe(Dn, Cn.opc), trocaMalha = malhaN !== MALHA, mudaForma = nova !== forma;
        const cam = Dn.camera || Cn.opc.camera || "estado";
        C.legenda = Cn.legenda; C.opc = Cn.opc;
        legenda(C, { U: s.U, cats: s.cats, contornos: malhaN, forma: nova, D: Dn });   // já com o estado novo: o palco toma a altura certa
        // uma mudança de cada vez: a forma (círculos ⇄ geometrias) com o estado antigo; depois cor, realce e destaque
        const recolorir = () => {
          D = Dn; aplicarEstado(s);
          const parcial = { opacidade: opacidadeCom(dest), foco: focoDe, escalaBolhas: (Cn.opc.escala_bolhas || D.escala_bolhas) === "fiel" ? "fiel" : "ds" };
          if (trocaMalha) { MALHA = malhaN; contornos = malhaN; forma = nova; api.contornos(malhaN, parcial); }
          else api.atualizar(parcial, { animar: true });
          legendaTamanho();
          fixarDestaque(C);
        };
        const conteudo = () => {
          if (mudaForma && !trocaMalha && !Lab.semMovimento()) { api.forma(nova); legendaTamanho(); agendar(recolorir, MORPH_MS); }
          else { if (mudaForma && !trocaMalha) api.forma(nova, false); recolorir(); }
        };
        // o palco do cartão novo já tem a altura final no próximo quadro (legenda e nota preenchidas)
        requestAnimationFrame(() => {
          if (!alvo.isConnected) return;
          api.dimensoes([alvo.clientWidth, Math.max(180, alvo.clientHeight)]);
          if (Lab.semMovimento()) { conteudo(); api.camera(cam, false); return; }
          const p = api.planoCamera(cam, malhaN), redesenha = trocaMalha || mudaForma, voar = () => api.camera(cam, true, { malha: malhaN });
          if (!p.move) conteudo();
          else if (p.k1 > p.k0 * 1.25) { conteudo(); agendar(voar, mudaForma ? MORPH_MS + 250 : trocaMalha ? 500 : 250); }   // aproxima: muda no alto e desce
          else if (p.k1 < p.k0 / 1.25 || redesenha) { const d = voar(); agendar(conteudo, d * 0.92); }             // afasta: sobe e muda
          else { const d = voar(); agendar(conteudo, d * 0.4); }                                                     // lateral: muda no meio
        });
        return true;
      },
    };
  };

  /** barras100 — barras empilhadas de 100%, uma por linha, em SVG (L0012); linha pontilhada de 50% (elemento implícito).
   *  dados: {categorias: [{id, rotulo, cor}], linhas: [{rotulo, valores: {cat: %}, absolutos?: {cat: texto}}], maioria?: bool} */
  adaptadores.barras100 = (C) => {
    C.passarDestaca = true;   // passar o mouse numa marca destaca a categoria dela
    const D = C.dados, L = D?.linhas || [], cats = D?.categorias || [];
    if (!L.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(120, C.alvo.clientHeight), larg = W - 2;
    const passo = Math.min(72, (H - 6) / L.length), bh = Math.max(12, Math.min(34, passo * 0.5));
    const y0 = Math.max(0, (H - L.length * passo) / 2);   // poucas linhas: bloco no meio do palco
    const svg = svgDe(C, W, H, L.map((l) => `${l.rotulo}: ${cats.filter((k) => l.valores[k.id]).map((k) => `${k.rotulo} ${Lab.fmtPct(l.valores[k.id])}`).join(", ")}`).join(". "));
    const segs = [];   // um por linha × categoria: a posição depende de qual categoria está na base
    L.forEach((l, i) => {
      const y = y0 + 2 + i * passo;
      svg.append("text").attr("class", "rot-linha").attr("data-linha", l.id ?? l.rotulo).attr("x", 0).attr("y", y + 12).attr("font-size", 12).attr("font-weight", 600).attr("fill", tok("cor-texto")).text(curto(l.rotulo, Math.floor(W / 6.5)));
      for (const k of cats) {
        const v = l.valores[k.id];
        if (!v) continue;
        const w = (larg * v) / 100, c = corDe(k.cor);
        const r = svg.append("rect").attr("data-cat", k.id).attr("data-k", `${l.id ?? l.rotulo}|${k.id}`).attr("y", y + 17).attr("width", Math.max(0, w - 2)).attr("height", bh).attr("rx", 2).attr("fill", c);
        titulo(r, [l.rotulo, `${k.rotulo}: ${Lab.fmtPct(v)}`, l.absolutos?.[k.id] || null]);
        const t = w >= 34 ? svg.append("text").attr("data-cat", k.id).attr("y", y + 17 + bh / 2 + 4).attr("font-size", 11).attr("font-weight", 700)
          .attr("fill", Lab.tinta(c)).attr("pointer-events", "none").text(`${Math.round(v)}%`) : null;
        segs.push({ i, k: k.id, w, r, t });
      }
    });
    // a categoria na base começa em x = 0 em todas as linhas: comparar o tamanho dela fica fácil (só a ordem muda)
    const posicionar = (base, animar) => {
      const ordem = base ? [base, ...cats.map((k) => k.id).filter((id) => id !== base)] : cats.map((k) => k.id);
      L.forEach((_, i) => {
        let x = 0;
        for (const id of ordem) {
          const sg = segs.find((q) => q.i === i && q.k === id);
          if (!sg) continue;
          const tr = (n) => (animar && !Lab.semMovimento() ? n.transition("base").duration(450).ease(d3.easeCubicInOut) : n);
          tr(sg.r).attr("x", x);
          if (sg.t) tr(sg.t).attr("x", x + 5);
          x += sg.w;
        }
      });
    };
    posicionar(null, false);
    const maioria = D.maioria !== false;
    if (maioria) svg.append("line").attr("x1", larg / 2).attr("x2", larg / 2).attr("y1", y0 + 14).attr("y2", y0 + 2 + (L.length - 1) * passo + 17 + bh + 3)
      .attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "2 3").attr("stroke-width", 1).attr("opacity", 0.55).attr("pointer-events", "none");
    legendaCategorias(C, cats.filter((k) => L.some((l) => l.valores[k.id])),
      (id) => esmaecer(svg.selectAll("[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.2; }),
      [maioria ? "pontilhada: 50% (maioria)" : null, C.interativa && cats.length > 2 ? "tocar numa categoria a alinha à esquerda" : null], (id) => posicionar(id, true));
    // linha em destaque (a citada no texto): as outras linhas esmaecem e o rótulo dela fica em negrito
    const linhaDest = C.opc.linha_destaque;
    if (linhaDest && L.some((l) => (l.id ?? l.rotulo) === linhaDest)) {
      L.forEach((l, i) => { if ((l.id ?? l.rotulo) !== linhaDest) svg.selectAll(`[data-k^="${CSS.escape(String(l.id ?? l.rotulo))}|"]`).attr("opacity", 0.35); });
      svg.selectAll("text.rot-linha").attr("opacity", function () { return this.dataset.linha === linhaDest ? 1 : 0.55; });
    }
    // destaque do roteiro: a categoria começa fixada (na base, à esquerda; as demais esmaecidas), como ao tocar na legenda
    const dest = C.opc.destaque;
    if (dest && cats.some((k) => k.id === dest)) {
      posicionar(dest, false);
      svg.selectAll("[data-cat]").attr("opacity", function () { return this.dataset.cat === dest ? 1 : 0.2; });
      C.legenda?.querySelector(`button[data-cat="${CSS.escape(dest)}"]`)?.click();
    }
    fixarTexto(svg);
    return {};
  };

  /** fluxos — Sankey entre etapas, com as contagens prontas do Python (sem d3-sankey). Duas etapas: na vertical (DS);
   *  três ou mais: na horizontal. dados: {etapas: [rótulo], categorias: [{id, rotulo, cor}], unidade: "municípios",
   *  formato?: int | pct | brl, ligacoes: [{etapa (índice da origem), de, para, n}]}.
   *  opcoes: fase (origem = só os blocos da 1ª etapa | blocos = blocos de todas, sem faixas | faixas, o padrão: para
   *  montar e explicar o gráfico em cartões seguidos) e destaque ("de>para" ou lista: essas faixas acesas). O mesmo
   *  Sankey segue de um cartão para o outro (estado): `atualizar` só muda o que aparece, com transição. */
  adaptadores.fluxos = (C) => {
    const D = C.dados, E = D?.etapas || [], lig = (D?.ligacoes || []).filter((l) => l.n > 0), cats = D?.categorias || [];
    if (E.length < 2 || !lig.length) return semDados(C);
    const vertical = E.length === 2, uni = D.unidade || "unidades";
    const fmtN = D.formato ? fmtNum(D.formato) : (v) => Lab.fmtInt.format(v), comUni = (v) => (D.formato === "pct" ? fmtN(v) : `${fmtN(v)} ${uni}`);
    const ordem = cats.map((k) => k.id), cor = Object.fromEntries(cats.map((k) => [k.id, corDe(k.cor)])), nomeCat = Object.fromEntries(cats.map((k) => [k.id, k.rotulo]));
    // tamanho de cada bloco: saídas da etapa (ou entradas, na última)
    const blocos = E.map((_, e) => {
      const m = new Map();
      for (const l of lig) if (l.etapa === e) m.set(l.de, (m.get(l.de) || 0) + l.n); else if (e === E.length - 1 && l.etapa === e - 1) m.set(l.para, (m.get(l.para) || 0) + l.n);
      return m;
    });
    const total = d3.max(blocos, (m) => d3.sum([...m.values()])) || 1;
    const esp = vertical ? 36 : 26, gap = 5, hN = 10;              // vertical: o nome da etapa e os números dos blocos em linhas separadas
    const ligs = [...lig].sort((a, b) => a.etapa - b.etapa || ordem.indexOf(a.de) - ordem.indexOf(b.de) || ordem.indexOf(a.para) - ordem.indexOf(b.para));
    /** Geometria para um palco W × H (refeita quando o mesmo Sankey segue para um cartão de outra altura). */
    const geometria = (W, H) => {
      const comprimento = vertical ? W : H - esp;                  // eixo em que os blocos se empilham
      const posEtapa = (e) => (vertical ? (e === 0 ? esp : H - esp - hN) : 6 + (e * (W - 12 - hN)) / (E.length - 1));
      const esc = (comprimento - gap * (ordem.length - 1)) / total;
      const pos = blocos.map((m) => { let a = vertical ? 0 : esp; const p = {}; for (const g of ordem) { const n = m.get(g) || 0; if (!n) continue; p[g] = { a, w: n * esc, n }; a += n * esc + gap; } return p; });
      const cursorS = pos.map((p) => Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.a])));
      const cursorE = pos.map((p) => Object.fromEntries(Object.entries(p).map(([g, v]) => [g, v.a])));
      const faixas = ligs.map((l) => {
        const e = l.etapa, w = l.n * esc, a0 = cursorS[e][l.de], a1 = cursorE[e + 1][l.para];
        if (a0 === undefined || a1 === undefined) return null;
        cursorS[e][l.de] += w; cursorE[e + 1][l.para] += w;
        const p0 = posEtapa(e) + hN, p1 = posEtapa(e + 1), pm = (p0 + p1) / 2;
        return vertical
          ? `M${a0},${p0} C${a0},${pm} ${a1},${pm} ${a1},${p1} L${a1 + w},${p1} C${a1 + w},${pm} ${a0 + w},${pm} ${a0 + w},${p0} Z`
          : `M${p0},${a0} C${pm},${a0} ${pm},${a1} ${p1},${a1} L${p1},${a1 + w} C${pm},${a1 + w} ${pm},${a0 + w} ${p0},${a0 + w} Z`;
      });
      return { W, H, posEtapa, pos, faixas };
    };
    let G = geometria(C.alvo.clientWidth, Math.max(180, C.alvo.clientHeight));
    const svg = svgDe(C, G.W, G.H, `Fluxos entre ${E.join(", ")}: ` + lig.map((l) => `${nomeCat[l.de] || l.de} para ${nomeCat[l.para] || l.para}, ${comUni(l.n)}`).join("; "));
    const gl = svg.append("g");
    ligs.forEach((l, i) => {
      if (!G.faixas[i]) return;
      titulo(gl.append("path").attr("data-i", i).attr("fill", cor[l.de] || tok("cor-grade")).attr("data-de", l.de).attr("data-para", l.para).attr("data-etapa", l.etapa),
        [`${nomeCat[l.de] || l.de} → ${nomeCat[l.para] || l.para}`, comUni(l.n), `de ${E[l.etapa]} para ${E[l.etapa + 1]}`]);
    });
    const gb = svg.append("g");
    G.pos.forEach((p, e) => {
      const ge = gb.append("g").attr("data-etapa", e).attr("class", "etapa");
      for (const [g, v] of Object.entries(p)) {
        const r = ge.append("rect").attr("rx", 2).attr("fill", cor[g] || tok("cor-grade")).attr("data-cat", g).attr("data-etapa", e).attr("class", "bloco");
        titulo(r, [nomeCat[g] || g, `${E[e]}: ${comUni(v.n)}`, "as faixas acesas saem e chegam neste bloco"]);
        ge.append("text").attr("class", "num-bloco").attr("data-cat", g).attr("font-size", 11).attr("font-weight", 700).attr("fill", tok("cor-texto"))
          .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).attr("pointer-events", "none");
      }
      ge.append("text").attr("class", "nome-etapa").attr("font-size", 11.5).attr("font-weight", 700).attr("fill", tok("cor-texto-secundario"));
    });
    /** Põe faixas, blocos e rótulos na geometria G (com transição quando o palco muda de altura entre cartões). */
    const posicionar = (tr = (s) => s) => {
      const { W, H, posEtapa, pos, faixas } = G;
      tr(svg).attr("width", W).attr("height", H);
      tr(gl.selectAll("path")).attr("d", function () { return faixas[+this.dataset.i]; });
      gb.selectAll("g.etapa").each(function () {
        const e = +this.dataset.etapa, ge = d3.select(this);
        ge.selectAll("rect.bloco").each(function () {
          const v = pos[e][this.dataset.cat], r = tr(d3.select(this));
          if (vertical) r.attr("x", v.a).attr("y", posEtapa(e)).attr("width", Math.max(1, v.w)).attr("height", hN);
          else r.attr("x", posEtapa(e)).attr("y", v.a).attr("width", hN).attr("height", Math.max(1, v.w));
        });
        ge.selectAll("text.num-bloco").each(function () {   // número no bloco, se couber (o nome fica na legenda; no bloco largo, também o nome)
          const g = this.dataset.cat, v = pos[e][g], cabeB = (t) => v.w >= t.length * 6.6 + 4;
          const txtB = vertical ? [`${nomeCat[g] || g} ${fmtN(v.n)}`, fmtN(v.n)].find(cabeB) || "" : v.w >= 14 ? fmtN(v.n) : "";
          const t = d3.select(this).text(txtB);
          if (vertical) tr(t).attr("x", v.a + 2).attr("y", e === 0 ? posEtapa(e) - 5 : posEtapa(e) + hN + 13);
          else tr(t).attr("x", e === E.length - 1 ? posEtapa(e) - 3 : posEtapa(e) + hN + 3).attr("y", v.a + Math.min(v.w / 2, 12) + 4).attr("text-anchor", e === E.length - 1 ? "end" : "start");
        });
        const te = ge.select("text.nome-etapa").text(curto(E[e], vertical ? 40 : Math.max(10, Math.floor(W / E.length / 6.5))));
        if (vertical) tr(te).attr("x", W).attr("text-anchor", "end").attr("y", e === 0 ? 11 : H - 2);
        else tr(te).attr("x", e === 0 ? posEtapa(e) : e === E.length - 1 ? posEtapa(e) + hN : posEtapa(e) + hN / 2).attr("text-anchor", e === 0 ? "start" : e === E.length - 1 ? "end" : "middle").attr("y", 12);
      });
    };
    posicionar();
    /** Espaço do palco sem o desenho (o SVG da altura antiga empurraria a medida). */
    const medir = () => {
      const n = svg.node(), d = n.style.display;
      n.style.display = "none";
      const w = C.alvo.clientWidth, h = Math.max(180, C.alvo.clientHeight);
      n.style.display = d;
      return [w, h];
    };
    // fase e destaque: o que aparece (blocos de cada etapa, faixas) e quais faixas ficam acesas
    let fase = "faixas", dest = [], bloco = null, catLeg = null;
    const opFaixa = (n) => {
      if (fase !== "faixas") return 0;
      const e = +n.dataset.etapa, de = n.dataset.de, para = n.dataset.para;
      if (bloco) return (e === bloco.e && de === bloco.g) || (e === bloco.e - 1 && para === bloco.g) ? 0.85 : 0.07;
      if (catLeg) return de === catLeg || para === catLeg ? 0.85 : 0.07;
      if (dest.length) return dest.includes(`${de}>${para}`) ? 0.85 : 0.1;
      return 0.42;
    };
    const aplicar = (animar) => {
      const tr = (sel) => (!animar ? sel : animar === "lento" && !Lab.semMovimento() ? sel.transition("leg").duration(550).ease(d3.easeCubicInOut) : esmaecer(sel));   // troca de cartão: mais lenta
      tr(gl.selectAll("path")).attr("opacity", function () { return opFaixa(this); });
      tr(gb.selectAll("g.etapa")).attr("opacity", function () { return fase === "origem" && +this.dataset.etapa > 0 ? 0 : 1; });
      gl.selectAll("path").attr("pointer-events", fase === "faixas" ? null : "none");
    };
    const lerOpcoes = (o) => { fase = o.fase || "faixas"; dest = [].concat(o.destaque || []).map(String); };
    lerOpcoes(C.opc);
    aplicar(false);
    const montarLegenda = (Cx) => legendaCategorias(Cx, cats.filter((k) => G.pos.some((p) => p[k.id])), (id) => { catLeg = id; aplicar(true); },
      [D.formato === "pct" ? "largura: % do total" : `largura: número de ${uni}`, fase !== "faixas" ? null : dest.length ? "acesas: as faixas citadas no texto" : null]);
    montarLegenda(C);
    // bloco: passar o mouse (ou tocar) acende só as faixas que saem dele e as que chegam nele
    if (C.interativa && !C.naImagem) {
      let fixo = null;
      const deBloco = (n) => (n?.classList?.contains("bloco") ? { e: +n.dataset.etapa, g: n.dataset.cat } : null);
      svg.selectAll("rect.bloco").on("pointerenter.fluxo", function () { if (!fixo) { bloco = deBloco(this); aplicar(true); } }).on("pointerleave.fluxo", () => { if (!fixo) { bloco = null; aplicar(true); } });
      svg.on("click.fluxo", (ev) => { const b = deBloco(ev.target); fixo = b && !(fixo && fixo.e === b.e && fixo.g === b.g) ? b : null; bloco = fixo; aplicar(true); });
    }
    fixarTexto(svg);
    return {
      /** Próximo cartão com o mesmo Sankey (mesmos dados): muda fase e destaque, com transição. */
      atualizar(Cn) {
        if (JSON.stringify(Cn.dados) !== JSON.stringify(D)) return false;
        C.legenda = Cn.legenda; C.opc = Cn.opc; C.fecharDica?.();
        lerOpcoes(Cn.opc); bloco = null; catLeg = null;
        aplicar("lento");
        montarLegenda(C);
        // o cartão novo pode ter outra altura (texto e nota mais longos): a etapa de baixo não pode sair do palco
        const [w, h] = medir();
        if (Math.abs(w - G.W) > 2 || Math.abs(h - G.H) > 2) {
          G = geometria(w, h);
          posicionar(Lab.semMovimento() ? (s) => s : (s) => s.transition("tam").duration(550).ease(d3.easeCubicInOut));
        }
        return true;
      },
    };
  };

  /** distribuicao — um círculo por unidade num eixo (beeswarm); posições por simulação de forças (só desenho).
   *  dados: {pontos: [{id, rotulo, valor, peso?, categoria?}], categorias?: [{id, rotulo, cor}], eixo: "rótulo",
   *          referencia?: {valor, rotulo}, formato?: "pp" | "pct" | "num", rotulo_tamanho?} */
  adaptadores.distribuicao = (C) => {
    const D = C.dados, P = (D?.pontos || []).filter((p) => p.valor !== null && p.valor !== undefined);
    if (!P.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(150, C.alvo.clientHeight), m = { l: 18, r: 14, t: 16, b: 34 };
    const fmtV = D.formato === "pp" ? (v) => Lab.fmtPP(v) : D.formato === "pct" ? (v) => Lab.fmtPct(v) : (v) => Lab.fmtInt.format(v);
    const cats = D.categorias || [], corCat = Object.fromEntries(cats.map((k) => [k.id, corDe(k.cor)]));
    const ext = d3.extent([...P.map((p) => p.valor), D.referencia?.valor].filter((v) => v !== undefined));
    const sx = d3.scaleLinear().domain(ext).nice().range([m.l, W - m.r]);
    const temPeso = P.some((p) => p.peso);
    const rMax = Math.max(3, Math.min(10, Math.sqrt(((W - m.l - m.r) * (H - m.t - m.b) * 0.35) / (Math.PI * P.length)) * 1.4));
    const sr = temPeso ? d3.scaleSqrt().domain([0, d3.max(P, (p) => p.peso)]).range([1.5, rMax]) : () => Math.min(4, rMax);
    const nos = P.map((p) => ({ ...p, x: sx(p.valor), y: (H - m.b + m.t) / 2, r: sr(p.peso || 0) }));
    const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => sx(n.valor)).strength(1)).force("y", d3.forceY((H - m.b + m.t) / 2).strength(0.06))
      .force("c", d3.forceCollide((n) => n.r + 0.6)).stop();
    for (let i = 0; i < 160; i++) { sim.tick(); for (const n of nos) n.y = Math.max(m.t + n.r, Math.min(H - m.b - n.r, n.y)); }
    const svg = svgDe(C, W, H, `${D.eixo || "Distribuição"}: ${P.length} unidades, de ${fmtV(ext[0])} a ${fmtV(ext[1])}.`);
    eixoX(svg, sx, W, H, m, D.eixo);
    if (D.referencia) {
      const xr = sx(D.referencia.valor);
      svg.append("line").attr("x1", xr).attr("x2", xr).attr("y1", m.t - 4).attr("y2", H - m.b + 2).attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "3 3").attr("opacity", 0.6);
      svg.append("text").attr("x", xr + 4).attr("y", m.t - 4).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(D.referencia.rotulo || fmtV(D.referencia.valor));
    }
    const pts = svg.append("g").selectAll("circle").data(nos).join("circle").attr("cx", (n) => n.x).attr("cy", (n) => n.y).attr("r", (n) => n.r)
      .attr("fill", (n) => corCat[n.categoria] || tok("cor-cat-1")).attr("fill-opacity", 0.8).attr("stroke", tok("cor-superficie")).attr("stroke-width", 0.5)
      .attr("data-cat", (n) => n.categoria || "");
    const nomeC = Object.fromEntries(cats.map((k) => [k.id, k.rotulo]));
    titulo(pts, (n) => [n.rotulo, `${D.eixo || "valor"}: ${fmtV(n.valor)}`, n.peso ? `${D.rotulo_tamanho || "peso"}: ${Lab.fmtInt.format(n.peso)}` : null, nomeC[n.categoria] || null]);
    legendaCategorias(C, cats.filter((k) => P.some((p) => p.categoria === k.id)),
      (id) => esmaecer(pts).attr("opacity", (n) => (!id || n.categoria === id ? 1 : 0.15)),
      [`N = ${Lab.fmtInt.format(P.length)}`, temPeso ? `área ∝ ${D.rotulo_tamanho || "peso"}` : null, D.referencia ? `tracejada: ${D.referencia.rotulo || "referência"}` : null]);
    fixarTexto(svg);
    return {};
  };

  /** boxplot — uma linha por grupo: caixa Q1–Q3, mediana rotulada, bigodes (Tukey, calculados no Python) e um ponto
   *  por unidade em enxame. dados: {grupos: [{id, rotulo, cor, resumo: {q1, mediana, q3, bigode_inf, bigode_sup, n},
   *  pontos: [{id, rotulo, valor}]}], eixo, formato?: "pct" | "num"} */
  adaptadores.boxplot = (C) => {
    const D = C.dados, G = (D?.grupos || []).filter((g) => g.resumo);
    if (!G.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(150, C.alvo.clientHeight), m = { l: 14, r: 14, t: 4, b: 26 };
    const fmtV = D.formato === "num" ? (v) => Lab.fmtInt.format(v) : (v) => Lab.fmtPct(v);
    const vals = G.flatMap((g) => [g.resumo.bigode_inf, g.resumo.bigode_sup, ...(g.pontos || []).map((p) => p.valor)]).filter((v) => v !== null && v !== undefined);
    const sx = d3.scaleLinear().domain(d3.extent(vals)).nice().range([m.l, W - m.r]);
    const passo = (H - m.t - m.b) / G.length, bh = Math.min(22, passo * 0.38);
    const svg = svgDe(C, W, H, `${D.eixo || "Distribuição por grupo"}: ` + G.map((g) => `${g.rotulo}, mediana ${fmtV(g.resumo.mediana)}, ${g.resumo.n} unidades`).join("; "));
    eixoX(svg, sx, W, H, m, null);
    G.forEach((g, i) => {
      const c = corDe(g.cor), yc = m.t + i * passo + passo * 0.62, R = g.resumo, gg = svg.append("g").attr("data-cat", g.id);
      gg.append("text").attr("x", m.l).attr("y", m.t + i * passo + 11).attr("font-size", 11.5).attr("font-weight", 600).attr("fill", tok("cor-texto"))
        .text(`${curto(g.rotulo, 26)} · n = ${Lab.fmtInt.format(R.n)}`);
      const nos = (g.pontos || []).map((p) => ({ ...p, x: sx(p.valor), y: yc }));
      const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => sx(n.valor)).strength(1)).force("y", d3.forceY(yc).strength(0.1)).force("c", d3.forceCollide(2.3)).stop();
      for (let k = 0; k < 90; k++) { sim.tick(); for (const n of nos) n.y = Math.max(yc - passo * 0.32, Math.min(yc + passo * 0.32, n.y)); }
      gg.append("g").selectAll("circle").data(nos).join("circle").attr("cx", (n) => n.x).attr("cy", (n) => n.y).attr("r", 1.8).attr("fill", c).attr("fill-opacity", 0.45)
        .call((q) => titulo(q, (n) => [n.rotulo, `${g.rotulo}: ${fmtV(n.valor)}`]));
      gg.append("line").attr("x1", sx(R.bigode_inf)).attr("x2", sx(R.bigode_sup)).attr("y1", yc).attr("y2", yc).attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2);
      titulo(gg.append("rect").attr("x", sx(R.q1)).attr("y", yc - bh / 2).attr("width", Math.max(1, sx(R.q3) - sx(R.q1))).attr("height", bh).attr("rx", 2)
        .attr("fill", c).attr("fill-opacity", 0.22).attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2),
        [g.rotulo, `mediana: ${fmtV(R.mediana)}`, `metade do meio: de ${fmtV(R.q1)} a ${fmtV(R.q3)}`, `bigodes: de ${fmtV(R.bigode_inf)} a ${fmtV(R.bigode_sup)}`, `n = ${Lab.fmtInt.format(R.n)}`]);
      gg.append("line").attr("x1", sx(R.mediana)).attr("x2", sx(R.mediana)).attr("y1", yc - bh / 2 - 3).attr("y2", yc + bh / 2 + 3).attr("stroke", tok("cor-texto")).attr("stroke-width", 2.4);
      gg.append("text").attr("x", sx(R.mediana)).attr("y", yc - bh / 2 - 5).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 700)
        .attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(fmtV(R.mediana));
    });
    legendaCategorias(C, G.map((g) => ({ id: g.id, rotulo: g.rotulo, cor: g.cor })),
      (id) => esmaecer(svg.selectAll("g[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.2; }),
      [D.eixo ? `eixo: ${D.eixo}` : null, "caixa: metade do meio (Q1 a Q3) · traço grosso: mediana · linha: bigodes (até 1,5 × a caixa)"]);
    fixarTexto(svg);
    return {};
  };

  /** tabela — em SVG (a imagem é igual à tela): cabeçalho e linhas; números à direita, algarismos tabulares; o que não
   *  couber vira "… e mais N" (o recorte longo é do Python). dados: {colunas: [{id, rotulo, numerica?}], linhas: [{…}],
   *  destaque?: valor da 1ª coluna a realçar} — valores já formatados no Python (texto). */
  adaptadores.tabela = (C) => {
    const D = C.dados, cols = D?.colunas || [], L = D?.linhas || [];
    if (!cols.length || !L.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(120, C.alvo.clientHeight), alt = 22, cab = 26;
    const cabe = Math.max(1, Math.floor((H - cab - 4) / alt)), mostra = L.length > cabe ? L.slice(0, cabe - 1) : L;
    const txt = (v) => (v === null || v === undefined ? "—" : String(v));
    // largura: valores (o destaque sai em negrito, mais largo) e cabeçalho (negrito 11 px)
    const cabeca = (c) => c.rotulo.length * 6.7 + 10;   // largura do cabeçalho inteiro (negrito 11 px + folga) — a mesma do encurtamento
    const larg = cols.map((c) => {
      const vw = Math.max(0, ...L.map((l) => txt(l[c.id]).length * (c.numerica ? 7.4 : 6.4))) + 12;
      return Math.max(vw, c.numerica ? Math.min(cabeca(c), vw + 16) : cabeca(c));   // numérica: o cabeçalho alarga até 16 px além dos valores; depois, “…”
    });
    // sobra largura: completa primeiro os cabeçalhos encurtados das colunas numéricas; o resto fica com a 1ª coluna
    const need0 = Math.max(cols[0].rotulo.length * 6.4, ...L.map((l) => txt(l[cols[0].id]).length * 7.4)) + 12;
    let sobra = W - d3.sum(larg.slice(1)) - need0;
    cols.forEach((c, j) => { if (!j || !c.numerica || sobra <= 0) return; const d = Math.min(sobra, Math.max(0, cabeca(c) - larg[j])); larg[j] += d; sobra -= d; });
    const fixas = d3.sum(larg.slice(1)), w0 = Math.max(80, W - fixas);
    const xs = [0]; cols.forEach((c, j) => xs.push(xs[j] + (j === 0 ? w0 : larg[j])));
    const fator = xs[cols.length] > W ? W / xs[cols.length] : 1;
    const X = (j) => xs[j] * fator;
    const svg = svgDe(C, W, H, `Tabela com ${L.length} linhas: ${cols.map((c) => c.rotulo).join(", ")}.`);
    cols.forEach((c, j) => svg.append("text").attr("x", c.numerica ? X(j + 1) - 6 : X(j) + 4).attr("y", 16).attr("text-anchor", c.numerica ? "end" : "start")
      .attr("font-size", 11).attr("font-weight", 700).attr("fill", tok("cor-texto-secundario")).text(curto(c.rotulo, Math.floor((X(j + 1) - X(j) - 8) / 6.7))));
    svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", cab - 4).attr("y2", cab - 4).attr("stroke", tok("cor-texto")).attr("stroke-opacity", 0.4);
    mostra.forEach((l, i) => {
      const y = cab + i * alt, dest = D.destaque !== undefined && txt(l[cols[0].id]) === String(D.destaque);
      if (dest) svg.append("rect").attr("x", 0).attr("y", y - 1).attr("width", W).attr("height", alt).attr("fill", tok("cor-grade"));
      else if (C.interativa && !C.naImagem) svg.append("g").attr("class", "faixa-t").append("rect").attr("x", 0).attr("y", y - 1).attr("width", W).attr("height", alt).attr("fill", "transparent");   // acende a linha sob o mouse
      cols.forEach((c, j) => svg.append("text").attr("x", c.numerica ? X(j + 1) - 6 : X(j) + 4).attr("y", y + 14).attr("text-anchor", c.numerica ? "end" : "start")
        .attr("font-size", 12).attr("font-weight", dest || j === 0 ? 600 : 400).attr("fill", tok("cor-texto")).style("font-variant-numeric", "tabular-nums")
        .text(curto(txt(l[c.id]), Math.floor((X(j + 1) - X(j) - 8) / (dest || j === 0 ? 7.4 : 6.6)))));   // negrito é mais largo
      svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", y + alt - 1).attr("y2", y + alt - 1).attr("stroke", tok("cor-grade"));
    });
    if (mostra.length < L.length) svg.append("text").attr("x", 4).attr("y", cab + mostra.length * alt + 14).attr("font-size", 11.5).attr("fill", tok("cor-texto-secundario"))
      .text(`… e mais ${L.length - mostra.length} linhas${W > 420 ? " (tabela completa em ↗ Baixar ou Compartilhar)" : ""}`);
    fixarTexto(svg);
    return {};
  };

  // ==================================================================== repertório novo (pedido do pesquisador, 2026-10-11)
  // Experimentais (L0007, L0016): área, colunas empilhadas, pontos conectados, treemap e waffle. Mesmo padrão da fase C:
  // dados prontos do Python, SVG, legenda que destaca, caso vazio. Valores brutos; o JS só formata (pt-BR).
  const compacto = (v) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi` : Lab.fmtCompacto(v));
  const fmtNum = (formato) => (formato === "pct" ? (v) => Lab.fmtPct(v) : formato === "pp" ? (v) => Lab.fmtPP(v)
    : formato === "brl" ? (v) => `R$ ${compacto(v)}` : /^dec\d$/.test(formato || "") ? (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: +formato[3], maximumFractionDigits: +formato[3] }) : (v) => Lab.fmtInt.format(v));
  const fmtEixo = (formato) => (formato === "pct" ? (v) => `${v.toLocaleString("pt-BR")}%` : compacto);
  /** Largura do eixo vertical: o maior rótulo dos ticks (≈ 6,2 px por caractere a 10,5 px) + folga. */
  const margemEixo = (max, formato, ticks = 4) => 8 + 6.2 * d3.max(d3.scaleLinear().domain([0, max || 1]).nice().ticks(ticks), (t) => fmtEixo(formato)(t).length);
  function eixoY(svg, sy, x, W, formato, ticks = 4) {
    const g = svg.append("g");
    for (const t of sy.ticks(ticks)) {
      g.append("line").attr("x1", x).attr("x2", W).attr("y1", sy(t)).attr("y2", sy(t)).attr("stroke", tok("cor-grade"));
      g.append("text").attr("x", x - 4).attr("y", sy(t) + 3.5).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(fmtEixo(formato)(t));
    }
    return g;
  }

  /** Eixo vertical com transição: os ticks entram, saem e se movem quando a escala muda (troca de modo). */
  function eixoYAnim(g, sy, x0, x1, formato, animar, ticks = 4) {
    const tr = (n) => (animar && !Lab.semMovimento() ? n.transition().duration(500).ease(d3.easeCubicInOut) : n);
    const sel = g.selectAll("g.tick-y").data(sy.ticks(ticks), (t) => t);
    const novo = sel.enter().append("g").attr("class", "tick-y").attr("opacity", 0).attr("transform", (t) => `translate(0,${sy(t)})`);
    novo.append("line").attr("x1", x0).attr("x2", x1).attr("stroke", tok("cor-grade"));
    novo.append("text").attr("x", x0 - 4).attr("y", 3.5).attr("text-anchor", "end").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario"))
      .style("fill", tok("cor-texto-secundario")).style("font-size", "10.5px").text((t) => fmtEixo(formato)(t));
    tr(novo.merge(sel)).attr("opacity", 1).attr("transform", (t) => `translate(0,${sy(t)})`);
    tr(sel.exit()).attr("opacity", 0).remove();
  }
  /** Botões de modo no canto do palco (mesmo estilo do controle de tamanho do mapa de pontos). */
  const botoesModo = (C, rotulo, opcoes, atual, aoMudar) => {
    const caixa = el("div", { class: "fundo-mini dir so-interativo", role: "group", "aria-label": rotulo });
    const bts = opcoes.map(([v, r]) => el("button", { type: "button", "aria-pressed": String(v === atual), onclick: () => { bts.forEach((b) => b.setAttribute("aria-pressed", String(b === bt(v)))); aoMudar(v); } }, r));
    const bt = (v) => bts[opcoes.findIndex(([x]) => x === v)];
    caixa.append(...bts);
    C.alvo.append(caixa);
    return caixa;
  };
  /** Períodos (ex.: governos) em gráficos no tempo (pesquisador, 2026-10-15, story da rede federal): faixa com o nome no
   *  alto e tom leve ao fundo, na cor do período (`cor`, token) ou em cinza. periodos: [{de, ate, rotulo, cor?, nota?}],
   *  com `ate` exclusivo (o ano em que o período seguinte começa); dominio: os rótulos do eixo (anos); xIni/xFim: as bordas
   *  de um rótulo no eixo. Desenhar ANTES das marcas (o tom fica atrás). O gráfico reserva ALTURA_PERIODOS no topo. */
  const ALTURA_PERIODOS = 16;
  function faixaPeriodos(svg, periodos, dominio, xIni, xFim, [xMin, xMax], yTopo, yBase) {
    const g = svg.append("g").attr("class", "periodos");
    for (const q of periodos || []) {
      const anos = dominio.filter((t) => +t >= q.de && +t < q.ate);
      if (!anos.length) continue;
      const xa = Math.max(xMin, xIni(anos[0])), xb = Math.min(xMax, xFim(anos.at(-1))), w = Math.max(0, xb - xa - 1);
      const cor = tok(q.cor || "cor-grade"), k = g.append("g");
      k.append("rect").attr("x", xa).attr("y", yTopo).attr("width", w).attr("height", 12).attr("rx", 2).attr("fill", cor).attr("fill-opacity", q.cor ? 0.35 : 0.8);
      k.append("rect").attr("x", xa).attr("y", yTopo + 13).attr("width", w).attr("height", Math.max(0, yBase - yTopo - 13)).attr("fill", cor).attr("fill-opacity", q.cor ? 0.07 : 0.25);
      const nome = curto(q.rotulo, Math.floor((w - 4) / 5.6));
      if (w > 16) k.append("text").attr("x", xa + w / 2).attr("y", yTopo + 9.5).attr("text-anchor", "middle").attr("font-size", 9.5).attr("font-weight", 600).attr("fill", tok("cor-texto")).text(nome);
      titulo(k, [q.rotulo, q.nota || null]);
    }
    return g;
  }
  /** Faixas verticais por momento (passar o mouse ou tocar mostra o valor de todas as séries no card). */
  function faixasTempo(svg, T, sx, H, m, dica) {
    const g = svg.append("g").attr("class", "faixas-t"), passo = T.length > 1 ? sx(T[1]) - sx(T[0]) : 40;
    return T.map((t, i) => {
      const f = g.append("g").attr("class", "faixa-t");
      f.append("rect").attr("x", sx(t) - passo / 2).attr("width", passo).attr("y", m.t).attr("height", H - m.t - m.b).attr("fill", "transparent");
      f.append("line").attr("x1", sx(t)).attr("x2", sx(t)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", tok("cor-texto")).attr("stroke-width", 1);
      titulo(f, dica(i));
      return f;
    });
  }

  /** area — uma ou várias categorias no tempo; `opcoes.empilhada` empilha (parte do todo ao longo do tempo);
   *  `opcoes.alternar` põe no palco o controle Sobrepostas | Empilhadas (a troca é animada). Na empilhada, a categoria
   *  fixada na legenda vai para a base. dados: {tempo: [rótulo], series: [{id, rotulo, cor, valores}], totais?: [n]
   *  (do Python, para o card), formato?: int | pct | brl | dec1, eixo?, periodos?: [{de, ate, rotulo, cor?, nota?}]
   *  (governos em faixas, faixaPeriodos)} */
  adaptadores.area = (C) => {
    const D = C.dados, T = D?.tempo || [], S = (D?.series || []).filter((s) => s.valores?.some((v) => v !== null && v !== undefined));
    if (T.length < 2 || !S.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(150, C.alvo.clientHeight), multi = S.length > 1, fmt = fmtNum(D.formato);
    const alternar = multi && Boolean(C.opc.alternar) && C.interativa && !C.naImagem;
    let emp = Boolean(C.opc.empilhada ?? D.empilhada) && multi, base = null;
    const linhas = T.map((t, i) => Object.fromEntries([["t", t], ...S.map((s) => [s.id, s.valores[i] ?? 0])]));
    const pilhaDe = (b) => { const ks = S.map((s) => s.id); return d3.stack().keys(b ? [b, ...ks.filter((k) => k !== b)] : ks)(linhas); };
    const maxSob = d3.max(S.flatMap((s) => s.valores.filter((v) => v != null))), maxEmp = multi ? d3.max(pilhaDe(null).at(-1), (d) => d[1]) : maxSob;
    const larguraRot = 10 + 6.6 * d3.max(S, (s) => fmt(s.valores.at(-1) ?? 0).length);   // o rótulo do fim cabe (também com uma série)
    const m = { t: (alternar ? 32 : 10) + (D.periodos?.length ? ALTURA_PERIODOS : 0), b: 20, l: margemEixo(Math.max(maxSob, emp || alternar ? maxEmp : 0), D.formato), r: larguraRot };
    const sx = d3.scalePoint().domain(T).range([m.l, W - m.r]);
    const sy = d3.scaleLinear().range([H - m.b, m.t]);
    const svg = svgDe(C, W, H, `${D.eixo || "Área"} de ${T[0]} a ${T.at(-1)}: ` + S.map((s) => `${s.rotulo} de ${fmt(s.valores[0] ?? 0)} a ${fmt(s.valores.at(-1) ?? 0)}`).join("; "));
    const gEixo = svg.append("g");
    const passoT = Math.max(1, Math.ceil(T.length / Math.floor((W - m.l - m.r) / 40)));
    T.forEach((t, i) => {
      const ultimo = i === T.length - 1, colado = !ultimo && i % passoT === 0 && T.length - 1 - i < passoT && sx(T.at(-1)) - sx(t) < 34;   // não encosta no último
      if ((i % passoT === 0 && !colado) || ultimo) svg.append("text").attr("x", sx(t)).attr("y", H - 4).attr("text-anchor", ultimo ? "end" : "middle").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(t);
    });
    if (D.periodos?.length) faixaPeriodos(svg, D.periodos, T, (t) => sx(t) - sx.step() / 2, (t) => sx(t) + sx.step() / 2, [m.l, W - m.r], m.t - ALTURA_PERIODOS, H - m.b);
    const g = svg.append("g");
    const defs = svg.append("defs"), uid = Math.random().toString(36).slice(2, 8);
    const camadas = S.map((s, j) => {
      const c = corDe(s.cor), k = g.append("g").attr("data-cat", s.id);
      // degradê vertical (forte no alto, quase nulo na base): as faixas de período ao fundo continuam legíveis
      const gr = defs.append("linearGradient").attr("id", `ar-${uid}-${j}`).attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
      gr.append("stop").attr("offset", "0%").attr("stop-color", c).attr("stop-opacity", multi ? 0.22 : 0.32);
      gr.append("stop").attr("offset", "100%").attr("stop-color", c).attr("stop-opacity", 0.03);
      return { s, c, grad: `url(#ar-${uid}-${j})`, area: k.append("path").attr("fill", c), linha: k.append("path").attr("fill", "none").attr("stroke", c).attr("stroke-width", 2.4).attr("stroke-linejoin", "round").attr("stroke-linecap", "round"),
        fim: k.append("circle").attr("r", 4).attr("fill", c).attr("stroke", tok("cor-superficie")).attr("stroke-width", 2) };
    });
    const rot = svg.append("g");
    const desenhar = (animar) => {
      sy.domain([0, (emp ? maxEmp : maxSob) || 1]).nice();
      eixoYAnim(gEixo, sy, m.l, W - m.r, D.formato, animar);
      const tr = (n) => (animar && !Lab.semMovimento() ? n.transition("modo").duration(500).ease(d3.easeCubicInOut) : n);
      const P = emp ? pilhaDe(base) : null, porId = P ? Object.fromEntries(P.map((q) => [q.key, q])) : null;
      camadas.forEach(({ s, c, grad, area, linha, fim }) => {
        const y0 = (i) => (emp ? sy(porId[s.id][i][0]) : sy(0)), y1 = (i) => (emp ? sy(porId[s.id][i][1]) : sy(s.valores[i] ?? 0));
        const idx = T.map((_, i) => i);
        // empilhadas: cor cheia (a parte do todo); sobrepostas: degradê
        tr(area.attr("fill", emp ? c : grad)).attr("d", d3.area().x((i) => sx(T[i])).y0(y0).y1(y1)(idx)).attr("fill-opacity", emp ? 0.85 : 1);
        tr(linha).attr("d", d3.line().x((i) => sx(T[i])).y(y1)(idx)).attr("stroke-width", emp ? 1.2 : 2.4);
        tr(fim).attr("cx", sx(T.at(-1))).attr("cy", y1(T.length - 1)).attr("opacity", emp ? 0 : 1);
      });
      // rótulos à direita: valor final (sobrepostas: na ponta da linha; empilhadas: no meio da fatia), sem sobreposição
      const fim = T.length - 1;
      const itens = S.map((s) => ({ s, y: emp ? sy((porId[s.id][fim][0] + porId[s.id][fim][1]) / 2) : sy(s.valores[fim] ?? 0) })).sort((a, b) => a.y - b.y);
      for (let k = 1; k < itens.length; k++) if (itens[k].y - itens[k - 1].y < 13) itens[k].y = itens[k - 1].y + 13;
      const ts = rot.selectAll("text").data(itens, (d) => d.s.id).join((en) => en.append("text").attr("data-cat", (d) => d.s.id).attr("x", W - m.r + 5).attr("font-size", 11).attr("font-weight", 700)
        .attr("fill", tok("cor-texto")).style("fill", tok("cor-texto")).style("font-size", "11px").attr("y", (d) => d.y + 4).text((d) => fmt(d.s.valores[fim] ?? 0)));
      tr(ts).attr("y", (d) => d.y + 4);
    };
    desenhar(false);
    if (!multi) {   // uma série: valor do início também, sobre a linha
      const s = S[0];
      svg.append("text").attr("x", sx(T[0]) + 2).attr("y", sy(s.valores[0] ?? 0) - 7).attr("font-size", 11).attr("fill", tok("cor-texto")).attr("paint-order", "stroke")
        .attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(fmt(s.valores[0] ?? 0));
    }
    faixasTempo(svg, T, sx, H, m, (i) => [T[i], ...S.map((s) => `${s.rotulo}: ${s.valores[i] == null ? "—" : fmt(s.valores[i])}`), D.totais?.[i] != null ? `total: ${fmt(D.totais[i])}` : null]);
    if (alternar) botoesModo(C, "Forma das áreas", [["sob", "Sobrepostas"], ["emp", "Empilhadas"]], emp ? "emp" : "sob", (v) => { emp = v === "emp"; desenhar(true); });
    legendaCategorias(C, multi ? S.map((s) => ({ id: s.id, rotulo: s.rotulo, cor: s.cor })) : [],
      (id) => esmaecer(svg.selectAll("[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.15; }),
      [D.eixo ? `eixo: ${D.eixo}` : null, emp || alternar ? "empilhadas: a altura total é a soma das categorias" : null], (id) => { base = id; if (emp) desenhar(true); });
    fixarTexto(svg);
    return {};
  };

  /** colunas_empilhadas — colunas por grupo (ex.: ano), empilhadas por categoria; `opcoes.modo`: absoluto (com o total
   *  no topo) ou proporcional (cada coluna soma 100%); `opcoes.alternar` põe no palco o controle Valores | 100% (troca
   *  animada). A categoria fixada na legenda desce para a base (comparar o tamanho dela entre colunas fica fácil).
   *  dados: {grupos: [rótulo], series: [{id, rotulo, cor, valores, pct}], totais?: [n], formato?, eixo?} — pct e totais
   *  calculados no Python; periodos?: [{de, ate, rotulo, cor?, nota?}] (governos em faixas, faixaPeriodos). */
  adaptadores.colunas_empilhadas = (C) => {
    C.passarDestaca = true;   // passar o mouse numa marca destaca a categoria dela
    const D = C.dados, Gs = D?.grupos || [], S = D?.series || [];
    if (!Gs.length || !S.length) return semDados(C);
    let prop = (C.opc.modo || D.modo) === "proporcional", base = null;
    const alternar = Boolean(C.opc.alternar) && C.interativa && !C.naImagem && S.every((s) => s.pct);
    const fmtA = fmtNum(D.formato), fmtP = (v) => `${Math.round(v)}%`;
    const tot = Gs.map((_, i) => D.totais?.[i] ?? d3.sum(S, (s) => s.valores[i] ?? 0));
    const W = C.alvo.clientWidth, H = Math.max(150, C.alvo.clientHeight);
    const m = { t: (alternar ? 34 : prop ? 8 : 18) + (D.periodos?.length ? ALTURA_PERIODOS : 0), b: 20, l: Math.max(margemEixo(100, "pct"), margemEixo(d3.max(tot), D.formato)), r: 6 };
    const sx = d3.scaleBand().domain(Gs).range([m.l, W - m.r]).padding(0.22), sy = d3.scaleLinear().range([H - m.b, m.t]);
    const val = (s, i) => (prop ? s.pct?.[i] : s.valores[i]) ?? 0;
    const svg = svgDe(C, W, H, `${D.eixo || "Colunas empilhadas"}${prop ? " (proporção)" : ""}: ` + Gs.map((g, i) => `${g}: ${S.map((s) => `${s.rotulo} ${prop ? fmtP(val(s, i)) : fmtA(val(s, i))}`).join(", ")}`).join(". "));
    const gEixo = svg.append("g");
    const cabeX = Math.floor((W - m.l) / 34), passoX = Math.max(1, Math.ceil(Gs.length / cabeX));
    Gs.forEach((g, i) => {
      const ultimo = i === Gs.length - 1, colado = !ultimo && Gs.length - 1 - i < passoX && sx(Gs.at(-1)) - sx(g) < 34;   // não encosta no último
      if ((i % passoX === 0 && !colado) || ultimo) svg.append("text").attr("x", sx(g) + sx.bandwidth() / 2).attr("y", H - 5).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(g);
    });
    const folgaB = (sx.step() - sx.bandwidth()) / 2;
    if (D.periodos?.length) faixaPeriodos(svg, D.periodos, Gs, (g) => sx(g) - folgaB, (g) => sx(g) + sx.bandwidth() + folgaB, [m.l, W - m.r], m.t - ALTURA_PERIODOS, H - m.b);
    const segs = [];
    Gs.forEach((g, i) => S.forEach((s) => {
      if (!(s.valores[i] > 0)) return;
      const c = corDe(s.cor);
      const r = svg.append("rect").attr("data-cat", s.id).attr("x", sx(g)).attr("width", sx.bandwidth()).attr("fill", c);
      titulo(r, [`${g} · ${s.rotulo}`, `${fmtA(s.valores[i])}${s.pct?.[i] != null ? ` (${Lab.fmtPct(s.pct[i])} da coluna)` : ""}`, `total de ${g}: ${fmtA(tot[i])}`]);
      const t = svg.append("text").attr("data-cat", s.id).attr("x", sx(g) + sx.bandwidth() / 2).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 700)
        .attr("fill", Lab.tinta(c)).style("fill", Lab.tinta(c)).style("font-size", "10px").attr("pointer-events", "none");
      segs.push({ i, s, r, t });
    }));
    const cabeTot = sx.step() >= 6.4 * d3.max(tot, (t) => compacto(t).length) + 4;   // colunas estreitas: só o 1º e o último total
    const totais = Gs.map((g, i) => svg.append("text").attr("x", sx(g) + sx.bandwidth() / 2).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 700)
      .attr("fill", tok("cor-texto")).style("fill", tok("cor-texto")).style("font-size", "10.5px").attr("pointer-events", "none")
      .attr("display", cabeTot || i === 0 || i === Gs.length - 1 ? null : "none").text(compacto(tot[i])));
    const meio = svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "2 3").attr("pointer-events", "none");
    const desenhar = (animar) => {
      sy.domain([0, prop ? 100 : d3.max(tot) || 1]).nice();
      eixoYAnim(gEixo, sy, m.l, W - m.r, prop ? "pct" : D.formato, animar);
      const tr = (n) => (animar && !Lab.semMovimento() ? n.transition("modo").duration(500).ease(d3.easeCubicInOut) : n);
      const ordem = base ? [base, ...S.map((s) => s.id).filter((id) => id !== base)] : S.map((s) => s.id);
      Gs.forEach((_, i) => {
        let acc = 0;
        for (const id of ordem) {
          const sg = segs.find((q) => q.i === i && q.s.id === id);
          if (!sg) continue;
          const v = val(sg.s, i), y1 = sy(acc + v), y0 = sy(acc), cabe = y0 - y1 >= 14 && sx.bandwidth() >= 26;
          tr(sg.r).attr("y", y1).attr("height", Math.max(0, y0 - y1 - 1));
          sg.t.text(prop ? fmtP(v) : compacto(v));
          tr(sg.t).attr("y", (y0 + y1) / 2 + 4).attr("opacity", cabe ? 1 : 0);
          acc += v;
        }
        tr(totais[i]).attr("y", sy(prop ? 100 : tot[i]) - 4).attr("opacity", prop ? 0 : 1);
      });
      tr(meio).attr("y1", sy(50)).attr("y2", sy(50)).attr("opacity", prop ? 0.5 : 0);
    };
    desenhar(false);
    if (alternar) botoesModo(C, "Medida das colunas", [["abs", "Valores"], ["prop", "100%"]], prop ? "prop" : "abs", (v) => { prop = v === "prop"; desenhar(true); });
    legendaCategorias(C, S.map((s) => ({ id: s.id, rotulo: s.rotulo, cor: s.cor })),
      (id) => esmaecer(svg.selectAll("[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.18; }),
      [alternar ? (D.eixo || null) : prop ? "cada coluna soma 100% · pontilhada: 50%" : `número no topo: total${D.eixo ? ` · ${D.eixo}` : ""}`,
        C.interativa && S.length > 2 ? "tocar numa categoria a desce para a base" : null], (id) => { base = id; desenhar(true); });
    fixarTexto(svg);
    return {};
  };

  /** pontos_conectados — uma linha por categoria (eixo vertical), valores no eixo horizontal; dois (ou mais) pontos
   *  ligados por um traço (ex.: homens × mulheres; população × valor). Variante `faixa`: as pontas são o menor e o maior
   *  valor do grupo e um traço vertical marca uma medida de posição (ex.: mediana).
   *  dados: {pontos: [{id, rotulo, cor}], linhas: [{rotulo, valores: {id: v}}], formato?, eixo?} ou
   *         {faixa: true, linhas: [{rotulo, cor, min, max, marcador, n?}], marcador_rotulo: "mediana", formato?, eixo?} */
  adaptadores.pontos_conectados = (C) => {
    const D = C.dados, L = D?.linhas || [];
    if (!L.length) return semDados(C);
    // a legenda entra antes de medir o palco: ela ocupa altura, e o eixo não pode ficar cortado embaixo
    let svg = null;
    if (D.faixa) legendaCategorias(C, [], () => {}, [`barra: do menor ao maior valor · traço: ${D.marcador_rotulo || "marcador"}`]);
    // com `seta`, o traço vira seta do primeiro ao último ponto, colorida pela classe de mudança (dados.escala, do Python)
    const continua = D.seta && D.escala?.tipo === "continua", escC = continua ? escalaContinua(D.escala) : null;
    if (!D.faixa) legendaCategorias(C, [...(D.pontos || []), ...(D.seta && !continua ? D.escala?.itens || [] : [])],
      (id) => svg && esmaecer(svg.selectAll("[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.2; }),
      [D.seta ? (continua ? "seta: do primeiro ao último ano" : D.escala?.titulo || "seta: do primeiro ao último ano") : "traço: a distância entre os pontos"]);
    if (continua) legendaContinua(C, D.escala);
    const W = C.alvo.clientWidth, H = Math.max(140, C.alvo.clientHeight), fmt = fmtNum(D.formato), faixa = Boolean(D.faixa);
    const todos = faixa ? L.flatMap((l) => [l.min, l.max]) : L.flatMap((l) => Object.values(l.valores));
    const largRot = Math.min(150, W * 0.3, 8 + 7.2 * d3.max(L, (l) => String(l.rotulo).length));
    const m = { l: largRot + 8 + 6.2 * fmt(d3.min(todos)).length, r: 14 + 6.2 * fmt(d3.max(todos)).length, t: 6, b: 30 };
    const sx = d3.scaleLinear().domain(d3.extent(todos.filter((v) => v != null))).nice().range([m.l, W - m.r]);
    const folgaEixo = D.eixo ? 16 : 4;   // o nome do eixo fica entre a última linha e o eixo
    const passo = Math.min(46, (H - m.t - m.b - folgaEixo) / L.length);   // a folga do nome conta: senão o eixo sai do palco
    // poucas linhas: o bloco fica no meio do palco e o eixo logo abaixo dele (não no rodapé, com um vão no meio)
    const sobraV = Math.max(0, H - (m.t + passo * L.length + m.b + folgaEixo));
    m.t += sobraV / 2;
    const Hb = m.t + passo * L.length + m.b + folgaEixo;
    svg = svgDe(C, W, H, (D.eixo || "Pontos conectados") + ": " + L.map((l) => faixa ? `${l.rotulo} de ${fmt(l.min)} a ${fmt(l.max)}, ${D.marcador_rotulo || "marcador"} ${fmt(l.marcador)}`
      : `${l.rotulo}: ${(D.pontos || []).map((p) => `${p.rotulo} ${fmt(l.valores[p.id])}`).join(", ")}`).join("; "));
    eixoX(svg, sx, W, Hb, m, D.eixo);
    L.forEach((l, i) => {
      const y = m.t + passo * i + passo / 2;
      // linha em destaque (ex.: a região do leitor): faixa ao fundo e rótulo em negrito
      if (l.destaque) svg.append("rect").attr("x", 0).attr("y", y - passo / 2 + 2).attr("width", W).attr("height", passo - 4).attr("rx", 4).attr("fill", tok("cor-grade")).attr("opacity", 0.6);
      svg.append("text").attr("x", 0).attr("y", y + 4).attr("font-size", 11.5).attr("font-weight", l.destaque ? 800 : 600).attr("fill", tok("cor-texto")).text(curto(l.rotulo, Math.floor(largRot / 7.2)));
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y).attr("stroke", tok("cor-grade")).attr("stroke-dasharray", "1 3");
      if (faixa) {
        const c = corDe(l.cor || "cor-cat-1"), g = svg.append("g").attr("data-cat", l.rotulo);
        g.append("line").attr("x1", sx(l.min)).attr("x2", sx(l.max)).attr("y1", y).attr("y2", y).attr("stroke", c).attr("stroke-width", 7).attr("stroke-linecap", "round").attr("opacity", 0.35);
        for (const [v, ancora, dx] of [[l.min, "end", -8], [l.max, "start", 8]]) {
          g.append("circle").attr("cx", sx(v)).attr("cy", y).attr("r", 4.5).attr("fill", c);
          g.append("text").attr("x", sx(v) + dx).attr("y", y + 4).attr("text-anchor", ancora).attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(fmt(v));
        }
        g.append("line").attr("x1", sx(l.marcador)).attr("x2", sx(l.marcador)).attr("y1", y - 9).attr("y2", y + 9).attr("stroke", tok("cor-texto")).attr("stroke-width", 2.4);
        g.append("text").attr("x", sx(l.marcador)).attr("y", y - 11).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 700).attr("fill", tok("cor-texto"))
          .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(fmt(l.marcador));

      } else {
        const vs = (D.pontos || []).map((p) => ({ p, v: l.valores[p.id] })).filter((x) => x.v != null).sort((a, b) => a.v - b.v);
        if (D.seta && vs.length > 1) {   // seta na ordem dos pontos (do primeiro ao último ano), não na ordem dos valores
          const ord = (D.pontos || []).map((p) => l.valores[p.id]).filter((v) => v != null), x0 = sx(ord[0]), x1 = sx(ord.at(-1)), dir = Math.sign(x1 - x0) || 1;
          const cs = escC ? escC(l.mud) : corDe(l.cor_seta || "cor-texto-secundario"), ga = svg.append("g").attr("data-cat", l.cat || null);
          const fimL = Math.abs(x1 - x0) > 14 ? x1 - dir * 11 : x1;
          ga.append("line").attr("x1", x0).attr("x2", fimL).attr("y1", y).attr("y2", y).attr("stroke", cs).attr("stroke-width", 4).attr("stroke-linecap", "round");
          if (Math.abs(x1 - x0) > 14) ga.append("path").attr("d", `M${x1 - dir * 7},${y} l${-dir * 8},-5.5 l0,11 z`).attr("fill", cs);
        } else if (vs.length > 1) svg.append("line").attr("x1", sx(vs[0].v)).attr("x2", sx(vs.at(-1).v)).attr("y1", y).attr("y2", y).attr("stroke", tok("cor-texto-secundario")).attr("stroke-width", 2.5).attr("opacity", 0.55);
        vs.forEach(({ p, v }, k) => {
          const c = corDe(p.cor);
          svg.append("circle").attr("data-cat", p.id).attr("cx", sx(v)).attr("cy", y).attr("r", 6).attr("fill", c).attr("stroke", tok("cor-superficie")).attr("stroke-width", 1.5);
          const borda = k === 0 ? -10 : k === vs.length - 1 ? 10 : 0;
          if (borda) svg.append("text").attr("data-cat", p.id).attr("x", sx(v) + borda).attr("y", y + 4).attr("text-anchor", borda < 0 ? "end" : "start").attr("font-size", 10.5).attr("fill", tok("cor-texto")).text(fmt(v));
        });
      }
    });
    // a linha inteira é a área de toque: o card traz todos os valores da linha
    const gl = svg.append("g").attr("class", "faixas-l");
    L.forEach((l, i) => {
      const f = gl.append("g").attr("class", "faixa-t");
      f.append("rect").attr("x", 0).attr("y", m.t + passo * i).attr("width", W).attr("height", passo).attr("fill", "transparent");
      titulo(f, l.dica ? [l.rotulo, ...l.dica] : faixa ? [l.rotulo, `de ${fmt(l.min)} a ${fmt(l.max)}`, `${D.marcador_rotulo || "marcador"}: ${fmt(l.marcador)}`, l.n ? `n = ${Lab.fmtInt.format(l.n)}` : null]
        : [l.rotulo, ...(D.pontos || []).map((p) => `${p.rotulo}: ${l.valores[p.id] == null ? "—" : fmt(l.valores[p.id])}`)]);
    });
    fixarTexto(svg);
    return {};
  };

  /** treemap — hierarquia em retângulos com área proporcional ao valor (dois níveis: grupo → item), com aninhamento:
   *  tocar num grupo (ou no item da legenda) amplia o bloco até ocupar o palco e abre os itens dele; "‹ Todos" (ou Esc)
   *  volta. Layout do d3 (só desenho); valores, totais e % do grupo vêm do Python. A imagem sai no nível que está na tela.
   *  dados: {grupos: [{id, rotulo, cor, total, itens: [{rotulo, valor, pct?}]}], formato?, total_rotulo?} */
  adaptadores.treemap = (C) => {
    const D = C.dados, Gs = (D?.grupos || []).filter((g) => g.itens?.some((i) => i.valor > 0));
    if (!Gs.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(160, C.alvo.clientHeight), fmt = fmtNum(D.formato);
    const chave = `treemap:${C.espec?.id || ""}`, est = C.est || {};
    const aninhar = Gs.length > 1 && C.opc.aninhar !== false;
    const svg = svgDe(C, W, H, "Treemap: " + Gs.map((g) => `${g.rotulo} ${fmt(g.total)}: ${g.itens.map((i) => `${i.rotulo} ${fmt(i.valor)}`).join(", ")}`).join("; "));
    let cena = svg.append("g"), voltar = null, tirarEscNinho = null;
    const linhaPct = (i) => (i.pct != null ? `${Lab.fmtPct(i.pct)} do grupo` : null);
    const tom = (c, k) => d3.color(c).darker(Math.min(1.6, k * 0.22)).formatRgb();
    const rotulos = (gg, x0, y0, w, h, t1, t2, cor, px = 10.5) => {
      if (w > 34 && h > 16) gg.append("text").attr("x", x0 + 4).attr("y", y0 + 13).attr("font-size", px).attr("font-weight", 600).attr("fill", Lab.tinta(cor)).attr("pointer-events", "none")
        .text(curto(t1, Math.floor((w - 6) / (px * 0.6))));
      if (t2 && w > 44 && h > 30) gg.append("text").attr("x", x0 + 4).attr("y", y0 + 26).attr("font-size", 10).attr("fill", Lab.tinta(cor)).attr("pointer-events", "none").text(curto(t2, Math.floor((w - 6) / 6)));
    };
    // nível de cima: blocos dos grupos (cabeçalho com nome e total) e os itens dentro
    const topo = () => {
      const raiz = d3.hierarchy({ filhos: Gs.map((g) => ({ ...g, filhos: g.itens.filter((i) => i.valor > 0) })) }, (d) => d.filhos).sum((d) => (d.filhos ? 0 : d.valor)).sort((a, b) => b.value - a.value);
      d3.treemap().size([W, H]).paddingOuter(1).paddingTop((d) => (d.depth === 1 ? 17 : 0)).paddingInner(1.5).tile(d3.treemapSquarify.ratio(1.2))(raiz);
      const caixas = {};
      for (const n of raiz.children || []) {
        const g = n.data, c = corDe(g.cor), gg = cena.append("g").attr("data-cat", g.id).attr("data-grupo", g.id);
        caixas[g.id] = [n.x0, n.y0, n.x1, n.y1];
        titulo(gg.append("rect").attr("x", n.x0).attr("y", n.y0).attr("width", n.x1 - n.x0).attr("height", n.y1 - n.y0).attr("fill", c).attr("fill-opacity", 0.25),
          [g.rotulo, `${fmt(g.total)}${D.total_rotulo ? ` (${D.total_rotulo})` : ""}`, `${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}`, aninhar ? "tocar abre o grupo" : null]);
        if (n.x1 - n.x0 > 40) gg.append("text").attr("x", n.x0 + 4).attr("y", n.y0 + 12.5).attr("font-size", 11).attr("font-weight", 700).attr("fill", tok("cor-texto")).attr("pointer-events", "none")
          .text(curto(`${g.rotulo} · ${fmt(g.total)}`, Math.floor((n.x1 - n.x0 - 8) / 6.4)));
        (n.children || []).forEach((f, k) => {
          const w = f.x1 - f.x0, h = f.y1 - f.y0, cf = tom(c, k);
          titulo(gg.append("rect").attr("x", f.x0).attr("y", f.y0).attr("width", Math.max(0, w)).attr("height", Math.max(0, h)).attr("fill", cf),
            [`${g.rotulo} › ${f.data.rotulo}`, fmt(f.data.valor), linhaPct(f.data), aninhar ? "tocar abre o grupo" : null]);
          rotulos(gg, f.x0, f.y0, w, h, f.data.rotulo, fmt(f.data.valor), cf);
        });
      }
      return caixas;
    };
    // nível do grupo: só os itens dele, ocupando o palco abaixo da barra "‹ Todos"
    const BARRA = 26;
    const grupo = (g) => {
      const c = corDe(g.cor), itens = g.itens.filter((i) => i.valor > 0);
      const raiz = d3.hierarchy({ filhos: itens }, (d) => d.filhos).sum((d) => (d.filhos ? 0 : d.valor)).sort((a, b) => b.value - a.value);
      d3.treemap().size([W, H - BARRA]).paddingInner(1.5).tile(d3.treemapSquarify.ratio(1.2))(raiz);
      const gg = cena.append("g").attr("data-cat", g.id).attr("transform", `translate(0,${BARRA})`);
      (raiz.children || []).forEach((f, k) => {
        const w = f.x1 - f.x0, h = f.y1 - f.y0, cf = tom(c, k);
        titulo(gg.append("rect").attr("x", f.x0).attr("y", f.y0).attr("width", Math.max(0, w)).attr("height", Math.max(0, h)).attr("fill", cf),
          [`${g.rotulo} › ${f.data.rotulo}`, fmt(f.data.valor), linhaPct(f.data)]);
        rotulos(gg, f.x0, f.y0, w, h, f.data.rotulo, [fmt(f.data.valor), f.data.pct != null ? Lab.fmtPct(f.data.pct) : null].filter(Boolean).join(" · "), cf, 11.5);
      });
      cena.append("text").attr("x", W - 4).attr("y", 17).attr("text-anchor", "end").attr("font-size", 11.5).attr("font-weight", 700).attr("fill", tok("cor-texto"))
        .text(curto(`${g.rotulo} · ${fmt(g.total)}`, Math.floor((W - 130) / 6.6)));
    };
    const tr = (n, ms = 520) => (Lab.semMovimento() || C.naImagem ? n : n.transition("ninho").duration(ms).ease(d3.easeCubicInOut));
    // muda de nível: a cena antiga amplia (ou encolhe) até o bloco do grupo e some; a nova surge no lugar
    const irPara = (id, animar = true) => {
      if (id === (est[chave] ?? null)) return;
      const antes = est[chave] ?? null, caixas = caixasTopo;
      est[chave] = id;
      C.fecharDica?.();
      const velha = cena;
      cena = svg.insert("g", () => velha.node().nextSibling);
      if (id) grupo(Gs.find((g) => g.id === id)); else caixasTopo = topo();
      fixarTexto(cena);
      voltar?.remove(); voltar = null;
      tirarEscNinho?.(); tirarEscNinho = null;
      if (id && C.interativa && !C.naImagem) tirarEscNinho = empilharEsc(() => { tirarEscNinho = null; irPara(null); C.legenda?.querySelector('button[aria-pressed="true"]')?.click(); }, svg.node());
      if (id && C.interativa && !C.naImagem) {
        voltar = el("div", { class: "fundo-mini so-interativo", role: "group", "aria-label": "Nível do treemap" },
          el("button", { type: "button", onclick: () => { irPara(null); C.legenda?.querySelector('button[aria-pressed="true"]')?.click(); } }, "‹ Todos os grupos"));
        C.alvo.append(voltar);
      }
      if (!animar || Lab.semMovimento()) { velha.remove(); return; }
      const b = caixas[id || antes];
      const zoom = b ? `translate(${-b[0] * W / (b[2] - b[0])},${-b[1] * H / (b[3] - b[1])}) scale(${W / (b[2] - b[0])},${H / (b[3] - b[1])})` : null;
      const inverso = b ? `translate(${b[0]},${b[1]}) scale(${(b[2] - b[0]) / W},${(b[3] - b[1]) / H})` : null;
      velha.selectAll("text").remove();
      if (id) {   // entrando: a velha amplia o bloco do grupo; a nova surge
        tr(velha).attr("transform", zoom).attr("opacity", 0).remove();
        cena.attr("opacity", 0); tr(cena, 420).attr("opacity", 1);
      } else {    // saindo: a velha encolhe para o lugar do bloco; a nova aparece por trás
        tr(velha).attr("transform", inverso).attr("opacity", 0).remove();
        cena.attr("opacity", 0); tr(cena, 420).attr("opacity", 1);
      }
    };
    let caixasTopo = topo();
    const inicial = aninhar ? est[chave] ?? null : null;
    est[chave] = null;
    if (inicial && Gs.some((g) => g.id === inicial)) irPara(inicial, false);
    if (aninhar && C.interativa && !C.naImagem) {
      svg.on("click.ninho", (ev) => {
        if (est[chave]) return;
        const g = ev.target.closest?.("[data-grupo]");
        if (!g) return;
        ev.stopImmediatePropagation();   // no nível de cima, tocar abre o grupo (o card não fica preso)
        irPara(g.dataset.grupo);
      }, true);
    }
    legendaCategorias(C, Gs.map((g) => ({ id: g.id, rotulo: g.rotulo, cor: g.cor })),
      (id) => { if (!est[chave]) esmaecer(svg.selectAll("g[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.2; }); },
      [`área: ${D.total_rotulo || "valor"}; dentro de cada grupo, os itens`, aninhar && C.interativa ? "tocar num grupo abre os itens dele" : null],
      aninhar ? (id) => irPara(id) : null);
    fixarTexto(svg);
    return {};
  };

  /** waffle — grade de quadrados: cada quadrado é uma unidade (ex.: uma cadeira) ou 1% do total. As contagens por
   *  categoria vêm do Python (no modo 1%, arredondadas para somar 100 — maiores restos). dados: {itens: [{id, rotulo,
   *  cor, n, valor_rotulo?}], unidade: "1 quadrado = 1 cadeira", colunas?: n} */
  adaptadores.waffle = (C) => {
    C.passarDestaca = true;   // passar o mouse numa marca destaca a categoria dela
    const D = C.dados, I = (D?.itens || []).filter((i) => i.n > 0);
    if (!I.length) return semDados(C);
    const N = d3.sum(I, (i) => i.n), W = C.alvo.clientWidth, H = Math.max(120, C.alvo.clientHeight);
    let cols = D.colunas || Math.max(1, Math.round(Math.sqrt((N * W) / H)));
    const rows = Math.ceil(N / cols), lado = Math.min((W - 4) / cols, (H - 4) / rows), q = lado * 0.86;
    const x0 = (W - cols * lado) / 2, y0 = (H - rows * lado) / 2;
    const svg = svgDe(C, W, H, `${D.unidade || "Waffle"}: ` + I.map((i) => `${i.rotulo} ${i.valor_rotulo || i.n}`).join(", "));
    let k = 0;
    for (const it of I) {
      const c = corDe(it.cor), g = svg.append("g").attr("data-cat", it.id);
      titulo(g, [it.rotulo, it.valor_rotulo ? `${it.valor_rotulo} (${it.n} ${it.n === 1 ? "quadrado" : "quadrados"})` : `${it.n} de ${N}`, D.unidade || null]);
      for (let j = 0; j < it.n; j++, k++) {
        const col = k % cols, lin = Math.floor(k / cols);
        g.append("rect").attr("x", x0 + col * lado).attr("y", y0 + lin * lado).attr("width", q).attr("height", q).attr("rx", Math.min(3, q * 0.15)).attr("fill", c);
      }
    }
    legendaCategorias(C, I.map((i) => ({ id: i.id, rotulo: `${i.rotulo} · ${i.valor_rotulo || i.n}`, cor: i.cor })),
      (id) => esmaecer(svg.selectAll("g[data-cat]")).attr("opacity", function () { return !id || this.dataset.cat === id ? 1 : 0.2; }), [D.unidade]);
    fixarTexto(svg);
    return {};
  };

  /** serie_marcos (EXPERIMENTAL, pesquisador 2026-10-12: story de indicadores entre governos) — valores em alguns anos
   *  (marcos, ex.: o último ano de cada governo) num eixo de tempo REAL, com os períodos (governos) em faixas ao fundo.
   *  Os pontos ficam no ano a que o valor se refere; o traço pontilhado só liga os pontos (não mostra os anos do meio);
   *  `quebra` interrompe o traço (mudança de método). Rótulos e dicas prontos no Python (L0002; dica com contexto:
   *  variação desde o marco anterior, ano, ressalvas). Marca vazada = estimado ou aproximado.
   *  dados: {pontos: [{x, rotulo, dica: [linhas], vazado?}], periodos: [{de, ate, rotulo}], dominio: [x0, x1],
   *          quebras?: [{x, rotulo}], referencia?: {valor, rotulo}, eixo?, cor?}; período com `cor` (token) ganha tom e
   *          filete na cor dele (governos; pesquisador, 2026-10-15) */
  adaptadores.serie_marcos = (C) => {
    const D = C.dados, P0 = (D?.pontos || []).filter((p) => p.valor !== null && p.valor !== undefined);
    if (!P0.length) return semDados(C);
    const W = C.alvo.clientWidth, H = Math.max(170, C.alvo.clientHeight), m = { t: 30, r: 12, b: 26, l: 12 };
    const sx = d3.scaleLinear().domain(D.dominio || d3.extent(P0, (p) => p.x)).range([m.l, W - m.r]);
    const ys = P0.map((p) => p.valor).concat(D.referencia ? [D.referencia.valor] : []);
    const [y0, y1] = d3.extent(ys), folga = (y1 - y0 || Math.abs(y1) || 1) * 0.18;
    const sy = d3.scaleLinear().domain([Math.min(y0 - folga, D.referencia ? D.referencia.valor : Infinity), y1 + folga]).range([H - m.b, m.t + 14]);
    const cor = corDe(D.cor || C.opc.cor || "cor-cat-1");
    const svg = svgDe(C, W, H, `${D.eixo || "Série"}: ` + P0.map((p) => `${p.marco || ""} ${p.rotulo}`).join("; "));
    // faixas dos períodos (alternadas) com o nome no alto; nome que não cabe fica só na dica da faixa
    (D.periodos || []).forEach((q, i) => {
      const xa = sx(q.de), xb = sx(q.ate), g = svg.append("g").attr("class", "periodo");
      g.append("rect").attr("x", xa).attr("y", m.t - 2).attr("width", Math.max(0, xb - xa)).attr("height", H - m.b - m.t + 2)
        .attr("fill", q.cor ? tok(q.cor) : tok(i % 2 ? "cor-fundo" : "cor-grade")).attr("opacity", q.cor ? 0.1 : i % 2 ? 1 : 0.55);
      if (q.cor) g.append("rect").attr("x", xa).attr("y", m.t - 2).attr("width", Math.max(0, xb - xa - 1)).attr("height", 3).attr("fill", tok(q.cor));   // cor do período (ex.: governos)
      const nome = curto(q.rotulo, Math.floor((xb - xa - 4) / 6));
      if (xb - xa > 18) g.append("text").attr("x", (xa + xb) / 2).attr("y", m.t - 7).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 600)
        .attr("fill", tok("cor-texto-secundario")).text(nome);
      titulo(g, [q.rotulo, q.nota || null]);
    });
    // eixo do tempo: os anos dos marcos
    for (const p of P0) svg.append("line").attr("x1", sx(p.x)).attr("x2", sx(p.x)).attr("y1", H - m.b).attr("y2", H - m.b + 4).attr("stroke", tok("cor-eixo"));
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", H - m.b).attr("y2", H - m.b).attr("stroke", tok("cor-eixo"));
    let xUlt = -Infinity;
    P0.forEach((p) => { const x = sx(p.x); if (x - xUlt < 26) return; xUlt = x;
      svg.append("text").attr("x", x).attr("y", H - m.b + 16).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", tok("cor-texto-secundario")).text(p.ano_rotulo || Math.floor(p.x)); });
    if (D.referencia) {
      const yr = sy(D.referencia.valor);
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yr).attr("y2", yr).attr("stroke", tok("cor-texto")).attr("stroke-dasharray", "3 3").attr("opacity", 0.55);
      svg.append("text").attr("x", W - m.r - 2).attr("y", yr - 4).attr("text-anchor", "end").attr("font-size", 10).attr("fill", tok("cor-texto-secundario")).text(D.referencia.rotulo || "");
    }
    // traço pontilhado entre marcos, interrompido nas quebras de série
    const Q = (D.quebras || []).map((q) => q.x);
    for (let i = 1; i < P0.length; i++) {
      const a = P0[i - 1], b = P0[i];
      if (Q.some((x) => x > a.x && x < b.x)) continue;
      svg.append("line").attr("x1", sx(a.x)).attr("y1", sy(a.valor)).attr("x2", sx(b.x)).attr("y2", sy(b.valor)).attr("stroke", cor).attr("stroke-width", 1.6).attr("stroke-dasharray", "2 4").attr("stroke-linecap", "round");
    }
    for (const q of D.quebras || []) {
      svg.append("line").attr("x1", sx(q.x)).attr("x2", sx(q.x)).attr("y1", m.t + 10).attr("y2", H - m.b).attr("stroke", tok("cor-texto")).attr("stroke-width", 1.2).attr("stroke-dasharray", "1 3");
      svg.append("text").attr("x", sx(q.x) + 3).attr("y", m.t + 20).attr("font-size", 10).attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(q.rotulo);
    }
    // pontos e valores: rótulo acima; se encostar no anterior, abaixo
    let ant = null;
    for (const p of P0) {
      const x = sx(p.x), y = sy(p.valor), g = svg.append("g").attr("data-k", p.marco || p.x);
      g.append("circle").attr("cx", x).attr("cy", y).attr("r", 5).attr("fill", p.vazado ? tok("cor-superficie") : cor).attr("stroke", cor).attr("stroke-width", 2);
      g.append("circle").attr("cx", x).attr("cy", y).attr("r", 14).attr("fill", "transparent");   // área de toque
      const w = String(p.rotulo).length * 6.8, baixo = ant && Math.abs(x - ant.x) < (w + ant.w) / 2 + 4 && !ant.baixo && Math.abs(y - ant.y) < 18;
      const ty = baixo ? y + 18 : y - 10;
      g.append("text").attr("x", Math.max(m.l + w / 2, Math.min(W - m.r - w / 2, x))).attr("y", ty).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700)
        .attr("fill", tok("cor-texto")).attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(p.rotulo);
      titulo(g, p.dica || [p.rotulo]);
      ant = { x, y, w, baixo };
    }
    legendaCategorias(C, [], () => {}, ["ponto: o valor do ano; faixas: governos", "pontilhado: só liga os pontos (os anos do meio não estão no gráfico)",
      P0.some((p) => p.vazado) ? "ponto vazado: valor estimado ou aproximado" : null, D.quebras?.length ? "linha vertical: mudança de método (séries não comparáveis)" : null, D.eixo ? `unidade: ${D.eixo}` : null]);
    fixarTexto(svg);
    return {};
  };

  /** pontos_agrupados (EXPERIMENTAL) — muitos pontos num mapa, em grupos que se desfazem ao ampliar. Os níveis
   *  aninhados vêm do Python (labdados.agrupamento: centro médio e soma de cada grupo); o JS escolhe o nível pelo zoom,
   *  desenha e anima: ao ampliar, os pontos de um grupo saem do centro dele; ao reduzir, voltam para o centro do grupo
   *  maior. Tocar num grupo amplia até ele se abrir; tocar num ponto abre o card. Tamanho pelo número de pontos (com o
   *  número no círculo) ou pelo valor (soma) — `opcoes.tamanho`: n | valor; `opcoes.alternar` põe o controle no palco.
   *  dados: {pontos: [{rotulo, linhas, valor}], niveis: [{lat, lon, n, soma, pai?, pontos?}], raio, unidade: [singular,
   *  plural], valor_rotulo, formato?, referencia?: FeatureCollection (contornos de contexto)} */
  adaptadores.pontos_agrupados = (C) => {
    const D = C.dados, NV = D?.niveis || [], PT = D?.pontos || [];
    if (!NV.length) return semDados(C, "Nenhum ponto tem coordenada.");
    const W = C.alvo.clientWidth, H = Math.max(180, C.alvo.clientHeight), fmt = fmtNum(D.formato), Z = NV.length - 1;
    const [uS, uP] = D.unidade || ["ponto", "pontos"], est = C.est || {}, chave = `agrup:${C.espec?.id || ""}`;
    const temValor = NV[0].soma.some((v) => v > 0);
    let modo = est[`${chave}:tam`] || (C.opc.tamanho === "valor" && temValor ? "valor" : "n");
    const ult = NV[Z];
    const topoCtl = C.opc.alternar && C.interativa && !C.naImagem ? 44 : 16;   // o controle de tamanho não cobre os grupos do alto
    const proj = d3.geoMercator().fitExtent([[16, topoCtl], [W - 16, H - 16]], { type: "MultiPoint", coordinates: ult.lon.map((x, i) => [x, ult.lat[i]]) });
    const P = NV.map((nv) => nv.lon.map((x, i) => proj([x, nv.lat[i]])));
    // caixa de cada grupo (para ampliar até ele): dos grupos do último nível para cima
    const caixa = NV.map((nv) => nv.n.map(() => [Infinity, Infinity, -Infinity, -Infinity]));
    P[Z].forEach(([x, y], i) => { for (let z = Z, k = i; z >= 0; k = NV[z].pai?.[k], z--) { const c = caixa[z][k]; c[0] = Math.min(c[0], x); c[1] = Math.min(c[1], y); c[2] = Math.max(c[2], x); c[3] = Math.max(c[3], y); } });
    const ancestral = (z, i, a) => { while (z > a) { i = NV[z].pai[i]; z--; } return i; };
    // nível pelo zoom: o raio de fusão do Python, na tela, fica perto de ALVO px
    const ext = Math.max(d3.max(P[Z], (p) => p[0]) - d3.min(P[Z], (p) => p[0]), d3.max(P[Z], (p) => p[1]) - d3.min(P[Z], (p) => p[1])) || 1;
    // distância de fusão na tela: maior no modo valor (círculos maiores)
    const raio = D.raio || 0.1, alvo = () => (modo === "valor" ? 40 : 30);
    const nivelDe = (k) => Math.max(0, Math.min(Z, Math.round(Math.log2((raio * ext * k) / alvo()))));
    const kDoNivel = (z) => (alvo() * 2 ** (z + 0.05)) / (raio * ext);
    const KMAX = Math.max(4, kDoNivel(Z) * 2);
    const svg = svgDe(C, W, H, `Mapa de ${Lab.fmtInt.format(PT.length || d3.sum(NV[0].n))} ${uP}, agrupados; ampliar separa os grupos.`);
    const cena = svg.append("g");
    // fundo opcional com ruas (Esri cinza, o mesmo do Lab.mapa — L0006); sem ele, os contornos de referência em cinza
    const raster = C.opc.fundo === "esri-cinza" && Lab.fundoRaster ? cena.append("g").attr("class", "tiles") : null;
    if (D.referencia?.features?.length) cena.append("g").selectAll("path").data(D.referencia.features).join("path").attr("d", d3.geoPath(proj))
      .attr("fill", raster ? "none" : tok("cor-fundo")).attr("stroke", tok(raster ? "cor-texto-secundario" : "cor-eixo")).attr("stroke-width", raster ? 1.2 : 0.7).attr("vector-effect", "non-scaling-stroke");
    const blocos = (t) => raster && Lab.fundoRaster.desenhar(raster, proj, W, H, t);
    const gNos = cena.append("g");
    const cor = corDe(C.opc.cor || "cor-cat-1");
    let zA = null, k = 1, escTam = null;
    const escala = (z) => {
      const nv = NV[z];
      if (modo === "valor") { const s = d3.scaleSqrt().domain([0, d3.max(nv.soma) || 1]).range([0, Math.min(23, W / 14)]); escTam = s; return (i) => Math.max(2.5, s(nv.soma[i])); }
      escTam = null;
      const s = d3.scaleSqrt().domain([1, d3.max(nv.n) || 1]).range([7, Math.min(19, W / 17)]);
      return (i) => (nv.n[i] === 1 ? 4 : s(nv.n[i]));
    };
    const dica = (z, i) => {
      const n = NV[z].n[i];
      if (n === 1 || z === Z) {
        const ids = z === Z ? NV[Z].pontos?.[i] || [] : [];
        if (n === 1) { const p = PT[ids[0]] || {}; return [p.rotulo || uS, ...(p.linhas || [])]; }
        return [`${n} ${uP} no mesmo lugar`, ...ids.slice(0, 6).map((j) => PT[j]?.rotulo), ids.length > 6 ? `… e mais ${ids.length - 6}` : null, temValor ? `${D.valor_rotulo || "valor"}: ${fmt(NV[z].soma[i])}` : null];
      }
      return [`${Lab.fmtInt.format(n)} ${uP}`, temValor ? `${D.valor_rotulo || "valor"}: ${fmt(NV[z].soma[i])}` : null, "tocar amplia o grupo"];
    };
    // desenha o nível z; ao mudar de nível, anima a partir do (ou para o) grupo correspondente do nível anterior
    const desenhar = (z, animar) => {
      const de = zA, r = escala(z), nv = NV[z];
      const mover = animar && de !== null && de !== z && !Lab.semMovimento() && !C.naImagem;
      const velhos = gNos.selectAll("g.no").attr("class", "no saindo");
      const novos = gNos.selectAll("g.no.entrando").data(nv.n.map((n, i) => i)).enter().append("g").attr("class", "no").attr("data-z", z);
      novos.append("circle").attr("fill", cor).attr("fill-opacity", (i) => (nv.n[i] > 1 ? 0.82 : 0.95)).attr("stroke", tok("cor-superficie")).attr("stroke-width", 1).attr("vector-effect", "non-scaling-stroke");
      novos.filter((i) => nv.n[i] > 1).append("text").attr("text-anchor", "middle").attr("font-weight", 700).attr("fill", Lab.tinta(cor)).style("fill", Lab.tinta(cor)).attr("pointer-events", "none")
        .text((i) => (nv.n[i] >= 1000 ? compacto(nv.n[i]) : nv.n[i]));
      titulo(novos, (i) => dica(z, i));
      novos.each(function (i) { this.__i = i; this.__z = z; this.__r = r(i); });
      if (mover && z > de) {   // ampliando: cada grupo novo nasce no centro do grupo de onde saiu
        novos.attr("transform", (i) => `translate(${P[de][ancestral(z, i, de)]})`).transition("nivel").duration(450).ease(d3.easeCubicOut).attr("transform", (i) => `translate(${P[z][i]})`);
        velhos.transition("nivel").duration(250).attr("opacity", 0).remove();
      } else if (mover) {        // reduzindo: os grupos velhos voltam para o centro do grupo maior e somem
        novos.attr("transform", (i) => `translate(${P[z][i]})`).attr("opacity", 0).transition("nivel").delay(200).duration(300).attr("opacity", 1);
        velhos.transition("nivel").duration(420).ease(d3.easeCubicIn).attr("transform", function () { return `translate(${P[z][ancestral(this.__z, this.__i, z)]})`; }).attr("opacity", 0).remove();
      } else { velhos.remove(); novos.attr("transform", (i) => `translate(${P[z][i]})`); }
      zA = z;
      tamanhoNaTela();
      // legenda de tamanho (modo valor): a escala é a do nível na tela e muda ao ampliar
      const zona = C.legenda?.querySelector(".leg-tamanho");
      if (zona) zona.replaceChildren(...(escTam ? [Lab.legendaTamanho(escTam, `${D.valor_rotulo || "valor"} do grupo (escala deste nível)`)] : []));
    };
    // círculos e números mantêm o tamanho na tela com qualquer zoom (o grupo da cena é que escala)
    const tamanhoNaTela = () => gNos.selectAll("g.no").each(function () {
      const g = d3.select(this), rr = this.__r / k;
      g.select("circle").attr("r", rr);
      g.select("text").attr("font-size", 11 / k).style("font-size", `${11 / k}px`).attr("dy", 3.8 / k).attr("opacity", this.__r >= 7 ? 1 : 0);
    });
    const aplicar = (t, animar = true) => {
      k = t.k;
      cena.attr("transform", t);
      const z = nivelDe(k);
      if (z !== zA) desenhar(z, animar); else tamanhoNaTela();
      est[chave] = t.k === 1 && !t.x && !t.y ? null : { x: t.x, y: t.y, k: t.k };
    };
    const t0 = est[chave] ? d3.zoomIdentity.translate(est[chave].x, est[chave].y).scale(est[chave].k) : d3.zoomIdentity;
    if (C.interativa && !C.naImagem) {
      const aviso = el("div", { class: "aviso-roda", hidden: "" });
      let tAv = null;
      const avisar = (t) => { aviso.textContent = t; aviso.hidden = false; clearTimeout(tAv); tAv = setTimeout(() => { aviso.hidden = true; }, 1400); };
      const zoom = d3.zoom().scaleExtent([1, KMAX]).translateExtent([[0, 0], [W, H]]).clickDistance(4)
        .filter((ev) => {
          const kk = d3.zoomTransform(svg.node()).k;
          if (ev.type === "wheel") { if (ev.ctrlKey || ev.metaKey) return true; avisar("Use Ctrl + roda (⌘ no Mac) para ampliar o mapa"); return false; }
          if (ev.type.startsWith("touch")) return ev.touches.length > 1;
          return !ev.button && kk > 1;
        })
        .on("zoom", (ev) => aplicar(ev.transform))
        .on("end", (ev) => blocos(ev.transform));
      svg.call(zoom).on("dblclick.zoom", null).style("touch-action", "pan-x pan-y");
      // arrastar com um dedo no mapa ampliado: lembrete dos dois dedos (tocar, sem arrastar, não avisa)
      svg.node().addEventListener("touchmove", (ev) => { if (ev.touches.length === 1 && d3.zoomTransform(svg.node()).k > 1.01) avisar("Use dois dedos para mover o mapa"); }, { passive: true });
      const irPara = (t) => svg.transition().duration(Lab.semMovimento() ? 0 : 650).ease(d3.easeCubicInOut).call(zoom.transform, t);
      // tocar num grupo: amplia até a caixa dele, no mínimo até o nível em que ele se abre
      svg.on("click.grupo", (ev) => {
        const no = ev.target.closest?.("g.no");
        if (!no || no.classList.contains("saindo")) return;
        const z = no.__z, i = no.__i;
        if (NV[z].n[i] === 1 || z === Z) return;   // ponto (ou pontos no mesmo lugar): fica o card
        ev.stopImmediatePropagation();
        C.fecharDica?.();
        const [x0, y0, x1, y1] = caixa[z][i], kFit = Math.min((W - 60) / Math.max(x1 - x0, 1), (H - 60) / Math.max(y1 - y0, 1));
        const kk = Math.max(1, Math.min(KMAX, Math.max(kDoNivel(z + 1), Math.min(kFit, kDoNivel(Math.min(Z, z + 3))))));
        irPara(d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
      }, true);
      C.alvo.append(aviso, el("div", { class: "zoom-pontos so-interativo", role: "group", "aria-label": "Zoom do mapa" },
        el("button", { type: "button", "aria-label": "Ampliar", text: "+", onclick: () => svg.transition().duration(300).call(zoom.scaleBy, 2) }),
        el("button", { type: "button", "aria-label": "Reduzir", text: "−", onclick: () => svg.transition().duration(300).call(zoom.scaleBy, 0.5) }),
        el("button", { type: "button", "aria-label": "Voltar ao enquadramento inicial", text: "⟲", onclick: () => irPara(d3.zoomIdentity) })));
      if (temValor && C.opc.alternar) {
        const caixaT = el("div", { class: "fundo-mini so-interativo", role: "group", "aria-label": "Tamanho dos círculos" }, el("span", { class: "rot-mini", text: "Tamanho:" }));
        const bts = [["n", `nº de ${uP}`], ["valor", D.valor_rotulo || "valor"]].map(([v, r]) => el("button", { type: "button", "aria-pressed": String(v === modo),
          onclick: () => { modo = v; est[`${chave}:tam`] = v; bts.forEach((b) => b.setAttribute("aria-pressed", String(b === bts[v === "n" ? 0 : 1]))); zA = null; desenhar(nivelDe(k), false); atualizarLegenda(); } }, r));
        caixaT.append(...bts);
        C.alvo.append(caixaT);
      }
      svg.call(zoom.transform, t0);
      if (zA === null) aplicar(t0, false);
      if (raster) C.alvo.append(el("div", { class: "mapa-atribuicao-mini", text: Lab.fundoRaster.atribuicao }));
    } else {   // a imagem sai com o enquadramento e o nível do momento
      aplicar(t0, false);
      if (raster) svg.append("text").attr("x", W - 4).attr("y", H - 4).attr("text-anchor", "end").attr("font-size", 8.5).attr("fill", tok("cor-texto-secundario"))
        .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text(Lab.fundoRaster.atribuicao);
    }
    blocos(t0);
    const extras = [];
    const atualizarLegenda = () => {
      if (!C.legenda) { if (C.naImagem) C.itensImagem = [{ rotulo: modo === "valor" ? `círculo: área ∝ ${D.valor_rotulo || "valor"} · número: quantos ${uP}` : `número no círculo: quantos ${uP} estão agrupados` }]; return; }
      const zona = el("div", { class: "leg-tamanho" });
      if (escTam) zona.append(Lab.legendaTamanho(escTam, `${D.valor_rotulo || "valor"} do grupo (escala deste nível)`));
      C.legenda.replaceChildren(zona, el("span", { class: "item-extra", text: modo === "valor"
        ? `círculo: área ∝ ${D.valor_rotulo || "valor"} do grupo · número: quantos ${uP}` : `número no círculo: quantos ${uP} estão agrupados · ponto: 1 ${uS}` }),
        el("span", { class: "item-extra", text: C.interativa && !C.naImagem ? "ampliar (ou tocar num grupo) separa os grupos" : "grupos no centro médio dos pontos" }), ...extras);
    };
    atualizarLegenda();
    fixarTexto(svg);
    return {};
  };

  // ==================================================================== fundo OSM (L0013: mapas de cidade publicados)
  /** Raster do OpenStreetMap ao vivo, só quando a página é servida por http(s) (o OSM recusa pedidos sem origem, como
   *  em arquivo aberto com duplo clique). Uso leve, com atribuição; nada de download em massa. */
  const osm = {
    disponivel: () => typeof d3.tile === "function" && /^https?:$/.test(location.protocol),
    camada(g, proj, W, H) {
      return (t) => {
        const [tx0, ty0] = proj.translate();
        const tiles = d3.tile().size([W, H]).scale(proj.scale() * 2 * Math.PI * t.k).translate([t.x + t.k * tx0, t.y + t.k * ty0])();
        const sc = tiles.scale, [ox, oy] = tiles.translate;
        const itens = tiles.filter(([, , z]) => z <= 18).map(([x, y, z]) => ({ k: `${z}/${x}/${y}`, href: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, x: (x + ox) * sc, y: (y + oy) * sc, w: sc }));
        g.selectAll("image").data(itens, (d) => d.k).join((en) => en.append("image").attr("preserveAspectRatio", "none").attr("crossorigin", "anonymous").attr("href", (d) => d.href))
          .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.w + 0.5).attr("height", (d) => d.w + 0.5);
      };
    },
  };

  /** Página da Visualização: lê o plano embutido, carrega a fatia sob demanda (data/<pasta>/<chave>.js) e monta a peça;
   *  ?embed=1 vira o hospedeiro embed; senão, página avulsa com o bloco de metodologia. */
  async function pagina() {
    const P = await Lab.decodificar(document.getElementById("plano").textContent.trim());
    const tema = new URLSearchParams(location.search).get("tema");   // padrão: o tema do leitor; ?tema=claro|escuro fixa (Q-020)
    if (tema === "claro" || tema === "escuro") document.documentElement.dataset.theme = tema === "claro" ? "light" : "dark";
    const embed = new URLSearchParams(location.search).has("embed");   // o código de embutir leva ?embed=1
    document.body.classList.add(embed ? "viz-embed" : "viz-pagina");
    Lab.configurar({ autor: P.autor });
    const carregadas = new Map();
    const global = P.fatias?.global || "VIZ_FATIAS";
    const carregarFatia = (chave) => {
      if (!P.fatias) return Promise.resolve(P.base || { textos: {} });   // story ou peça sem fatias: base única no plano
      // fatia já presente na página (pacote único, ex.: versão de teste com cidades embutidas): sem buscar arquivo
      if (!carregadas.has(chave) && typeof window[global]?.[chave] === "string") carregadas.set(chave, Lab.decodificar(window[global][chave]));
      if (!carregadas.has(chave)) carregadas.set(chave, new Promise((ok, falha) => {
        const s = el("script", { src: `${P.fatias.pasta}/${chave}.js` });
        s.onload = () => (typeof window[global]?.[chave] === "string" ? Lab.decodificar(window[global][chave]).then(ok, falha) : falha(new Error("arquivo sem dados")));
        s.onerror = () => { carregadas.delete(chave); falha(new Error(`${P.fatias.pasta}/${chave}.js não encontrado`)); };
        document.head.append(s);
      }));
      return carregadas.get(chave);
    };
    const alvo = document.getElementById("viz");
    if (P.teste && !embed) {
      alvo.before(el("p", { class: "viz-selo-teste", text: "Versão de teste" }));
      if (P.aviso_teste) alvo.before(el("p", { class: "viz-aviso-teste", role: "note", text: P.aviso_teste }));   // publicacao.aviso
    }
    const og = new URLSearchParams(location.search).has("og");   // prévia do link (og:image), capturada no build
    const peca = montar(alvo, P, { host: embed ? "embed" : "pagina", carregarFatia, osm });
    if (og) {   // 1200 × 630: a imagem paisagem inteira, centrada sobre a superfície; o PNG vai para o DOM (o build o lê)
      await peca.pronto;
      const { cv } = await peca.gerarImagem("paisagem");
      const c = el("canvas", { width: "1200", height: "630" }), x = c.getContext("2d");
      x.fillStyle = Lab.token("cor-superficie"); x.fillRect(0, 0, 1200, 630);
      const k = Math.min(1200 / cv.width, 630 / cv.height), w = cv.width * k, h = cv.height * k;
      x.imageSmoothingQuality = "high"; x.drawImage(cv, (1200 - w) / 2, (630 - h) / 2, w, h);
      document.body.replaceChildren(el("pre", { id: "og-png", text: c.toDataURL("image/png") }));
      return;
    }
    // a metodologia completa fica em ✎ Notas e fontes (L0014): a página termina na peça
    await peca.pronto;
    window.LAB_VIZ = peca;   // para testes automáticos (imagem e estado)
  }

  Lab.viz = { montar, adaptadores, resolver, pagina, osm };
})();
