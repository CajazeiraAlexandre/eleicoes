/* app.js — Locais de votação: abstenção e votos para Presidente por local, 1º turno de 2026 × 2022.
 * Derivado da seção de locais do Mapa da virada. Os totais de cada local chegam prontos da base Python
 * (projetos/eleicoes/analise/preparar_locais_votacao.py: válidos EL0003, grupos EL0008, mesmo local EL0009);
 * aqui só se divide (percentual), subtrai, ordena e desenha. Nada é estimado: local sem par em 2022 = "—".
 * Escalas de cor marcadas com PROPOSTA dependem de validação do pesquisador. */
(async function () {
  "use strict";
  const { el, placar, instrucao, seletorTitulo, fmtInt, fmtPct, fmtPP } = Lab;
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const base = await Lab.decodificar($("#dados").textContent.trim());
  Lab.configurar({ raiz: app, autor: "__AUTOR__", orgaos: { tse: "TSE" }, artigos: { TSE: "do TSE" } });

  /** 100 · parte / total; null se faltar dado ou o total for 0 (espelha preparar_mapa_virada.percentual). */
  const percentual = (parte, total) => (parte === null || parte === undefined || !total ? null : (100 * parte) / total);
  /** Quantil tipo 7 (espelha preparar_mapa_virada.quantil). */
  function quantil(valores, q) {
    const v = valores.filter((a) => a !== null && a !== undefined).sort((p, s) => p - s);
    if (!v.length) return null;
    const h = (v.length - 1) * q, lo = Math.floor(h);
    return v[lo] + (h - lo) * (v[Math.min(lo + 1, v.length - 1)] - v[lo]);
  }
  const BL = base.blocos;                                   // [{id, nome, sem_2022}]
  const corDe = (id) => Lab.token(id === "abst" ? "cor-abstencao" : `cg-${id}`);
  const nomeDe = (id) => (id === "abst" ? "Abstenção" : id === "turno" ? "2º turno de 2022" : BL.find((b) => b.id === id).nome);
  const semPar2022 = (id) => id !== "abst" && id !== "turno" && BL.find((b) => b.id === id).sem_2022;
  const NOMES_UF = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins" };
  const TIPO_LOCAL = { C: "", T: "local temporário", P: "presos provisórios", V: "voto em trânsito" };
  const PAR = { nome: "mesmo local em 2022 (nome)", distancia: "mesmo local em 2022 (até 100 m)", sem_par: "sem par em 2022 (mesmo número, outro local)",
    sem_chave: "sem par em 2022 (local novo)", especial: "local especial, sem comparação" };
  // |v| < 0,05 p.p. arredonda para zero: mostra "0,0", sem sinal (evita "−0,0")
  const fmtDif = (v) => (v === null ? "—" : Math.abs(v) < 0.05 ? "0,0" : Lab.comSinal(v, fmtPP).replace(" p.p.", ""));

  // ---------------------------------------------------------- estado (no endereço: o link reproduz a vista)
  const est = { mun: "", area: "", fundo: "nada", aba: "resumo", persp: "lula", tam: "fixo", evm: "pct", lente: "abst", modo: "var", forma: "bolhas", ordem: "aptos", dir: "desc" };
  try { const p = new URLSearchParams(location.hash.slice(1)); for (const k of Object.keys(est)) if (p.has(k)) est[k] = p.get(k); } catch (erro) { /* padrão */ }
  const MUN = new Map(base.municipios.map(([c, n, uf]) => [c, { nome: n, uf, rotulo: `${n} (${uf})` }]));
  if (!MUN.has(est.mun)) est.mun = "";
  if (!["lula", "flavio"].includes(est.persp)) est.persp = "lula";
  // abas: cada uma mostra uma parte (menos rolagem no celular); o endereço guarda a aba (#mun=…&aba=tabela)
  const ABAS = [["resumo", "Resumo"], ["disputa", "Votos em disputa"], ["turnos", "1º → 2º turno"], ["mapa", "Mapa"], ["tabela", "Tabela"]];
  if (!ABAS.some(([k]) => k === est.aba)) est.aba = "resumo";     // só as candidaturas que disputaram o 2º turno
  const atualizar = (m) => { Object.assign(est, m); history.replaceState(null, "", `#${new URLSearchParams(est)}`); render(); };

  // ---------------------------------------------------------- escolha da cidade
  const campo = $("#f-municipio");
  $("#lista-municipios").replaceChildren(...base.municipios.map(([, n, uf]) => el("option", { value: `${n} (${uf})` })));
  // bairro (como está no cadastro do TSE) ou zona eleitoral: filtra as vistas por local; os números da cidade não mudam
  const campoArea = $("#f-area");
  const chaveArea = (o) => [`b:${o.bairro.trim().toUpperCase()}`, `z:${o.zona}`];
  const rotuloArea = (a) => (!a ? "" : a.startsWith("z:") ? `Zona eleitoral ${a.slice(2)}` : a.slice(2));
  const naArea = (o) => !est.area || chaveArea(o).includes(est.area);
  let opcoesArea = [];
  campoArea.addEventListener("change", () => {
    const v = campoArea.value.trim().toLowerCase();
    if (!v) { if (est.area) atualizar({ area: "" }); return; }
    const hit = opcoesArea.find(([, txt]) => txt.toLowerCase() === v);
    if (!hit) { campoArea.setCustomValidity("Escolha um bairro ou uma zona da lista."); campoArea.reportValidity(); return; }
    campoArea.setCustomValidity("");
    if (hit[0] !== est.area) atualizar({ area: hit[0] });
  });
  campoArea.addEventListener("search", () => { if (!campoArea.value.trim() && est.area) atualizar({ area: "" }); });
  function prepararAreas(L) {
    const n = new Map();
    for (const o of L) for (const a of chaveArea(o)) n.set(a, (n.get(a) || 0) + 1);
    opcoesArea = [...n].map(([a, k]) => [a, `${rotuloArea(a)} (${a.startsWith("z:") ? "zona" : "bairro"} · ${k} ${k === 1 ? "local" : "locais"})`])
      .sort((x, y) => (x[0][0] === y[0][0] ? (x[0][0] === "z" ? +x[0].slice(2) - +y[0].slice(2) : x[1].localeCompare(y[1])) : x[0] < y[0] ? -1 : 1));
    $("#lista-areas").replaceChildren(...opcoesArea.map(([, txt]) => el("option", { value: txt })));
    if (est.area && !n.has(est.area)) est.area = "";
    campoArea.value = est.area ? opcoesArea.find(([a]) => a === est.area)?.[1] ?? "" : "";
  }
  campo.addEventListener("change", () => {
    const v = campo.value.trim().toLowerCase();
    if (!v) return;
    const hit = base.municipios.find(([, n, uf]) => `${n} (${uf})`.toLowerCase() === v);
    if (!hit) { campo.setCustomValidity("Escolha uma cidade da lista."); campo.reportValidity(); return; }
    campo.setCustomValidity("");
    if (hit[0] !== est.mun) atualizar({ mun: hit[0], area: "" });
  });

  // ---------------------------------------------------------- dados do município (data/locais/<IBGE>.js, sob demanda)
  const carregados = new Map();
  let formaAnterior = null;      // para a transição Pontos ⇄ Bolhas (design.yaml › padroes.mapa_transicao)
  function carregar(ibge) {
    if (!carregados.has(ibge)) carregados.set(ibge, new Promise((ok, falha) => {
      const s = el("script", { src: `data/locais/${ibge}.js` });
      s.onload = () => (typeof window.LOCAIS_PRESIDENTE?.[ibge] === "string" ? Lab.decodificar(window.LOCAIS_PRESIDENTE[ibge]).then(ok, falha) : falha(new Error("arquivo sem dados")));
      s.onerror = () => { carregados.delete(ibge); falha(new Error(`data/locais/${ibge}.js não encontrado`)); };
      document.head.append(s);
    }));
    return carregados.get(ibge);
  }
  /** Totais [aptos, abstenções, válidos, blocos…] → objeto; null continua null. */
  const objTotais = (d, t) => (t ? Object.fromEntries(d.totais.map((k, i) => [k, t[i]])) : null);
  /** Medidas de uma linha (local ou total): % e variação de cada bloco e da abstenção. */
  function medidas(t26, t22) {
    const m = { aptos: t26.aptos, abstencoes: t26.abstencoes, validos: t26.validos };
    m.abst = percentual(t26.abstencoes, t26.aptos);
    m.abst0 = t22 ? percentual(t22.abstencoes, t22.aptos) : null;
    m.abst_dif = m.abst !== null && m.abst0 !== null ? m.abst - m.abst0 : null;
    for (const b of BL) {
      m[`${b.id}_votos`] = t26[b.id];
      m[b.id] = percentual(t26[b.id], t26.validos);
      m[`${b.id}0`] = t22 && !b.sem_2022 ? percentual(t22[b.id], t22.validos) : null;
      m[`${b.id}_dif`] = m[b.id] !== null && m[`${b.id}0`] !== null ? m[b.id] - m[`${b.id}0`] : null;
    }
    return m;
  }
  function linhasDe(d) {
    return d.l.map((r) => {
      const o = Object.fromEntries(d.campos.map((c, i) => [c, r[i]]));
      const turno = o.turnos2022 ? saldoEntreTurnos(objCampos(d.turnos, o.turnos2022), "lula") : null;
      return { ...o, ...medidas(objTotais(d, o.t2026), objTotais(d, o.t2022)), turno, fatia2t: turno?.fatia ?? null };
    });
  }

  // ---------------------------------------------------------- escalas (PROPOSTA — validar)
  const superficie = () => Lab.token("cor-superficie");
  function escalaQuintis(valores, cor) {
    const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => quantil(valores, q));
    const cores = [0.18, 0.38, 0.58, 0.78, 1].map((t) => d3.interpolateLab(superficie(), cor)(t));
    return { cortes, cores, cor: (v) => (v === null ? null : cores[d3.bisectRight(cortes, v)]) };
  }
  /** Variação em p.p.: queda em cinza, alta na cor da lente; faixa neutra no meio. */
  function escalaVariacao(cor, cortes) {
    const cinza = Lab.token("cor-texto-secundario");
    const cores = [0.95, 0.6, 0.3].map((t) => d3.interpolateLab(superficie(), cinza)(t))
      .concat([Lab.token("cor-div-4")], [0.3, 0.6, 0.95].map((t) => d3.interpolateLab(superficie(), cor)(t)));
    return { cortes, cores, cor: (v) => (v === null ? null : cores[d3.bisectRight(cortes, v)]) };
  }
  const CORTES = { abst: [-6, -3, -1, 1, 3, 6], voto: [-10, -5, -2, 2, 5, 10] };

  // ---------------------------------------------------------- mapa de pontos / bolhas
  /** Cartão do local tocado/clicado, logo abaixo do gráfico (no celular a dica flutuante é ilegível; padrão do DS:
   *  "card perto do toque"). O toque procura o local mais próximo (até ~22 px na tela), porque bolhas pequenas são
   *  alvos difíceis. */
  function cartaoLocal(alvo) {
    const painel = el("div", { class: "painel-sel cartao-local", "aria-live": "polite", hidden: "" });
    alvo.append(painel);
    let marcado = null;
    const fechar = () => { painel.hidden = true; marcado?.classList.remove("sel"); marcado = null; };
    return {
      painel,
      fechar,
      mostrar(titulo, linhas, elemento) {
        Lab.esconderDica();
        marcado?.classList.remove("sel");
        marcado = elemento; elemento?.classList.add("sel");
        painel.replaceChildren(el("b", { text: titulo }), ...linhas.filter(Boolean).map((t) => el("span", { text: t })),
          el("div", { class: "acoes-sel" }, el("button", { type: "button", class: "voltar", text: "Fechar", onclick: fechar })));
        painel.hidden = false;
        if (painel.getBoundingClientRect().bottom > innerHeight) painel.scrollIntoView({ block: "nearest", behavior: Lab.semMovimento() ? "auto" : "smooth" });
      },
    };
  }
  /** Ponto mais próximo do toque/clique, em unidades do desenho (raioTela: tolerância em px na tela). */
  function maisProximo(ev, camada, svgEl, itens, x, y, larguraDesenho, k = 1, raioTela = 22) {
    const [mx, my] = d3.pointer(ev, camada);
    const tol = (raioTela * larguraDesenho) / (svgEl.clientWidth || larguraDesenho) / k;
    let melhor = null, dm = Infinity;
    for (const it of itens) { const dd = Math.hypot(x(it) - mx, y(it) - my); if (dd < dm) { dm = dd; melhor = it; } }
    return melhor && dm <= tol + (melhor.r || 0) ? melhor : null;
  }
  function blocoMapa(d, L, fixa = null, Lref = L) {      // Lref: locais da cidade (classes de cor não mudam com o filtro de área)
    const lente = fixa || est.lente, turno = lente === "turno", variacao = !turno && est.modo === "var" && !semPar2022(lente);
    const valor = (o) => (turno ? o.fatia2t : variacao ? o[`${lente}_dif`] : o[lente]);
    const qtd = (o) => (turno ? Math.max(0, o.turno?.outros_1t ?? 0) : lente === "abst" ? o.abstencoes : o[`${lente}_votos`]);
    const fmt = turno ? (v) => `Lula ficou com ${fmtPct(v)} do ganho` : variacao ? (v) => Lab.comSinal(v, fmtPP) : fmtPct;
    const cortes = lente === "abst" ? CORTES.abst : CORTES.voto;
    const esc = turno ? escalaFatia("lula") : variacao ? escalaVariacao(corDe(lente), cortes) : escalaQuintis(Lref.filter((o) => o.tipo === "C").map(valor), corDe(lente));
    const fmtC = (v) => fmtPP(v).replace(/,0(?=\D|$)/, "");
    const legenda = turno ? Lab.legendaTres(esc.cores, "Bolsonaro ficou com 65% ou mais", "45 a 55%", "Lula ficou com 65% ou mais")
      : variacao ? Lab.legendaTres(esc.cores, `queda de ${fmtC(-cortes[0])} ou mais`, `${fmtC(cortes[2])} a +${fmtC(cortes[3])}`, `alta de ${fmtC(cortes[5])} ou mais`)
      : Lab.legendaRampa(esc.cores, `≤ ${fmtPct(esc.cortes[0])}`, `> ${fmtPct(esc.cortes[3])}`);
    const unidade = lente === "abst" ? "% dos aptos" : "% dos votos válidos";
    const sec = el("section", { id: "mapa-bloco", "aria-labelledby": "t-mapa" });
    const LENTES_MAPA = [["abst", "abstenção"], ...BL.map((b) => [b.id, b.nome]), ["turno", "2º turno de 2022"]];
    sec.append(fixa ? el("h3", { id: "t-mapa", text: `Onde, ${est.area ? `em ${rotuloArea(est.area)}` : "na cidade"}, o ganho do 2º turno de 2022 foi para cada lado` })
      : el("h2", { id: "t-mapa" }, "Mapa: ", seletorTitulo("Lente", LENTES_MAPA, lente, (v) => atualizar({ lente: v }))),
      el("p", { class: "lendo" }, ...(turno ? [] : [seletorTitulo("Medida", [["2026", "em 2026"], ...(semPar2022(lente) ? [] : [["var", "variação desde 2022"]])], variacao ? "var" : "2026", (v) => atualizar({ modo: v })), " · "]),
        seletorTitulo("Forma", [["bolhas", "bolhas"], ["pontos", "pontos"]], est.forma, (v) => atualizar({ forma: v })),
        " · fundo: ", seletorTitulo("Fundo", [["nada", "sem fundo"], ["ruas", "ruas"]], est.fundo === "ruas" ? "ruas" : "nada", (v) => atualizar({ fundo: v }))),
      el("p", { class: "lendo", text: turno ? "Cor: com quem ficou o ganho de votos do local entre o 1º e o 2º turno de 2022 (Lula × Jair Bolsonaro) · tamanho: votos das outras candidaturas no 1º turno"
        : `${nomeDe(lente)} · ${variacao ? `2026 menos 2022 no mesmo local, em pontos percentuais (${unidade})` : `Presidente · 1º turno de 2026 · ${unidade}`}` }),
      instrucao(turno ? "Vermelho: Lula ficou com a maior parte do que as duas candidaturas ganharam no local entre os turnos; azul: Jair Bolsonaro. Cinza médio: dividido (45 a 55%). Círculo tracejado: sem ganho somado ou local sem par em 2022 (os locais são os de 2026, ligados aos de 2022 pelo EL0009)."
        : variacao ? "Cinza: caiu no local; cor da lente: subiu. A faixa clara do meio indica estabilidade. Círculo tracejado: local sem par em 2022."
        : "Cinco classes com o mesmo número de locais (quintis entre os locais convencionais da cidade): a cor mostra a posição relativa entre os locais, não um patamar fixo.",
        est.forma === "bolhas" ? `Bolhas: área proporcional a ${turno ? "votos das outras candidaturas no 1º turno de 2022" : lente === "abst" ? "abstenções" : `votos de ${nomeDe(lente)}`}. Pontos: um ponto do mesmo tamanho por local.` : "Pontos: um ponto do mesmo tamanho por local.",
        !turno && semPar2022(lente) ? `${nomeDe(lente)}: o grupo não teve candidatura presidencial em 2022, por isso não há variação.` : null,
        "Passe o mouse (ou toque) num local para ver todos os números. Relação entre lugares não descreve o voto de pessoas."));
    const noMapa = L.filter((o) => o.coord === "ok");
    const W = 560, H = 520, bolhas = est.forma === "bolhas";
    const fc = { type: "FeatureCollection", features: [...(d.contorno ? [{ type: "Feature", geometry: d.contorno }] : []),
      ...noMapa.map((o) => ({ type: "Feature", geometry: { type: "Point", coordinates: [o.lon, o.lat] } }))] };
    // com bairro/zona, o mapa enquadra só os locais da área (mínimo de ~1 km de lado, para um único local)
    let alvoFit = fc;
    if (est.area && noMapa.length) {
      const [lo0, lo1] = d3.extent(noMapa, (o) => o.lon), [la0, la1] = d3.extent(noMapa, (o) => o.lat);
      const m = Math.max(0.005, (lo1 - lo0) * 0.08, (la1 - la0) * 0.08);
      alvoFit = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[lo0 - m, la0 - m], [lo0 - m, la1 + m], [lo1 + m, la1 + m], [lo1 + m, la0 - m], [lo0 - m, la0 - m]]] } };
    }
    const proj = d3.geoMercator().fitExtent([[14, 14], [W - 14, H - 14]], alvoFit);
    // padrão do projeto (Onde estão os votos?): bolhas = cartograma de Dorling — cada círculo parte da posição real e é
    // afastado o mínimo para não sobrepor; a soma das áreas ocupa 45% da envoltória dos locais, com teto de raio (30 px)
    // e "fora de escala" quando o maior passa de 3× o segundo (L0003)
    const nos = noMapa.map((o) => { const [x, y] = proj([o.lon, o.lat]); return { o, x0: x, y0: y, x, y, r: 0 }; });
    const ea = Lab.escalaArea(nos.map((n) => qtd(n.o) || 0), 1);
    const casco = d3.polygonHull(nos.map((n) => [n.x0, n.y0]));
    const area = Math.max(casco ? Math.abs(d3.polygonArea(casco)) : 0, 0.02 * W * H);
    const total = d3.sum(nos, (n) => Math.min(qtd(n.o) || 0, ea.teto)) || 1;
    const rMax = Math.min(30, Math.sqrt((0.45 * area * (ea.teto || 1)) / (Math.PI * total)));
    const escalaR = d3.scaleSqrt().domain([0, ea.teto || 1]).range([0, rMax]).clamp(true);
    for (const n of nos) { n.r = escalaR(qtd(n.o) || 0); n.fora = ea.fora(qtd(n.o) || 0); }
    const anterior = formaAnterior; formaAnterior = est.forma;
    const animar = anterior && anterior !== est.forma && !Lab.semMovimento();
    if (bolhas || animar) {
      const sim = d3.forceSimulation(nos).force("x", d3.forceX((n) => n.x0).strength(0.2)).force("y", d3.forceY((n) => n.y0).strength(0.2))
        .force("colisao", d3.forceCollide((n) => (n.r > 0 ? n.r + 0.8 : 0)).iterations(3)).stop();
      for (let i = 0; i < 300; i++) sim.tick();
    }
    const raioPonto = nos.length > 400 ? 2.6 : nos.length > 80 ? 3.6 : 5;
    const cartao = el("div", { class: "cartao" });
    const moldura = el("div", { class: "mapa-moldura" });
    moldura.style.position = "relative"; moldura.style.maxWidth = "560px";
    const svg0 = d3.select(moldura).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "mapa mapa-locais").attr("role", "img")
      .attr("aria-label", `Mapa dos ${noMapa.length} locais de votação: ${nomeDe(lente)}, ${variacao ? "variação desde 2022" : "2026"}. A tabela abaixo traz os mesmos dados.`)
      .style("width", "100%").style("max-width", "560px").style("height", "auto").style("overflow", "hidden");
    // fundo de ruas (opcional, desligado por padrão): tiles do OpenStreetMap na mesma projeção (Web Mercator),
    // recalculados a cada zoom com d3-tile, em cinza e desbotados. A política de uso do OSM exige a origem do pedido
    // (Referer): funciona na página publicada, não aberta por duplo clique (file://). Sem internet, o fundo some.
    const ruasPossivel = location.protocol !== "file:";
    const comRuas = est.fundo === "ruas" && ruasPossivel && typeof d3.tile === "function";
    const camadaRuas = comRuas ? svg0.append("g").attr("class", "ruas") : null;
    let falhasRuas = 0;
    const urlTile = (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const desenharRuas = (t) => {
      if (!comRuas) return;
      const [tx0, ty0] = proj.translate();
      const tiles = d3.tile().size([W, H]).scale(proj.scale() * 2 * Math.PI * t.k).translate([t.x + t.k * tx0, t.y + t.k * ty0])();
      camadaRuas.selectAll("image").data(tiles, (q) => q.join(",")).join((en) => en.append("image")
        .attr("href", ([x, y, z]) => urlTile(x, y, z)).attr("preserveAspectRatio", "none")
        .on("error", function () { this.remove(); if (++falhasRuas === 1) avisoRuas.hidden = false; }))
        .attr("x", ([x]) => (x + tiles.translate[0]) * tiles.scale).attr("y", ([, y]) => (y + tiles.translate[1]) * tiles.scale)
        .attr("width", tiles.scale + 0.5).attr("height", tiles.scale + 0.5);
    };
    const svg = svg0.append("g");      // camada com zoom
    if (d.contorno) svg.append("path").attr("d", d3.geoPath(proj)(d.contorno)).attr("fill", comRuas ? "none" : superficie())
      .attr("stroke", comRuas ? Lab.token("cor-texto-secundario") : Lab.token("cor-eixo")).attr("stroke-width", comRuas ? 1.4 : 0.8);
    const ordem = bolhas ? [...nos].sort((a, b) => b.r - a.r) : [...nos].sort((a, b) => (valor(a.o) ?? -Infinity) - (valor(b.o) ?? -Infinity));
    const circ = svg.append("g").selectAll("circle").data(ordem).join("circle")
      .classed("sem-valor", (n) => valor(n.o) === null).classed("fora-escala", (n) => bolhas && n.fora)
      .attr("fill", (n) => esc.cor(valor(n.o)) ?? "none").attr("stroke", (n) => (valor(n.o) === null ? null : superficie())).attr("stroke-width", 0.7)
      .on("pointermove", (ev, n) => { if (ev.pointerType !== "touch") Lab.mostrarDica(ev, n.o.nome, dica(n.o, lente, variacao, fmt, valor)); })
      .on("pointerleave", Lab.esconderDica);
    const posicao = (sel, b) => sel.attr("cx", (n) => (b ? n.x : n.x0)).attr("cy", (n) => (b ? n.y : n.y0)).attr("r", (n) => (b ? Math.max(n.r, 1.2) : raioPonto));
    if (animar) posicao(circ, !bolhas).call((sel) => posicao(sel.transition().duration(900).ease(d3.easeCubicInOut), bolhas));
    else posicao(circ, bolhas);
    // fora de escala: rótulo na margem esquerda, ligado ao círculo por uma linha (como no Mapa da virada)
    if (bolhas) nos.filter((n) => n.fora).forEach((n, i) => {
      const tx = 10, ty = 18 + i * 34;
      const t = svg.append("text").attr("class", "rotulo-fora").attr("x", tx).attr("y", ty).style("font-size", "11px").style("fill", Lab.token("cor-texto"));
      t.append("tspan").attr("x", tx).text(n.o.nome.length > 34 ? `${n.o.nome.slice(0, 33)}…` : n.o.nome);
      t.append("tspan").attr("x", tx).attr("dy", 13).text(`${fmtInt.format(qtd(n.o))} ${lente === "abst" ? "abstenções" : "votos"} · fora de escala`);
      const x0 = tx + t.node().getBBox().width + 6, x1 = n.x - n.r - 2;
      if (x1 > x0) svg.append("path").attr("d", `M${x0},${ty + 3} L${x1 - 6},${ty + 3} L${x1},${n.y}`).attr("fill", "none").attr("stroke", Lab.token("cor-texto-secundario")).attr("stroke-width", 1);
    });
    // zoom: botões; Ctrl + rolagem (computador) ou dois dedos (celular), para não prender a rolagem da página.
    // Ao aproximar, os círculos crescem menos que o mapa (raio ÷ √zoom), abrindo espaço entre eles.
    const rBase = new Map(nos.map((n) => [n, bolhas ? Math.max(n.r, 1.2) : raioPonto]));
    const zoom = d3.zoom().scaleExtent([1, 16]).translateExtent([[0, 0], [W, H]])
      .filter((ev) => (ev.type === "wheel" ? ev.ctrlKey || ev.metaKey : ev.type.startsWith("touch") ? ev.touches.length > 1 : !ev.button))
      .on("zoom", (ev) => { svg.attr("transform", ev.transform); circ.attr("r", (n) => rBase.get(n) / Math.sqrt(ev.transform.k)); desenharRuas(ev.transform); });
    svg0.call(zoom).on("dblclick.zoom", null);
    desenharRuas(d3.zoomIdentity);
    if (comRuas) circ.attr("stroke-width", 1.1).attr("stroke", (n) => (valor(n.o) === null ? null : Lab.token("cor-texto")));
    const avisoRuas = el("p", { class: "nota", hidden: "", text: "Fundo de ruas indisponível (sem internet ou servidor fora do ar): o mapa segue sem fundo." });
    if (comRuas) moldura.append(el("p", { class: "atribuicao-ruas" }, "© ", el("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener", text: "OpenStreetMap" }),
      " contributors"), avisoRuas);
    if (est.fundo === "ruas" && !ruasPossivel) moldura.append(el("p", { class: "nota", text: "O fundo de ruas (OpenStreetMap) só aparece na página publicada na internet: aberta direto do computador, o serviço recusa os pedidos." }));
    // toque/clique: cartão do local mais próximo abaixo do mapa
    const cartaoM = { ref: null };
    svg0.on("click", (ev) => {
      const k = d3.zoomTransform(svg0.node()).k;
      const n = maisProximo(ev, svg.node(), svg0.node(), nos, (q) => (bolhas ? q.x : q.x0), (q) => (bolhas ? q.y : q.y0), W, k);
      if (!n) { cartaoM.ref?.fechar(); return; }
      cartaoM.ref.mostrar(n.o.nome, dica(n.o, lente, variacao, fmt, valor), circ.filter((q) => q === n).node());
    });
    moldura.append(el("div", { class: "zoom-mapa", role: "group", "aria-label": "Zoom do mapa" },
      el("button", { type: "button", "aria-label": "Aproximar", text: "+", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1.8) }),
      el("button", { type: "button", "aria-label": "Afastar", text: "−", onclick: () => svg0.transition().duration(300).call(zoom.scaleBy, 1 / 1.8) }),
      el("button", { type: "button", class: "tudo", "aria-label": "Ver o mapa inteiro", text: "ver tudo", onclick: () => svg0.transition().duration(300).call(zoom.transform, d3.zoomIdentity) })));
    cartaoM.ref = cartaoLocal(cartao);
    const fora = L.length - noMapa.length;
    cartao.append(moldura, cartaoM.ref.painel, el("div", { class: "legendas-mapa" }, legenda,
      bolhas ? Lab.legendaTamanho(escalaR, turno ? "votos das outras no 1º turno" : lente === "abst" ? "abstenções" : "votos") : "",
      variacao || turno ? el("p", { class: "nota", text: turno ? "Círculo tracejado: sem ganho somado ou sem par em 2022." : "Círculo tracejado: local sem par em 2022." }) : ""),
      Lab.rodape({ fontes: ["tse"], cobertura: `${noMapa.length} de ${L.length} locais no mapa.`,
        nota: [fora ? `${fora} ${fora === 1 ? "local fica" : "locais ficam"} fora do mapa (sem coordenada no cadastro do TSE ou com coordenada fora da cidade) e ${fora === 1 ? "aparece" : "aparecem"} só na tabela; a posição não é estimada.` : null,
          bolhas ? "Bolhas afastadas o mínimo da posição real para não se sobreporem." : null,
          "Zoom: botões + e −, Ctrl + rolagem do mouse ou dois dedos na tela; arraste para mover.",
          bolhas && nos.some((n) => n.fora) ? "Fora de escala (contorno tracejado): a bolha tem o tamanho da segunda maior." : null].filter(Boolean).join(" ") || null }));
    sec.append(cartao);
    return sec;
  }
  function dica(o, lente, variacao, fmt, valor) {
    const ls = [lente === "turno" ? (valor(o) === null ? "2º turno de 2022: sem ganho somado ou sem par" : fmt(valor(o))) : `${nomeDe(lente)} ${variacao ? "(variação)" : "(2026)"}: ${valor(o) === null ? "—" : fmt(valor(o))}`,
      [o.endereco, o.bairro].filter(Boolean).join(" · "),
      `Zona ${o.zona} · local nº ${o.local} · ${o.secoes} ${o.secoes === 1 ? "seção" : "seções"} · ${fmtInt.format(o.aptos)} aptos`];
    for (const b of BL) ls.push(`${b.nome}: ${fmtPct(o[b.id])} (${fmtInt.format(o[`${b.id}_votos`])})${o[`${b.id}_dif`] !== null ? ` · ${Lab.comSinal(o[`${b.id}_dif`], fmtPP)}` : ""}`);
    ls.push(`Abstenção: ${fmtPct(o.abst)} (${fmtInt.format(o.abstencoes)})${o.abst_dif !== null ? ` · ${Lab.comSinal(o.abst_dif, fmtPP)}` : ""}`);
    if (o.turno) ls.push(`2º turno de 2022: outras no 1º turno ${fmtInt.format(o.turno.outros_1t)} → Lula ${Lab.comSinal(o.turno.ganho_pt, (v) => fmtInt.format(v))} · Bolsonaro ${Lab.comSinal(o.turno.ganho_pl, (v) => fmtInt.format(v))}${o.turno.fatia === null ? "" : ` (Lula ficou com ${fmtPct(o.turno.fatia)} do ganho)`}`);
    ls.push(PAR[o.par] + (o.par === "distancia" && o.nome_2022 ? ` — em 2022: “${o.nome_2022}”, a ${o.distancia_2022_m} m` : ""));
    return ls;
  }

  // ---------------------------------------------------------- como a cidade votou (análise rápida)
  // 1) linhas 2018 → 2022 → 2026 (Presidente, 1º turno) em % do eleitorado apto: candidaturas, brancos e nulos e
  //    abstenção na mesma base, somando 100% (base do Mapa da virada, conferida com os totais oficiais);
  // 2) quantos locais com par em 2022 subiram ou caíram, com a mediana da variação. Sem sankey: um fluxo de
  //    eleitores entre eleições exigiria estimar transferências a partir de totais (inferência ecológica).
  const COR_BN = "#c9a47c";      // brancos e nulos: o tom do Mapa da virada (--cor-brancos-nulos)
  /** Soma elemento a elemento (totais de locais). */
  const somar = (linhas) => (linhas.length ? linhas.reduce((a, l) => a.map((v, i) => v + l[i])) : null);
  /** Totais de uma área (bairro/zona): 2026 de todos os locais; 2022 × 2026 só dos locais com par (os mesmos nos dois
   *  anos, EL0009) — por local não há 2018; 1º × 2º turno de 2022 dos locais com par. */
  function agregadosArea(LA) {
    const par = LA.filter((o) => o.t2022);
    return { t26: somar(LA.map((o) => o.t2026)), t26par: somar(par.map((o) => o.t2026)), t22par: somar(par.map((o) => o.t2022)),
      turnos: somar(LA.filter((o) => o.turnos2022).map((o) => o.turnos2022)), nPar: par.length };
  }
  function blocoAnalise(d, L, LA, mun) {
    const ev = base.evolucao, area = est.area ? agregadosArea(LA) : null;
    const linhas = area ? [null, area.t22par, area.t26par] : ev.municipios[est.mun];
    const sec = el("section", { "aria-labelledby": "t-analise" }, el("h2", { id: "t-analise", text: area ? `Como ${rotuloArea(est.area)} votou para Presidente, 2022–2026` : "Como a cidade votou para Presidente, 2018–2026" }));
    if (!linhas || (area && !area.nPar)) { sec.append(el("p", { class: "aviso", text: area ? "Nenhum local desta área tem par em 2022: sem comparação." : "Sem série histórica para esta cidade." })); return sec; }
    // com área não há 2018 (por local só 2022 e 2026): o gráfico começa em 2022
    const i0 = area ? 1 : 0, anosV = ev.anos.slice(i0);
    const T = linhas.slice(i0).map((t) => (t ? Object.fromEntries(ev.campos.map((c, i) => [c, t[i]])) : null));
    const emVotos = est.evm === "votos";
    const medida = (t, v) => (!t ? null : emVotos ? v : percentual(v, t.aptos));
    const fmtM = emVotos ? (v) => fmtInt.format(v) : fmtPct;
    const series = [
      ...BL.map((b) => ({ id: b.id, rotulo: b.nome, cor: corDe(b.id),
        valores: T.map((t, i) => (ev.sem_candidatura[anosV[i]].includes(b.id) ? null : medida(t, t?.[b.id]))), n: T.map((t) => t?.[b.id]), p: T.map((t) => (t ? percentual(t[b.id], t.aptos) : null)) })),
      { id: "bn", rotulo: "Brancos e nulos", cor: COR_BN, tracejado: true, valores: T.map((t) => medida(t, t && t.aptos - t.abstencoes - t.validos)), n: T.map((t) => t && t.aptos - t.abstencoes - t.validos), p: T.map((t) => (t ? percentual(t.aptos - t.abstencoes - t.validos, t.aptos) : null)) },
      { id: "abst", rotulo: "Abstenção", cor: corDe("abst"), tracejado: true, valores: T.map((t) => medida(t, t?.abstencoes)), n: T.map((t) => t?.abstencoes), p: T.map((t) => (t ? percentual(t.abstencoes, t.aptos) : null)) }];
    for (const sr of series) sr.dicas = anosV.map((a, i) => [`${sr.rotulo} · ${a}`, sr.valores[i] === null ? ["sem candidatura do grupo"] : [`${fmtPct(sr.p[i])} do eleitorado apto`, `${fmtInt.format(sr.n[i])} ${sr.id === "abst" ? "abstenções" : "votos"}`]]);
    const cartao = el("div", { class: "cartao" }, el("h3", {}, "Evolução no 1º turno, em ",
      seletorTitulo("Medida da evolução", [["pct", "% do eleitorado apto"], ["votos", "votos"]], emVotos ? "votos" : "pct", (v) => atualizar({ evm: v }))));
    const alvo = el("div");
    cartao.append(alvo);
    // folga abaixo de zero (o gráfico não tem eixo y): espaço para os rótulos das séries pequenas, que o componente
    // empurra para baixo para não se sobreporem (13 px cada)
    const maxV = d3.max(series.flatMap((x) => x.valores).filter((v) => v !== null)) || 1;
    const topo = emVotos ? d3.nice(0, maxV, 5)[1] : Math.ceil(maxV / 10) * 10;
    Lab.linhasPontas(alvo, { pontas: anosV, series, fmt: fmtM, largura: 620, dominio: [-topo * 0.16, topo], legenda: true,
      aria: `Linhas de ${anosV.join(", ").replace(/, (?=[^,]*$)/, " e ")} em ${area ? `${rotuloArea(est.area)} (${mun.rotulo}), locais com par em 2022` : mun.rotulo}, em ${emVotos ? "votos" : "% do eleitorado apto"}: ${series.map((sr) => `${sr.rotulo} ${sr.valores.map((v) => (v === null ? "—" : fmtM(v))).join(", ")}`).join("; ")}.` });
    // celular: "Flávio Bolsonaro" em duas linhas no rótulo direto (pedido do pesquisador)
    if (Lab.estreito()) alvo.querySelectorAll("svg text").forEach((t) => {
      const m = t.textContent.match(/^(.*) (Bolsonaro)$/);
      if (!m) return;
      const x = t.getAttribute("x");
      t.textContent = "";
      d3.select(t).append("tspan").attr("x", x).text(m[1]);
      d3.select(t).append("tspan").attr("x", x).attr("dy", 12).text(m[2]);
    });
    cartao.append(el("p", { class: "nota", text: "Passe o mouse (ou toque) numa linha ou num nome da legenda para destacá-la; tocar no nome fixa o destaque." }),
      el("details", { class: "info" }, el("summary", {}, "Ver em tabela"), Lab.tabela(["", ...anosV.flatMap((a) => [`${a} (%)`, `${a} (votos)`])],
        series.map((sr) => [sr.rotulo, ...anosV.flatMap((a, i) => (sr.valores[i] === null ? ["—", "—"] : [fmtPct(sr.p[i]), fmtInt.format(sr.n[i])]))]))),
      Lab.rodape({ fontes: ["tse"], nota: (area ? `${rotuloArea(est.area)}: soma dos ${area.nPar} locais com par em 2022 (os mesmos locais nos dois anos, EL0009); por local não há 2018. ` : "") + "Grupos de 2026 aplicados às eleições anteriores pelos partidos que os formam hoje (EL0008): em 2018 e 2022, o grupo de Lula reúne PT e aliados (com o PDT de Ciro Gomes) e o de Flávio Bolsonaro é o PL/PSL de Jair Bolsonaro; Augusto Cury e Renan Santos não tinham candidatura. Brancos e nulos inclui votos anulados. Linhas tracejadas: não são candidaturas." }));
    // quadro: locais com par em 2022 que subiram ou caíram
    const comPar = LA.filter((o) => o.abst_dif !== null);
    const itens = [...BL.filter((b) => !b.sem_2022).map((b) => [b.nome, `${b.id}_dif`, "dos válidos"]), ["Abstenção", "abst_dif", "dos aptos"]];
    const quadro = el("div", { class: "cartao" }, el("h3", { text: "De 2022 para 2026, local a local" }),
      el("p", { class: "nota", text: `${area ? `${rotuloArea(est.area)}: ` : ""}${fmtInt.format(comPar.length)} de ${fmtInt.format(LA.length)} locais têm par em 2022 (mesmo local). Variação em pontos percentuais.` }),
      el("div", { class: "rolagem" }, Lab.tabela(["", "Subiu em", "Caiu em", "Variação mediana"], itens.map(([nome, k, un]) => {
        const nLoc = (n) => `${fmtInt.format(n)} ${n === 1 ? "local" : "locais"}`;
        const vs = comPar.map((o) => o[k]).filter((v) => v !== null);
        return [nome, nLoc(vs.filter((v) => v > 0).length), nLoc(vs.filter((v) => v < 0).length), vs.length ? `${Lab.comSinal(quantil(vs, 0.5), fmtPP)} ${un}` : "—"];
      }))),
      Lab.rodape({ fontes: ["tse"], nota: "Mesmo local pelo EL0009. Locais especiais e sem par ficam fora. Variação de um lugar, não de pessoas: o eleitorado do local muda entre eleições." }));
    // chamada para a aba "Entre turnos" (o histórico do 2º turno tem aba própria)
    const t22 = (base.evolucao.turnos.municipios[est.mun] || [])[1];
    const s22 = t22 ? saldoEntreTurnos(objCampos(base.evolucao.turnos.campos, t22), "lula") : null;
    const sA = area?.turnos ? saldoEntreTurnos(objCampos(base.evolucao.turnos.campos, area.turnos), "lula") : null;
    const sBr = saldoEntreTurnos(objCampos(base.evolucao.turnos.campos, base.evolucao.turnos.brasil[1]), "lula");
    const quadroT = el("div", { class: "cartao chamada" },
      el("p", {}, el("b", { text: "E no 2º turno? " }), sA?.fatia != null
        ? `Em 2022, do que Lula e Jair Bolsonaro ganharam entre o 1º e o 2º turno em ${rotuloArea(est.area)}, Lula ficou com ${fmtPct(sA.fatia)} (na cidade, ${s22?.fatia != null ? fmtPct(s22.fatia) : "—"}; no Brasil, ${fmtPct(sBr.fatia)}).`
        : s22?.fatia != null
        ? `Em 2022, do que Lula e Jair Bolsonaro ganharam entre o 1º e o 2º turno em ${mun.nome}, Lula ficou com ${fmtPct(s22.fatia)} (no Brasil, ${fmtPct(sBr.fatia)}).`
        : "Veja como os votos se moveram entre o 1º e o 2º turno de 2018 e 2022."),
      el("button", { type: "button", class: "ir-aba", text: "Ver mudanças do 1º para o 2º turno →", onclick: () => irAba("turnos") }));
    sec.append(el("div", { class: "grade-analise" }, cartao, quadro), quadroT);
    return sec;
  }

  // ---------------------------------------------------------- onde há mais votos em disputa (dispersão)
  // Mesma conta para qualquer candidatura (regra simétrica aprovada no Mapa da virada); a página abre em Lula.
  const DISPUTA_PRINCIPAL = ["lula", "flavio"];
  /** Espelha preparar_locais_votacao.votos_em_disputa: abstenções + brancos/nulos + votos fora da disputa principal
   *  (sem o próprio grupo); perdas desde 2022 à parte (podem ser as mesmas pessoas). */
  function votosEmDisputa(t26, grupo, t22 = null) {
    const outras = BL.map((b) => b.id).filter((b) => !DISPUTA_PRINCIPAL.includes(b) && b !== grupo).reduce((a, b) => a + t26[b], 0);
    const bn = t26.aptos - t26.abstencoes - t26.validos;
    return { abstencoes: t26.abstencoes, brancos_nulos: bn, outras, disputa: t26.abstencoes + bn + outras,
      perdas: t22 === null ? null : Math.max(0, t22[grupo] - t26[grupo]) };
  }
  /** Espelha preparar_locais_votacao.saldo_entre_turnos: saldo líquido do 1º para o 2º turno num lugar, por
   *  candidatura (PT × PSL/PL); fatia = ganho da candidatura / soma dos dois ganhos (null se a soma não for positiva). */
  function saldoEntreTurnos(t, grupo) {
    if (!DISPUTA_PRINCIPAL.includes(grupo)) return null;
    const gPt = t.pt_2t - t.pt_1t, gPl = t.pl_2t - t.pl_1t;
    const bn = (s_) => t[`aptos_${s_}`] - t[`abstencoes_${s_}`] - t[`validos_${s_}`];
    const proprio = grupo === "lula" ? gPt : gPl;
    return { outros_1t: t.validos_1t - t.pt_1t - t.pl_1t, ganho_pt: gPt, ganho_pl: gPl, brancos_nulos: bn("2t") - bn("1t"),
      abstencoes: t.abstencoes_2t - t.abstencoes_1t, fatia: gPt + gPl > 0 ? (100 * proprio) / (gPt + gPl) : null };
  }
  const objCampos = (campos, t) => (t ? Object.fromEntries(campos.map((k, i) => [k, t[i]])) : null);
  /** Fatia do ganho no 2º turno de 2022: cor do adversário abaixo de 50%, da candidatura acima; faixa neutra 45–55%. PROPOSTA. */
  const CORTES_FATIA = [35, 45, 55, 65];
  function escalaFatia(g) {
    const adv = corDe(g === "lula" ? "flavio" : "lula"), propria = corDe(g);
    const cores = [d3.interpolateLab(superficie(), adv)(0.95), d3.interpolateLab(superficie(), adv)(0.5), d3.interpolateLab(superficie(), Lab.token("cor-texto-secundario"))(0.55),
      d3.interpolateLab(superficie(), propria)(0.5), d3.interpolateLab(superficie(), propria)(0.95)];
    return { cores, cor: (v) => (v === null ? null : cores[d3.bisectRight(CORTES_FATIA, v)]) };
  }
  function blocoDisputa(d, L, mun) {
    const g = est.persp, nome = nomeDe(g), semX = semPar2022(g);
    const sec = el("section", { "aria-labelledby": "t-disputa" });
    sec.append(el("h2", { id: "t-disputa" }, "Onde há mais votos em disputa: ", seletorTitulo("Candidatura", BL.filter((b) => DISPUTA_PRINCIPAL.includes(b.id)).map((b) => [b.id, b.nome]), g, (v) => atualizar({ persp: v }))),
      el("p", { class: "lendo", text: "Votos em disputa = eleitores do local que, no 1º turno de 2026, não votaram em Lula nem em Flávio Bolsonaro: os que não compareceram (abstenção), os que votaram em branco ou nulo e os que votaram nas demais candidaturas (Augusto Cury, Renan Santos, Ronaldo Caiado e outras). É o eleitorado que as duas candidaturas do 2º turno podem disputar." }));
    const P = L.filter((o) => o.tipo === "C").map((o) => {
      const t22 = o.t2022 ? objTotais(d, o.t2022) : null;
      const v = votosEmDisputa(objTotais(d, o.t2026), g, t22 && !semX ? t22 : null);
      const tt = objCampos(d.turnos, o.turnos2022);
      return { o, ...v, x: semX ? o[g] : o[`${g}_dif`], turno: tt ? saldoEntreTurnos(tt, g) : null };
    }).filter((p) => p.x !== null);
    const medY = quantil(P.map((p) => p.disputa), 0.5);
    // destaque: abaixo de 2022 (ou abaixo da mediana do grupo, sem 2022) e acima da mediana de votos em disputa
    const medX = semX ? quantil(P.map((p) => p.x), 0.5) : 0;
    const dest = (p) => p.x < medX && p.disputa >= medY;
    // com bairro/zona: as linhas de referência continuam as da cidade; os locais da área ficam em primeiro plano
    const naA = (p) => naArea(p.o);
    const D = P.filter((p) => dest(p) && naA(p)).sort((a, b) => b.disputa - a.disputa);
    const tot = d3.sum(P, (p) => p.disputa);
    const PA = P.filter(naA);
    sec.append(placar(`${est.area ? `${rotuloArea(est.area)} — ` : ""}${fmtInt.format(D.length)} de ${fmtInt.format(PA.length)} locais ${semX ? `com ${nome} abaixo da mediana da cidade` : `onde ${nome} perdeu participação desde 2022`} e com votos em disputa acima da mediana ${est.area ? "da cidade " : ""}(${fmtInt.format(Math.round(medY))}). Somam ${fmtInt.format(d3.sum(D, (p) => p.disputa))} dos ${fmtInt.format(est.area ? d3.sum(PA, (p) => p.disputa) : tot)} votos em disputa ${est.area ? "da área" : "da cidade"}.`
      + (DISPUTA_PRINCIPAL.includes(g) ? ` Em ${fmtInt.format(D.filter((p) => (p.turno?.fatia ?? -1) > 50).length)} deles, ${g === "lula" ? "Lula" : "Bolsonaro"} ficou com mais da metade do ganho de votos no 2º turno de 2022.` : "")),
      instrucao("Votos em disputa = abstenções + brancos e nulos + votos em candidaturas fora da disputa principal (Lula × Flávio Bolsonaro), sem as da candidatura escolhida. A conta é a mesma para qualquer candidatura.",
        semX ? `${nome}: o grupo não teve candidatura em 2022; o eixo horizontal mostra o % dos válidos em 2026, e o destaque é abaixo da mediana dos locais.`
          : `Eixo horizontal: variação de ${nome} desde 2022 no mesmo local (p.p. dos válidos). Os votos perdidos desde 2022 aparecem na dica, à parte: podem ser as mesmas pessoas que hoje se abstêm ou votam em outra candidatura, por isso não entram na soma.`,
        "Em destaque: locais à esquerda da linha vertical e acima da linha horizontal (mediana dos votos em disputa); os demais ficam em cinza claro. Os cinco com mais votos em disputa têm o nome no gráfico.",
        DISPUTA_PRINCIPAL.includes(g) ? "Cor (Lula e Flávio Bolsonaro): no 2º turno de 2022, quanto do ganho de votos do local, entre o 1º e o 2º turno, ficou com cada candidatura (Lula × Jair Bolsonaro, PL). É o saldo do local, não o voto de pessoas; mostra para onde os votos em disputa foram da última vez, não para onde irão." : null,
        "Locais especiais e, na variação, locais sem par em 2022 ficam fora. Relação entre lugares não descreve o voto de pessoas."));
    const cartao = el("div", { class: "cartao" });
    const est_ = Lab.estreito(), W = Lab.largura(760), H = est_ ? 360 : 420, mg = { t: 16, r: 16, b: 44, l: 64 };
    const xs = P.map((p) => p.x), ext = d3.extent(xs);
    const sx = d3.scaleLinear().domain(semX ? [0, ext[1] || 1] : [Math.min(ext[0], -1), Math.max(ext[1], 1)]).nice().range([mg.l, W - mg.r]);
    const sy = d3.scaleLinear().domain([0, d3.max(P, (p) => p.disputa) || 1]).nice().range([H - mg.b, mg.t]);
    const svg = d3.select(cartao).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").attr("role", "img")
      .attr("aria-label", `Dispersão dos ${P.length} locais de ${mun.rotulo}: ${semX ? `% de ${nome} em 2026` : `variação de ${nome} desde 2022`} × votos em disputa. ${D.length} em destaque. A lista abaixo traz os locais.`);
    svg.append("g").attr("transform", `translate(0,${H - mg.b})`).call(d3.axisBottom(sx).ticks(est_ ? 5 : 8).tickFormat((v) => (semX ? `${v}%` : Lab.comSinal(v, (x) => fmtPP(x).replace(" p.p.", "")))))
      .call((g_) => g_.selectAll("text").style("fill", Lab.token("cor-texto-secundario"))).call((g_) => g_.selectAll("line,path").attr("stroke", Lab.token("cor-eixo")));
    svg.append("g").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(sy).ticks(5).tickFormat((v) => fmtInt.format(v)).tickSize(-(W - mg.l - mg.r)))
      .call((g_) => g_.select(".domain").remove()).call((g_) => g_.selectAll("line").attr("stroke", Lab.token("cor-grade")))
      .call((g_) => g_.selectAll("text").style("fill", Lab.token("cor-texto-secundario")));
    svg.append("text").attr("x", W - mg.r).attr("y", H - 8).attr("text-anchor", "end").style("font-size", "12px").style("fill", Lab.token("cor-texto-secundario"))
      .text(semX ? `% de ${nome} em 2026 →` : `← perdeu · variação de ${nome} desde 2022 (p.p.) · ganhou →`);
    svg.append("text").attr("x", mg.l).attr("y", mg.t - 4).style("font-size", "12px").style("fill", Lab.token("cor-texto-secundario")).text("votos em disputa ↑");
    const ref = Lab.token("cor-texto-secundario");
    svg.append("line").attr("x1", sx(medX)).attr("x2", sx(medX)).attr("y1", mg.t).attr("y2", H - mg.b).attr("stroke", ref).attr("stroke-dasharray", "4 3");
    svg.append("line").attr("x1", mg.l).attr("x2", W - mg.r).attr("y1", sy(medY)).attr("y2", sy(medY)).attr("stroke", ref).attr("stroke-dasharray", "4 3");
    const cor = corDe(g), cinza = Lab.token("cor-grade");
    const porTurno = DISPUTA_PRINCIPAL.includes(g);
    const escF = porTurno ? escalaFatia(g) : null;
    const nomeAdv = g === "lula" ? "Bolsonaro" : "Lula";
    const corPonto = (p) => (!dest(p) ? cinza : porTurno ? escF.cor(p.turno?.fatia ?? null) : cor);
    const dicaP = (p) => [`${semX ? `${nome} em 2026` : `Variação de ${nome}`}: ${semX ? fmtPct(p.x) : Lab.comSinal(p.x, fmtPP)}`,
      `Votos em disputa: ${fmtInt.format(p.disputa)} de ${fmtInt.format(p.o.aptos)} aptos (${fmtPct(percentual(p.disputa, p.o.aptos))})`,
      `· abstenções ${fmtInt.format(p.abstencoes)} · brancos e nulos ${fmtInt.format(p.brancos_nulos)} · outras candidaturas ${fmtInt.format(p.outras)}`,
      p.perdas === null ? null : `Votos de ${nome} perdidos desde 2022: ${fmtInt.format(p.perdas)} (à parte)`,
      p.turno ? `2º turno de 2022 no local: Lula ${Lab.comSinal(p.turno.ganho_pt, (v) => fmtInt.format(v))} · Bolsonaro ${Lab.comSinal(p.turno.ganho_pl, (v) => fmtInt.format(v))}${p.turno.fatia === null ? "" : ` → ${g === "lula" ? "Lula" : "Bolsonaro"} ficou com ${fmtPct(p.turno.fatia)} do ganho`}` : null,
      `${nome} em 2026: ${fmtPct(p.o[g])} (${fmtInt.format(p.o[`${g}_votos`])} votos)`, [p.o.endereco, p.o.bairro].filter(Boolean).join(" · ")];
    // tamanho dos círculos: fixo, eleitores aptos ou votos perdidos desde 2022 (área proporcional)
    const TAMANHOS = [["fixo", "fixo"], ["aptos", "eleitores aptos"], ["perdas", `votos perdidos por ${nome} desde 2022`]];
    const tam = TAMANHOS.some(([k]) => k === est.tam) ? est.tam : "fixo";
    const qtdT = (p) => (tam === "aptos" ? p.o.aptos : tam === "perdas" ? p.perdas ?? 0 : 0);
    const eaT = tam === "fixo" ? null : Lab.escalaArea(P.map(qtdT), est_ ? 12 : 16);
    const raio = (p) => (tam === "fixo" ? (est_ ? 4 : 5) : Math.max(2, eaT.s(Math.min(qtdT(p), eaT.teto))));
    svg.append("g").selectAll("circle").data([...P].sort((a, b) => naA(a) - naA(b) || dest(a) - dest(b) || raio(b) - raio(a))).join("circle")
      .attr("opacity", (p) => (naA(p) ? 1 : 0.15))
      .attr("cx", (p) => sx(p.x)).attr("cy", (p) => sy(p.disputa)).attr("r", raio)
      .attr("fill", (p) => corPonto(p) ?? "none").attr("stroke", (p) => (corPonto(p) ? superficie() : Lab.token("cor-texto-secundario"))).attr("stroke-width", 1)

      .on("pointermove", (ev, p) => { if (ev.pointerType !== "touch") Lab.mostrarDica(ev, p.o.nome, dicaP(p)); }).on("pointerleave", Lab.esconderDica);
    const cartaoD = cartaoLocal(cartao);
    svg.on("click", (ev) => {
      const p = maisProximo(ev, svg.node(), svg.node(), P.filter(naA), (q) => sx(q.x), (q) => sy(q.disputa), W);
      if (!p) { cartaoD.fechar(); return; }
      cartaoD.mostrar(p.o.nome, dicaP(p), svg.selectAll("circle").filter((q) => q === p).node());
    });
    // nomes dos cinco com mais votos em disputa entre os destacados (rótulos curtos, com halo)
    const rot = D.slice(0, 5).map((p) => ({ p, x: sx(p.x) + 8, y: sy(p.disputa) + 4 })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < rot.length; k++) if (rot[k].y - rot[k - 1].y < 13) rot[k].y = rot[k - 1].y + 13;
    for (const r of rot) {
      const nm = r.p.o.nome.length > 28 ? `${r.p.o.nome.slice(0, 27)}…` : r.p.o.nome;
      svg.append("text").attr("x", r.x).attr("y", r.y).style("font-size", "11px").style("font-weight", 600).style("fill", Lab.token("cor-texto"))
        .style("paint-order", "stroke").style("stroke", superficie()).style("stroke-width", 3).text(nm);
    }
    cartao.prepend(el("p", { class: "lendo" }, "Tamanho dos círculos: ", seletorTitulo("Tamanho", TAMANHOS, tam, (v) => atualizar({ tam: v }))));
    if (tam !== "fixo") cartao.append(el("div", { class: "legendas-mapa" }, Lab.legendaTamanho(eaT.s, TAMANHOS.find(([k]) => k === tam)[1])));
    if (porTurno) cartao.append(el("div", { class: "legendas-mapa" },
      el("p", { class: "nota", text: `Cor: no 2º turno de 2022, com quem ficou o ganho de votos no local (entre Lula e Bolsonaro). Cinza claro: fora do destaque. Círculo vazio: sem ganho líquido somado.` }),
      Lab.legendaTres(escF.cores, `${nomeAdv} ficou com 65% ou mais`, "45 a 55%", `${g === "lula" ? "Lula" : "Bolsonaro"} ficou com 65% ou mais`)));
    cartao.append(Lab.rodape({ fontes: ["tse"], cobertura: `${P.length} locais convencionais${semX ? "" : " com par em 2022"}.`,
      nota: "Votos em disputa contam eleitores, sem pesos. Perdas desde 2022 ficam fora da soma para não contar a mesma pessoa duas vezes." }));
    // lista dos destacados (também é a tabela alternativa do gráfico)
    cartao.append(el("details", { class: "info" }, el("summary", {}, `Ver os ${fmtInt.format(D.length)} locais em destaque`),
      el("div", { class: "rolagem" }, Lab.tabela(["Local", "Votos em disputa", "Abstenções", "Brancos e nulos", "Outras candidaturas", semX ? `${nome} 2026` : `Variação de ${nome}`, ...(semX ? [] : ["Perdidos desde 2022", "Fatia no 2º turno 2022"])],
        D.map((p) => [[el("b", { text: p.o.nome }), el("br"), el("small", { text: [p.o.endereco, p.o.bairro].filter(Boolean).join(" · ") })],
          fmtInt.format(p.disputa), fmtInt.format(p.abstencoes), fmtInt.format(p.brancos_nulos), fmtInt.format(p.outras),
          semX ? fmtPct(p.x) : Lab.comSinal(p.x, fmtPP), ...(semX ? [] : [fmtInt.format(p.perdas), p.turno?.fatia == null ? "—" : fmtPct(p.turno.fatia)])])))));
    sec.append(cartao);
    return sec;
  }

  // ---------------------------------------------------------- entre turnos (2018 e 2022): cidade × estado × Brasil, mapa e locais
  // Saldo do lugar por candidatura (PT × PSL/PL), não fluxo de eleitores (saldo_entre_turnos; decisão do pesquisador).
  function blocoEntreTurnos(d, L, LA, mun) {
    const tu = base.evolucao.turnos, cps = tu.campos;
    const sec = el("section", { "aria-labelledby": "t-turnos" }, el("h2", { id: "t-turnos", text: "Mudanças do 1º para o 2º turno nas últimas eleições: para onde foram os votos das outras candidaturas" }));
    const agA = est.area ? agregadosArea(LA) : null;
    const lugares = [...(agA ? [[`${rotuloArea(est.area)} (locais com par)`, [null, agA.turnos]]] : []),
      [mun.rotulo, (tu.municipios[est.mun] || [])], [NOMES_UF[mun.uf] ?? mun.uf, tu.uf[mun.uf] || []], ["Brasil", tu.brasil]];
    const saldo = (t) => (t ? saldoEntreTurnos(objCampos(cps, t), "lula") : null);
    const S = tu.anos.map((a, j) => ({ ano: a, pt: tu.nome_pt[a], dir: tu.nome_dir[a], dirSg: a === "2018" ? "PSL" : "PL", ls: lugares.map(([nome, ts]) => ({ nome, s: saldo(ts[j]) })) }));
    const k22 = S.find((x) => x.ano === "2022"), k18 = S.find((x) => x.ano === "2018");
    const o_ = agA ? 1 : 0;             // com área, a 1ª linha é a área; depois cidade, estado e Brasil
    const c22 = k22.ls[o_].s, c18 = k18.ls[o_].s;
    if (c22?.fatia != null) sec.append(placar(`No 2º turno de 2022, do que Lula e Jair Bolsonaro ganharam em ${mun.nome}, Lula ficou com ${fmtPct(c22.fatia)}`
      + ` (no ${k22.ls[o_ + 1].nome === "Distrito Federal" ? "" : "estado do "}${k22.ls[o_ + 1].nome}, ${fmtPct(k22.ls[o_ + 1].s?.fatia)}; no Brasil, ${fmtPct(k22.ls[o_ + 2].s?.fatia)}).`
      + (agA && k22.ls[0].s?.fatia != null ? ` Nos locais de ${rotuloArea(est.area)}, ${fmtPct(k22.ls[0].s.fatia)}.` : "")
      + (c18?.fatia != null ? ` Em 2018, Fernando Haddad ficou com ${fmtPct(c18.fatia)} na cidade.` : "")));
    sec.append(instrucao("Entre os turnos, o eleitorado é praticamente o mesmo. O que as duas candidaturas ganharam, somado à variação de brancos, nulos e abstenção, é igual aos votos que as outras candidaturas tiveram no 1º turno. A barra divide o ganho entre as duas candidaturas do 2º turno.",
      "Comparação por candidatura (PT × PSL/PL), não pelos grupos de 2026: no 1º turno o grupo de Lula incluiria o PDT de Ciro Gomes. É o saldo de cada lugar, não o voto de quem mudou; mostra o que aconteceu, não o que vai acontecer em 2026."));
    // barras: cidade, estado e Brasil, 2022 e 2018
    const cartao = el("div", { class: "cartao composicao" }, el("h3", { text: "Com quem ficou o ganho de votos do 1º para o 2º turno" }));
    const sinal = (v) => Lab.comSinal(v, (x) => fmtInt.format(x));
    const outrasTxt = (a) => (tu.outras[a]?.[est.mun] || []).map(([n, , v]) => `${n} ${Lab.fmtCompacto(v)}`).join(" · ");
    for (const x of [k22, k18]) {
      cartao.append(el("h4", { class: "ano-turnos", text: `${x.ano}: ${x.pt} × ${x.dir}` }));
      for (const { nome, s: t } of x.ls) {
        if (!t) { if (!(agA && nome.startsWith(rotuloArea(est.area)))) cartao.append(el("p", { class: "nota", text: `${nome}: sem dado.` })); continue; }
        const conta = [`${x.pt}: ${sinal(t.ganho_pt)} votos`, `${x.dir}: ${sinal(t.ganho_pl)} votos`, `brancos e nulos: ${sinal(t.brancos_nulos)}`, `abstenção: ${sinal(t.abstencoes)}`, `outras candidaturas no 1º turno: ${fmtInt.format(t.outros_1t)}`];
        if (t.ganho_pt < 0 || t.ganho_pl < 0 || t.fatia === null) { cartao.append(el("p", { class: "nota", text: `${nome}: ${conta.join(" · ")} (uma das candidaturas perdeu votos entre os turnos; a divisão do ganho não se aplica).` })); continue; }
        const pPt = t.fatia, pPl = 100 - t.fatia;
        cartao.append(Lab.linhaBarra100({ rotulo: nome, aria: `${nome}, ${x.ano}: ${x.pt} ficou com ${fmtPct(pPt)} do ganho e ${x.dir} com ${fmtPct(pPl)}.`, segmentos: [
          { cor: corDe("lula"), pct: pPt, texto: `${x.pt.split(" ").pop()} ${Math.round(pPt)}%`, curto: `${Math.round(pPt)}%`, dica: [`${nome} · ${x.ano}`, conta] },
          { cor: corDe("flavio"), pct: pPl, texto: `${Math.round(pPl)}% Bolsonaro`, curto: `${Math.round(pPl)}%`, dica: [`${nome} · ${x.ano}`, conta] }] }));
      }
      const ot = outrasTxt(x.ano);
      if (ot) cartao.append(el("p", { class: "nota", text: `Outras candidaturas no 1º turno de ${x.ano} em ${mun.nome}: ${ot}.` }));
    }
    cartao.append(el("details", { class: "info" }, el("summary", {}, "Ver a conta completa"),
      el("div", { class: "rolagem" }, Lab.tabela(["", "Outras no 1º turno", "Ganho PT", "Ganho PSL/PL", "Brancos e nulos", "Abstenção", "PT ficou com"],
        S.flatMap((x) => x.ls.map(({ nome, s: t }) => (t ? [`${nome} · ${x.ano}`, fmtInt.format(t.outros_1t), sinal(t.ganho_pt), sinal(t.ganho_pl), sinal(t.brancos_nulos), sinal(t.abstencoes), t.fatia === null ? "—" : fmtPct(t.fatia)]
          : [`${nome} · ${x.ano}`, "—", "—", "—", "—", "—", "—"])))))),
      Lab.rodape({ fontes: ["tse"], nota: "Totais oficiais por município, somados por estado e Brasil (exterior fora). Ganho = votos no 2º turno menos votos no 1º turno da mesma candidatura." }));
    sec.append(cartao);
    // mapa dos locais (2022) e lista
    // o mapa desta leitura está na aba Mapa (lente "2º turno de 2022"), para não repetir
    sec.append(el("div", { class: "cartao chamada" }, el("p", { text: `Onde, ${est.area ? `em ${rotuloArea(est.area)}` : "na cidade"}, o ganho do 2º turno de 2022 foi para cada lado: veja no mapa (cor = com quem ficou o ganho em cada local).` }),
      el("button", { type: "button", class: "ir-aba", text: "Ver no mapa →", onclick: () => { est.lente = "turno"; irAba("mapa"); } })));
    const T = LA.filter((o) => o.turno && o.tipo === "C");
    const maioria = T.filter((o) => (o.fatia2t ?? -1) > 50).length;
    const top = [...T].sort((a, b) => b.turno.outros_1t - a.turno.outros_1t).slice(0, 15);
    sec.append(el("div", { class: "cartao" }, el("h3", { text: "Os locais com mais votos das outras candidaturas no 1º turno de 2022" }),
      el("p", { class: "nota", text: `${est.area ? `${rotuloArea(est.area)}: ` : ""}Lula ficou com mais da metade do ganho em ${fmtInt.format(maioria)} de ${fmtInt.format(T.length)} locais com par em 2022. Abaixo, os 15 locais onde havia mais votos em disputa no 1º turno de 2022 e com quem ficou o ganho.` }),
      el("div", { class: "rolagem" }, Lab.tabela(["Local", "Outras no 1º turno", "Lula", "Bolsonaro", "Brancos e nulos", "Abstenção", "Lula ficou com"],
        top.map((o) => [[el("b", { text: o.nome }), el("br"), el("small", { text: [o.endereco, o.bairro].filter(Boolean).join(" · ") })],
          fmtInt.format(o.turno.outros_1t), sinal(o.turno.ganho_pt), sinal(o.turno.ganho_pl), sinal(o.turno.brancos_nulos), sinal(o.turno.abstencoes), o.fatia2t === null ? "—" : fmtPct(o.fatia2t)]))),
      Lab.rodape({ fontes: ["tse"], nota: "Locais de 2026 ligados aos de 2022 pelo EL0009; locais especiais e sem par ficam fora. Saldo do local, não voto de pessoas." })));
    return sec;
  }

  // ---------------------------------------------------------- tabela (a "folha" do print e do PNG)
  const COLS = [...BL.flatMap((b) => [{ k: b.id, tit: "% válidos", grupo: b.id }, ...(b.sem_2022 ? [] : [{ k: `${b.id}_dif`, tit: "Δ p.p.", grupo: b.id, dif: true }])]),
    { k: "abst", tit: "% aptos", grupo: "abst" }, { k: "abst_dif", tit: "Δ p.p.", grupo: "abst", dif: true }];
  function celula(o, c) {
    if (c.dif) { const v = o[c.k]; return el("td", { class: `dif${v > 0 ? " sobe" : ""}`, text: fmtDif(v) }); }
    const n = c.grupo === "abst" ? o.abstencoes : o[`${c.grupo}_votos`];
    const td = el("td", { class: c.grupo === BL[0].id ? "sep" : null }, el("span", { class: "pct", text: o[c.k] === null ? "—" : fmtPct(o[c.k]) }), el("span", { class: "n", text: fmtInt.format(n) }));
    if (c.grupo !== "abst" && semPar2022(c.grupo)) td.style.borderRight = "1px solid var(--cor-borda)";
    return td;
  }
  function folha(d, L, mun) {
    const tot = { nome: "Total da cidade", endereco: `${fmtInt.format(L.length)} locais de votação · comparação com todos os locais de 2022`, ...medidas(objTotais(d, d.t2026), objTotais(d, d.t2022)) };
    const ord = [...L].sort((a, b) => {
      if (est.ordem === "nome") return (est.dir === "asc" ? 1 : -1) * b.nome.localeCompare(a.nome);
      const x = a[est.ordem], y = b[est.ordem];
      if (x === null && y === null) return b.aptos - a.aptos;
      if (x === null) return 1;
      if (y === null) return -1;
      return (est.dir === "asc" ? x - y : y - x) || b.aptos - a.aptos;
    });
    const ordenar = (k) => atualizar({ ordem: k, dir: est.ordem === k && est.dir === "desc" ? "asc" : "desc" });
    const thOrd = (k, conteudo, attrs = {}) => el("th", { ...attrs, scope: "col", "data-ordem": k, tabindex: "0", "aria-sort": est.ordem === k ? (est.dir === "desc" ? "descending" : "ascending") : null,
      onclick: () => ordenar(k), onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ordenar(k); } } }, conteudo);
    const faixa = (id) => { const s = el("span", { class: "faixa" }); s.style.background = corDe(id); return s; };
    const thead = el("thead", {},
      el("tr", { class: "grupos" }, thOrd("nome", "Local de votação", { rowspan: "2", class: "esq" }), thOrd("aptos", "Aptos", { rowspan: "2" }),
        ...BL.map((b) => el("th", { colspan: b.sem_2022 ? "1" : "2", scope: "colgroup" }, b.nome, faixa(b.id))),
        el("th", { colspan: "2", scope: "colgroup" }, "Abstenção", faixa("abst"))),
      el("tr", {}, ...COLS.map((c) => thOrd(c.k, c.tit))));
    const linha = (o, total = false) => el("tr", { class: total ? "total" : null },
      el("td", { class: "local esq" }, el("b", { text: o.nome }),
        el("small", { text: total ? o.endereco : [[o.endereco, o.bairro].filter(Boolean).join(" · "), TIPO_LOCAL[o.tipo], o.par === "sem_par" || o.par === "sem_chave" ? "sem par em 2022" : null].filter(Boolean).join(" · ") })),
      el("td", { text: fmtInt.format(o.aptos) }), ...COLS.map((c) => celula(o, c)));
    const tabela = el("table", { class: "locais" }, el("caption", { class: "sr-only", text: `Locais de votação de ${mun.rotulo}: aptos, votos para Presidente e abstenção no 1º turno de 2026, com a variação desde 2022.` }),
      thead, el("tbody", {}, linha(tot, true), ...ord.map((o) => linha(o))));
    const semVar = BL.filter((b) => b.sem_2022).map((b) => b.nome);
    const f = el("div", { class: "folha", id: "folha" },
      el("h3", { text: `${mun.rotulo}${est.area ? ` · ${rotuloArea(est.area)}` : ""} · Presidente, 1º turno de 2026, por local de votação` }),
      el("p", { class: "sub", text: `${fmtInt.format(L.length)} locais · ${fmtInt.format(tot.aptos)} eleitores aptos. Votos em % dos válidos (número de votos abaixo); abstenção em % dos aptos. Δ p.p. = variação em pontos percentuais em relação ao 1º turno de 2022 no mesmo local.` }),
      el("div", { class: "rolar" }, tabela),
      el("p", { class: "fonte", text: `Fonte: TSE — votação e detalhe por seção eleitoral e cadastro de locais de votação, 1º turno de 2022 e de 2026. `
        + `Outros = Ronaldo Caiado e demais candidaturas (em 2022, as candidaturas fora dos grupos de Lula e de Flávio Bolsonaro; o grupo de Lula inclui o PDT). `
        + (semVar.length ? `${semVar.join(" e ")}: grupo sem candidatura presidencial em 2022, sem variação. ` : "")
        + `Mesmo local em 2022: mesma zona e número, com nome igual ou a até 100 m; locais novos, sem par ou especiais (trânsito, presos, temporários) ficam com “—”. `
        + `Elaboração: __AUTOR__ · Laboratório de Dados Públicos.` }));
    return f;
  }

  // ---------------------------------------------------------- exportação
  const nomeArquivo = (mun, ext) => `locais_${(mun.nome + (est.area ? ` ${rotuloArea(est.area)}` : "")).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()}_${mun.uf.toLowerCase()}_presidente_2026.${ext}`;
  function baixar(blob, nome) {
    const a = el("a", { href: URL.createObjectURL(blob), download: nome });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /** CSV para planilha em português: separador ";", vírgula decimal, UTF-8 com BOM. */
  function exportarCSV(d, L, mun) {
    const num = (v, casas = 2) => (v === null || v === undefined ? "" : (casas === 0 ? String(v) : v.toFixed(casas).replace(".", ",")));
    const txt = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cab = ["zona", "local", "nome", "endereco", "bairro", "tipo", "secoes", "aptos", "validos",
      ...BL.flatMap((b) => [`${b.id}_votos`, `${b.id}_pct_validos`, `${b.id}_pct_validos_2022`, `${b.id}_variacao_pp`]),
      "abstencoes", "abstencao_pct_aptos", "abstencao_pct_aptos_2022", "abstencao_variacao_pp", "par_2022", "nome_2022", "distancia_2022_m"];
    const tot = medidas(objTotais(d, d.t2026), objTotais(d, d.t2022));
    const linha = (o, total) => [total ? "" : o.zona, total ? "" : o.local, txt(total ? `TOTAL ${mun.rotulo}` : o.nome), txt(total ? "" : o.endereco), txt(total ? "" : o.bairro),
      total ? "" : txt(TIPO_LOCAL[o.tipo] || "convencional"), total ? "" : o.secoes, o.aptos, o.validos,
      ...BL.flatMap((b) => [o[`${b.id}_votos`], num(o[b.id]), num(o[`${b.id}0`]), num(o[`${b.id}_dif`])]),
      o.abstencoes, num(o.abst), num(o.abst0), num(o.abst_dif), total ? txt("municipio inteiro") : txt(o.par), txt(total ? "" : o.nome_2022), total ? "" : (o.distancia_2022_m ?? "")].join(";");
    const corpo = [cab.join(";"), linha(tot, true), ...L.map((o) => linha(o, false))].join("\r\n");
    baixar(new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" }), nomeArquivo(mun, "csv"));
  }
  const LIMITE_PNG = 20;
  const rotuloOrdem = () => {
    const c = est.ordem === "nome" ? "nome do local" : est.ordem === "aptos" ? "aptos" : COLS.find((x) => x.k === est.ordem) ? `${nomeDe(COLS.find((x) => x.k === est.ordem).grupo)} ${COLS.find((x) => x.k === est.ordem).tit}` : est.ordem;
    return `${c}, ${est.dir === "desc" ? "do maior para o menor" : "do menor para o maior"}`;
  };
  async function exportarPNG(mun, botao) {
    if (typeof html2canvas === "undefined") { alert("A exportação em imagem precisa de internet (biblioteca html2canvas)."); return; }
    const f = $("#folha");
    botao.disabled = true; botao.textContent = "Gerando imagem…";
    f.classList.add("exportando");
    // a imagem leva o total e os 20 primeiros locais na ordem mostrada, com aviso dos demais (pedido do pesquisador)
    const linhas = [...f.querySelectorAll("tbody tr:not(.total)")];
    const escondidas = linhas.slice(LIMITE_PNG);
    let aviso = null;
    if (escondidas.length) {
      for (const tr of escondidas) tr.hidden = true;
      aviso = el("tr", { class: "mais" }, el("td", { colspan: String(2 + COLS.length), text: `+ ${fmtInt.format(escondidas.length)} ${escondidas.length === 1 ? "local não mostrado" : "locais não mostrados"} nesta imagem (ordem: ${rotuloOrdem()}). A tabela completa está na página e no CSV.` }));
      f.querySelector("tbody").append(aviso);
    }
    try {
      const canvas = await html2canvas(f, { scale: 2, backgroundColor: getComputedStyle(f).backgroundColor, windowWidth: f.scrollWidth + 40, logging: false });
      canvas.toBlob((b) => baixar(b, nomeArquivo(mun, "png")), "image/png");
    } finally {
      for (const tr of escondidas) tr.hidden = false;
      aviso?.remove();
      f.classList.remove("exportando");
      botao.disabled = false; botao.textContent = "Baixar imagem da tabela (PNG)";
    }
  }

  // ---------------------------------------------------------- página
  let pedido = 0;
  const prontos = new Map();     // município → dados já decodificados
  const abas = $("#abas");
  /** Troca de aba: redesenha e leva o início do conteúdo para logo abaixo da barra fixa (sem descer a página toda). */
  function irAba(k) {
    if (k === est.aba) return;
    Object.assign(est, { aba: k });
    history.replaceState(null, "", `#${new URLSearchParams(est)}`);
    render();
    const topoApp = app.getBoundingClientRect().top + scrollY - $("#barra").offsetHeight - 8;
    if (scrollY > topoApp) scrollTo(0, topoApp);
    abas.querySelector(`[data-aba="${k}"]`)?.focus({ preventScroll: true });
  }
  function desenharAbas() {
    abas.hidden = !est.mun;
    abas.replaceChildren(...ABAS.map(([k, r]) => el("button", { type: "button", role: "tab", id: `aba-${k}`, "data-aba": k, "aria-selected": String(k === est.aba),
      "aria-controls": "app", tabindex: k === est.aba ? "0" : "-1", text: r, onclick: () => irAba(k),
      onkeydown: (ev) => {     // setas trocam de aba (padrão de abas acessíveis)
        const i = ABAS.findIndex(([x]) => x === k), j = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : null;
        if (j !== null && ABAS[(j + ABAS.length) % ABAS.length]) { ev.preventDefault(); irAba(ABAS[(j + ABAS.length) % ABAS.length][0]); }
      } })));
    abas.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function render() {
    Lab.esconderDica();
    desenharAbas();
    document.body.classList.toggle("com-cidade", Boolean(est.mun));
    $("#campo-area").hidden = !est.mun;
    if (!est.mun) {
      campo.value = "";
      app.replaceChildren(el("p", { class: "vazio", text: "Escolha uma cidade no campo acima (digite parte do nome e selecione na lista)." }));
      return;
    }
    const mun = MUN.get(est.mun);
    campo.value = mun.rotulo;
    const meu = ++pedido;
    // dados já carregados: redesenha no lugar (sem voltar ao topo e mantendo o foco no seletor; Lab.noLugar)
    if (prontos.has(est.mun)) { Lab.noLugar(() => montar(prontos.get(est.mun), mun)); return; }
    app.replaceChildren(el("p", { class: "carregando", text: `Carregando os locais de votação de ${mun.rotulo}…` }));
    carregar(est.mun).then((d) => {
      prontos.set(est.mun, d);
      if (meu === pedido) montar(d, mun);
    }).catch((erro) => {
      if (meu === pedido) app.replaceChildren(el("p", { class: "aviso", text: `Não foi possível carregar os locais de ${mun.rotulo} (${erro.message}). A pasta data/ precisa estar ao lado do index.html.` }));
    });
  }
  function montar(d, mun) {
    {
      const L = linhasDe(d);
      prepararAreas(L);
      const LA = L.filter(naArea);     // vistas por local (mapa, dispersão, listas, tabela) seguem o bairro/zona
      const avisoArea = est.area ? el("p", { class: "aviso-area", role: "status" }, el("b", { text: `${rotuloArea(est.area)}: ` }),
        `${LA.length} de ${L.length} locais. Todas as abas mostram esta área; os números da cidade, do estado e do Brasil continuam ao lado para comparação.`,
        el("button", { type: "button", text: "Ver toda a cidade", onclick: () => atualizar({ area: "" }) })) : null;
      const tot = medidas(objTotais(d, d.t2026), objTotais(d, d.t2022));
      const linhaResumo = (rot, t, n) => `${rot}${fmtInt.format(n)} locais · ${fmtInt.format(t.aptos)} eleitores aptos · `
        + BL.slice(0, 2).map((b) => `${b.nome} ${fmtPct(t[b.id])}`).join(" × ") + ` dos válidos · abstenção de ${fmtPct(t.abst)}`;
      const totA = est.area && LA.length ? medidas(objTotais(d, agregadosArea(LA).t26), null) : null;
      const resumo = placar(totA ? `${linhaResumo(`${rotuloArea(est.area)}: `, totA, LA.length)} (1º turno de 2026). Na cidade: ${linhaResumo("", tot, L.length).replace(/^\d[\d.]* locais · /, "")}.`
        : `${linhaResumo("", tot, L.length)} (1º turno de 2026).`);
      const acoes = el("div", { class: "acoes" },
        el("button", { type: "button", text: "Baixar tabela (CSV)", onclick: () => exportarCSV(d, LA, mun) }),
        el("button", { type: "button", text: "Baixar imagem da tabela (PNG)", onclick: (ev) => exportarPNG(mun, ev.currentTarget) }));
      const secTab = el("section", { "aria-labelledby": "t-tabela" }, el("h2", { id: "t-tabela", text: "Tabela dos locais" }),
        el("p", { class: "nota", text: "Clique no título de uma coluna para ordenar (de novo, inverte). A imagem (PNG) traz o total e os 20 primeiros locais na ordem mostrada; o CSV traz todos." }),
        acoes, folha(d, LA, mun));
      // só a aba escolhida é montada (mais leve: o mapa e a dispersão não são calculados sem necessidade)
      const partes = { resumo: () => [avisoArea, resumo, blocoAnalise(d, L, LA, mun)], disputa: () => [avisoArea, blocoDisputa(d, L, mun)], turnos: () => [avisoArea, blocoEntreTurnos(d, L, LA, mun)], mapa: () => [avisoArea, blocoMapa(d, LA, null, L)], tabela: () => [avisoArea, secTab] };
      app.setAttribute("role", "tabpanel");
      app.setAttribute("aria-labelledby", `aba-${est.aba}`);
      app.replaceChildren(...partes[est.aba]().filter(Boolean));
      Lab.ajustarRotulos?.(app);
    }
  }
  if (base.metodologia) Lab.rodapePagina(base.metodologia, { linkAutor: { href: "__PORTFOLIO__", texto: "Página do autor ↗" } });
  render();
})().catch((erro) => {
  document.getElementById("app").textContent = `Não foi possível carregar a página: ${erro}. Use um navegador atualizado.`;
});
