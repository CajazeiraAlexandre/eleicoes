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
 *   contagem(id): quantas unidades cada sequência representa (padrão 1) — para fluxos de VALOR com sequências
 *                 agregadas (ex.: combinações região → região, contando aportes); o rótulo "% (n)" usa essa soma,
 *   semLista: true esconde "Ver lista" (sequências agregadas não são itens nomeáveis),
 *   vertical: etapas de cima para baixo. PADRÃO com 2 etapas (validado pelo pesquisador em 2026-10-08, melhor no
 *             celular); com 3 ou mais, horizontal. `vertical: false|true` força a orientação,
 *   Legenda interativa: passar o mouse num item destaca os fluxos que tocam a categoria; clicar fixa (Esc desfaz),
 *   Legendas por lado: com categorias diferentes no primeiro e no último lado (duas variáveis), a legenda do primeiro
 *             fica ACIMA do diagrama e a do último ABAIXO, centralizadas; com as mesmas categorias, uma só, acima,
 *   formatoValor(v) → texto do valor de um fluxo ou total (ex.: "R$ 1,2 bi", "831 proponentes"); padrão: número inteiro.
 *   Distribuição do destaque (como o card do mapa): passar o mouse numa barra ou num item da legenda mostra, numa dica,
 *             "Para onde vai" (destinos, com valor e parte do que saiu da categoria) e "De onde vem" (origens, com a parte
 *             do que chegou nela); clicar fixa o destaque e mostra a mesma distribuição num card abaixo do desenho,
 *   cabecalhoLados: [nó, nó] — conteúdo no início da legenda de cada lado (ex.: o seletor da variável daquele lado);
 *             com ele, as duas linhas de legenda sempre aparecem,
 * })
 * Rótulo de cada barra: "% da coluna (nº de unidades)". Clique fixa o destaque e libera "Ver lista".
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;
  let escAtual = null;   // um só ouvinte de Esc por página

  Lab.sankey = (alvo, o) => {
    const estreito = Lab.estreito(), vert = o.vertical ?? o.etapas.length === 2;
    const W = Lab.largura(760), H = vert ? (estreito ? 460 : 420) + 60 * Math.max(0, o.etapas.length - 2) : estreito ? 520 : 460, mx = estreito ? 58 : 90;
    const nE = o.etapas.length, ult = nE - 1;
    const xs = d3.range(nE).map((i) => (nE === 1 ? W / 2 : mx + ((W - 2 * mx) * i) / (nE - 1)));
    // margens da versão vertical: rótulos das barras acima e abaixo (+ títulos das etapas, quando não há cabeçalhos nas legendas)
    const vTop = o.cabecalhoLados ? 24 : 44, vBase = o.cabecalhoLados ? 20 : 34, vLado = estreito ? 8 : 16;
    const seqs = Object.entries(o.sequencias);
    const nos = [], idx = new Map();
    const no = (etapa, g) => { const k = `${etapa}|${g}`; if (!idx.has(k)) { idx.set(k, nos.length); nos.push({ k, etapa, g }); } return idx.get(k); };
    for (let e = 0; e < nE; e++) for (const g of o.ordem) if (seqs.some(([, s]) => s[e] === g)) no(e, g);
    const links = o.fluxos.map((f) => ({ source: idx.get(`${f.etapa}|${f.de}`), target: idx.get(`${f.etapa + 1}|${f.para}`), value: o.valor(f), f }))
      .filter((l) => l.value > 0);
    // vertical: a disposição é calculada na horizontal com os eixos trocados (profundidade = altura) e depois transposta
    const gerador = d3.sankey().nodeId((d) => d.index).nodeWidth(vert ? 16 : 18).nodePadding(vert ? 14 : 10).nodeSort((a, b) => o.ordem.indexOf(a.g) - o.ordem.indexOf(b.g))
      .extent(vert ? [[vTop, vLado], [H - vBase, W - vLado]] : [[mx, 24], [W - mx, H - 10]]);
    const grafo = gerador({ nodes: nos.map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) });
    if (vert) for (const n of grafo.nodes) [n.x0, n.x1, n.y0, n.y1] = [n.y0, n.y1, n.x0, n.x1];
    const caminhoFluxo = vert
      ? (d) => { const sy = d.source.y1, ty = d.target.y0, m = (sy + ty) / 2; return `M${d.y0},${sy}C${d.y0},${m} ${d.y1},${m} ${d.y1},${ty}`; }
      : d3.sankeyLinkHorizontal();
    const presentes = o.ordem.filter((g) => nos.some((n) => n.g === g));
    const doLado = (e) => o.ordem.filter((g) => nos.some((n) => n.g === g && n.etapa === e));
    const [catsIni, catsFim] = [doLado(0), doLado(ult)];
    const porLado = Boolean(o.cabecalhoLados) || catsIni.some((g) => !catsFim.includes(g)) || catsFim.some((g) => !catsIni.includes(g));
    /** Linha de legenda centralizada e interativa; cada item guarda a sua categoria (data-cat). */
    const linhaLegenda = (cats, cabecalho) => {
      const lg = Lab.legendaCategorias(cats.map((g) => [o.cor(g), o.nome(g)]));
      lg.classList.add("legenda-interativa", "legenda-sankey");
      [...lg.querySelectorAll(".chave")].forEach((item, i) => { item.dataset.cat = cats[i]; });
      if (cabecalho) lg.prepend(el("span", { class: "lado-legenda" }, cabecalho));
      return lg;
    };
    const legendas = porLado ? [linhaLegenda(catsIni, o.cabecalhoLados?.[0]), linhaLegenda(catsFim, o.cabecalhoLados?.[1])] : [linhaLegenda(presentes)];
    alvo.append(legendas[0]);
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "sankey").attr("width", W).attr("height", H).style("max-width", "100%").style("height", "auto")
      .attr("role", "img").attr("aria-label", `Diagrama de fluxos: ${o.etapas.join(" → ")}. A tabela abaixo traz os números.`);
    const soAno = (t) => (t.match(/\d{4}/) || [t])[0];
    const curto = (t) => (estreito ? soAno(t) : nE > 3 ? (o.rotuloEtapa || soAno)(t) : t);
    if (estreito && !o.cabecalhoLados) alvo.append(el("p", { class: "nota", text: o.etapas.join(" → ") }));
    // trilho claro de cada coluna = 100%
    const colunas = d3.groups(grafo.nodes, (d) => d.etapa).map(([e, ns]) => ({ e, x0: d3.min(ns, (d) => d.x0), x1: d3.max(ns, (d) => d.x1), y0: d3.min(ns, (d) => d.y0), y1: d3.max(ns, (d) => d.y1), total: d3.sum(ns, (d) => d.value) }));
    const totalColuna = new Map(colunas.map((c) => [c.e, c.total]));
    svg.append("g").selectAll("rect").data(colunas).join("rect").attr("x", (c) => c.x0 - 3).attr("width", (c) => c.x1 - c.x0 + 6)
      .attr("y", (c) => c.y0 - 3).attr("height", (c) => c.y1 - c.y0 + 6).attr("rx", 3).attr("fill", Lab.token("cor-grade")).attr("opacity", 0.55);
    const c0 = colunas.find((c) => c.e === 0);
    if (c0 && !vert) {
      svg.append("text").attr("x", c0.x0 - 8).attr("y", c0.y0 + 4).attr("text-anchor", "end").style("font-size", "10px").text("100%");
      svg.append("text").attr("x", c0.x0 - 8).attr("y", c0.y1).attr("text-anchor", "end").style("font-size", "10px").text("0%");
    }
    // com cabeçalhos nas legendas (cabecalhoLados), os nomes das etapas já estão neles: nada desenhado aqui
    if (o.cabecalhoLados) { /* sem títulos de etapa no desenho */ }
    else if (vert) colunas.forEach((c) => svg.append("text").attr("x", vLado).attr("y", c.e === ult ? c.y1 + 30 : c.y0 - 24).style("font-weight", 600).text(o.etapas[c.e]));
    else o.etapas.forEach((t, i) => svg.append("text").attr("x", xs[i]).attr("y", 12).attr("text-anchor", i === 0 ? "start" : i === ult ? "end" : "middle").style("font-weight", 600).text(curto(t)));
    svg.append("g").selectAll("path").data(grafo.links).join("path").attr("class", "fluxo")
      .attr("d", caminhoFluxo).attr("stroke", (d) => o.cor(d.source.g)).attr("stroke-width", (d) => Math.max(1, d.width))
      .style("cursor", "pointer")
      .on("pointerenter", (ev, d) => { if (!fixo) destacar((x) => x === d); })
      .on("pointermove", (ev, d) => Lab.mostrarDica(ev, `${o.nome(d.source.g)} → ${o.nome(d.target.g)}`, [...o.dicaFluxo(d.f), fixo ? null : "clique para fixar o destaque"]))
      .on("pointerleave", () => { Lab.esconderDica(); if (!fixo) destacar(null); })
      .on("click", (ev, d) => fixar(`f|${d.f.etapa}|${d.f.de}|${d.f.para}`, Object.assign((x) => x === d, { link: d }),
        { titulo: `${o.nome(d.f.de)} → ${o.nome(d.f.para)} (${o.etapas[d.f.etapa]} → ${o.etapas[d.f.etapa + 1]})`, filtro: (s) => s[d.f.etapa] === d.f.de && s[d.f.etapa + 1] === d.f.para }));
    const gNos = svg.append("g").selectAll("g").data(grafo.nodes).join("g");
    const pctNo = (d) => (100 * d.value) / (totalColuna.get(d.etapa) || 1);
    const resumoNo = (d) => {
      const ms = seqs.filter(([, s]) => s[d.etapa] === d.g);
      const conta = (i) => d3.rollups(ms, (v) => v.length, ([, s]) => s[i]).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${o.nome(g)} ${n}`).join(", ");
      return [...o.dicaNo({ cat: d.g, etapa: d.etapa, ids: ms.map(([m]) => m), pct: pctNo(d), conta, ultima: ult }), ...linhasDist(distribuicao(d.g, d.etapa)), fixo ? null : "clique para fixar o destaque"];
    };
    gNos.append("rect").attr("x", (d) => d.x0 - 3).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0 + 6).attr("height", (d) => Math.max(6, d.y1 - d.y0)).attr("fill", "transparent");
    gNos.append("rect").attr("x", (d) => d.x0).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0).attr("height", (d) => Math.max(1, d.y1 - d.y0)).attr("fill", (d) => o.cor(d.g));
    const ligado = (d) => Object.assign((x) => (x.source.etapa === d.etapa && x.source.g === d.g) || (x.target.etapa === d.etapa && x.target.g === d.g), { foco: { g: d.g, etapa: d.etapa } });
    gNos.style("cursor", "pointer")
      .on("pointerenter", (ev, d) => { if (!fixo) destacar(ligado(d)); })
      .on("pointermove", (ev, d) => Lab.mostrarDica(ev, `${o.nome(d.g)} · ${o.etapas[d.etapa]}`, resumoNo(d)))
      .on("pointerleave", () => { Lab.esconderDica(); if (!fixo) destacar(null); })
      .on("click", (ev, d) => fixar(`n|${d.etapa}|${d.g}`, ligado(d), { titulo: `${o.nome(d.g)} · ${o.etapas[d.etapa]}`, filtro: (s) => s[d.etapa] === d.g }));
    // rótulo = parte da coluna e número de unidades (a categoria é identificada pela cor e pela legenda)
    const contar = o.contagem || (() => 1);
    const nNo = d3.rollup(seqs.flatMap(([id, sq]) => sq.map((g, i) => [`${i}|${g}`, contar(id)])), (v) => d3.sum(v, (x) => x[1]), (x) => x[0]);
    const rotNo = (d) => `${Math.round(pctNo(d))}% (${Lab.fmtInt.format(nNo.get(`${d.etapa}|${d.g}`) || 0)})`;
    const meio = (d) => d.etapa > 0 && d.etapa < ult;
    if (vert) {   // rótulos acima da primeira linha e abaixo da última; no meio, ao lado do nó
      gNos.append("text").attr("x", (d) => (meio(d) ? d.x1 + 4 : (d.x0 + d.x1) / 2)).attr("y", (d) => (d.etapa === 0 ? d.y0 - 6 : d.etapa === ult ? d.y1 + 14 : (d.y0 + d.y1) / 2))
        .attr("dy", (d) => (meio(d) ? "0.35em" : 0)).attr("text-anchor", (d) => (meio(d) ? "start" : "middle")).style("font-size", "11px").style("font-weight", 600)
        .style("fill", Lab.token("cor-texto")).text((d) => (d.x1 - d.x0 >= 46 ? rotNo(d) : d.x1 - d.x0 >= 26 ? `${Math.round(pctNo(d))}%` : ""));
    } else
    gNos.filter((d) => !meio(d)).append("text").attr("x", (d) => (d.etapa === ult ? d.x1 + 6 : d.x0 - 8)).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.etapa === ult ? "start" : "end")).style("font-weight", 600).style("fill", Lab.token("cor-texto"))
      .text((d) => (d.y1 - d.y0 >= 9 ? rotNo(d) : ""));
    if (!vert) gNos.filter(meio).append("text").attr("x", (d) => d.x1 + 5).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em").style("font-size", "11px").style("font-weight", 600)
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
    // distribuição de uma categoria destacada (dica ao passar o mouse; card ao fixar)
    const fmtV = o.formatoValor || ((v) => Lab.fmtInt.format(Math.round(v)));
    function distribuicao(g, etapa) {
      const blocos = [];
      const porEtapa = (lista, papel) => d3.groups(lista, (l) => (papel === "saida" ? l.source.etapa : l.target.etapa)).sort((a, b) => a[0] - b[0]).forEach(([e, ls]) => {
        const tot = d3.sum(ls, (l) => l.value);
        const titulo = papel === "saida" ? (nE > 2 ? `De ${o.etapas[e]} para ${o.etapas[e + 1]}` : "Para onde vai") : (nE > 2 ? `De ${o.etapas[e - 1]} para ${o.etapas[e]}` : "De onde vem");
        blocos.push({ titulo: `${titulo} (${fmtV(tot)})`, linhas: [...ls].sort((a, b) => b.value - a.value)
          .map((l) => `${papel === "saida" ? "→" : "←"} ${o.nome(papel === "saida" ? l.target.g : l.source.g)}: ${fmtV(l.value)} (${(100 * l.value) / tot < 0.05 ? "<0,1%" : Lab.fmtPct((100 * l.value) / tot)})`) });
      });
      porEtapa(grafo.links.filter((l) => l.source.g === g && (etapa === undefined || l.source.etapa === etapa)), "saida");
      // chegadas: no nó do meio ou do fim; pela legenda, só com dois lados (com 3+ etapas a lista ficaria longa demais)
      if (etapa !== undefined || nE === 2) porEtapa(grafo.links.filter((l) => l.target.g === g && (etapa === undefined || l.target.etapa === etapa)), "chegada");
      return blocos;
    }
    const linhasDist = (blocos) => blocos.flatMap((b) => [b.titulo, ...b.linhas]);
    const painel = el("div", { class: "painel-sel painel-sankey", "aria-live": "polite" });
    painel.hidden = true;
    function mostrarCard(foco, link) {
      if (!foco && !link) { painel.hidden = true; return; }
      const titulo = foco ? `${o.nome(foco.g)}${foco.etapa !== undefined ? ` · ${o.etapas[foco.etapa]}` : ""}` : `${o.nome(link.source.g)} → ${o.nome(link.target.g)}`;
      const corpo = foco ? distribuicao(foco.g, foco.etapa).map((b) => el("div", { class: "bloco-dist" }, el("strong", { text: b.titulo }), ...b.linhas.map((l) => el("span", { text: l }))))
        : [el("div", { class: "bloco-dist" }, ...o.dicaFluxo(link.f).filter(Boolean).map((l) => el("span", { text: l })))];
      painel.replaceChildren(el("b", { text: titulo }), ...corpo, el("div", { class: "acoes-sel" }, limpar, o.semLista ? null : verLista));
      painel.hidden = false;
    }
    function destacar(pred) {
      svg.selectAll("path.fluxo").classed("realce", (x) => Boolean(pred && pred(x))).classed("apagado", (x) => Boolean(pred && !pred(x)));
    }
    function fixar(chave, pred, lista) {
      fixo = chave && chave !== fixo ? chave : null;
      alvoLista = fixo ? lista : null;
      destacar(fixo ? pred : null);
      limpar.hidden = !fixo;
      verLista.hidden = !fixo || Boolean(o.semLista);
      mostrarCard(fixo ? pred.foco : null, fixo && !pred.foco ? pred.link : null);
      alternarLista(true);
      Lab.esconderDica();
    }
    // legenda interativa: cada item destaca (passar o mouse / foco) ou fixa (clique, Enter) os fluxos da sua categoria
    const tocaCat = (g) => Object.assign((x) => x.source.g === g || x.target.g === g, { foco: { g } });
    legendas.flatMap((lg) => [...lg.querySelectorAll(".chave")]).forEach((item) => {
      const g = item.dataset.cat;
      item.setAttribute("tabindex", "0"); item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Destacar os fluxos de ${o.nome(g)}`);
      item.addEventListener("pointerenter", () => { if (!fixo) destacar(tocaCat(g)); });
      item.addEventListener("pointerleave", () => { if (!fixo) destacar(null); Lab.esconderDica(); });
      item.addEventListener("pointermove", (ev) => { if (!fixo) Lab.mostrarDica(ev, o.nome(g), [...linhasDist(distribuicao(g)), "clique para fixar"]); });
      item.addEventListener("focus", () => { if (!fixo) destacar(tocaCat(g)); });
      item.addEventListener("blur", () => { if (!fixo) destacar(null); });
      const fixarCat = () => { Lab.esconderDica(); fixar(`c|${g}`, tocaCat(g), { titulo: o.nome(g), filtro: (s) => s.includes(g) }); };
      item.addEventListener("click", fixarCat);
      item.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fixarCat(); } });
    });
    if (escAtual) removeEventListener("keydown", escAtual);
    escAtual = (ev) => { if (ev.key === "Escape" && fixo) fixar(null); };
    addEventListener("keydown", escAtual);
    alvo.append(painel);                          // card da distribuição fixada, logo abaixo do desenho (como no mapa)
    if (legendas[1]) alvo.append(legendas[1]);   // legenda do último lado, abaixo do diagrama
    alvo.append(o.nota ? el("p", { class: "nota", text: o.nota }) : "", caixaLista);
  };
})();
