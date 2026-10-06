/* lab-sankey.js — diagrama de fluxos entre etapas (quem liderava cada unidade em cada momento). ADR L0003.
 * Requer d3-sankey. Mostra mudança de categoria por unidade, não transferência de votos/pessoas.
 *
 * Lab.sankey(alvo, {
 *   etapas: ["Dep. Estadual 2022", "Prefeito 2024", …],
 *   sequencias: { id: [categoria na etapa 0, na etapa 1, …] },
 *   fluxos: [{ etapa, de, para, … }], valor(f) → largura da faixa,
 *   ordem: [categorias na ordem fixa], cor(cat), nome(cat), nomeItem(id),
 *   dicaFluxo(f) → linhas, dicaNo({cat, etapa, ids, pct, conta(i)}) → linhas,
 *   nota: texto sob o diagrama,
 *   rotuloEtapa(t): forma curta do nome da etapa, usada com mais de 3 etapas (padrão: só o ano),
 * })
 * Rótulo de cada barra: "% da coluna (nº de unidades)". Clique fixa o destaque e libera "Ver lista".
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;
  let escAtual = null;   // um só ouvinte de Esc por página

  Lab.sankey = (alvo, o) => {
    const estreito = Lab.estreito();
    const W = Lab.largura(760), H = estreito ? 520 : 460, mx = estreito ? 58 : 90;
    const nE = o.etapas.length, ult = nE - 1;
    const xs = d3.range(nE).map((i) => (nE === 1 ? W / 2 : mx + ((W - 2 * mx) * i) / (nE - 1)));
    const seqs = Object.entries(o.sequencias);
    const nos = [], idx = new Map();
    const no = (etapa, g) => { const k = `${etapa}|${g}`; if (!idx.has(k)) { idx.set(k, nos.length); nos.push({ k, etapa, g }); } return idx.get(k); };
    for (let e = 0; e < nE; e++) for (const g of o.ordem) if (seqs.some(([, s]) => s[e] === g)) no(e, g);
    const links = o.fluxos.map((f) => ({ source: idx.get(`${f.etapa}|${f.de}`), target: idx.get(`${f.etapa + 1}|${f.para}`), value: o.valor(f), f }))
      .filter((l) => l.value > 0);
    const gerador = d3.sankey().nodeId((d) => d.index).nodeWidth(18).nodePadding(10).nodeSort((a, b) => o.ordem.indexOf(a.g) - o.ordem.indexOf(b.g)).extent([[mx, 24], [W - mx, H - 10]]);
    const grafo = gerador({ nodes: nos.map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) });
    const presentes = o.ordem.filter((g) => nos.some((n) => n.g === g));
    const legenda = Lab.legendaCategorias(presentes.map((g) => [o.cor(g), o.nome(g)]));
    legenda.style.marginBottom = "12px";
    alvo.append(legenda);
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "sankey").attr("width", W).attr("height", H).style("max-width", "100%").style("height", "auto")
      .attr("role", "img").attr("aria-label", `Diagrama de fluxos: ${o.etapas.join(" → ")}. A tabela abaixo traz os números.`);
    const soAno = (t) => (t.match(/\d{4}/) || [t])[0];
    const curto = (t) => (estreito ? soAno(t) : nE > 3 ? (o.rotuloEtapa || soAno)(t) : t);
    if (estreito) alvo.append(el("p", { class: "nota", text: o.etapas.join(" → ") }));
    // trilho claro de cada coluna = 100%
    const colunas = d3.groups(grafo.nodes, (d) => d.etapa).map(([e, ns]) => ({ e, x0: ns[0].x0, x1: ns[0].x1, y0: d3.min(ns, (d) => d.y0), y1: d3.max(ns, (d) => d.y1), total: d3.sum(ns, (d) => d.value) }));
    const totalColuna = new Map(colunas.map((c) => [c.e, c.total]));
    svg.append("g").selectAll("rect").data(colunas).join("rect").attr("x", (c) => c.x0 - 3).attr("width", (c) => c.x1 - c.x0 + 6)
      .attr("y", (c) => c.y0 - 3).attr("height", (c) => c.y1 - c.y0 + 6).attr("rx", 3).attr("fill", Lab.token("cor-grade")).attr("opacity", 0.55);
    const c0 = colunas.find((c) => c.e === 0);
    if (c0) {
      svg.append("text").attr("x", c0.x0 - 8).attr("y", c0.y0 + 4).attr("text-anchor", "end").style("font-size", "10px").text("100%");
      svg.append("text").attr("x", c0.x0 - 8).attr("y", c0.y1).attr("text-anchor", "end").style("font-size", "10px").text("0%");
    }
    o.etapas.forEach((t, i) => svg.append("text").attr("x", xs[i]).attr("y", 12).attr("text-anchor", i === 0 ? "start" : i === ult ? "end" : "middle").style("font-weight", 600).text(curto(t)));
    svg.append("g").selectAll("path").data(grafo.links).join("path").attr("class", "fluxo")
      .attr("d", d3.sankeyLinkHorizontal()).attr("stroke", (d) => o.cor(d.source.g)).attr("stroke-width", (d) => Math.max(1, d.width))
      .style("cursor", "pointer")
      .on("pointerenter", (ev, d) => { if (!fixo) destacar((x) => x === d); })
      .on("pointermove", (ev, d) => Lab.mostrarDica(ev, `${o.nome(d.source.g)} → ${o.nome(d.target.g)}`, [...o.dicaFluxo(d.f), fixo ? null : "clique para fixar o destaque"]))
      .on("pointerleave", () => { Lab.esconderDica(); if (!fixo) destacar(null); })
      .on("click", (ev, d) => fixar(`f|${d.f.etapa}|${d.f.de}|${d.f.para}`, (x) => x === d,
        { titulo: `${o.nome(d.f.de)} → ${o.nome(d.f.para)} (${o.etapas[d.f.etapa]} → ${o.etapas[d.f.etapa + 1]})`, filtro: (s) => s[d.f.etapa] === d.f.de && s[d.f.etapa + 1] === d.f.para }));
    const gNos = svg.append("g").selectAll("g").data(grafo.nodes).join("g");
    const pctNo = (d) => (100 * d.value) / (totalColuna.get(d.etapa) || 1);
    const resumoNo = (d) => {
      const ms = seqs.filter(([, s]) => s[d.etapa] === d.g);
      const conta = (i) => d3.rollups(ms, (v) => v.length, ([, s]) => s[i]).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${o.nome(g)} ${n}`).join(", ");
      return [...o.dicaNo({ cat: d.g, etapa: d.etapa, ids: ms.map(([m]) => m), pct: pctNo(d), conta, ultima: ult }), fixo ? null : "clique para fixar o destaque"];
    };
    gNos.append("rect").attr("x", (d) => d.x0 - 3).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0 + 6).attr("height", (d) => Math.max(6, d.y1 - d.y0)).attr("fill", "transparent");
    gNos.append("rect").attr("x", (d) => d.x0).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0).attr("height", (d) => Math.max(1, d.y1 - d.y0)).attr("fill", (d) => o.cor(d.g));
    const ligado = (d) => (x) => (x.source.etapa === d.etapa && x.source.g === d.g) || (x.target.etapa === d.etapa && x.target.g === d.g);
    gNos.style("cursor", "pointer")
      .on("pointerenter", (ev, d) => { if (!fixo) destacar(ligado(d)); })
      .on("pointermove", (ev, d) => Lab.mostrarDica(ev, `${o.nome(d.g)} · ${o.etapas[d.etapa]}`, resumoNo(d)))
      .on("pointerleave", () => { Lab.esconderDica(); if (!fixo) destacar(null); })
      .on("click", (ev, d) => fixar(`n|${d.etapa}|${d.g}`, ligado(d), { titulo: `${o.nome(d.g)} · ${o.etapas[d.etapa]}`, filtro: (s) => s[d.etapa] === d.g }));
    // rótulo = parte da coluna e número de unidades (a categoria é identificada pela cor e pela legenda)
    const nNo = d3.rollup(seqs.flatMap(([, sq]) => sq.map((g, i) => `${i}|${g}`)), (v) => v.length, (k) => k);
    const rotNo = (d) => `${Math.round(pctNo(d))}% (${nNo.get(`${d.etapa}|${d.g}`) || 0})`;
    const meio = (d) => d.etapa > 0 && d.etapa < ult;
    gNos.filter((d) => !meio(d)).append("text").attr("x", (d) => (d.etapa === ult ? d.x1 + 6 : d.x0 - 8)).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.etapa === ult ? "start" : "end")).style("font-weight", 600).style("fill", Lab.token("cor-texto"))
      .text((d) => (d.y1 - d.y0 >= 9 ? rotNo(d) : ""));
    gNos.filter(meio).append("text").attr("x", (d) => d.x1 + 5).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em").style("font-size", "11px").style("font-weight", 600)
      .text((d) => (d.y1 - d.y0 >= 12 ? rotNo(d) : ""));

    // destaque: passar o mouse mostra; clicar fixa (para leitura ou print); "Limpar", novo clique ou Esc desfazem
    let fixo = null, alvoLista = null;
    const limpar = el("button", { class: "voltar", type: "button", text: "Limpar destaque", onclick: () => fixar(null) });
    const verLista = el("button", { class: "voltar", type: "button", "aria-expanded": "false", onclick: () => alternarLista() });
    const caixaLista = el("div", { class: "caixa-lista" });
    limpar.hidden = verLista.hidden = caixaLista.hidden = true;
    const itensDe = (filtro) => seqs.filter(([, s]) => filtro(s)).map(([m]) => o.nomeItem(m)).sort((a, b) => a.localeCompare(b));
    function alternarLista(fechar = false) {
      const abrir = !fechar && caixaLista.hidden && alvoLista;
      caixaLista.hidden = !abrir;
      verLista.setAttribute("aria-expanded", String(Boolean(abrir)));
      if (abrir) {
        const ms = itensDe(alvoLista.filtro);
        caixaLista.replaceChildren(el("div", { class: "nota", text: `${alvoLista.titulo}: ${ms.length} ${o.nomeUnidades || "unidades"}` }),
          el("ul", { class: "lista-mun" }, ...ms.map((n) => el("li", { text: n }))));
      }
      verLista.textContent = abrir ? "Fechar lista" : `Ver lista (${alvoLista ? itensDe(alvoLista.filtro).length : 0})`;
    }
    function destacar(pred) {
      svg.selectAll("path.fluxo").classed("realce", (x) => Boolean(pred && pred(x))).classed("apagado", (x) => Boolean(pred && !pred(x)));
    }
    function fixar(chave, pred, lista) {
      fixo = chave && chave !== fixo ? chave : null;
      alvoLista = fixo ? lista : null;
      destacar(fixo ? pred : null);
      limpar.hidden = verLista.hidden = !fixo;
      alternarLista(true);
      Lab.esconderDica();
    }
    if (escAtual) removeEventListener("keydown", escAtual);
    escAtual = (ev) => { if (ev.key === "Escape" && fixo) fixar(null); };
    addEventListener("keydown", escAtual);
    alvo.append(o.nota ? el("p", { class: "nota", text: o.nota }) : "", el("div", { class: "botoes-sankey" }, limpar, verLista), caixaLista);
  };
})();
