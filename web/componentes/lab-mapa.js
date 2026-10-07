/* lab-mapa.js — mapa coroplético com alternativa em círculos proporcionais (cartograma de Dorling). ADR L0003.
 *
 * Anatomia (design.yaml › padroes.mapa): barra sem fundo no topo (busca à esquerda, Mapa | Círculos à
 * direita) → desenho → painel da unidade selecionada → legendas (cor, tamanho, "sem dados") → notas.
 * Lacunas em hachura (nunca cinza liso). Fora de escala: rótulo na margem esquerda com linha de ligação.
 *
 * Lab.mapa(alvo, {
 *   contornos,            // FeatureCollection; properties.id = chave da unidade
 *   sobreposicao,         // FeatureCollection fina desenhada por cima (ex.: municípios sob regiões) — opcional
 *   nome(id), preencher(id) → cor (token("cor-grade") = sem dado), dica(id) → linhas,
 *   abrir(id), rotuloAbrir, // botão do painel (ex.: "Ver ficha do município →") — opcional
 *   rotuloAria, rotuloBusca,
 *   tamanho(id), rotuloTamanho,              // habilita Mapa | Círculos
 *   forma: { obter() → "mapa"|"bolhas", definir(v) },
 *   legenda,               // elemento de legenda de cor
 *   detalhado,             // muitas unidades pequenas (padrão: mais de 60): raios menores
 * })
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;
  const DURACAO = 1400;      // ms, ida e volta (design.yaml › padroes.mapa_transicao)
  const MORPH_MAX = 600;     // acima disso, transição alternativa (morph de milhares de polígonos trava o navegador)
  let avisouFlubber = false;
  const caminhoCirculo = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  function anelPrincipal(f, caminho) {
    const g = f.geometry, polis = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const maior = d3.greatest(polis, (p) => d3.geoArea({ type: "Polygon", coordinates: p }));
    return caminho({ type: "Polygon", coordinates: [maior[0]] });
  }
  /** Afasta os círculos o mínimo para não se sobreporem, partindo do centro de cada unidade. */
  function posicionarBolhas(nos, W, H) {
    const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => n.x0).strength(0.2)).force("y", d3.forceY((n) => n.y0).strength(0.2))
      .force("colisao", d3.forceCollide((n) => (n.r > 0 ? n.r + 0.8 : 0)).iterations(3)).stop();
    for (let i = 0; i < 300; i++) {
      sim.tick();
      for (const n of nos) {   // mantém as bolhas dentro da área do desenho
        n.x = Math.max(n.r + 2, Math.min(W - n.r - 2, n.x));
        n.y = Math.max(n.r + 2, Math.min(H - n.r - 2, n.y));
      }
    }
  }

  Lab.mapa = (alvoExterno, opts) => {
    const fc = opts.contornos;
    const detalhado = opts.detalhado ?? fc.features.length > 60;
    const nome = opts.nome || ((id) => id);
    // a troca Mapa | Círculos redesenha só este bloco (o resto da página não muda)
    const alvo = el("div", { class: "bloco-mapa" });
    alvoExterno.append(alvo);
    let ctrl = null;
    if (opts.tamanho && opts.forma) {
      ctrl = el("div", { class: "alternar pequeno no-mapa", role: "group", "aria-label": "Representação do mapa" });
      for (const [v, r] of [["mapa", "Mapa"], ["bolhas", "Círculos"]]) {
        ctrl.append(el("button", { type: "button", "aria-pressed": v === opts.forma.obter(), text: r, "data-chave": `Representação|${v}`, onclick: () => {
          if (v === opts.forma.obter()) return;
          const anterior = opts.forma.obter(); opts.forma.definir(v);
          for (const bt of ctrl.querySelectorAll("button")) bt.setAttribute("aria-pressed", bt.dataset.chave === `Representação|${v}`);
          desenhar(Lab.semMovimento() ? null : anterior);
          ctrl.querySelector(`[data-chave="Representação|${v}"]`)?.focus({ preventScroll: true });
        } }));
      }
    }
    const desenhar = (de) => {
      Lab.esconderDica();
      alvo.style.minHeight = alvo.offsetHeight ? `${alvo.offsetHeight}px` : "";
      alvo.replaceChildren();
      desenharMapa(de);
      requestAnimationFrame(() => { alvo.style.minHeight = ""; });
    };
    const desenharMapa = (de) => {
      const W = 560, H = 620;
      const bolhas = Boolean(opts.tamanho) && opts.forma?.obter() === "bolhas";
      // lupa: digitar o nome de uma unidade e destacá-la (sem sair do mapa)
      const nomes = fc.features.map((f) => [f.properties.id, nome(f.properties.id)]).sort((a, b) => a[1].localeCompare(b[1]));
      const idLista = `lista-${Math.random().toString(36).slice(2, 8)}`;
      const esc = Lab.escopoDe(alvoExterno);
      const busca = el("input", { type: "search", class: "busca-mapa", list: idLista, placeholder: opts.rotuloBusca || "Buscar…",
        "aria-label": "Buscar no mapa", onchange: (ev) => { const hit = nomes.find(([, n]) => n.toLowerCase() === ev.target.value.trim().toLowerCase()); if (hit && Lab.selecoes.get(esc) !== hit[0]) Lab.selecionar(hit[0], esc); } });
      // o "x" nativo do campo de busca (e apagar o texto) limpa a seleção do bloco
      const limparSeVazio = () => { if (!busca.value.trim() && Lab.selecoes.get(esc)) Lab.selecionar("", esc); };
      busca.addEventListener("search", limparSeVazio);
      busca.addEventListener("input", limparSeVazio);
      // barra sem fundo no topo do mapa: busca à esquerda, Mapa | Círculos à direita
      alvo.append(el("div", { class: "barra-mapa" },
        el("div", { class: "lupa" }, el("span", { "aria-hidden": "true", text: "🔍" }), busca,
          el("datalist", { id: idLista }, ...nomes.map(([, n]) => el("option", { value: n })))),
        ctrl));
      // legendas (cor e, nos círculos, tamanho) logo abaixo do desenho; notas e textos depois delas
      const zonaLeg = el("div", { class: "legendas-mapa" });
      if (opts.legenda) zonaLeg.append(opts.legenda);
      const proj = d3.geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], fc);
      const caminho = d3.geoPath(proj);
      const moldura = el("div", { class: "mapa-moldura" });
      alvo.append(moldura);
      const svg = d3.select(moldura).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "mapa")
        .attr("role", "img").attr("aria-label", (opts.rotuloAria || "Mapa.") + (bolhas ? ` Círculos: área proporcional a ${opts.rotuloTamanho}.` : ""))
        .style("width", "100%").style("max-width", "560px").style("height", "auto");
      alvo.append(zonaLeg);
      // lacunas (sem dado) em hachura, não em cinza liso
      const idHach = `hach-${Math.random().toString(36).slice(2, 8)}`;
      const pad = svg.append("defs").append("pattern").attr("id", idHach).attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)");
      pad.append("rect").attr("width", 5).attr("height", 5).attr("fill", Lab.token("cor-superficie"));
      pad.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5).attr("stroke", Lab.token("cor-eixo")).attr("stroke-width", 1.6);
      const semDado = Lab.token("cor-grade");
      let temLacuna = false;
      const preencherH = (id) => { const c = opts.preencher(id); if (c === semDado) { temLacuna = true; return `url(#${idHach})`; } return c; };
      const nos = fc.features.map((f) => { const c = caminho.centroid(f); return { f, id: f.properties.id, x0: c[0], y0: c[1], x: c[0], y: c[1], r: 0 }; });
      let escalaR = null;
      if (opts.tamanho) {
        // soma das áreas dos círculos = 30% da área desenhada (45% com poucas unidades); teto de raio;
        // raio mínimo visível (unidades pequenas não somem ao lado da maior)
        const valores = nos.map((n) => opts.tamanho(n.id) || 0);
        const ea = Lab.escalaArea(valores, 1);
        const total = d3.sum(valores, (v) => Math.min(v, ea.teto)) || 1, maxV = ea.teto;
        const area = d3.sum(fc.features, (f) => caminho.area(f));
        const fracao = nos.length <= 25 ? 0.45 : 0.3;
        const rMax = Math.min(detalhado ? 60 : 120, Math.sqrt((fracao * area * maxV) / (Math.PI * total)));
        escalaR = Lab.escalaArea(valores, rMax).s;
        const rMin = detalhado ? 2.5 : 8;
        for (const n of nos) { const v = opts.tamanho(n.id) || 0; n.r = v > 0 ? Math.max(rMin, escalaR(v)) : 0; n.fora = ea.fora(v); }
        if (bolhas || de) posicionarBolhas(nos, W, H);
      }
      if (bolhas) svg.append("g").selectAll("path").data(fc.features).join("path").attr("d", caminho)
        .attr("fill", (f) => (opts.preencher(f.properties.id) === semDado ? `url(#${idHach})` : "none")).attr("stroke", Lab.token("cor-eixo")).attr("stroke-width", 0.5);
      const formas = svg.append("g").selectAll("path").data(bolhas ? [...nos].sort((a, b) => b.r - a.r) : nos).join("path").attr("class", "u")
        .attr("data-u", (n) => n.id)
        .classed("fora-escala", (n) => bolhas && n.fora)
        .attr("fill", (n) => preencherH(n.id))
        .on("pointermove", (ev, n) => Lab.mostrarDica(ev, nome(n.id), [...opts.dica(n.id), bolhas ? `${opts.rotuloTamanho}: ${Lab.fmtInt.format(opts.tamanho(n.id) || 0)}` : null]))
        .on("pointerleave", Lab.esconderDica)
        .on("click", (ev, n) => Lab.selecionar(n.id, esc));
      const final = (n) => (bolhas ? caminhoCirculo(n.x, n.y, Math.max(n.r, 0.01)) : caminho(n.f));
      // Transição Mapa ⇄ Círculos (design.yaml › padroes.mapa_transicao): morph de cada unidade com flubber; sem
      // flubber ou com muitas unidades, transição alternativa (polígonos desbotam enquanto os círculos crescem a partir
      // do centro de cada unidade, e o inverso). Sem animação com prefers-reduced-motion (de = null).
      const morph = typeof flubber !== "undefined" && nos.length <= MORPH_MAX;
      if (de && opts.tamanho && typeof flubber === "undefined" && !avisouFlubber) {
        avisouFlubber = true;
        console.warn("lab-mapa: flubber ausente — transição Mapa ⇄ Círculos sem morph (inclua flubber 0.4 no modelo do produto).");
      }
      if (de && opts.tamanho && !morph) {
        const interp = (n, ida) => { const xi = d3.interpolateNumber(ida ? n.x0 : n.x, ida ? n.x : n.x0), yi = d3.interpolateNumber(ida ? n.y0 : n.y, ida ? n.y : n.y0),
          ri = d3.interpolateNumber(ida ? 0 : n.r, ida ? n.r : 0); return (t) => caminhoCirculo(xi(t), yi(t), Math.max(ri(t), 0.01)); };
        if (bolhas) {   // mapa → círculos: polígonos (fantasmas) desbotam; círculos crescem do centro de cada unidade
          const fantasmas = svg.insert("g", () => formas.node().parentNode).attr("pointer-events", "none");
          fantasmas.selectAll("path").data(nos).join("path").attr("d", (n) => caminho(n.f)).attr("fill", (n) => preencherH(n.id))
            .transition().duration(DURACAO).ease(d3.easeCubicInOut).style("opacity", 0).remove();
          formas.attr("d", (n) => caminhoCirculo(n.x0, n.y0, 0.01)).transition().duration(DURACAO).ease(d3.easeCubicInOut).attrTween("d", (n) => interp(n, true));
        } else {        // círculos → mapa: círculos (fantasmas) encolhem para o centro; polígonos surgem
          formas.attr("d", final).style("opacity", 0).transition().duration(DURACAO).ease(d3.easeCubicInOut).style("opacity", 1);
          const fantasmas = svg.append("g").attr("pointer-events", "none");
          fantasmas.selectAll("path").data(nos.filter((n) => n.r > 0)).join("path").attr("fill", (n) => preencherH(n.id))
            .attr("stroke", Lab.token("cor-superficie")).attr("stroke-width", 0.6)
            .transition().duration(DURACAO).ease(d3.easeCubicInOut).attrTween("d", (n) => interp(n, false)).style("opacity", 0).remove();
        }
      } else if (de && opts.tamanho) {
        formas.attr("d", (n) => (bolhas ? anelPrincipal(n.f, caminho) : caminhoCirculo(n.x, n.y, Math.max(n.r, 0.01))))
          .transition().duration(DURACAO).ease(d3.easeCubicInOut)
          .attrTween("d", (n) => {
            const r = Math.max(n.r, 0.5);
            const it = bolhas ? flubber.toCircle(anelPrincipal(n.f, caminho), n.x, n.y, r, { maxSegmentLength: 4 })
                              : flubber.fromCircle(n.x, n.y, r, anelPrincipal(n.f, caminho), { maxSegmentLength: 4 });
            return (t) => (t < 1 ? it(t) : final(n));
          });
      } else formas.attr("d", final);
      // fora de escala: rótulo na margem esquerda (área vazia), na altura do círculo, ligado por uma linha
      if (bolhas) {
        const gf = svg.append("g").attr("class", "rotulos-fora").attr("pointer-events", "none");
        nos.filter((n) => n.fora).sort((p, q) => p.y - q.y).forEach((n, i) => {
          const tx = 10, ty = Math.max(16, n.y - 4 + i * 34);
          const t = gf.append("text").attr("class", "rotulo-fora").attr("x", tx).attr("y", ty);
          t.append("tspan").attr("x", tx).text(nome(n.id));
          t.append("tspan").attr("x", tx).attr("dy", 14).text(`${Lab.fmtCompacto(opts.tamanho(n.id) || 0)} · fora de escala`);
          const larg = t.node().getComputedTextLength ? t.node().getBBox().width : 110;
          const x0 = tx + larg + 6, x1 = n.x - n.r - 2;
          if (x1 > x0) gf.append("path").attr("d", `M${x0},${ty + 3} L${x1 - 6},${ty + 3} L${x1},${n.y}`)
            .attr("fill", "none").attr("stroke", Lab.token("cor-texto-secundario")).attr("stroke-width", 1);
        });
      }
      if (opts.sobreposicao && !bolhas) {
        svg.append("path").datum(opts.sobreposicao).attr("d", caminho).attr("fill", "none")
          .attr("stroke", Lab.token("cor-texto")).attr("stroke-opacity", 0.12).attr("stroke-width", 0.3).attr("pointer-events", "none");
      }
      if (temLacuna || (bolhas && fc.features.some((f) => opts.preencher(f.properties.id) === semDado)))
        zonaLeg.append(el("div", { class: "legenda" }, el("span", { class: "chave" }, el("span", { class: "amostra hachura" }), "sem dados")));
      // painel da unidade selecionada (clique ou busca): logo abaixo do desenho, perto do toque no celular
      const painel = el("div", { class: "painel-sel", "aria-live": "polite" });
      alvo.insertBefore(painel, zonaLeg);
      const atualizarPainel = () => {
        const sel = Lab.selecoes.get(esc) || "";
        const u = sel && fc.features.some((f) => f.properties.id === sel) ? sel : null;
        painel.hidden = !u;
        if (!u) { busca.value = ""; return; }
        busca.value = nome(u);
        Lab.conteudoPainel(painel, { u, nome: nome(u), linhas: opts.dica(u), abrir: opts.abrir, rotuloAbrir: opts.rotuloAbrir, esc });
      };
      Lab.registrarPainel(esc, atualizarPainel, alvo);   // um registro por mapa (o redesenho troca, não acumula)
      atualizarPainel();
      if (alvo.isConnected) Lab.aplicarSelecao(esc);
      if (bolhas) zonaLeg.append(Lab.legendaTamanho(escalaR, opts.rotuloTamanho));
      if (bolhas) alvo.append(Lab.notaFora(nos.filter((n) => n.fora).map((n) => nome(n.id))),
        el("p", { class: "nota", text: "Círculos: cada um parte do centro da unidade e é afastado o mínimo para não se sobrepor; a posição é aproximada." }));
    };
    desenharMapa(null);
  };
})();
