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
  const negrito = (t) => String(t).split(/⟦|⟧/).map((p, i) => (i % 2 ? el("b", { text: p }) : p));
  const semMarcas = (t) => String(t).replace(/⟦|⟧/g, "");
  const curto = (n, k = 24) => (n.length > k ? `${n.slice(0, k - 1)}…` : n);
  const caixaRelativa = (no, palco) => { const r = no.getBoundingClientRect(), p = palco.getBoundingClientRect(); return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }; };

  // ------------------------------------------------------------------ marcadores do plano
  /** "{e.caminho}" sozinho devolve o valor (número, objeto, null); dentro de um texto, é substituído. "{c.id}" fica
   *  para quem monta o título (controle no lugar). */
  const pegar = (obj, caminho) => caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function resolver(v, e) {
    if (typeof v !== "string") return Array.isArray(v) ? v.map((x) => resolver(x, e)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolver(x, e)])) : v;
    const so = v.match(/^\{e\.([\w.]+)\}$/);
    if (so) return pegar(e, so[1]);
    return v.replace(/\{e\.([\w.]+)\}/g, (_, c) => { const x = pegar(e, c); return x == null ? "" : String(x); });
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
    } catch (erro) { /* mantém o padrão */ }
    const ctl = Object.fromEntries((P.controles || []).map((c) => [c.id, c]));
    const fatiador = (P.controles || []).find((c) => c.tipo === "busca" && P.fatias && c.campo === P.fatias.campo);
    let fatia = null, e = {}, linhas = [];
    const indice = P.fatias ? new Map(P.fatias.indice.map(([k, nome, uf]) => [k, { nome, uf, rotulo: uf ? `${nome} (${uf})` : nome }])) : null;

    const lerFatia = (f) => {
      const L = f.linhas.map((r) => Object.fromEntries(f.colunas.map((c, i) => [c, r[i]])));
      const esc = Object.fromEntries(Object.entries(f).filter(([, v]) => v === null || typeof v !== "object"));
      return { linhas: L, e: { ...esc, ...(f.textos || {}) } };
    };
    async function irPara(chave) {
      const f = await opcoes.carregarFatia(chave);
      fatia = f; ({ linhas, e } = lerFatia(f));
      est.sel = null; est.legFixa = null; est.anotAberta = false; est.cam = null;
      render();
    }
    function guardarEndereco() {
      const q = new URLSearchParams();
      if (fatiador) q.set(fatiador.id, est[fatiador.id]);
      if (est.aba === "mapa") q.set("aba", "mapa");
      try { history.replaceState(null, "", `${location.pathname}${location.search}#${q}`); } catch (erro) { /* sem âncora */ }
    }
    const enderecoAtual = (embed = false) => {
      const base = P.endereco || `${location.origin}${location.pathname}`;
      const q = new URLSearchParams();
      if (fatiador) q.set(fatiador.id, est[fatiador.id]);
      if (est.aba === "mapa") q.set("aba", "mapa");
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
      if (!linhas.length) f.append(el("div", { class: "viz-legenda", hidden: "" }));   // sem dados, sem legenda
      else if (legendaRec && interativa) f.append(el("details", { class: "viz-legenda-rec so-interativo" }, el("summary", {}, "◧ Legenda"), el("div", { class: "viz-legenda" })));
      else f.append(el("div", { class: "viz-legenda" }));
      f.append(interativa ? barraBase(f, fmt, hostQ) : rodapeMinimo());
      f._palco = palco; f._palcoCompa = palcoCompa; f._lado = lado;
      if (est.buscando && interativa && fatiador) abrirBusca(f, fatiador, false);   // continua aberta depois de um redesenho
      return f;
    }
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
      const ops = Object.entries(c.valores || {});
      const atual = est[c.id];
      if (!interativa) return el("span", { text: c.valores?.[atual] ?? String(atual) });
      const mudar = (v) => { est[c.id] = v; render(); };
      return ops.length <= 3 ? Lab.seletorTitulo(c.rotulo || c.id, ops, atual, mudar) : Lab.seletorTituloLista(c.rotulo || c.id, ops, atual, mudar);
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
        explorar.length ? el("button", { type: "button", onclick: () => abrir("Explorar", ...explorar.map((c) => Lab.seletor(c.rotulo || c.id, Object.entries(c.valores || {}), valorControle(c), (v) => { est[c.id] = v; render(); }))) }, "⇄ Explorar") : null);
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
      const bLink = el("button", { type: "button" }, el("span", { class: "ic", text: "🔗" }), el("span", { text: "Copiar link (com a cidade e a vista atuais)" }));
      bLink.onclick = () => copiar(url, bLink, "Link copiado");
      const emb = P.saidas?.embed || { largura: 400, altura: 640 };
      const codigo = `<iframe src="${enderecoAtual(true)}" width="${emb.largura}" height="${emb.altura}" loading="lazy" title="${titulo.replaceAll('"', "&quot;")}" style="border:0;max-width:100%"></iframe>`;
      abrir("Baixar ou Compartilhar", el("div", { class: "opcoes-comp" },
        bLink,
        el("a", { href: `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, target: "_blank", rel: "noopener" }, el("span", { class: "ic", text: "💬" }), "WhatsApp"),
        el("a", { href: `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(`${texto}\n${url}`)}` }, el("span", { class: "ic", text: "✉" }), "E-mail"),
        el("button", { type: "button", onclick: () => mostrarTexto("Código para embutir", codigo) }, el("span", { class: "ic", text: "</>" }), "Código para embutir"),
        el("button", { type: "button", onclick: () => { fechar(); abrirImagem(fmt === "paisagem" ? "paisagem" : fmt === "quadrado" ? "quadrado" : "retrato"); } }, el("span", { class: "ic", text: "⤓" }), "Baixar imagem (o que está na tela)"),
        (P.saidas?.dados || ["csv"]).includes("csv") ? el("button", { type: "button", onclick: () => baixarCSV() }, el("span", { class: "ic", text: "▦" }), "Baixar dados do gráfico (CSV)") : null));
    }
    function rodapeMinimo() {   // estática: fonte + assinatura (L0008, Q-022)
      return el("footer", { class: "viz-rodape" }, `Fonte: ${P.fonte}`, el("br"), el("b", { text: P.autor }), " · Saiba mais em ", el("b", { text: dominio() }));
    }
    const dominio = () => (P.endereco || P.portfolio || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

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
          n.setAttribute("opacity", op || 1);
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
      const d = P.grafico.destaque;
      if (d) leg.append(...legendaInterativa(frame, [{ chave: "fora", cor: tok("cor-grade"), rotulo: d.rotulo || "fora do destaque", forma: "circulo" }]));
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
      const emDestaque = (l) => (dest ? Boolean(l[dest]) : true);
      const cor = (l) => (!emDestaque(l) ? tok("cor-grade") : campoCor ? escC.cor(l[campoCor]) : tok("cor-cat-1"));
      const chave = (l) => (!emDestaque(l) ? "fora" : campoCor ? String(escC.classe(l[campoCor]) ?? "sem") : "dado");
      const cartao = interativa && alvo === frame._palco ? (frame._cartao ||= cartaoDetalhe(frame, frame._palco)) : interativa ? frame._cartao : null;
      const realcar = (id) => frame.querySelectorAll("circle[data-id]").forEach((c) => c.classList.toggle("realce", c.dataset.id === id));
      const ligar = (sel) => sel
        .on("pointerenter", (ev, l) => { realcar(l.id); cartao?.mostrar(l, caixaRelativa(ev.currentTarget, frame._palco)); })
        .on("pointerleave", () => cartao?.esconder())
        .on("click", (ev, l) => { realcar(l.id); est.sel = l.id; cartao?.mostrar(l, caixaRelativa(ev.currentTarget, frame._palco), true); });
      const ordenadas = [...linhas].sort((a, b) => emDestaque(a) - emDestaque(b));   // destacados por cima
      return { P, e, est, frame, alvo, espec, lig: espec.ligacoes, opc: { ...(espec.opcoes || {}) }, linhas: ordenadas, todas: linhas, interativa, naImagem,
        fmt: frame.dataset.fmt, cor, chave, emDestaque, ligar, escC, render, fmtCol, col, resolver: (v) => resolver(v, e), osm: opcoes.osm,
        opcao: (op) => opcaoAtual(op, espec.opcoes?.[op]) };
    }
    function desenharPalco(frame) {
      const naImagem = frame.dataset.host === "imagem", interativa = frame.dataset.rep === "interativa";
      const comp = P.grafico.companheiro;
      const vista = comp && (interativa || naImagem) && !frame._lado && est.aba === "mapa" ? "mapa" : "principal";
      frame.dataset.vista = vista;
      const palco = frame._palco;
      const n = frame.querySelector(".viz-n");
      if (n && !naImagem) n.textContent = resolver(typeof P.amostra === "string" ? P.amostra : P.amostra?.[vista === "mapa" ? "mapa" : "grafico"], e) || "";
      if (!linhas.length) { palco.append(el("div", { class: "viz-vazio", text: resolver(P.subtitulo, e) || "Sem dados para esta escolha." })); return null; }
      const escC = escalaCor();
      if (!naImagem || frame.querySelector(".viz-legenda")) preencherLegenda(frame, vista, escC);
      const rodar = (alvo, espec) => {
        const ad = Lab.viz.adaptadores[espec.componente];
        if (!ad) { alvo.append(el("div", { class: "viz-vazio", text: `Componente “${espec.componente}” sem adaptador em lab-viz.js.` })); return null; }
        return ad(contexto(frame, alvo, espec));
      };
      const principal = vista === "mapa" ? rodar(palco, comp) : rodar(palco, P.grafico);
      if (frame._palcoCompa) rodar(frame._palcoCompa, comp);
      // anotações do componente principal (âncoras que o adaptador sabe posicionar)
      const anots = (P.grafico.anotacoes || []).filter((a) => a.tipo !== "linha").map((a) => resolver(a, e)).filter((a) => a.texto && a.alvo);
      if (principal?.posicao && vista === "principal" && !naImagem) {
        const obst = principal.obstaculos ? principal.obstaculos() : [];
        anotar(frame, palco, anots.map((a) => { const p = principal.posicao(a.alvo); return p && { ...a, a: { x: p[0] - 4, y: p[1] - 4, w: 8, h: 8 } }; }).filter(Boolean), obst);
      }
      if (interativa && est.sel) requestAnimationFrame(() => palco.querySelector(`circle[data-id="${CSS.escape(est.sel)}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      return principal;
    }

    // ---------------------------------------------------------------- troca gráfico ⇄ mapa com transição (L0013, Q-059)
    function trocarAba(f, k) {
      if (est.aba === k) return;
      const palco = f._palco, pr = palco.getBoundingClientRect();
      const antes = new Map([...palco.querySelectorAll("circle[data-id]")].map((c) => { const r = c.getBoundingClientRect(); return [c.dataset.id, { x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2, r: r.width / 2 }]; }));
      const velho = palco.querySelector("svg")?.cloneNode(true);
      const y = scrollY;
      est.aba = k; guardarEndereco(); render(); scrollTo(0, y);
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
    function baixarCSV() {   // separador “;”, decimal com vírgula, UTF-8 com BOM (abre no Excel)
      const cols = fatia.colunas;
      const q = (t) => `"${String(t ?? "").replaceAll('"', '""')}"`;
      const v = (c, x) => (x === null || x === undefined ? "" : col(c).tipo === "booleano" ? (x ? "sim" : "nao") : typeof x === "number" ? String(x).replace(".", ",") : q(x));
      const texto = `﻿${[cols.join(";"), ...linhas.map((l) => cols.map((c) => v(c, l[c])).join(";"))].join("\n")}\n`;
      const nome = `${P.id}${fatiador ? `-${est[fatiador.id]}` : ""}.csv`;
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
      const [W, H0] = TAM_IMG[fmt], pad = 16, iw = W - 2 * pad;
      let H = H0;
      const svg = d3.create("svg").attr("xmlns", "http://www.w3.org/2000/svg").attr("width", W).attr("height", H).attr("font-family", FONTE());
      const fundo = svg.append("rect").attr("width", W).attr("height", H).attr("fill", tok("cor-superficie"));
      const escrever = (ls, x, y, px, { peso = 400, cor = "cor-texto", lh = 1.3 } = {}) => {
        const t = svg.append("text").attr("x", x).attr("y", y).attr("font-size", px).attr("font-weight", peso).attr("fill", tok(cor));
        ls.forEach((l, k) => t.append("tspan").attr("x", x).attr("dy", k ? px * lh : px).text(l));
        return y + ls.length * px * lh;
      };
      const textoPlano = (t) => resolver(t, e).replace(/\{c\.(\w+)\}/g, (_, id) => (ctl[id]?.tipo === "busca" ? rotuloFatia() : ctl[id]?.valores?.[est[id]] ?? ""));
      let y = pad - 2;
      if (P.chapeu) y = escrever([textoPlano(P.chapeu)], pad, y, 11.5, { peso: 600, cor: "cor-texto-secundario" }) + 3;
      const tt = fmt === "paisagem" ? 19 : 18;
      y = escrever(quebrar(semMarcas(textoPlano(P.titulo)), tt, iw, 700), pad, y, tt, { peso: 700, lh: 1.22 }) + 4;
      const sub = resolver(P.subtitulo, e);
      if (sub) y = escrever(quebrar(semMarcas(sub), 12.5, iw), pad, y, 12.5, { cor: "cor-texto-secundario" }) + 4;
      const vista = P.grafico.companheiro && est.aba === "mapa" ? "mapa" : "principal";
      // rodapé mínimo: fonte e assinatura “nome · Saiba mais em <endereço>” (Q-022)
      const rod = quebrar(`Fonte: ${P.fonte}`, 10, iw);
      // assinatura em 1, 2 ou 3 linhas, conforme couber: “nome · Saiba mais em <endereço>”
      const wNome = medir(`${P.autor} · `, 11, 700), wSaiba = medir("Saiba mais em ", 11), wEnd = medir(dominio(), 11, 700);
      const nAss = wNome + wSaiba + wEnd <= iw ? 1 : wSaiba + wEnd <= iw ? 2 : 3;
      const hAss = 16 + (nAss - 1) * 14, hRod = rod.length * 13 + hAss + 6;
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
      const hLeg = hEscala + (itensLeg.length ? 15 : 0) + d3.sum(ext, ([, ls]) => ls.length * 13 + 2) + hTam;
      if (linhasAnot.length && estiloImg === "margem") y = escrever(linhasAnot, pad, y + 2, 11, { peso: 600 }) + 2;
      const graficoMin = lado ? Math.max(hLeg + 12, (iw - lw - 12) * 0.7) : vista === "mapa" ? iw * 0.95 : Math.max(230, iw * 0.62);
      H = Math.round(Math.min(W * TETO_IMG[fmt], Math.max(H0, y + 4 + graficoMin + 12 + (lado ? 0 : hLeg) + 10 + hRod + pad)));
      const yRod = H - pad + 2 - rod.length * 13 - hAss;
      escrever(rod, pad, yRod, 10, { cor: "cor-texto-secundario" });
      {
        const yA = yRod + rod.length * 13 + 3 + 11, t = svg.append("text").attr("font-size", 11).attr("fill", tok("cor-texto"));
        t.append("tspan").attr("x", pad).attr("y", yA).attr("font-weight", 700).text(P.autor + (nAss === 1 ? " · " : ""));
        if (nAss === 1) t.append("tspan").text("Saiba mais em "); else t.append("tspan").attr("x", pad).attr("y", yA + 14).text("Saiba mais em ");
        const tEnd = t.append("tspan").attr("font-weight", 700).text(dominio());
        if (nAss === 3) tEnd.attr("x", pad).attr("y", yA + 28);
      }
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
      const nome = `${P.id}${fatiador ? `-${est[fatiador.id]}` : ""}-${fmt}.png`;
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
        alvo.replaceChildren(f); desenharPalco(f);
        return;
      }
      const largura = Math.min(760, alvo.clientWidth || document.documentElement.clientWidth - 16);
      wAnt = alvo.clientWidth;
      const fmt = formatoFluido(largura);
      const f = moldura({ fmt, rep: "interativa", hostQ: "pagina", largura, cartao: fmt === "retrato" ? "abaixo" : "sobre", legendaRec: Boolean(P.legenda?.recolhida) && fmt !== "paisagem" });
      alvo.replaceChildren(f);
      f.querySelector(".viz-corpo").style.height = `${Math.round(largura * ALTURA_GRAFICO[fmt])}px`;
      desenharPalco(f);
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
    const desenharRuas = comOSM ? C.osm.camada(gRuas, proj, W, H, C.naImagem) : () => {};
    const cena = svg0.append("g");
    if (C.e.contorno) cena.append("path").attr("d", d3.geoPath(proj)({ type: "Feature", geometry: C.e.contorno })).attr("fill", comOSM ? "none" : tok("cor-fundo"))
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
    const aplicarT = (t) => { cena.attr("transform", t); pts.attr("r", (l) => porId.get(l.id).r / Math.sqrt(t.k)); desenharRuas(t); };
    if (C.interativa) {
      C.ligar(pts);
      const aviso = el("div", { class: "aviso-roda", hidden: "" });
      let tAv = null;
      const avisar = (t) => { aviso.textContent = t; aviso.hidden = false; clearTimeout(tAv); tAv = setTimeout(() => { aviso.hidden = true; }, 1400); };
      const zoom = d3.zoom().scaleExtent([1, 16]).translateExtent([[0, 0], [W, H]])
        .filter((ev) => {
          const k = d3.zoomTransform(svg0.node()).k;
          if (ev.type === "wheel") { if (ev.ctrlKey || ev.metaKey) return true; avisar("Use Ctrl + roda (⌘ no Mac) para ampliar o mapa"); return false; }
          if (ev.type.startsWith("touch")) { if (ev.touches.length > 1) return true; if (k > 1.01 && ev.type === "touchstart") avisar("Use dois dedos para mover o mapa"); return false; }
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
      alvo.style.position = "relative";
      alvo.append(aviso);
      if (est.cam) svg0.call(zoom.transform, camT(est.cam));
      alvo.append(el("div", { class: "zoom-pontos so-interativo", role: "group", "aria-label": "Zoom do mapa" },
        el("button", { type: "button", "aria-label": "Ampliar", text: "+", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1.8) }),
        el("button", { type: "button", "aria-label": "Reduzir", text: "−", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1 / 1.8) }),
        el("button", { type: "button", "aria-label": "Voltar ao enquadramento inicial", text: "⟲", onclick: () => svg0.transition().duration(300).call(zoom.transform, d3.zoomIdentity) })));
      if (comOSM) alvo.append(el("div", { class: "mapa-atribuicao-mini" }, "© ", el("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener", text: "OpenStreetMap" })));
      const cTam = (C.P.controles || []).find((c) => c.opcao === "forma" && (c.local || "explorar") === "grafico");
      if (cTam && lig.tamanho) alvo.append(el("div", { class: "fundo-mini so-interativo", role: "group", "aria-label": cTam.rotulo || "Tamanho" },
        el("span", { class: "rot-mini", text: `${cTam.rotulo || "Tamanho"}:` }),
        ...Object.entries(cTam.valores).map(([v, r]) => el("button", { type: "button", "aria-pressed": forma === v, onclick: () => { est[cTam.id] = v; C.render(); } }, r))));   // vale também para o gráfico
      if (!est.cam) desenharRuas(d3.zoomIdentity);
    } else aplicarT(est.cam ? camT(est.cam) : d3.zoomIdentity);   // a imagem sai com o enquadramento do momento
    if (C.naImagem && comOSM) svg0.append("text").attr("x", W - 4).attr("y", H - 4).attr("text-anchor", "end").attr("font-size", 9).attr("fill", tok("cor-texto-secundario"))
      .attr("paint-order", "stroke").attr("stroke", tok("cor-superficie")).attr("stroke-width", 3).text("© colaboradores do OpenStreetMap");
    return { posicao: (id) => { const n = porId.get(id); return n ? [n.x, n.y] : null; },
      tamanho: bolhas ? { sc: escTam(est.cam?.k || 1), rotulo: rotTam } : null };
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
      if (!carregadas.has(chave)) carregadas.set(chave, new Promise((ok, falha) => {
        const s = el("script", { src: `${P.fatias.pasta}/${chave}.js` });
        s.onload = () => (typeof window[global]?.[chave] === "string" ? Lab.decodificar(window[global][chave]).then(ok, falha) : falha(new Error("arquivo sem dados")));
        s.onerror = () => { carregadas.delete(chave); falha(new Error(`${P.fatias.pasta}/${chave}.js não encontrado`)); };
        document.head.append(s);
      }));
      return carregadas.get(chave);
    };
    const alvo = document.getElementById("viz");
    if (P.teste && !embed) alvo.before(el("p", { class: "viz-selo-teste", text: "Versão de teste" }));
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
