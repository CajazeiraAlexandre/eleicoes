/* lab-mapa.js — mapa coroplético com alternativa em círculos proporcionais (cartograma de Dorling). ADR L0003, L0006.
 *
 * Anatomia (design.yaml › padroes.mapa): barra sem fundo no topo (busca à esquerda, Mapa | Círculos à
 * direita) → desenho (com controles + − ⟲ no canto) → card da unidade selecionada → legendas → notas.
 * Lacunas em hachura (nunca cinza liso). Fora de escala: rótulo na margem esquerda com linha de ligação.
 *
 * Camadas (de baixo para cima — L0006): fundo opcional (raster Esri cinza ou vetorial OpenFreeMap) → referência
 * (UFs vizinhas, do IBGE; funciona offline) → unidades → limites finos (sobreposicao) → rótulos de referência →
 * seleção e foco.
 *
 * const m = Lab.mapa(alvo, {
 *   contornos,            // FeatureCollection; properties.id = chave da unidade
 *   sobreposicao,         // FeatureCollection fina desenhada por cima (ex.: municípios sob regiões) — opcional
 *   nome(id), preencher(id) → cor (token("cor-grade") = sem dado), dica(id) → linhas,
 *   abrir(id), rotuloAbrir, // botão do card (ex.: "Ver ficha do município →") — opcional
 *   rotuloAria, rotuloBusca,
 *   tamanho(id), rotuloTamanho,              // habilita Mapa | Círculos
 *   forma: { obter() → "mapa"|"bolhas", definir(v) },
 *   legenda,               // elemento de legenda de cor
 *   detalhado,             // muitas unidades pequenas (padrão: mais de 60): raios menores
 *   // ---- L0006 (todos opcionais) ----
 *   camera,                // "estado" (padrão) | {foco: id | [ids], contexto: 1.5} | {centro: [lon, lat], zoom: k}
 *   zoom,                  // false desliga zoom e arrasto (padrão: ligado)
 *   referencia,            // FeatureCollection de contexto (UFs vizinhas) desenhada por baixo, em cinza
 *   rotulos,               // [{nome, coord: [lon, lat]}] — poucas cidades de referência
 *   fundo,                 // null (padrão) | "esri-cinza" | "vetorial" (OpenFreeMap; o modelo carrega o MapLibre)
 *   escalaBolhas,          // "ds" (padrão: fora de escala acima de 3× a segunda) | "fiel" (área sempre proporcional)
 *   compacto, dimensoes,   // story: sem barra, legendas e notas; desenho [W, H] ocupando o contêiner; card dentro do mapa
 *   opacidade(id), foco(id), aoClicar(id)   // opcionais: opacidade do preenchimento, contorno de foco, aviso do toque
 * })
 * m.camera(camera, animar = true)  // move a câmera (story: um enquadramento por cartão)
 * m.atualizar({preencher, dica, opacidade, foco, nome}, {animar})   // troca cores e textos sem redesenhar
 * m.forma("mapa" | "bolhas", animar = true)                          // troca a forma (com a transição suave)
 * m.redesenhar()
 * Com ?editar=1 no endereço, o mapa mostra a câmera atual e "Copiar câmera" (para colar no roteiro de um story).
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;
  const DURACAO = 1400;      // ms, ida e volta (design.yaml › padroes.mapa_transicao) — vale também para a câmera
  const MORPH_MAX = 600;     // acima disso, transição alternativa (morph de milhares de polígonos trava o navegador)
  const ZOOM_MAX = 14;
  const PASSO_ZOOM = 1.8;
  let avisouFlubber = false, avisouMapLibre = false;
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

  // ---------------------------------------------------------------- fundo (L0006)
  const ATRIBUICAO = {
    "esri-cinza": "Fundo: Esri, HERE, Garmin, © colaboradores do OpenStreetMap",
    vetorial: "Fundo: © OpenFreeMap · © colaboradores do OpenStreetMap",
  };
  const escuro = () => { const t = document.documentElement.dataset.theme; return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches); };
  const urlEsri = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${escuro() ? "World_Dark_Gray_Base" : "World_Light_Gray_Base"}/MapServer/tile/${z}/${y}/${x}`;
  const estiloVetorial = () => `https://tiles.openfreemap.org/styles/${escuro() ? "dark" : "positron"}`;
  // blocos de mapa (Web Mercator, mesma projeção do d3.geoMercator)
  const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
  const tileLat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };
  const lonTile = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const latTile = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };

  /** Transformação de zoom que realiza uma câmera (L0006). */
  function transformacaoCamera(camera, { caminho, proj, fc, W, H }) {
    if (!camera || camera === "estado") return d3.zoomIdentity;
    if (camera.centro) {
      const [x, y] = proj(camera.centro), k = Math.max(1, Math.min(ZOOM_MAX, camera.zoom || 1));
      return d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-x, -y);
    }
    if (camera.foco) {
      const ids = new Set([].concat(camera.foco));
      const feats = fc.features.filter((f) => ids.has(f.properties.id));
      if (!feats.length) return d3.zoomIdentity;
      const [[x0, y0], [x1, y1]] = caminho.bounds({ type: "FeatureCollection", features: feats });
      const ctx = camera.contexto || 1.5;
      const k = Math.max(1, Math.min(ZOOM_MAX, W / (Math.max(x1 - x0, 1) * ctx), H / (Math.max(y1 - y0, 1) * ctx)));
      return d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }
    return d3.zoomIdentity;
  }

  Lab.mapa = (alvoExterno, opts) => {
    const fc = opts.contornos;
    const detalhado = opts.detalhado ?? fc.features.length > 60;
    const nome = opts.nome || ((id) => id);
    const zoomAtivo = opts.zoom !== false;
    const editar = new URLSearchParams(location.search).has("editar");
    // estado que sobrevive aos redesenhos (Mapa | Círculos): câmera pedida, transformação atual, mapa vetorial
    const est = { camera: opts.camera || "estado", transform: null, geo: null, zoom: null, svg: null, vetorial: null, aoZoom: [] };
    let fundo = opts.fundo || null;
    if (fundo === "vetorial" && typeof maplibregl === "undefined") {
      if (!avisouMapLibre) { avisouMapLibre = true; console.warn("lab-mapa: MapLibre ausente — fundo vetorial desligado (inclua maplibre-gl no modelo do produto)."); }
      fundo = null;
    }
    // a troca Mapa | Círculos redesenha só este bloco (o resto da página não muda)
    const compacto = Boolean(opts.compacto);
    const alvo = el("div", { class: `bloco-mapa${compacto ? " compacto" : ""}` });
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
      const [W, H] = compacto && opts.dimensoes ? opts.dimensoes.map((v) => Math.max(120, Math.round(v))) : [560, 620];
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
      if (!compacto) alvo.append(el("div", { class: "barra-mapa" },
        el("div", { class: "lupa" }, el("span", { "aria-hidden": "true", text: "🔍" }), busca,
          el("datalist", { id: idLista }, ...nomes.map(([, n]) => el("option", { value: n })))),
        ctrl));
      // legendas (cor e, nos círculos, tamanho) logo abaixo do desenho; notas e textos depois delas
      const zonaLeg = el("div", { class: "legendas-mapa" });
      if (opts.legenda) zonaLeg.append(opts.legenda);
      const proj = d3.geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], fc);
      const caminho = d3.geoPath(proj);
      est.geo = { caminho, proj, fc, W, H };
      const moldura = el("div", { class: `mapa-moldura${fundo ? " com-fundo" : ""}${compacto ? " compacto" : ""}` });
      alvo.append(moldura);
      // fundo vetorial: um mapa MapLibre sem interação, atrás do SVG, sincronizado com a câmera
      if (fundo === "vetorial") {
        if (!est.vetorial) {
          const caixa = el("div", { class: "mapa-fundo", "aria-hidden": "true" });
          est.vetorial = { caixa, mapa: null };
        }
        moldura.append(est.vetorial.caixa);
      }
      const svg = d3.select(moldura).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "mapa")
        .attr("role", "img").attr("aria-label", (opts.rotuloAria || "Mapa.") + (bolhas ? ` Círculos: área proporcional a ${opts.rotuloTamanho}.` : ""))
        .style("width", "100%").style("max-width", compacto ? "none" : "560px").style("height", compacto ? "100%" : "auto");
      est.svg = svg.node();
      if (!compacto) alvo.append(zonaLeg);
      // lacunas (sem dado) em hachura, não em cinza liso
      const idHach = `hach-${Math.random().toString(36).slice(2, 8)}`;
      const pad = svg.append("defs").append("pattern").attr("id", idHach).attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)");
      pad.append("rect").attr("width", 5).attr("height", 5).attr("fill", Lab.token("cor-superficie"));
      pad.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5).attr("stroke", Lab.token("cor-eixo")).attr("stroke-width", 1.6);
      const cena = svg.append("g").attr("class", "cena");   // tudo o que se move com a câmera
      const gTiles = fundo === "esri-cinza" ? cena.append("g").attr("class", "tiles").attr("opacity", bolhas ? 0 : 1) : null;
      if (opts.referencia) cena.append("g").attr("class", "referencia").selectAll("path").data(opts.referencia.features).join("path").attr("d", caminho);
      const semDado = Lab.token("cor-grade");
      let temLacuna = false;
      const preencherH = (id) => { const c = opts.preencher(id); if (c === semDado) { temLacuna = true; return `url(#${idHach})`; } return c; };
      const nos = fc.features.map((f) => { const c = caminho.centroid(f); return { f, id: f.properties.id, x0: c[0], y0: c[1], x: c[0], y: c[1], r: 0 }; });
      let escalaR = null;
      if (opts.tamanho) {
        // soma das áreas dos círculos = 30% da área desenhada (45% com poucas unidades); teto de raio;
        // raio mínimo visível (unidades pequenas não somem ao lado da maior)
        const valores = nos.map((n) => opts.tamanho(n.id) || 0);
        const fiel = opts.escalaBolhas === "fiel";   // L0006: área sempre proporcional, sem "fora de escala"
        const ea = Lab.escalaArea(valores, 1);
        const maxV = fiel ? d3.max(valores) || 1 : ea.teto;
        const total = d3.sum(valores, (v) => Math.min(v, maxV)) || 1;
        const area = d3.sum(fc.features, (f) => caminho.area(f));
        const fracao = nos.length <= 25 ? 0.45 : 0.3;
        const rMax = Math.min(detalhado ? (fiel ? 90 : 60) : 120, Math.sqrt((fracao * area * maxV) / (Math.PI * total)));
        escalaR = fiel ? d3.scaleSqrt().domain([0, maxV]).range([0, rMax]) : Lab.escalaArea(valores, rMax).s;
        const rMin = detalhado ? 2.5 : 8;
        for (const n of nos) { const v = opts.tamanho(n.id) || 0; n.r = v > 0 ? Math.max(rMin, escalaR(v)) : 0; n.fora = !fiel && ea.fora(v); }
        if (bolhas || de) posicionarBolhas(nos, W, H);
      }
      if (bolhas) cena.append("g").selectAll("path").data(fc.features).join("path").attr("d", caminho)
        .attr("fill", (f) => (opts.preencher(f.properties.id) === semDado ? `url(#${idHach})` : "none")).attr("stroke", Lab.token("cor-eixo")).attr("stroke-width", 0.5);
      const formas = cena.append("g").selectAll("path").data(bolhas ? [...nos].sort((a, b) => b.r - a.r) : nos).join("path").attr("class", "u")
        .attr("data-u", (n) => n.id)
        .classed("fora-escala", (n) => bolhas && n.fora)
        .attr("fill", (n) => preencherH(n.id))
        .attr("fill-opacity", (n) => (opts.opacidade ? opts.opacidade(n.id) : null))
        .classed("foco", (n) => Boolean(opts.foco?.(n.id)))
        .on("pointermove", (ev, n) => Lab.mostrarDica(ev, nome(n.id), [...opts.dica(n.id), bolhas ? `${opts.rotuloTamanho}: ${Lab.fmtInt.format(opts.tamanho(n.id) || 0)}` : null]))
        .on("pointerleave", Lab.esconderDica)
        .on("click", (ev, n) => { Lab.selecionar(n.id, esc); opts.aoClicar?.(n.id); });
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
          const fantasmas = cena.insert("g", () => formas.node().parentNode).attr("pointer-events", "none");
          fantasmas.selectAll("path").data(nos).join("path").attr("d", (n) => caminho(n.f)).attr("fill", (n) => preencherH(n.id))
            .transition().duration(DURACAO).ease(d3.easeCubicInOut).style("opacity", 0).remove();
          formas.attr("d", (n) => caminhoCirculo(n.x0, n.y0, 0.01)).transition().duration(DURACAO).ease(d3.easeCubicInOut).attrTween("d", (n) => interp(n, true));
        } else {        // círculos → mapa: círculos (fantasmas) encolhem para o centro; polígonos surgem
          formas.attr("d", final).style("opacity", 0).transition().duration(DURACAO).ease(d3.easeCubicInOut).style("opacity", 1);
          const fantasmas = cena.append("g").attr("pointer-events", "none");
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
        const gf = cena.append("g").attr("class", "rotulos-fora").attr("pointer-events", "none");
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
        cena.append("path").datum(opts.sobreposicao).attr("d", caminho).attr("fill", "none").attr("class", "sobreposicao")
          .attr("stroke", Lab.token("cor-texto")).attr("stroke-opacity", 0.12).attr("stroke-width", 0.3).attr("pointer-events", "none");
      }
      // rótulos de referência (poucas cidades), escondidos nos círculos (lá a posição é aproximada)
      const gRot = opts.rotulos && !bolhas ? cena.append("g").attr("class", "rotulos-ref").attr("pointer-events", "none") : null;
      if (gRot) gRot.selectAll("g").data(opts.rotulos).join((e) => {
        const g = e.append("g").attr("transform", (r) => `translate(${proj(r.coord)})`);
        g.append("circle").attr("r", 2.2);
        g.append("text").attr("x", 4).attr("y", -4).text((r) => r.nome);
        return g;
      });
      if (temLacuna || (bolhas && fc.features.some((f) => opts.preencher(f.properties.id) === semDado)))
        zonaLeg.append(el("div", { class: "legenda" }, el("span", { class: "chave" }, el("span", { class: "amostra hachura" }), "sem dados")));
      if (fundo) moldura.append(el("div", { class: "mapa-atribuicao", text: ATRIBUICAO[fundo] }));

      // ------------------------------------------------ card da unidade selecionada (clique ou busca)
      // computador: card flutuante perto da unidade; celular: logo abaixo do desenho, perto do toque (L0006)
      // compacto (story): no celular, o card fica no rodapé do próprio mapa
      const flutuante = matchMedia("(hover: hover) and (pointer: fine)").matches;
      const painel = el("div", { class: `painel-sel${flutuante ? " flutuante" : compacto ? " rodape" : ""}`, "aria-live": "polite" });
      if (flutuante || compacto) moldura.append(painel); else alvo.insertBefore(painel, zonaLeg);
      const posicionarPainel = () => {
        if (!flutuante || painel.hidden) return;
        const sel = Lab.selecoes.get(esc) || "", n = nos.find((x) => x.id === sel);
        if (!n) return;
        const t = est.transform || d3.zoomIdentity, s = est.svg.clientWidth / W;
        const [px, py] = t.apply(bolhas ? [n.x, n.y] : [n.x0, n.y0]).map((v) => v * s);
        const lw = painel.offsetWidth, lh = painel.offsetHeight, mw = moldura.clientWidth, mh = est.svg.clientHeight;
        let x = px + 16, y = py - lh / 2;
        if (x + lw > mw - 4) x = Math.max(4, px - lw - 16);
        y = Math.max(4, Math.min(mh - lh - 4, y));
        painel.style.left = `${x}px`; painel.style.top = `${y}px`;
      };
      const atualizarPainel = () => {
        const sel = Lab.selecoes.get(esc) || "";
        const u = sel && fc.features.some((f) => f.properties.id === sel) ? sel : null;
        painel.hidden = !u;
        if (!u) { busca.value = ""; return; }
        busca.value = nome(u);
        Lab.conteudoPainel(painel, { u, nome: nome(u), linhas: opts.dica(u), abrir: opts.abrir, rotuloAbrir: opts.rotuloAbrir, esc });
        requestAnimationFrame(posicionarPainel);
      };
      Lab.registrarPainel(esc, atualizarPainel, alvo);   // um registro por mapa (o redesenho troca, não acumula)
      atualizarPainel();
      // troca de cores e textos sem redesenhar (story: o mesmo mapa muda de estado entre cartões)
      est.recolorir = (animar) => {
        temLacuna = false;
        const sel = animar && !Lab.semMovimento() ? formas.transition().duration(650) : formas;
        sel.attr("fill", (n) => preencherH(n.id)).attr("fill-opacity", (n) => (opts.opacidade ? opts.opacidade(n.id) : null));
        formas.classed("foco", (n) => Boolean(opts.foco?.(n.id)));
        atualizarPainel();
      };
      if (alvo.isConnected) Lab.aplicarSelecao(esc);
      if (bolhas && !compacto) zonaLeg.append(Lab.legendaTamanho(escalaR, opts.rotuloTamanho));
      if (bolhas && !compacto) alvo.append(Lab.notaFora(nos.filter((n) => n.fora).map((n) => nome(n.id))),
        el("p", { class: "nota", text: "Círculos: cada um parte do centro da unidade e é afastado o mínimo para não se sobrepor; a posição é aproximada." }));

      // ------------------------------------------------ fundo raster: blocos visíveis no zoom atual
      const atualizarTiles = () => {
        if (!gTiles) return;
        const t = est.transform || d3.zoomIdentity, s = (est.svg.clientWidth || W) / W;
        const z = Math.max(0, Math.min(16, Math.round(Math.log2((2 * Math.PI * proj.scale() * t.k * s * Math.min(2, devicePixelRatio || 1)) / 256))));
        const [lon0, lat0] = proj.invert(t.invert([0, 0])), [lon1, lat1] = proj.invert(t.invert([W, H]));
        const blocos = [];
        for (let x = lonTile(lon0, z); x <= lonTile(lon1, z); x++) for (let y = latTile(lat0, z); y <= latTile(lat1, z); y++) blocos.push([x, y, z]);
        if (blocos.length > 120) return;
        gTiles.selectAll("image").data(blocos, (b) => b.join("/")).join("image")
          .attr("preserveAspectRatio", "none").attr("href", ([x, y]) => urlEsri(z, x, y))
          .each(function ([x, y]) {
            const [ax, ay] = proj([tileLon(x, z), tileLat(y, z)]), [bx, by] = proj([tileLon(x + 1, z), tileLat(y + 1, z)]);
            d3.select(this).attr("x", ax).attr("y", ay).attr("width", bx - ax + 0.5).attr("height", by - ay + 0.5);
          })
          .on("error", function () { d3.select(this).remove(); });
      };
      // ------------------------------------------------ fundo vetorial: centro e zoom do MapLibre = câmera do SVG
      const sincronizarVetorial = () => {
        const v = est.vetorial;
        if (!v) return;
        const sv = est.svg, cw = sv.clientWidth, ch = sv.clientHeight;
        if (!cw) return;
        v.caixa.style.width = `${cw}px`; v.caixa.style.height = `${ch}px`;
        v.caixa.style.opacity = bolhas ? 0 : 1;
        const t = est.transform || d3.zoomIdentity;
        const centro = proj.invert(t.invert([W / 2, H / 2]));
        const zoomML = Math.log2((2 * Math.PI * proj.scale() * t.k * (cw / W)) / 512);
        if (!v.mapa) {
          try {
            v.mapa = new maplibregl.Map({ container: v.caixa, style: estiloVetorial(), center: centro, zoom: zoomML, interactive: false, attributionControl: false, fadeDuration: 0 });
            v.mapa.on("error", (e) => console.warn("lab-mapa: fundo vetorial com erro —", e?.error?.message || e));
          } catch (e) {   // sem WebGL, por exemplo: o mapa segue sem fundo
            console.warn("lab-mapa: fundo vetorial indisponível —", e.message);
            v.caixa.remove(); est.vetorial = null;
            moldura.classList.remove("com-fundo"); moldura.querySelector(".mapa-atribuicao")?.remove();
          }
        } else { v.mapa.resize(); v.mapa.jumpTo({ center: centro, zoom: zoomML }); }
      };

      // ------------------------------------------------ câmera, zoom e arrasto (L0006)
      const aplicar = (t) => {
        est.transform = t;
        cena.attr("transform", t);
        // rótulos e marcadores mantêm o tamanho na tela (descontados o zoom e a escala do desenho na página)
        const f = (W / (est.svg.clientWidth || W)) / t.k;
        cena.selectAll(".rotulos-ref text, .rotulo-fora").style("font-size", (d, i, n) => `${(n[i].classList.contains("rotulo-fora") ? 11 : 12) * f}px`)
          .style("stroke-width", `${3 * f}px`);
        cena.selectAll(".rotulos-ref text").attr("x", 4 * f).attr("y", -4 * f);
        cena.selectAll(".rotulos-ref circle").attr("r", 2.4 * f);
        // no enquadramento inicial, um dedo é da página (ou do story, que passa o cartão deslizando para o lado)
        svg.style("touch-action", t.k > 1.01 ? "none" : compacto ? "pan-y" : "pan-x pan-y");
        posicionarPainel();
        sincronizarVetorial();
        for (const f of est.aoZoom) f(t);
      };
      const inicial = est.transform || transformacaoCamera(est.camera, est.geo);
      if (zoomAtivo) {
        const zoom = d3.zoom().scaleExtent([1, ZOOM_MAX]).translateExtent([[-W * 0.3, -H * 0.3], [W * 1.3, H * 1.3]]).clickDistance(4)
          .filter((ev) => {
            const k = (est.transform || d3.zoomIdentity).k;
            if (ev.type === "wheel") return ev.ctrlKey || ev.metaKey;           // roda sozinha rola a página
            if (ev.type.startsWith("touch")) {   // um dedo nunca move o mapa (rola a página ou passa o cartão); dois dedos movem e ampliam (L0013)
              if (ev.touches.length > 1) return true;
              if (k > 1.01 && ev.type === "touchstart") avisar("Use dois dedos para mover o mapa");
              return false;
            }
            if (ev.type === "mousedown") return !ev.button && k > 1.01;          // arrastar só quando ampliado
            return !ev.button;
          })
          .on("zoom", (ev) => aplicar(ev.transform))
          .on("end", () => atualizarTiles());
        est.zoom = zoom;
        svg.call(zoom).on("dblclick.zoom", null);
        svg.style("touch-action", "pan-x pan-y");   // um dedo fica com a página (rolar, passar cartão); a pinça fica com o mapa
        svg.call(zoom.transform, inicial);
        // aviso: Ctrl + roda amplia (a roda sozinha continua rolando a página); dois dedos movem no celular
        const textoRoda = `${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} + roda do mouse para ampliar`;
        const avisoRoda = el("div", { class: "mapa-aviso", hidden: "", text: textoRoda });
        moldura.append(avisoRoda);
        let tAviso = null;
        function avisar(t) { avisoRoda.textContent = t; avisoRoda.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => { avisoRoda.hidden = true; }, 1400); }
        svg.on("wheel.aviso", (ev) => { if (ev.ctrlKey || ev.metaKey) return; avisar(textoRoda); });
        const mover = (f) => { const s = d3.select(est.svg); (Lab.semMovimento() ? s : s.transition().duration(350)).call(f); };
        moldura.append(el("div", { class: "mapa-controles", role: "group", "aria-label": "Zoom do mapa" },
          el("button", { type: "button", "aria-label": "Ampliar", title: "Ampliar", text: "+", onclick: () => mover((s) => zoom.scaleBy(s, PASSO_ZOOM)) }),
          el("button", { type: "button", "aria-label": "Reduzir", title: "Reduzir", text: "−", onclick: () => mover((s) => zoom.scaleBy(s, 1 / PASSO_ZOOM)) }),
          el("button", { type: "button", "aria-label": "Voltar ao enquadramento inicial", title: "Voltar ao enquadramento", text: "⟲",
            onclick: () => api.camera(est.camera) })));
      } else {
        aplicar(inicial);
      }
      atualizarTiles();
      // modo de edição (?editar=1): mostra a câmera atual para copiar no roteiro
      if (editar) {
        const saida = el("code");
        const textoCamera = () => {
          const t = est.transform || d3.zoomIdentity, [lon, lat] = proj.invert(t.invert([W / 2, H / 2]));
          return `camera: {centro: [${lon.toFixed(3)}, ${lat.toFixed(3)}], zoom: ${t.k.toFixed(2)}}`;
        };
        const atualizarSaida = () => { saida.textContent = textoCamera(); };
        est.aoZoom = [atualizarSaida];
        atualizarSaida();
        moldura.append(el("div", { class: "mapa-editar" }, saida,
          el("button", { type: "button", text: "Copiar câmera", onclick: async (ev) => {
            try { await navigator.clipboard.writeText(textoCamera()); ev.target.textContent = "Copiado ✓"; } catch (e) { window.prompt("Copie a câmera:", textoCamera()); }
            setTimeout(() => { ev.target.textContent = "Copiar câmera"; }, 1500);
          } })));
      }
      if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { aplicar(est.transform || d3.zoomIdentity); }).observe(est.svg);
      requestAnimationFrame(() => { sincronizarVetorial(); atualizarTiles(); });
    };

    const api = {
      /** Move a câmera ("estado" | {foco, contexto} | {centro, zoom}); animada, salvo prefers-reduced-motion. */
      camera(camera, animar = true) {
        est.camera = camera || "estado";
        if (!est.geo) return;
        const t = transformacaoCamera(est.camera, est.geo);
        if (!est.zoom) { est.transform = t; desenhar(null); return; }
        const s = d3.select(est.svg);
        (animar && !Lab.semMovimento() ? s.transition().duration(DURACAO).ease(d3.easeCubicInOut) : s).call(est.zoom.transform, t);
      },
      /** Troca cores, textos, opacidade e foco sem redesenhar (com transição). */
      atualizar(parcial = {}, { animar = true } = {}) {
        Object.assign(opts, parcial);
        if (est.recolorir) est.recolorir(animar);
      },
      /** Troca a forma (Mapa | Círculos) com a transição do design system. */
      forma(v, animar = true) {
        if (!opts.forma || !opts.tamanho || opts.forma.obter() === v) return;
        const anterior = opts.forma.obter();
        opts.forma.definir(v);
        if (ctrl) for (const bt of ctrl.querySelectorAll("button")) bt.setAttribute("aria-pressed", bt.dataset.chave === `Representação|${v}`);
        desenhar(animar && !Lab.semMovimento() ? anterior : null);
      },
      redesenhar() { desenhar(null); },
    };
    desenharMapa(null);
    return api;
  };
})();
