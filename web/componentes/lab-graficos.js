/* lab-graficos.js — gráficos do catálogo do design system (design.yaml › graficos). ADR L0003.
 * Todos recebem valores prontos (calculados em Python, L0002) e só posicionam e desenham.
 * Marcas selecionáveis levam data-u; o clique seleciona no bloco (data-escopo) do gráfico.
 * Quando há círculos proporcionais (porPeso), a legenda de tamanho vem antes do desenho e
 * a função devolve { foraIds } para a nota de "fora de escala" (Lab.notaFora) abaixo dele.
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const tok = Lab.token;

  /** Linhas por momentos (2 ou mais pontas: 2018 → 2022 → 2026), com rótulos diretos sem sobreposição.
   *  opts: { pontas: ["2018","2022","2026"], series: [{cor, valores: [v por ponta, null = sem dado], rotulo, dicas: [[título, linhas] por ponta]}],
   *          fmt, aria, largura, dominio ([min, max] fixo; padrão: 0 até o maior valor) }
   *  Linha só entre momentos vizinhos com dado. Rótulos: valor na 1ª ponta; valor e nome na última; meio só na dica. */
  Lab.linhasPontas = (alvo, { pontas, series, fmt, aria, largura = 500, dominio = null }) => {
    const W = Math.min(largura, Lab.largura(largura)), H = 320, mg = { t: 26, b: 26, l: 58, r: 178 };
    const max = d3.max(series.flatMap((s) => s.valores).filter((v) => v !== null && v !== undefined)) || 1;
    const emPct = fmt === Lab.fmtPct;
    const sy = d3.scaleLinear().domain(dominio || [0, emPct ? Math.ceil(max / 10) * 10 : max * 1.05]).nice().range([H - mg.b, mg.t]);
    const n = pontas.length, x0 = mg.l, x1 = W - mg.r;
    const sx = (i) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
    const tem = (v) => v !== null && v !== undefined;
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H).style("max-width", "100%").style("height", "auto")
      .attr("role", "img").attr("aria-label", aria);
    pontas.forEach((t, i) => {
      svg.append("line").attr("x1", sx(i)).attr("x2", sx(i)).attr("y1", mg.t - 6).attr("y2", H - mg.b).attr("stroke", tok("cor-grade"));
      svg.append("text").attr("x", sx(i)).attr("y", 14).attr("text-anchor", "middle").style("font-weight", 700).style("fill", tok("cor-texto")).text(t);
    });
    // rótulos sem sobreposição: empurra para baixo os que ficam a menos de 13 px
    const afastar = (itens) => { itens.sort((a, b) => a.y - b.y); for (let k = 1; k < itens.length; k++) if (itens[k].y - itens[k - 1].y < 13) itens[k].y = itens[k - 1].y + 13; return itens; };
    const rotEsq = afastar(series.filter((s) => tem(s.valores[0])).map((s) => ({ s, y: sy(s.valores[0]) })));
    const rotDir = afastar(series.filter((s) => tem(s.valores[n - 1])).map((s) => ({ s, y: sy(s.valores[n - 1]) })));
    for (const s of series) {
      for (let i = 1; i < n; i++) if (tem(s.valores[i - 1]) && tem(s.valores[i]))
        svg.append("line").attr("x1", sx(i - 1)).attr("y1", sy(s.valores[i - 1])).attr("x2", sx(i)).attr("y2", sy(s.valores[i]))
          .attr("stroke", s.cor).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
      s.valores.forEach((v, i) => {
        if (!tem(v)) return;
        const d = s.dicas?.[i];
        svg.append("circle").attr("class", "ponto").attr("cx", sx(i)).attr("cy", sy(v)).attr("r", 6).attr("fill", s.cor)
          .on("pointermove", (ev) => d && Lab.mostrarDica(ev, d[0], d[1])).on("pointerleave", Lab.esconderDica);
      });
    }
    const rot = (x, y, txt, ancora) => svg.append("text").attr("x", x).attr("y", y + 4).attr("text-anchor", ancora).style("font-size", "12px").style("font-weight", 600).style("fill", tok("cor-texto")).text(txt);
    for (const { s, y } of rotEsq) rot(x0 - 9, y, fmt(s.valores[0]), "end");
    for (const { s, y } of rotDir) rot(x1 + 9, y, `${fmt(s.valores[n - 1])} ${s.rotulo}`, "start");
  };
  /** Duas pontas (antes → depois): atalho de Lab.linhasPontas. series: [{cor, v0, v1, rotulo, dica0, dica1}]. */
  Lab.linhasDuasPontas = (alvo, { pontas, series, fmt, aria, largura = 500 }) => Lab.linhasPontas(alvo, { pontas, fmt, aria, largura,
    series: series.map((s) => ({ cor: s.cor, valores: [s.v0, s.v1], rotulo: s.rotulo, dicas: [s.dica0, s.dica1] })) });

  /** Distribuição sem eixo vertical (beeswarm): cada unidade na posição do seu valor; 0 no centro.
   *  opts: { pontos: [{u, d, peso}], cor(d), simlog (bool: eixo logarítmico simétrico), marcas, fmtMarca,
   *          rotuloEsq, rotuloDir, rotuloEixo, porPeso, rotuloPeso, raio (fixo), rMaxPeso, alturaMax,
   *          nome(u), dica(u) → linhas, aria } */
  Lab.distribuicao = (alvo, o) => {
    const W = 440, HMAX = o.alturaMax || 360, mg = { t: 30, r: 18, b: 34, l: 18 };
    const M = d3.max(o.pontos, (p) => Math.abs(p.d)) || 1;
    const sx = o.simlog ? d3.scaleSymlog().constant(100).domain([-M, M]).range([mg.l, W - mg.r])
      : d3.scaleLinear().domain([-M, M]).nice().range([mg.l, W - mg.r]);
    const marcas = o.simlog ? (o.marcas || [-100000, -10000, -1000, 0, 1000, 10000, 100000]).filter((v) => Math.abs(v) <= M * 1.0001) : sx.ticks(Lab.estreito() ? 5 : 7);
    const ea = Lab.escalaArea(o.pontos.map((p) => p.peso), o.rMaxPeso || 16);
    const raio = (p) => (o.porPeso ? Math.max(2.5, ea.s(p.peso)) : o.raio || 4.5);
    const meio = (mg.t + HMAX - mg.b) / 2;
    const nos = o.pontos.map((p) => ({ ...p, x: sx(p.d), y: meio, r: raio(p) }));
    const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => sx(n.d)).strength(1)).force("y", d3.forceY(meio).strength(0.06))
      .force("colisao", d3.forceCollide((n) => n.r + 0.7).iterations(3)).stop();
    for (let i = 0; i < 220; i++) { sim.tick(); for (const n of nos) n.y = Math.max(mg.t + n.r, Math.min(HMAX - mg.b - n.r, n.y)); }
    // altura do desenho = altura ocupada pelos círculos (sem faixa vazia)
    const topoN = d3.min(nos, (n) => n.y - n.r) ?? mg.t, baseN = d3.max(nos, (n) => n.y + n.r) ?? mg.t;
    for (const n of nos) n.y += mg.t + 4 - topoN;
    const H = Math.max(120, baseN - topoN + mg.t + mg.b + 8);
    if (o.porPeso) alvo.append(Lab.legendaTamanho(ea.s, o.rotuloPeso));
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("max-width", `${W}px`).style("height", "auto")
      .attr("role", "img").attr("aria-label", o.aria);
    const x0 = sx(0);
    svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", mg.t - 8).attr("y2", H - mg.b).attr("stroke", tok("cor-eixo")).attr("stroke-dasharray", "4 3");
    svg.append("text").attr("x", x0 - 8).attr("y", 14).attr("text-anchor", "end").style("font-size", "12px").style("fill", tok("cor-texto-secundario")).text(`← ${o.rotuloEsq}`);
    svg.append("text").attr("x", x0 + 8).attr("y", 14).style("font-size", "12px").style("fill", tok("cor-texto-secundario")).text(`${o.rotuloDir} →`);
    svg.append("g").attr("transform", `translate(0,${H - mg.b})`).call(d3.axisBottom(sx).tickValues(marcas).tickFormat(o.fmtMarca)).call(Lab.eixo);
    svg.append("text").attr("x", W - mg.r).attr("y", H - 2).attr("text-anchor", "end").style("font-size", "11px").style("fill", tok("cor-texto-secundario")).text(o.rotuloEixo);
    svg.append("g").selectAll("circle").data([...nos].sort((a, b) => b.r - a.r)).join("circle").attr("class", (n) => `ponto${o.porPeso && ea.fora(n.peso) ? " fora-escala" : ""}`)
      .attr("data-u", (n) => n.u).attr("cx", (n) => n.x).attr("cy", (n) => n.y).attr("r", (n) => n.r)
      .attr("fill", (n) => o.cor(n.d)).attr("stroke", tok("cor-superficie")).attr("stroke-width", 0.8).style("cursor", "pointer")
      .on("pointermove", (ev, n) => Lab.mostrarDica(ev, o.nome(n.u), o.dica(n.u)))
      .on("pointerleave", Lab.esconderDica).on("click", (ev, n) => Lab.selecionar(n.u, ev.currentTarget));
    return { foraIds: o.porPeso ? nos.filter((n) => ea.fora(n.peso)).map((n) => n.u) : [] };
  };

  /** Dispersão x × y com linha de igualdade tracejada (mesma escala nos dois eixos).
   *  opts: { pontos: [{u, x, y, peso}], cor, fmtEixo, rotuloX, rotuloY, porPeso, rotuloPeso, raio, rMaxPeso, nome(u), dica(u), aria } */
  Lab.dispersao = (alvo, o) => {
    const W = 440, H = 400, mg = { t: 14, r: 14, b: 42, l: 46 };
    const lim = Math.max(d3.max(o.pontos, (p) => p.x), d3.max(o.pontos, (p) => p.y)) || 1;
    const sx = d3.scaleLinear().domain([0, lim]).nice().range([mg.l, W - mg.r]), sy = d3.scaleLinear().domain(sx.domain()).range([H - mg.b, mg.t]);
    const ea = Lab.escalaArea(o.pontos.map((p) => p.peso), o.rMaxPeso || 22);
    const raio = (p) => (o.porPeso ? Math.max(3, ea.s(p.peso)) : o.raio || 5);
    if (o.porPeso) alvo.append(Lab.legendaTamanho(ea.s, o.rotuloPeso));
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("max-width", `${W}px`).style("height", "auto")
      .attr("role", "img").attr("aria-label", o.aria);
    svg.append("line").attr("x1", sx(0)).attr("y1", sy(0)).attr("x2", sx(sx.domain()[1])).attr("y2", sy(sx.domain()[1])).attr("stroke", tok("cor-eixo")).attr("stroke-dasharray", "4 3");
    svg.append("g").attr("transform", `translate(0,${H - mg.b})`).call(d3.axisBottom(sx).ticks(5).tickFormat(o.fmtEixo)).call(Lab.eixo);
    svg.append("g").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(sy).ticks(5).tickFormat(o.fmtEixo)).call(Lab.eixo);
    svg.append("text").attr("x", W - mg.r).attr("y", H - 6).attr("text-anchor", "end").text(o.rotuloX);
    svg.append("text").attr("x", mg.l + 4).attr("y", mg.t + 10).text(o.rotuloY);
    svg.append("g").selectAll("circle").data([...o.pontos].sort((a, b) => raio(b) - raio(a))).join("circle").attr("class", (p) => `ponto${o.porPeso && ea.fora(p.peso) ? " fora-escala" : ""}`)
      .attr("data-u", (p) => p.u).attr("cx", (p) => sx(p.x)).attr("cy", (p) => sy(p.y)).attr("r", raio)
      .attr("fill", o.cor).attr("fill-opacity", o.porPeso ? 0.55 : 0.75).style("cursor", "pointer")
      .on("pointermove", (ev, p) => Lab.mostrarDica(ev, o.nome(p.u), o.dica(p.u)))
      .on("pointerleave", Lab.esconderDica).on("click", (ev, p) => Lab.selecionar(p.u, ev.currentTarget));
    return { foraIds: o.porPeso ? o.pontos.filter((p) => ea.fora(p.peso)).map((p) => p.u) : [] };
  };

  /** Boxplot horizontal por categoria + um círculo por unidade (posição vertical determinística).
   *  Resumo (quartis, bigodes de Tukey) vem pronto da base Python.
   *  opts: { linhas: [{rotulo, sub, cor, resumo: {n,min,q1,mediana,q3,max,bigode_inf,bigode_sup}, pontos: [{u, v, peso, dica: [título, linhas]}]}],
   *          dominio: [min, max], referencias: [valores com linha fina], fmt, porPeso, rotuloPeso, nomeUnidades, aria } */
  Lab.boxplot = (alvo, o) => {
    const estreito = Lab.estreito();
    const faixa = estreito ? 64 : 72;
    const W = Lab.largura(760), H = faixa * o.linhas.length + 44, mg = { l: estreito ? 84 : 104, r: 16, t: 10, b: 30 };
    const sx = d3.scaleLinear().domain(o.dominio).range([mg.l, W - mg.r]).clamp(true);
    const ea = Lab.escalaArea(o.linhas.flatMap((l) => l.pontos).map((p) => p.peso), estreito ? 22 : 28);
    const raio = (p) => (o.porPeso ? Math.max(3, ea.s(p.peso)) : 4.6);
    if (o.porPeso) alvo.append(Lab.legendaTamanho(ea.s, o.rotuloPeso));
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H).style("max-width", "100%").style("height", "auto")
      .attr("role", "img").attr("aria-label", o.aria);
    svg.append("g").attr("transform", `translate(0,${H - mg.b})`).call(d3.axisBottom(sx).ticks(estreito ? 4 : 8).tickFormat((v) => `${v}%`)).call(Lab.eixo);
    for (const v of o.referencias || []) svg.append("line").attr("x1", sx(v)).attr("x2", sx(v)).attr("y1", mg.t).attr("y2", H - mg.b).attr("stroke", tok("cor-grade"));
    const tinta = tok("cor-texto");
    o.linhas.forEach((l, i) => {
      const y = mg.t + faixa * i + faixa / 2;
      const cor = l.cor, r = l.resumo;
      const g = svg.append("g");
      // nome em até duas linhas (nomes longos quebram no espaço)
      const linhasNome = l.rotulo.length > 12 ? l.rotulo.split(" ") : [l.rotulo];
      const tn = g.append("text").attr("x", mg.l - 10).attr("y", y - 3 - (linhasNome.length - 1) * 13).attr("text-anchor", "end").style("font-weight", 600).style("fill", tinta);
      linhasNome.forEach((t, k) => tn.append("tspan").attr("x", mg.l - 10).attr("dy", k ? 13 : 0).text(t));
      if (l.sub) g.append("text").attr("x", mg.l - 10).attr("y", y + 12).attr("text-anchor", "end").style("font-size", "11px").text(l.sub);
      // hastes e caixa
      g.append("line").attr("x1", sx(r.bigode_inf)).attr("x2", sx(r.q1)).attr("y1", y).attr("y2", y).attr("stroke", tinta).attr("stroke-width", 1.2);
      g.append("line").attr("x1", sx(r.q3)).attr("x2", sx(r.bigode_sup)).attr("y1", y).attr("y2", y).attr("stroke", tinta).attr("stroke-width", 1.2);
      for (const v of [r.bigode_inf, r.bigode_sup]) g.append("line").attr("x1", sx(v)).attr("x2", sx(v)).attr("y1", y - 7).attr("y2", y + 7).attr("stroke", tinta).attr("stroke-width", 1.2);
      // faixa interquartil hachurada na cor da categoria
      const idP = `iq-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const pat = svg.append("defs").append("pattern").attr("id", idP).attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
      pat.append("rect").attr("width", 6).attr("height", 6).attr("fill", d3.interpolateRgb(tok("cor-superficie"), cor)(0.16));
      pat.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).attr("stroke", cor).attr("stroke-width", 1.2).attr("stroke-opacity", 0.45);
      g.append("text").attr("x", sx(r.mediana)).attr("y", y - 17).attr("text-anchor", "middle").style("font-size", "11px").style("font-weight", 600).style("fill", tinta).text(`Med. ${o.fmt(r.mediana)}`);
      g.append("rect").attr("x", sx(r.q1)).attr("y", y - 13).attr("width", Math.max(2, sx(r.q3) - sx(r.q1))).attr("height", 26).attr("rx", 3)
        .attr("fill", `url(#${idP})`).attr("stroke", cor).attr("stroke-width", 1.5)
        .on("pointermove", (ev) => Lab.mostrarDica(ev, `${l.rotulo} · ${r.n} ${o.nomeUnidades || "unidades"}`, [`mediana: ${o.fmt(r.mediana)}`, `1º–3º quartil: ${o.fmt(r.q1)} a ${o.fmt(r.q3)}`, `menor–maior: ${o.fmt(r.min)} a ${o.fmt(r.max)}`]))
        .on("pointerleave", Lab.esconderDica);
      g.append("line").attr("x1", sx(r.mediana)).attr("x2", sx(r.mediana)).attr("y1", y - 13).attr("y2", y + 13).attr("stroke", tinta).attr("stroke-width", 2.5).attr("pointer-events", "none");
      // um círculo por unidade, espalhado na vertical (posição determinística)
      const pts = [...l.pontos].sort((a, b) => a.v - b.v).map((p, k) => ({ ...p, dy: ((k * 37) % 23) - 11 }))
        .sort((a, b) => raio(b) - raio(a));   // maiores atrás
      const circ = g.append("g").selectAll("g").data(pts).join("g").style("cursor", "pointer")
        .on("pointermove", (ev, p) => Lab.mostrarDica(ev, p.dica[0], p.dica[1]))
        .on("pointerleave", Lab.esconderDica)
        .on("click", (ev, p) => Lab.selecionar(p.u, ev.currentTarget));
      circ.append("circle").attr("cx", (p) => sx(p.v)).attr("cy", (p) => y + p.dy).attr("r", (p) => Math.max(9, raio(p))).attr("fill", "transparent");
      circ.attr("data-u", (p) => p.u);
      circ.append("circle").attr("class", (p) => `ponto${p.v < r.bigode_inf || p.v > r.bigode_sup ? " discrepante" : ""}${o.porPeso && ea.fora(p.peso) ? " fora-escala" : ""}`).attr("cx", (p) => sx(p.v)).attr("cy", (p) => y + p.dy).attr("r", raio)
        .attr("fill", cor).attr("fill-opacity", o.porPeso ? 0.55 : 0.8);
    });
    return { foraIds: o.porPeso ? o.linhas.flatMap((l) => l.pontos).filter((p) => ea.fora(p.peso)).map((p) => p.u) : [] };
  };
})();
