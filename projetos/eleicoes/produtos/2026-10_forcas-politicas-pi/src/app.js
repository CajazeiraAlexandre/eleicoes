/* app.js — "Forças políticas no Piauí". Todos os indicadores chegam prontos da base
 * Python (forcas_pi.py; EL0004/EL0005); aqui só se seleciona, ordena e desenha (L0002).
 * O desenho usa os componentes do design system do laboratório (window.Lab, web/componentes/lab-*;
 * ADR L0003); este arquivo guarda só o que é do produto: grupos, cores, textos, estado e episódios.
 * Textos vindos dos dados entram por textContent. */
(async function () {
  "use strict";
  const { el, token, fmtInt, fmtPct, fmtPP, fmtR, comSinal, mostrarDica, esconderDica, alternar, seletorTitulo,
    seletorTituloLista, instrucao, placar, rodape, escalaArea, notaFora, legendaTamanho, selecionar } = Lab;
  const fmtVotos = Lab.fmtCompacto;
  const tabelaSimples = Lab.tabela;
  const $ = (s) => document.querySelector(s);
  const base = await Lab.decodificar($("#dados").textContent.trim());
  const nav = $("#nav"), app = $("#app");
  Lab.configurar({ raiz: app, autor: "__AUTOR__", artigos: { TSE: "do TSE" },
    orgaos: { tse: "TSE", api: "TSE", td: "Governo do Piauí (via Wikipédia)", malha: "IBGE", ibge: "IBGE" } });

  // ---------------------------------------------------------- dados e cores
  const G = base.grupos;
  const corGrupo = (g) => {
    if (g === "empate" || g === "sem dados") return token("cor-eixo");
    const c = base.cores.claro[g] || "";
    return c.startsWith("var(") ? token(c.slice(6, -1)) : c;
  };
  // faixas de intensidade da liderança: 4 faixas (pedido do pesquisador, 2026-10-06); limites a validar (EL0005, I6)
  const CLASSES = [40, 50, 60];
  const classe = (v) => (v === null ? 0 : CLASSES.filter((c) => v >= c).length);
  const corIntensa = (g, v) => d3.interpolateRgb(token("cor-superficie"), corGrupo(g))([0.3, 0.52, 0.76, 1][classe(v)]);
  const ROTULOS_CLASSES = [`< ${CLASSES[0]}%`, ...CLASSES.slice(1).map((c, i) => `${CLASSES[i]}–${c}%`), `≥ ${CLASSES.at(-1)}%`];
  // nomes de exibição dos grupos (as chaves internas da base continuam PT, PSD, MDB, PP, Outros)
  const NOME_G = { PT: "PT/PV/PCdoB", PP: "União Progressista", empate: "Empate" };
  const nomeG = (g) => NOME_G[g] || g;
  const chave = (g, texto) => Lab.chave(corGrupo(g), texto ?? nomeG(g));
  const chip = (g) => Lab.chip(corGrupo(g));
  const muns = base.municipios;
  const porTse = new Map(muns.map((m) => [m.tse, m]));
  const ELEICOES = [["2018", "7"], ["2018", "6"], ["2020", "13"], ["2020", "11"], ["2022", "7"], ["2022", "6"],
    ["2024", "13"], ["2024", "11"], ["2026", "7"], ["2026", "6"]];
  const cargoDe = (ano, c) => base.eleicoes[ano].cargos[c];
  const rotulo = (ano, c) => `${cargoDe(ano, c).nome} ${ano}`;
  const NIVEIS = [["municipio", "Municípios"], ["imediata", "Regiões imediatas"], ["intermediaria", "Regiões intermediárias"], ["territorio", "Territórios de Desenvolvimento"]];
  const nomeUnidade = (nivel, u) => (nivel === "municipio" ? porTse.get(u)?.nome || u : u);
  const NOTA_PP = base.cores.nota_pp_2026;
  const NOME_NIVEL = { municipio: "município", imediata: "região imediata", intermediaria: "região intermediária", territorio: "território" };
  const OPC_NIVEL = [["municipio", "município"], ["imediata", "região imediata"], ["intermediaria", "região intermediária"], ["territorio", "território de desenvolvimento"]];
  const POR_NIVEL = { municipio: "por município", imediata: "por região imediata", intermediaria: "por região intermediária", territorio: "por território" };
  const UM_NIVEL = { municipio: "um município", imediata: "uma região imediata", intermediaria: "uma região intermediária", territorio: "um território" };
  const maiuscula = (t) => t[0].toUpperCase() + t.slice(1);

  // ---------------------------------------------------------- estado (no endereço)
  const est = { ep: 0, ano: "2026", cargo: "7", nivel: "municipio", modo: "lider", grupo: "PT",
                cAno: "2026", cGrupo: "PT", cNivel: "municipio", skCargo: "7", skEtapa: "direto", skIni: "2018", skPeso: "municipios", skSel: null, mun: "", forma: "mapa", formaLider: "bolhas", inAno: "2026", inCargo: "7", inTam: "igual", cTam: "votos", evUn: "estado|Piauí", evMed: "votos", evTipo: "gerais", vComp: "estadual_2022_x_2026", vGrupo: "PT", vNivel: "municipio", vMed: "pct", vTam: "votos", compMed: "votos", compCargo: "todos" };
  const TRANSITORIOS = new Set(["skSel"]);   // não vão para o endereço
  let volta = null;                           // retorno da ficha ao mapa
  const lerEndereco = () => {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      for (const k of Object.keys(est)) if (p.has(k) && !TRANSITORIOS.has(k)) est[k] = k === "ep" ? +p.get(k) || 0 : p.get(k);
    } catch (e) { /* endereço inválido: mantém padrão */ }
  };
  lerEndereco();
  const enderecoAtual = () => `#${new URLSearchParams(Object.entries(est).filter(([k, v]) => !TRANSITORIOS.has(k) && v !== "" && v !== null))}`;
  // novo episódio = nova entrada no histórico (o "voltar" do navegador funciona); demais mudanças substituem
  const gravar = (empilhar = false) => {
    if (empilhar) history.pushState({ y: 0 }, "", enderecoAtual());
    else history.replaceState({ y: scrollY }, "", enderecoAtual());
  };
  const titulo = (texto) => [el("h2", { text: texto })];

  // ---------------------------------------------------------- componentes com o vocabulário do produto
  /** Legenda da liderança: uma linha por grupo, quatro quadros com a faixa escrita sobre a cor. */
  const legendaIntensidade = (grupos) => {
    const reps = [CLASSES[0] - 5, ...CLASSES.slice(1).map((c, i) => (CLASSES[i] + c) / 2), CLASSES.at(-1) + 5];
    return Lab.legendaClasses(grupos.map((g) => ({ nome: nomeG(g), cores: reps.map((v) => corIntensa(g, v)) })), ROTULOS_CLASSES,
      `Legenda: cor do grupo líder; tom pela parcela dos votos válidos (${ROTULOS_CLASSES.join(", ")}).`);
  };
  /** Mapa de um nível territorial (Lab.mapa) com a forma (Mapa | Círculos) guardada no endereço. */
  function mapa(alvo, nivel, preencher, dica, abrir, rotuloAria, opts = {}) {
    const chaveForma = opts.chaveForma || "forma";
    Lab.mapa(alvo, { contornos: base.contornos[nivel], sobreposicao: nivel !== "municipio" ? base.contornos.municipio : null,
      nome: (id) => nomeUnidade(nivel, id), preencher, dica, abrir, rotuloAbrir: "Ver ficha do município →", rotuloAria,
      rotuloBusca: nivel === "municipio" ? "Buscar município…" : "Buscar…", detalhado: nivel === "municipio",
      tamanho: opts.tamanho, rotuloTamanho: opts.rotuloTamanho, legenda: opts.legenda,
      forma: { obter: () => est[chaveForma], definir: (v) => { est[chaveForma] = v; gravar(); } } });
  }
  const painelGrafico = (alvo, nivel, dica, abrir) => Lab.painelGrafico(alvo, { nome: (u) => nomeUnidade(nivel, u), dica,
    abrir: nivel === "municipio" ? abrir : null, rotuloAbrir: "Ver ficha do município →" });
  /** Quadros clicáveis de escolha do grupo, com um valor por grupo. */
  const quadrosGrupo = (atual, valorDe, aoEscolher, chaveDado) => Lab.quadros(
    G.map((g) => ({ chave: g, rotulo: nomeG(g), cor: corGrupo(g), valor: valorDe(g) })), { atual, aoEscolher, chaveDado, rotulo: "Escolha o grupo" });
  const FONTES_NIVEL = { territorio: "td", municipio: "malha", estado: null };
  const fontesNivel = (nivel, anos = []) => ["tse", ...(anos.includes("2026") ? ["api"] : []), nivel in FONTES_NIVEL ? FONTES_NIVEL[nivel] : "ibge"].filter(Boolean);
  const coberturaDe = (ano, nivel) => {
    const lac = base.eleicoes[ano]?.lacunas || [];
    return nivel === "municipio" && lac.length
      ? `${224 - lac.length} de 224 municípios — ${lac.map((l) => `${porTse.get(l.municipio)?.nome} (${l.cargo})`).join(", ")}: sem dados por partido no TSE.`
      : "224 municípios do Piauí.";
  };
  const contarLideres = (obj, chaveGrupo = (x) => x?.lider?.grupo) => d3.rollup(Object.values(obj).map(chaveGrupo).filter(Boolean), (v) => v.length, (g) => g);
  const frasePlacar = (cont, unidade) => G.filter((g) => cont.get(g)).sort((a, b) => cont.get(b) - cont.get(a))
    .map((g, i) => `${nomeG(g)} ${i === 0 ? "lidera em " : "em "}${fmtInt.format(cont.get(g))}${i === 0 ? ` ${unidade}` : ""}`).join("; ");
  /** Divisão por partido de um grupo com mais de um partido (Outros, PT/PV/PCdoB, União Progressista) para a dica:
   *  partidos do grupo na unidade, com votos e % dos válidos, da base Python (só seleção e ordenação, L0002).
   *  Grupo de um só partido (ou um só com votos) não ganha linhas. */
  const resumoGrupo = (g, ano, u, max = 5) => {
    if (!u?.partidos) return [];
    const gp = base.eleicoes[ano].grupo_partido;
    const lista = Object.entries(u.partidos).filter(([sg, v]) => gp[sg] === g && v > 0);   // já vem em ordem decrescente de votos
    if (lista.length < 2) return [];
    const resto = lista.slice(max);
    return [g === "Outros" ? `“Outros” reúne ${lista.length} partidos:` : `${nomeG(g)} por partido:`,
      ...lista.slice(0, max).map(([sg, v]) => `· ${sg}: ${fmtVotos(v)} (${fmtPct((100 * v) / u.validos)})`),
      resto.length ? `· mais ${resto.length} partido${resto.length > 1 ? "s" : ""}: ${fmtVotos(d3.sum(resto, ([, v]) => v))}` : null];
  };
  const lacunaTexto = (ano) => (base.eleicoes[ano].lacunas || []).map((l) => `Lacuna: ${porTse.get(l.municipio)?.nome || l.municipio} — ${l.cargo}: sem votos por partido nos arquivos do TSE; fora dos indicadores.`).join(" ");

  // ---------------------------------------------------------- episódios
  const EPISODIOS = [
    ["Composição e distribuição de forças", episodioComposicao],
    ["Evolução no tempo", episodioEvolucao],
    ["Consistência entre cargos", episodioCoesao],
    ["Migrações e viradas", episodioMudancas],
    ["Seu município", episodioMunicipio],
  ];
  function render(empilhar = false, entrando = false) {
    est.ep = Math.max(0, Math.min(EPISODIOS.length - 1, est.ep));
    nav.replaceChildren(...EPISODIOS.map(([nome], i) => el("button", { "aria-current": i === est.ep, onclick: () => irPara(i) },
      el("span", { class: "num", text: `${i + 1}.` }), nome)));
    const [nome, construir] = EPISODIOS[est.ep];
    const sec = el("section", { class: `episodio ativo${entrando ? " entrando" : ""}`, "aria-label": nome });
    Lab.limparPaineis();
    construir(sec);
    const passo = el("div", { class: "passo" });
    if (est.ep > 0) passo.append(el("button", { text: `← ${EPISODIOS[est.ep - 1][0]}`, onclick: () => irPara(est.ep - 1) }));
    if (est.ep < EPISODIOS.length - 1) passo.append(el("button", { class: "proximo", text: `${EPISODIOS[est.ep + 1][0]} →`, onclick: () => irPara(est.ep + 1) }));
    sec.append(passo);
    app.replaceChildren(sec);
    Lab.ajustarRotulos(app);
    Lab.aplicarSelecoes();
    // centraliza a aba ativa só na horizontal (scrollIntoView também rolaria a página)
    const aba = nav.querySelector('[aria-current="true"]');
    if (aba) nav.scrollLeft = aba.offsetLeft - nav.clientWidth / 2 + aba.offsetWidth / 2;
    gravar(empilhar);
  }
  let larguraAnterior = app.clientWidth;
  addEventListener("resize", () => { if (Math.abs(app.clientWidth - larguraAnterior) > 40) { larguraAnterior = app.clientWidth; Lab.noLugar(() => render()); } });
  /** Troca de episódio: nova entrada no histórico, animação de entrada, topo do episódio. */
  function irPara(i) {
    history.replaceState({ y: scrollY }, "", enderecoAtual());
    est.ep = i; render(true, true);
    // o menu de episódios é fixo (sticky): o topo da seção é o do conteúdo, descontada a altura do menu
    const topo = app.getBoundingClientRect().top + scrollY - nav.offsetHeight - 8;
    if (scrollY > topo) scrollTo({ top: topo, behavior: "auto" });
  }
  /** Do mapa para a ficha do município, guardando de onde veio. */
  function abrirFicha(m) { volta = { ep: est.ep, y: scrollY }; history.replaceState({ y: scrollY }, "", enderecoAtual()); est.ep = EPISODIOS.length - 1; est.mun = m; render(true, true); scrollTo(0, 0); }
  addEventListener("popstate", (ev) => { lerEndereco(); render(false, true); scrollTo(0, ev.state?.y || 0); });
  const atualizar = (mudancas) => Lab.noLugar(() => { Object.assign(est, mudancas); render(); });

  // ---- 1. Composição (4.1)
  function episodioComposicao(sec) {
    const liderados = (ano, c) => d3.rollup(Object.values(cargoDe(ano, c).forca.municipio).filter((u) => u.lider), (v) => v.length, (u) => u.lider.grupo);
    const pt22 = liderados("2022", "7").get("PT") || 0, pt26 = liderados("2026", "7").get("PT") || 0;
    sec.append(
      ...titulo("1. Composição e distribuição de forças"),
      el("p", { class: "lead", text: `Participação de cada grupo nos votos válidos, por eleição e cargo. Na disputa para deputado estadual, a Federação Brasil da Esperança (PT/PV/PCdoB) foi o grupo mais votado em ${pt26} dos 224 municípios em 2026 (eram ${pt22} em 2022).` }),
      ...composicao(),
      el("h2", { text: "Onde cada grupo é mais forte" }));
    const opcoesEleicao = ELEICOES.map(([a, c]) => [`${a}|${c}`, rotulo(a, c)]);
    // seletores na frase do título do mapa (eleição e cargo, recorte, grupo)
    const lEleicao = () => seletorTituloLista("Eleição e cargo", opcoesEleicao, `${est.ano}|${est.cargo}`, (v) => { const [a, c] = v.split("|"); atualizar({ ano: a, cargo: c }); });
    const lNivel = () => seletorTituloLista("Recorte territorial", OPC_NIVEL, est.nivel, (v) => atualizar({ nivel: v }));
    sec.append(el("div", { class: "controles" },
      Lab.botaoModo(est.modo === "grupo" ? "← Mapa de lideranças" : "Detalhar distribuição de um único grupo",
        () => atualizar({ modo: est.modo === "grupo" ? "lider" : "grupo" }))));
    const cg = cargoDe(est.ano, est.cargo);
    const unidades = cg.forca[est.nivel];
    const prefeitoMun = est.cargo === "11" && est.nivel === "municipio";
    const grade = el("div", { class: "grade2", "data-escopo": "composicao" });
    const cMapa = el("div", { class: "cartao" }), cLado = el("div", { class: "cartao" });
    grade.append(cMapa, cLado);
    sec.append(grade);
    const semCand = cg.grupos_sem_candidatos;
    if (est.modo === "lider") {
      const liderDe = (u) => {
        if (prefeitoMun) { const p = cg.prefeito[u]; return p ? { grupo: p.grupo, intensidade: unidades[u]?.pct_grupo[p.grupo] ?? null, margem: null } : null; }
        return unidades[u]?.lider || null;
      };
      const contMapa = contarLideres(Object.fromEntries(Object.keys(unidades).map((u) => [u, liderDe(u)])), (x) => x?.grupo);
      const nomeUn = { municipio: "municípios", imediata: "regiões imediatas", intermediaria: "regiões intermediárias", territorio: "territórios" }[est.nivel];
      cMapa.append(el("h3", {}, `${prefeitoMun ? "Grupo do prefeito eleito" : "Grupo líder"} por `, lNivel(), " — ", lEleicao()),
        placar(frasePlacar(contMapa, nomeUn)),
        instrucao(`A cor indica o grupo com mais votos em cada área; o tom, a força dessa liderança, em quatro faixas da parcela dos válidos (${ROTULOS_CLASSES.join(", ")}).`,
          "Clique numa área ou use a lupa para destacá-la e ver o resumo; em municípios, o resumo traz o acesso à ficha completa.",
          "Em Círculos, a área de cada círculo é proporcional aos votos válidos do cargo."));
      mapa(cMapa, est.nivel, (u) => { const l = liderDe(u); return l ? corIntensa(l.grupo, l.intensidade) : token("cor-grade"); },
        (u) => { const l = liderDe(u); const x = unidades[u]; return l ? [`${nomeG(l.grupo)} lidera com ${fmtPct(l.intensidade)} dos válidos`, l.margem !== null ? `margem de ${fmtPP(l.margem)} sobre o 2º` : null,
          prefeitoMun && cg.prefeito[u] ? `Prefeito(a): ${cg.prefeito[u].nome_urna} (${cg.prefeito[u].partido})` : null,
          x ? `válidos: ${fmtInt.format(x.validos)}` : null] : ["sem dados"]; },
        est.nivel === "municipio" ? (u) => abrirFicha(u) : null,
        `Mapa do Piauí por ${NIVEIS.find((n) => n[0] === est.nivel)[1].toLowerCase()}: cor = grupo líder, tom = intensidade.`,
        { tamanho: (u) => unidades[u]?.validos || 0, rotuloTamanho: "votos válidos do cargo", chaveForma: "formaLider",
          legenda: legendaIntensidade([...G.filter((g) => !semCand.includes(g)), ...(Object.values(unidades).some((x) => x.lider?.grupo === "empate") ? ["empate"] : [])]) });
      cMapa.append(rodape({ fontes: fontesNivel(est.nivel, [est.ano]), cobertura: coberturaDe(est.ano, est.cargo === "13" ? "municipio" : "x"),
        nota: `Tom da cor: parcela dos votos válidos do grupo líder, em quatro faixas (${ROTULOS_CLASSES.join("; ")} — faixas em validação). Líder = grupo com mais votos; “Outros” só lidera quando o partido mais votado é de fora dos quatro grupos. ${NOTA_PP}` }));
      // lado: contagem de unidades lideradas e as lideranças mais intensas
      const cont = d3.rollup(Object.keys(unidades).map(liderDe).filter(Boolean), (v) => v.length, (l) => l.grupo);
      cLado.append(el("h3", { text: `${NIVEIS.find((n) => n[0] === est.nivel)[1]} liderados por grupo` }),
        Lab.quadros(G.filter((g) => !semCand.includes(g)).map((g) => ({ chave: g, rotulo: nomeG(g), cor: corGrupo(g), valor: fmtInt.format(cont.get(g) || 0) }))));
      const top = Object.keys(unidades).map((u) => ({ u, l: liderDe(u) })).filter((x) => x.l && x.l.intensidade !== null)
        .sort((a, b) => b.l.intensidade - a.l.intensidade).slice(0, 8);
      cLado.append(el("h3", { text: "Lideranças mais intensas (maior % dos válidos)" }), tabelaSimples(["Unidade", "Grupo", "% válidos"],
        top.map((x) => [nomeUnidade(est.nivel, x.u), [chip(x.l.grupo), nomeG(x.l.grupo)], fmtPct(x.l.intensidade)])));
    } else {
      const g = est.grupo;
      cMapa.append(el("h3", {}, "% dos votos válidos de ", seletorTituloLista("Grupo", G.map((gg) => [gg, nomeG(gg)]), est.grupo, (v) => atualizar({ grupo: v })),
        " por ", lNivel(), " — ", lEleicao()),
        semCand.includes(g) ? null : placar(`${nomeG(g)} teve ${fmtPct(cg.forca.estado["Piauí"].pct_grupo[g])} dos válidos no Piauí.`),
        instrucao("Quanto mais escuro, maior o percentual do grupo nos votos válidos da área.", "Clique numa área ou use a lupa para destacá-la. Em Círculos, a área é proporcional aos votos do grupo."));
      if (semCand.includes(g)) { cMapa.append(el("p", { class: "aviso", text: `${nomeG(g)} não teve candidatos neste cargo e eleição.` })); }
      else {
        const vals = Object.values(unidades).map((x) => x.pct_grupo[g]).filter((v) => v !== null);
        const max = d3.max(vals) || 1;
        const c = d3.color(corGrupo(g));
        const interp = d3.interpolateLab(d3.interpolateRgb(token("cor-superficie"), c)(0.12), c.darker(0.6));
        mapa(cMapa, est.nivel, (u) => (unidades[u] ? interp(unidades[u].pct_grupo[g] / max) : token("cor-grade")),
          (u) => [unidades[u] ? `${fmtPct(unidades[u].pct_grupo[g])} dos válidos` : "sem dados", unidades[u] ? `${fmtInt.format(unidades[u].votos_grupo[g])} votos` : null],
          est.nivel === "municipio" ? (u) => abrirFicha(u) : null,
          `Mapa do Piauí: percentual de ${nomeG(g)} nos votos válidos.`,
          { tamanho: (u) => unidades[u]?.votos_grupo[g] || 0, rotuloTamanho: `votos de ${nomeG(g)}`,
            legenda: Lab.legendaRampa(d3.range(5).map((i) => interp(i / 4)), "0%", fmtPct(max)) });
        cMapa.append(rodape({ fontes: fontesNivel(est.nivel, [est.ano]), cobertura: coberturaDe(est.ano, est.cargo === "13" ? "municipio" : "x"),
          nota: `Escala de 0 ao maior valor deste grupo e cargo.${g === "PP" ? " " + NOTA_PP : ""}` }));
        const top = Object.entries(unidades).filter(([, x]) => x.pct_grupo[g] !== null).sort((a, b) => b[1].pct_grupo[g] - a[1].pct_grupo[g]).slice(0, 10);
        cLado.append(el("h3", { text: `Onde ${nomeG(g)} tem maior % dos válidos` }), tabelaSimples(["Unidade", "% válidos", "Votos"],
          top.map(([u, x]) => [nomeUnidade(est.nivel, u), fmtPct(x.pct_grupo[g]), fmtInt.format(x.votos_grupo[g])])));
      }
    }
  }

  /** Barras empilhadas de 100% por eleição e cargo: participação nos votos válidos ou nas vagas (rótulo: % e absoluto). */
  function composicao() {
    const vagas = est.compMed === "vagas";
    const fmtAbs = vagas ? (v) => fmtInt.format(v) : fmtVotos;
    const caixa = el("div", { class: "composicao cartao" });
    const linhasTab = [];
    if (!["todos", "7", "6", "13", "11"].includes(est.compCargo)) est.compCargo = "todos";
    for (const [a, c] of ELEICOES.filter(([, cc]) => est.compCargo === "todos" || cc === est.compCargo)) {
      const cg = cargoDe(a, c), x = cg.forca.estado["Piauí"], e = cg.eleitos_estado;
      const total = d3.sum(Object.values(e));
      const nomeLinha = vagas && c === "11" ? `Prefeituras ${a}` : rotulo(a, c);
      const dados = G.map((g) => (vagas ? { g, pct: total ? (100 * (e[g] || 0)) / total : null, abs: e[g] || 0 }
        : { g, pct: x.pct_grupo[g], abs: x.pct_grupo[g] === null ? null : x.votos_grupo[g] }));
      const faltam = vagas ? G.filter((g) => !e[g]) : cg.grupos_sem_candidatos;
      caixa.append(Lab.linhaBarra100({ rotulo: nomeLinha,
        aria: `${nomeLinha}: ${dados.filter((d) => d.pct).map((d) => `${nomeG(d.g)} ${fmtPct(d.pct)} (${fmtInt.format(d.abs)} ${vagas ? "vagas" : "votos"})`).join(", ")}`,
        abaixo: faltam.length ? `${vagas ? "sem vagas" : "sem candidatos"}: ${faltam.join(", ")}` : null,
        segmentos: dados.map((d) => {
          const pctTxt = `${Math.round(d.pct)}%`, absTxt = fmtAbs(d.abs);
          return { cor: corGrupo(d.g), pct: d.pct, texto: `${nomeG(d.g)} ${pctTxt} · ${absTxt}`, medio: `${pctTxt} · ${absTxt}`, curto: vagas ? absTxt : pctTxt,
            dica: [`${nomeG(d.g)} · ${nomeLinha}`, vagas
              ? [`${fmtInt.format(d.abs)} de ${fmtInt.format(total)} ${c === "11" ? "prefeituras" : "vagas"} (${fmtPct(d.pct)})`, `${fmtPct(x.pct_grupo[d.g])} dos votos válidos`]
              : [`${fmtPct(d.pct)} dos válidos`, `${fmtInt.format(d.abs)} votos`, ...resumoGrupo(d.g, a, x)]] };
        }) }));
      linhasTab.push([nomeLinha, ...dados.map((d) => (d.pct === null ? "—" : `${fmtInt.format(d.abs)} (${fmtPct(d.pct, 0)})`)), fmtInt.format(vagas ? total : x.validos)]);
    }
    caixa.append(el("div", { class: "legenda" }, ...G.map((g) => chave(g)), el("span", { class: "chave" }, el("span", { class: "amostra-50" }), vagas ? "50% das vagas" : "50% dos válidos")),
      el("details", { class: "info" }, el("summary", {}, "Ver tabela"),
        el("div", { class: "rolagem" }, tabelaSimples(["", ...G.map((g) => [chip(g), nomeG(g)]), vagas ? "Total de vagas" : "Votos válidos"], linhasTab, true))),
      rodape({ fontes: ["tse", "api"], cobertura: coberturaDe("2024", "municipio"),
        nota: vagas
          ? `Vagas = eleitos de cada grupo (deputados: vagas do Piauí; prefeituras: partido do prefeito eleito — em 2020, Teresina no 2º turno e Juazeiro do Piauí e Murici dos Portelas na eleição extraordinária). Eleitos de 2026 conforme a totalização do 1º turno (05/10/2026), sujeita a revisão. PT/PV/PCdoB = Federação Brasil da Esperança (PT, PCdoB e PV). ${NOTA_PP}`
          : `PT/PV/PCdoB = Federação Brasil da Esperança (PT, PCdoB e PV). ${NOTA_PP} Em 2018 e 2020, antes das federações e do União Brasil, os grupos têm a mesma composição (PT + PCdoB + PV; PP + DEM + PSL). Em 2022, o PSD não teve candidatos a deputado estadual e o MDB não teve candidatos a deputado federal no Piauí.` }));
    return [
      el("h3", {}, "Participação dos grupos em ",
        seletorTitulo("Mostrar", [["votos", "votos válidos"], ["vagas", "vagas conquistadas"]], est.compMed, (v) => atualizar({ compMed: v })),
        ", em cada eleição — ",
        seletorTituloLista("Cargo", [["todos", "todos os cargos"], ["7", "Deputado Estadual"], ["6", "Deputado Federal"], ["13", "Vereador"], ["11", "Prefeito"]],
          est.compCargo, (v) => atualizar({ compCargo: v }))),
      instrucao(vagas
        ? "Cada barra soma 100% das vagas do cargo (ou das 224 prefeituras); a largura de cada trecho é a parcela do grupo e o rótulo traz o % e o número de eleitos. A linha pontilhada marca a metade das vagas."
        : "Cada barra soma 100% dos votos válidos do cargo no Piauí; o rótulo traz o % e os votos do grupo. A linha pontilhada marca 50% (maioria absoluta).",
        "Passe o mouse ou toque num trecho para ver os detalhes. Rótulos que não cabem no trecho ficam na dica e na tabela."),
      caixa];
  }

  // ---- 2. Evolução 2022 → 2026 (mesmo cargo no tempo)
  function episodioEvolucao(sec) {
    sec.append(...titulo("2. Evolução no tempo"),
      el("p", { class: "lead", text: "O mesmo cargo ao longo das eleições — gerais (2018, 2022, 2026) ou municipais (2020, 2024): quanto cada grupo ampliou ou reduziu sua votação no Piauí e em cada lugar." }));
    graficoEvolucao(sec);
    const comps = [["estadual_2022_x_2026", "Deputado Estadual, 2022 → 2026"], ["federal_2022_x_2026", "Deputado Federal, 2022 → 2026"],
      ["estadual_2018_x_2022", "Deputado Estadual, 2018 → 2022"], ["federal_2018_x_2022", "Deputado Federal, 2018 → 2022"],
      ["estadual_2018_x_2026", "Deputado Estadual, 2018 → 2026"], ["federal_2018_x_2026", "Deputado Federal, 2018 → 2026"],
      ["vereador2020_x_vereador2024", "Vereador, 2020 → 2024"], ["prefeito2020_x_prefeito2024", "Prefeito, 2020 → 2024"]];
    if (!comps.some(([k]) => k === est.vComp)) est.vComp = comps[0][0];
    const c = base.coesao[est.vComp];
    const emVotos = est.vMed === "votos";
    const campoVar = emVotos ? "variacao_votos" : "variacao_pp";
    const g = est.vGrupo, nivel = est.vNivel;
    const vari = c[campoVar][nivel] || {};
    const noEstado = c[campoVar].estado?.["Piauí"] || {};
    const [[a1, c1], [a2, c2]] = c.chaves;
    const f1 = cargoDe(a1, c1).forca[nivel], f2 = cargoDe(a2, c2).forca[nivel];
    const fmtD = (d) => comSinal(d, emVotos ? (v) => `${fmtInt.format(v)} votos` : fmtPP);
    const lCargo = () => seletorTituloLista("Comparação", comps, est.vComp, (v) => atualizar({ vComp: v }));
    sec.append(el("h2", { class: "sub", text: "Onde cada grupo ampliou ou reduziu a votação" }),
      quadrosGrupo(g, (gg) => (noEstado[gg] === null || noEstado[gg] === undefined ? "—" : fmtD(noEstado[gg])), (gg) => atualizar({ vGrupo: gg }), "GrupoEvolucao"),
      el("p", { class: "nota", text: `Variação no Piauí, ${c.cargos[0]} → ${c.cargos[1]}. Clique num grupo para vê-lo no mapa e no gráfico ao lado. “—”: grupo sem candidatos em uma das eleições.` }));
    if (Object.values(vari).every((x) => x[g] === null || x[g] === undefined)) { sec.append(el("p", { class: "aviso" }, `${nomeG(g)} não teve candidatos em uma das eleições desta comparação: `, lCargo(), ".")); return; }
    const varDe = (u) => vari[u]?.[g] ?? null;
    const varVotosTxt = (v) => (v === null ? "—" : `${v > 0 ? "ganhou " : v < 0 ? "perdeu " : "manteve "}${fmtInt.format(Math.abs(v))} votos`);
    const varPPTxt = (v) => (v === null ? "—" : `${v > 0 ? "ampliou " : v < 0 ? "reduziu " : "manteve "}${fmtPP(Math.abs(v))}`);
    const dicaU = (u) => (!f1[u] && !f2[u] ? ["sem dados"] : [
      `variação: ${emVotos ? varVotosTxt(varDe(u)) : varPPTxt(varDe(u))}`,
      `${c.cargos[0]}: ${fmtPct(f1[u]?.pct_grupo[g])} · ${fmtInt.format(f1[u]?.votos_grupo[g] ?? 0)} votos`,
      `${c.cargos[1]}: ${fmtPct(f2[u]?.pct_grupo[g])} · ${fmtInt.format(f2[u]?.votos_grupo[g] ?? 0)} votos`]);
    const abrir = nivel === "municipio" ? (u) => abrirFicha(u) : null;
    const unidades = Object.keys(f1);

    // cor divergente: redução (cinza escuro) ← 0 (claro) → ampliação (cor do grupo).
    // Em votos, a cor satura no percentil 95 do módulo da variação (Teresina não apaga o resto do mapa).
    const absVals = unidades.map((u) => Math.abs(varDe(u) ?? 0)).sort(d3.ascending);
    const maxCor = (emVotos ? Math.round(d3.quantileSorted(absVals, 0.95)) : d3.max(absVals)) || 1;
    const saturados = emVotos ? absVals.filter((v) => v > maxCor).length : 0;
    const cg = d3.color(corGrupo(g)), neutro = d3.color(token("cor-texto-secundario"));
    const corDe = (d) => { const t = Math.max(-1, Math.min(1, d / maxCor));
      return t >= 0 ? d3.interpolateLab(token("cor-superficie"), cg.darker(0.4))(t) : d3.interpolateLab(token("cor-superficie"), neutro)(-t); };
    const fmtMax = emVotos ? `${fmtVotos(maxCor)} votos${saturados ? " ou mais" : ""}` : fmtPP(maxCor);

    const grade = el("div", { class: "grade2", "data-escopo": "evolucao" });
    const cMapa = el("div", { class: "cartao" }), cDist = el("div", { class: "cartao" });
    grade.append(cMapa, cDist); sec.append(grade);
    Lab.ligarDestaque(grade);
    const ampliou = unidades.filter((u) => (varDe(u) ?? 0) > 0).length, reduziu = unidades.filter((u) => (varDe(u) ?? 0) < 0).length;
    cMapa.append(el("h3", {}, "Variação ", seletorTitulo("Medida", [["pct", "em p.p. dos válidos"], ["votos", "em votos"]], est.vMed, (v) => atualizar({ vMed: v })),
        ` de ${nomeG(g)} por `, seletorTituloLista("Recorte territorial", OPC_NIVEL, nivel, (v) => atualizar({ vNivel: v })), " — ", lCargo()),
      placar(`${nomeG(g)} ${emVotos ? "ganhou votos" : "ampliou a votação"} em ${ampliou} e ${emVotos ? "perdeu" : "reduziu"} em ${reduziu} das ${unidades.length} unidades.`),
      instrucao(`Tons da cor do grupo: ${emVotos ? "ganhou votos" : "ampliou sua parcela dos válidos"} de ${a1} para ${a2}; cinza: ${emVotos ? "perdeu votos" : "reduziu"}; claro: pouca mudança.${saturados ? ` A cor para de escurecer em ${fmtVotos(maxCor)} votos (${saturados} unidades passam disso).` : ""}`,
        "Passe o mouse numa área: a mesma unidade acende no gráfico ao lado. Clique ou use a lupa para fixar o destaque."));
    mapa(cMapa, nivel, (u) => (varDe(u) !== null ? corDe(varDe(u)) : token("cor-grade")), dicaU, abrir,
      `Mapa: variação ${emVotos ? "em votos" : "em pontos percentuais"} de ${nomeG(g)} entre ${c.cargos.join(" e ")}.`,
      { tamanho: (u) => f1[u]?.validos || 0, rotuloTamanho: `votos válidos (${c.cargos[0]})`,
        legenda: Lab.legendaRampa(d3.range(-4, 5).map((k) => corDe((k / 4) * maxCor)), `${emVotos ? "perdeu" : "reduziu"} ${fmtMax}`, `${emVotos ? "ganhou" : "ampliou"} ${fmtMax}`) });
    cMapa.append(rodape({ fontes: fontesNivel(nivel, [a1, a2]), cobertura: "224 municípios do Piauí.", nota: g === "PP" ? NOTA_PP : null }));

    // distribuição sem eixo vertical: cada unidade na posição da sua variação (0 no centro)
    const pts = unidades.map((u) => ({ u, d: varDe(u), peso: f1[u]?.validos || 0 })).filter((p) => p.d !== null);
    const porVotos = est.vTam === "votos";
    cDist.append(el("h3", { text: `Distribuição da variação de ${nomeG(g)} ${POR_NIVEL[nivel]} (0 = sem variação)` }),
      placar(`${ampliou} ${emVotos ? "ganharam votos" : "ampliaram"} · ${reduziu} ${emVotos ? "perderam" : "reduziram"} · ${unidades.length} unidades`),
      instrucao(`Cada círculo é ${UM_NIVEL[nivel]}. À direita do centro, o grupo ${emVotos ? "ganhou votos" : "ampliou sua parcela dos válidos"}; à esquerda, ${emVotos ? "perdeu" : "reduziu"}; no centro (0), não variou. A altura não tem significado: só afasta os círculos para não se sobreporem.`,
        emVotos ? "Em votos, o eixo é comprimido longe do centro (escala logarítmica simétrica), para que as maiores cidades não espremam as demais: cada marca vale até 10 vezes a anterior." : null,
        "Passe o mouse num círculo para ver a unidade no mapa; clique para fixar o destaque."));
    const { foraIds } = Lab.distribuicao(cDist, { pontos: pts, cor: corDe, simlog: emVotos,
      fmtMarca: (v) => (v === 0 ? "0" : emVotos ? comSinal(v, fmtVotos) : comSinal(v, (x) => `${x.toLocaleString("pt-BR")}`)),
      rotuloEsq: emVotos ? "perdeu votos" : "reduziu", rotuloDir: emVotos ? "ganhou votos" : "ampliou", rotuloEixo: emVotos ? "variação em votos" : "variação em p.p.",
      porPeso: porVotos, rotuloPeso: `votos válidos (${c.cargos[0]})`, raio: nivel === "municipio" ? 4.5 : 8, rMaxPeso: nivel === "municipio" ? 16 : 24,
      alturaMax: nivel === "municipio" ? 360 : 220, nome: (u) => nomeUnidade(nivel, u), dica: dicaU,
      aria: `Distribuição da variação de ${nomeG(g)} por ${NOME_NIVEL[nivel]}: ${ampliou} ampliaram, ${reduziu} reduziram.` });
    painelGrafico(cDist, nivel, dicaU, abrir);
    if (porVotos) cDist.append(notaFora(foraIds.map((u) => nomeUnidade(nivel, u))));
    cDist.append(alternar("Tamanho", [["igual", "Igual"], ["votos", "Por votos"]], est.vTam, (v) => atualizar({ vTam: v }), true),
      rodape({ fontes: ["tse", ...(a2 === "2026" ? ["api"] : [])], nota: `Cor igual à do mapa${emVotos && saturados ? ` (satura em ${fmtVotos(maxCor)} votos)` : ""}.` }));

    // onde mais ampliou / reduziu
    const ordem = pts.map((p) => p.u).sort((p, q) => varDe(q) - varDe(p));
    const linhasT = (lista) => lista.map((u) => emVotos
      ? [nomeUnidade(nivel, u), fmtInt.format(f1[u]?.votos_grupo[g] ?? 0), fmtInt.format(f2[u]?.votos_grupo[g] ?? 0), comSinal(varDe(u), (x) => fmtInt.format(x))]
      : [nomeUnidade(nivel, u), fmtPct(f1[u]?.pct_grupo[g]), fmtPct(f2[u]?.pct_grupo[g]), comSinal(varDe(u), fmtPP)]);
    const cab = emVotos ? [maiuscula(NOME_NIVEL[nivel]), `Votos ${a1}`, `Votos ${a2}`, "Variação"] : [maiuscula(NOME_NIVEL[nivel]), a1, a2, "Variação"];
    sec.append(el("div", { class: "grade2" },
      el("div", {}, el("h3", { text: `Onde ${nomeG(g)} mais ${emVotos ? "ganhou votos" : "ampliou"}` }), el("div", { class: "rolagem" }, tabelaSimples(cab, linhasT(ordem.slice(0, 8))))),
      el("div", {}, el("h3", { text: `Onde ${nomeG(g)} mais ${emVotos ? "perdeu votos" : "reduziu"}` }), el("div", { class: "rolagem" }, tabelaSimples(cab, linhasT(ordem.slice(-8).reverse()))))));
  }

  /** Evolução de cada grupo no mesmo cargo: eleições gerais (2018 → 2022 → 2026; Dep. Estadual e Federal) ou
   *  municipais (2020 → 2024; Vereador e Prefeito), sem misturar as duas; em % dos válidos ou em votos,
   *  no Piauí ou num recorte. A variação do subtítulo (1º → último momento) vem da base Python. */
  const SERIES_EVOLUCAO = {
    gerais: { anos: ["2018", "2022", "2026"], cargos: [["7", "estadual_2018_x_2026", "dep. estadual"], ["6", "federal_2018_x_2026", "dep. federal"]] },
    municipais: { anos: ["2020", "2024"], cargos: [["13", "vereador2020_x_vereador2024", "vereador"], ["11", "prefeito2020_x_prefeito2024", "prefeito"]] },
  };
  function graficoEvolucao(sec) {
    if (!SERIES_EVOLUCAO[est.evTipo]) est.evTipo = "gerais";
    const { anos, cargos } = SERIES_EVOLUCAO[est.evTipo];
    const [nivel, un] = est.evUn.split("|");
    const emVotos = est.evMed === "votos";
    const opcoes = [["estado|Piauí", "Piauí"],
      ...Object.keys(cargoDe("2026", "7").forca.territorio).sort().map((t) => [`territorio|${t}`, `Território · ${t}`]),
      ...Object.keys(cargoDe("2026", "7").forca.intermediaria).sort().map((t) => [`intermediaria|${t}`, `Região intermediária · ${t}`])];
    const valor = (ano, c, g) => {
      const cg = cargoDe(ano, c), u = cg.forca[nivel][un];
      if (cg.grupos_sem_candidatos.includes(g) || !u) return null;
      return emVotos ? u.votos_grupo[g] : u.pct_grupo[g];
    };
    // variação do 1º ao último momento: da base Python (coesão no tempo), em p.p. ou em votos
    const variacao = (chave, g) => (base.coesao[chave][emVotos ? "variacao_votos" : "variacao_pp"][nivel]?.[un]?.[g] ?? null);
    const variacoes = cargos.flatMap(([, chave, nomeC]) => G.map((g) => ({ g, nomeC, d: variacao(chave, g) })).filter((x) => x.d !== null));
    const alta = d3.greatest(variacoes, (x) => x.d), queda = d3.least(variacoes, (x) => x.d);
    const fmtV = emVotos ? fmtVotos : fmtPct, fmtD = (d) => comSinal(d, emVotos ? (v) => `${fmtVotos(v)} votos` : fmtPP);
    const periodo = `${anos[0]} → ${anos.at(-1)}`;
    sec.append(el("h3", {}, seletorTitulo("Medida", [["votos", "Votos"], ["pct", "% dos votos válidos"]], est.evMed, (v) => atualizar({ evMed: v })),
        " de cada grupo nas ", seletorTituloLista("Eleições", [["gerais", "eleições gerais (2018 → 2022 → 2026)"], ["municipais", "eleições municipais (2020 → 2024)"]], est.evTipo, (v) => atualizar({ evTipo: v })),
        " — ", seletorTituloLista("Recorte territorial", opcoes, est.evUn, (v) => atualizar({ evUn: v }))),
      alta && queda ? placar(`De ${periodo}: maior ampliação, ${nomeG(alta.g)} (${alta.nomeC}), ${fmtD(alta.d)}; maior redução, ${nomeG(queda.g)} (${queda.nomeC}), ${fmtD(queda.d)}`) : null,
      instrucao(`Cada linha liga ${emVotos ? "os votos" : "o % dos votos válidos"} do grupo no mesmo cargo em ${anos.join(", ")}. Linha subindo: o grupo ampliou a votação; descendo: reduziu.`,
        est.evTipo === "gerais" ? "Em 2018 ainda não havia federações nem o União Brasil: o grupo PT/PV/PCdoB soma PT, PCdoB e PV, e a União Progressista soma PP, DEM e PSL (antecessores do União Brasil). “Outros” reúne muitos partidos pequenos naquele ano." : "Em 2020 ainda não havia federações nem o União Brasil: os grupos têm a mesma composição usada em 2024 (PT + PCdoB + PV; PP + DEM + PSL).",
        emVotos ? "Em votos, a variação também reflete mudanças no total de eleitores que votaram; em % dos válidos, só a fatia do grupo." : null,
        "Passe o mouse num ponto para ver os valores."));
    const grade = el("div", { class: "grade-evolucao" });
    sec.append(grade);
    for (const [c, chave] of cargos) {
      const cartao = el("div", { class: "cartao" });
      grade.append(cartao);
      const nomeCargo = cargoDe(anos.at(-1), c).nome;
      cartao.append(el("h3", { text: nomeCargo }));
      const ss = G.map((g) => ({ g, valores: anos.map((a) => valor(a, c, g)) }));
      const dica = (g, i) => {
        const a = anos[i], u = cargoDe(a, c).forca[nivel][un];
        return [`${nomeG(g)} · ${nomeCargo} ${a}`, [`${fmtPct(u?.pct_grupo[g])} dos válidos`, `${fmtInt.format(u?.votos_grupo[g] || 0)} votos`,
          i === anos.length - 1 ? `variação desde ${anos[0]}: ${comSinal(base.coesao[chave].variacao_pp[nivel]?.[un]?.[g] ?? null, fmtPP)} · ${comSinal(base.coesao[chave].variacao_votos[nivel]?.[un]?.[g] ?? null, (v) => `${fmtInt.format(v)} votos`)}` : null,
          ...resumoGrupo(g, a, u)]];
      };
      const ausentes = (x) => anos.filter((a, i) => x.valores[i] === null);
      Lab.linhasPontas(cartao, { pontas: anos, fmt: fmtV, largura: 500,
        aria: `${nomeCargo}, ${un}: ${ss.map((x) => `${nomeG(x.g)} ${x.valores.map(fmtV).join(" → ")}`).join("; ")}.`,
        series: ss.map((x) => ({ cor: corGrupo(x.g), valores: x.valores, rotulo: `${nomeG(x.g)}${ausentes(x).length ? ` (sem ${ausentes(x).join(", ")})` : ""}`,
          dicas: anos.map((_, i) => dica(x.g, i)) })) });
      const semCand = ss.filter((x) => ausentes(x).length);
      cartao.append(rodape({ fontes: fontesNivel(nivel, anos),
        nota: `${NOTA_PP}${semCand.length ? ` Sem linha num ano: grupo sem candidatos neste cargo (${semCand.map((x) => `${nomeG(x.g)}: ${ausentes(x).join(", ")}`).join("; ")}).` : ""}` }));
    }
  }

  // ---- 3. Consistência entre cargos (4.2)
  function episodioCoesao(sec) {
    const chaves = [["2026", "2026 · Estadual × Federal"], ["2022", "2022 · Estadual × Federal"], ["2018", "2018 · Estadual × Federal"], ["vereador2024_x_estadual2026", "Vereador 2024 × Estadual 2026"]];
    if (!chaves.some(([k]) => k === est.cAno)) est.cAno = "2026";
    const c = base.coesao[est.cAno];
    sec.append(...titulo("3. Consistência entre cargos"),
      el("p", { class: "lead", text: "Um grupo tem voto casado quando seu percentual para um cargo se parece com o percentual para o outro no mesmo lugar. A diferença entre os dois mostra onde o voto do grupo se divide." }));
    const nMun = d3.max(G, (gg) => c.pearson_municipios[gg].n) || 0;
    const ordemCorr = G.filter((gg) => c.pearson_municipios[gg].r !== null).sort((a, b) => c.pearson_municipios[b].r - c.pearson_municipios[a].r);
    sec.append(el("h3", {}, "Correlação por grupo entre ",
        seletorTituloLista("Comparação", chaves.map(([k]) => [k, base.coesao[k].cargos.join(" e ")]), est.cAno, (v) => atualizar({ cAno: v }))),
      ordemCorr.length ? placar(`${nMun} municípios. Voto mais casado: ${nomeG(ordemCorr[0])} (corr ${fmtR(c.pearson_municipios[ordemCorr[0]].r)}); mais dividido: ${nomeG(ordemCorr.at(-1))} (corr ${fmtR(c.pearson_municipios[ordemCorr.at(-1)].r)}).`) : null,
      quadrosGrupo(est.cGrupo, (gg) => (c.pearson_municipios[gg].r === null ? "—" : `corr = ${fmtR(c.pearson_municipios[gg].r)}`), (gg) => atualizar({ cGrupo: gg }), "Grupo"),
      el("p", { class: "nota", text: "Clique num grupo para vê-lo no mapa e na dispersão." }),
      instrucao("corr (correlação de Pearson) perto de 1: onde o grupo vai bem para um cargo, vai bem para o outro; perto de 0: o desempenho num cargo não indica o do outro. “—”: grupo sem candidatos em um dos cargos."));
    if (c.tipo === "cargos_e_eleicoes_diferentes") sec.append(el("p", { class: "aviso", text: "Comparação entre eleições diferentes (municipal de 2024 e geral de 2026): leitura complementar, não é coesão no mesmo pleito." }));
    const g = est.cGrupo, nivel = est.cNivel, dif = c.diferenca_pp[nivel];
    if (Object.values(dif).every((x) => x[g] === null)) { sec.append(el("p", { class: "aviso", text: `${nomeG(g)} não teve candidatos em um dos cargos desta comparação.` })); graficoCorrelacaoTempo(sec); return; }
    const [[a1, c1], [a2, c2]] = c.chaves;
    const f1 = cargoDe(a1, c1).forca[nivel], f2 = cargoDe(a2, c2).forca[nivel];
    // divergente pelo tamanho da diferença (decisão do pesquisador, 2026-10-06): centro neutro na mediana do grupo
    // nesta comparação; cor do grupo = mais casado que o típico (até 0 p.p.); cinza = mais dividido (até o máximo)
    const difs = Object.values(dif).map((x) => x[g]).filter((v) => v !== null);
    const med = d3.median(difs) ?? 0, max = d3.max(difs) || 1;
    const dicaU = (u) => (dif[u] ? [`diferença: ${fmtPP(dif[u][g])}${dif[u][g] !== null ? (dif[u][g] <= med ? " (mais casado que o típico)" : " (mais dividido que o típico)") : ""}`, `${c.cargos[0]}: ${fmtPct(f1[u]?.pct_grupo[g])}`, `${c.cargos[1]}: ${fmtPct(f2[u]?.pct_grupo[g])}`, `${fmtInt.format(f1[u]?.validos || 0)} votos válidos (${c.cargos[0]})`] : ["sem dados"]);
    const abrir = nivel === "municipio" ? (u) => abrirFicha(u) : null;
    const grade = el("div", { class: "grade2", "data-escopo": "consistencia" });
    const cMapa = el("div", { class: "cartao" }), cDisp = el("div", { class: "cartao" });
    grade.append(cMapa, cDisp); sec.append(grade);
    Lab.ligarDestaque(grade);
    const cg = d3.color(corGrupo(g)), neutro = d3.color(token("cor-texto-secundario"));
    const corDif = (v) => (v <= med
      ? d3.interpolateLab(token("cor-superficie"), cg.darker(0.4))(med > 0 ? (med - v) / med : 1)
      : d3.interpolateLab(token("cor-superficie"), neutro.darker(0.6))(max > med ? (v - med) / (max - med) : 1));
    cMapa.append(el("h3", {}, `Diferença do voto em ${nomeG(g)} entre ${c.cargos[0]} e ${c.cargos[1]}, por `,
        seletorTituloLista("Recorte territorial", OPC_NIVEL, nivel, (v) => atualizar({ cNivel: v }))),
      placar(`Diferença típica (mediana) entre os dois cargos: ${fmtPP(med)}; a maior chega a ${fmtPP(max)}`),
      instrucao(`Cor do grupo: voto mais casado que o típico (diferença entre os cargos abaixo de ${fmtPP(med)}, a mediana); quanto mais forte, mais perto de 0. Cinza: mais dividido que o típico; quanto mais escuro, maior a diferença. Tom claro: perto da mediana.`,
        "A diferença não tem lado: tanto faz em qual cargo o grupo foi melhor.",
        "Passe o mouse numa área: a mesma unidade acende na dispersão ao lado. Clique ou use a lupa para fixar o destaque."));
    mapa(cMapa, nivel, (u) => (dif[u]?.[g] !== null && dif[u]?.[g] !== undefined ? corDif(dif[u][g]) : token("cor-grade")), dicaU, abrir,
      `Mapa: diferença em pontos percentuais do voto em ${nomeG(g)} entre ${c.cargos.join(" e ")}; cor do grupo = voto mais casado que a mediana, cinza = mais dividido.`,
      { tamanho: (u) => f1[u]?.validos || 0, rotuloTamanho: `votos válidos (${c.cargos[0]})`,
        legenda: Lab.legendaTres(d3.range(9).map((k) => corDif(k <= 4 ? (med * k) / 4 : med + ((max - med) * (k - 4)) / 4)),
          "casado (0 p.p.)", `típico (${fmtPP(med)})`, `dividido (${fmtPP(max)})`) });
    cMapa.append(rodape({ fontes: fontesNivel(nivel, [a1, a2]), cobertura: coberturaDe(a1 === "2024" ? "2024" : a2, c1 === "13" ? "municipio" : "x"),
      nota: `Centro da escala na mediana da diferença deste grupo nesta comparação (${fmtPP(med)}).${g === "PP" ? " " + NOTA_PP : ""}` }));

    // dispersão: mesmas unidades e mesmo grupo do mapa
    const pts = Object.keys(dif).map((u) => ({ u, x: f1[u]?.pct_grupo[g], y: f2[u]?.pct_grupo[g], peso: f1[u]?.validos || 0 }))
      .filter((p) => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined);
    cDisp.append(el("h3", { text: `% de ${nomeG(g)} em ${c.cargos[0]} × ${c.cargos[1]}, ${POR_NIVEL[nivel]}` }),
      placar(`Correlação nos municípios: corr = ${fmtR(c.pearson_municipios[g].r)}`),
      instrucao(`Cada ponto é ${UM_NIVEL[nivel]}.`, "Na linha tracejada, o grupo teve o mesmo percentual nos dois cargos; longe dela, o voto se dividiu.",
        "Passe o mouse num ponto para ver a unidade no mapa; clique para fixar o destaque."));
    const porVotos = est.cTam === "votos";
    const { foraIds } = Lab.dispersao(cDisp, { pontos: pts, cor: corGrupo(g), fmtEixo: (v) => `${v}%`, rotuloX: c.cargos[0], rotuloY: c.cargos[1],
      porPeso: porVotos, rotuloPeso: `votos válidos (${c.cargos[0]})`, raio: nivel === "municipio" ? 5 : 7, rMaxPeso: nivel === "municipio" ? 22 : 30,
      nome: (u) => nomeUnidade(nivel, u), dica: dicaU,
      aria: `Dispersão: % de ${nomeG(g)} em ${c.cargos[0]} (horizontal) e ${c.cargos[1]} (vertical) por ${NOME_NIVEL[nivel]}.` });
    painelGrafico(cDisp, nivel, dicaU, abrir);
    if (porVotos) cDisp.append(notaFora(foraIds.map((u) => nomeUnidade(nivel, u))));
    cDisp.append(alternar("Tamanho", [["igual", "Igual"], ["votos", "Por votos"]], est.cTam, (v) => atualizar({ cTam: v }), true),
      rodape({ fontes: ["tse", ...(a2 === "2026" ? ["api"] : [])], nota: "Linha tracejada: mesmo percentual nos dois cargos." }));
    const ordem = Object.entries(dif).filter(([, x]) => x[g] !== null).sort((p, q) => q[1][g] - p[1][g]);
    const cab = [maiuscula(NOME_NIVEL[nivel]), c.cargos[0], c.cargos[1], "Diferença"];
    const linhasT = (lista) => lista.map(([u, x]) => [nomeUnidade(nivel, u), fmtPct(f1[u]?.pct_grupo[g]), fmtPct(f2[u]?.pct_grupo[g]), fmtPP(x[g])]);
    sec.append(el("div", { class: "grade2" },
      el("div", {}, el("h3", { text: `Onde o voto em ${nomeG(g)} mais se dividiu` }), el("div", { class: "rolagem" }, tabelaSimples(cab, linhasT(ordem.slice(0, 8))))),
      el("div", {}, el("h3", { text: `Onde o voto em ${nomeG(g)} foi mais casado` }), el("div", { class: "rolagem" }, tabelaSimples(cab, linhasT(ordem.slice(-8).reverse()))))));
    graficoCorrelacaoTempo(sec);
  }

  /** Correlação (Pearson, nos 224 municípios) entre Dep. Estadual e Dep. Federal de cada grupo, em 2018, 2022 e 2026.
   *  Valores da base Python (coesão entre cargos, EL0005); a página só desenha. */
  function graficoCorrelacaoTempo(sec) {
    const anos = ["2018", "2022", "2026"];
    const r = (a, g) => base.coesao[a].pearson_municipios[g].r;
    const series = G.map((g) => ({ g, valores: anos.map((a) => r(a, g)) }));
    const ultimo = series.filter((x) => x.valores.at(-1) !== null).sort((p, q) => q.valores.at(-1) - p.valores.at(-1));
    const ausentes = (x) => anos.filter((a, i) => x.valores[i] === null);
    sec.append(el("h3", { text: "Correlação entre o voto para Deputado Estadual e para Deputado Federal, por grupo — 2018, 2022 e 2026" }),
      ultimo.length ? placar(`Em 2026, voto mais casado: ${nomeG(ultimo[0].g)} (corr ${fmtR(ultimo[0].valores.at(-1))}); mais dividido: ${nomeG(ultimo.at(-1).g)} (corr ${fmtR(ultimo.at(-1).valores.at(-1))}).`) : null,
      instrucao("Cada linha é um grupo; cada ponto, a correlação de Pearson entre o % do grupo para deputado estadual e para deputado federal nos 224 municípios, na mesma eleição.",
        "Perto de 1: onde o grupo vai bem para um cargo, vai bem para o outro (voto casado); perto de 0: o desempenho num cargo não indica o do outro. A altura vai de 0 (base do gráfico) a 1 (topo), igual em todos os anos.",
        "Em 2018 os grupos têm a mesma composição usada depois (PT + PCdoB + PV; PP + DEM + PSL)."));
    const cartao = el("div", { class: "cartao" });
    sec.append(cartao);
    Lab.linhasPontas(cartao, { pontas: anos, fmt: fmtR, dominio: [0, 1], largura: 620,
      aria: `Correlação entre os cargos por grupo: ${series.map((x) => `${nomeG(x.g)} ${x.valores.map(fmtR).join(" → ")}`).join("; ")}.`,
      series: series.map((x) => ({ cor: corGrupo(x.g), valores: x.valores, rotulo: `${nomeG(x.g)}${ausentes(x).length ? ` (sem ${ausentes(x).join(", ")})` : ""}`,
        dicas: anos.map((a, i) => [`${nomeG(x.g)} · ${a}`, [x.valores[i] === null ? "sem candidatos a um dos cargos" : `corr = ${fmtR(x.valores[i])}`,
          `${base.coesao[a].pearson_municipios[x.g].n} municípios`]]) })) });
    const sem = series.filter((x) => ausentes(x).length);
    cartao.append(rodape({ fontes: ["tse", "api"],
      nota: `Correlação de Pearson entre municípios (EL0005); descreve associação, não causalidade.${sem.length ? ` Sem ponto num ano: grupo sem candidatos a um dos cargos (${sem.map((x) => `${nomeG(x.g)}: ${ausentes(x).join(", ")}`).join("; ")}).` : ""} ${NOTA_PP}` }));
  }

  // ---- 4. Migrações e viradas (4.3)
  function episodioMudancas(sec) {
    if (!["2022", "2018"].includes(est.skIni)) est.skIni = "2018";
    const municipal = est.skEtapa.startsWith("mun");   // só eleições municipais (2020 → 2024)
    const sk = base.sankey[municipal ? `mun_${est.skEtapa.slice(3)}` : `${est.skCargo}_${est.skEtapa}${est.skIni === "2018" ? "_2018" : ""}`];
    const pesoTxt = `${cargoDe(sk.ano_peso, sk.cargo_peso).nome.toLowerCase()} ${sk.ano_peso}`;
    const anosSk = sk.etapas.map((t) => t.match(/\d{4}/)[0]);
    const listaAnos = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}` : xs[0]);
    sec.append(...titulo("4. Migrações e viradas"));
    const lEtapa = seletorTituloLista("Eleições", [["direto", "só eleições gerais"], ["11", "com o prefeito eleito"], ["13", "com o mais votado para vereador"],
      ["mun11", "só eleições municipais (prefeito)"], ["mun13", "só eleições municipais (vereador)"]], est.skEtapa, (v) => atualizar({ skEtapa: v }));
    sec.append(el("h3", {}, "Grupo líder em cada município — ", ...(municipal ? [lEtapa, ", 2020 → 2024"] : [
        seletorTituloLista("Cargo", [["7", "Deputado Estadual"], ["6", "Deputado Federal"]], est.skCargo, (v) => atualizar({ skCargo: v })), ", ",
        seletorTituloLista("Período", [["2018", "2018 → 2026"], ["2022", "2022 → 2026"]], est.skIni, (v) => atualizar({ skIni: v })), ", ", lEtapa])));
    const ultima = sk.etapas.length - 2;
    const ex = sk.fluxos.filter((f) => f.etapa === ultima && f.de !== f.para && G.includes(f.de) && G.includes(f.para)).sort((a, b) => b.municipios - a.municipios)[0];
    // como ler cada etapa ("Prefeito 2024" → "o prefeito eleito em 2024 era do grupo")
    const descr = (t) => { const [, nome, ano] = t.match(/^(.*) (\d{4})$/);
      return nome === "Prefeito" ? `o prefeito eleito em ${ano} era do grupo` : `o grupo mais votado para ${nome.toLowerCase()} em ${ano} foi`; };
    sec.append(el("details", { class: "info" }, el("summary", {}, "ⓘ Como ler o gráfico"),
      el("p", { text: `Cada barra é um grupo num momento (${listaAnos(anosSk)}), do tamanho dos municípios que ele liderava. Cada faixa liga o grupo que liderava um município num momento ao grupo que o liderava no momento seguinte.` }),
      el("p", {},
      ex ? `A faixa de ${nomeG(ex.de)} (${sk.etapas[ultima]}) para ${nomeG(ex.para)} (${sk.etapas[ultima + 1]}) reúne ${ex.municipios} municípios: neles, ${descr(sk.etapas[ultima])} ${nomeG(ex.de)} e ${descr(sk.etapas[ultima + 1])} ${nomeG(ex.para)}. ` : "",
      `Isso não quer dizer que votos saíram de um grupo para outro: o voto é secreto e o diagrama não acompanha eleitores. Ele compara quem liderava cada município em cada momento${est.skEtapa === "direto" || municipal ? ` — os eleitores de ${listaAnos(anosSk)} não são exatamente os mesmos. ` : " — prefeito e deputado são escolhas diferentes, que podem conviver no mesmo eleitor. "}`,
      est.skIni === "2018" || municipal ? "Em 2018 e 2020, os grupos têm a mesma composição usada depois (PT + PCdoB + PV; PP + DEM + PSL). " : "",
      est.skPeso === "validos_2026" ? `Com a largura em votos válidos, a espessura indica o tamanho dos municípios (votos válidos de ${pesoTxt}), não votos transferidos.` : "Com a largura em municípios, cada município conta 1, do menor ao maior."),
      el("p", { text: "Passe o mouse numa barra ou faixa para destacá-la; clique para fixar o destaque e ver a lista de municípios." })));
    const cartao = el("div", { class: "cartao" });
    sec.append(cartao);
    {
      const n0 = d3.rollup(Object.values(sk.sequencias), (v) => v.length, (s) => s[0]);
      const nF = d3.rollup(Object.values(sk.sequencias), (v) => v.length, (s) => s[s.length - 1]);
      const saldo = G.map((g) => ({ g, a: n0.get(g) || 0, b: nF.get(g) || 0 })).filter((x) => x.a || x.b).sort((p, q) => Math.abs(q.b - q.a) - Math.abs(p.b - p.a));
      cartao.append(placar(saldo.slice(0, 3).map((x) => `${nomeG(x.g)}: ${x.a} → ${x.b} municípios (${x.b - x.a > 0 ? "+" : ""}${x.b - x.a})`).join(" · ")));
    }
    Lab.sankey(cartao, { etapas: sk.etapas, sequencias: sk.sequencias, fluxos: sk.fluxos, ordem: [...G, "empate", "sem dados"],
      valor: (f) => (est.skPeso === "municipios" ? f.municipios : f.validos_2026), cor: corGrupo, nome: nomeG,
      nomeItem: (m) => porTse.get(m).nome, nomeUnidades: "municípios", rotuloEtapa: (t) => t.replace(/^Deputado /, ""),
      dicaFluxo: (f) => [`${fmtInt.format(f.municipios)} municípios`, `${fmtInt.format(f.validos_2026)} votos válidos (${pesoTxt})`],
      dicaNo: ({ cat, etapa, ids, pct, conta, ultima: ult }) => [
        `${fmtPct(pct)} ${est.skPeso === "municipios" ? "dos municípios" : `dos votos válidos (${pesoTxt}) da coluna`}`,
        sk.etapas[etapa].startsWith("Prefeito") ? `${fmtInt.format(ids.length)} municípios com prefeito(a) eleito(a) do grupo ${nomeG(cat)}`
          : `${fmtInt.format(ids.length)} municípios em que ${nomeG(cat)} foi o grupo mais votado (${sk.etapas[etapa]})`,
        `${fmtInt.format(d3.sum(ids, (m) => cargoDe(sk.ano_peso, sk.cargo_peso).forca.municipio[m]?.validos || 0))} votos válidos (${pesoTxt}) nesses municípios`,
        etapa > 0 ? `na etapa anterior, eram liderados por: ${conta(etapa - 1)}` : null,
        etapa < ult ? `na etapa seguinte, passam a: ${conta(etapa + 1)}` : null],
      nota: `Números nas barras: parte de cada coluna ${est.skPeso === "municipios" ? "(% dos 224 municípios)" : "(% dos votos válidos de ${pesoTxt} nos municípios)"} e, entre parênteses, o número de municípios; o fundo claro de cada coluna equivale a 100%.` });
    cartao.append(alternar("Largura", [["municipios", "Municípios"], ["validos_2026", "Votos válidos"]], est.skPeso, (v) => atualizar({ skPeso: v }), true));
    cartao.append(rodape({ fontes: ["tse", ...(sk.ano_peso === "2026" ? ["api"] : [])], cobertura: est.skEtapa.endsWith("13") ? coberturaDe("2024", "municipio") : "224 municípios do Piauí.",
      nota: `${est.skPeso === "validos_2026" ? `Largura proporcional aos votos válidos de ${pesoTxt}. ` : "Largura proporcional ao número de municípios. "}Mostra mudança de liderança, não transferência de votos. ${NOTA_PP}` }));

    // saldo 2022 → 2026
    const ini = d3.rollup(Object.values(sk.sequencias), (v) => v.length, (s) => s[0]);
    const n = sk.etapas.length - 1;
    const fim = d3.rollup(Object.values(sk.sequencias), (v) => v.length, (s) => s[n]);
    const mantidos = d3.rollup(Object.values(sk.sequencias).filter((s) => s[0] === s[n]), (v) => v.length, (s) => s[0]);
    sec.append(el("h3", { text: `Municípios liderados por grupo, ${sk.etapas[0]} → ${sk.etapas[n]}` }),
      el("div", { class: "rolagem" }, tabelaSimples(["Grupo", anosSk[0], anosSk[n], "Saldo", "Manteve"],
        G.map((g) => [[chip(g), nomeG(g)], fmtInt.format(ini.get(g) || 0), fmtInt.format(fim.get(g) || 0),
          `${(fim.get(g) || 0) - (ini.get(g) || 0) > 0 ? "+" : ""}${(fim.get(g) || 0) - (ini.get(g) || 0)}`, fmtInt.format(mantidos.get(g) || 0)]), true)));
    graficoIntensidade(sec);
  }

  /** Intensidade da liderança por grupo: boxplot (resumo calculado em Python, I6) + um círculo por município. */
  function graficoIntensidade(sec) {
    const ano = est.inAno, cargo = est.inCargo;
    const forca = cargoDe(ano, cargo).forca.municipio;
    const resumo = base.intensidade_resumo[ano][cargo];
    const linhas = G.filter((g) => resumo[g]).map((g) => ({ g, r: resumo[g],
      pts: Object.entries(forca).filter(([, x]) => x.lider?.grupo === g).map(([m, x]) => ({ m, v: x.lider.intensidade, margem: x.lider.margem, partido: x.lider.partido_mais_votado, votos: x.validos })) }));
    const porVotos = est.inTam === "votos";
    const maiorMed = [...G].filter((g) => resumo[g]).sort((a, b) => resumo[b].mediana - resumo[a].mediana)[0];
    sec.append(el("h3", {}, "Intensidade da liderança nos municípios liderados por cada grupo — ",
        seletorTituloLista("Eleição e cargo do gráfico", ELEICOES.map(([a, c]) => [`${a}|${c}`, rotulo(a, c)]), `${ano}|${cargo}`, (v) => { const [a, c] = v.split("|"); atualizar({ inAno: a, inCargo: c }); })),
      maiorMed ? placar(`Lideranças mais folgadas: ${nomeG(maiorMed)}, com mediana de ${fmtPct(resumo[maiorMed].mediana)} dos válidos nos ${resumo[maiorMed].n} municípios que lidera.`) : null,
      ...(cargo === "11" ? [el("p", { class: "nota", text: `Prefeito ${ano}: líder pelos votos do 1º turno da eleição ordinária (grupo com mais votos para prefeito no município).` })] : []),
      instrucao("Cada círculo é um município liderado pelo grupo — quanto mais à direita, maior a parcela dos votos do grupo líder.",
        "A faixa hachurada vai do 1º ao 3º quartil; “Med.” é a mediana; as hastes vão até o valor mais distante a 1,5 vez a largura da faixa; círculos com contorno forte ficam além delas.",
        "Clique num círculo para destacar o município nos outros gráficos."));
    const cartao = el("div", { class: "cartao", "data-escopo": "intensidade" });
    sec.append(cartao);
    const { foraIds } = Lab.boxplot(cartao, { dominio: [20, 100], referencias: CLASSES, fmt: fmtPct, porPeso: porVotos,
      rotuloPeso: "votos válidos do município no cargo", nomeUnidades: "municípios",
      aria: `Boxplot da intensidade da liderança por grupo em ${ano}; a tabela abaixo traz os valores.`,
      linhas: linhas.map((l) => ({ rotulo: nomeG(l.g), sub: `${l.r.n} mun.`, cor: corGrupo(l.g), resumo: l.r,
        pontos: l.pts.map((p) => ({ u: p.m, v: p.v, peso: p.votos, dica: [porTse.get(p.m).nome, [`${nomeG(l.g)} lidera com ${fmtPct(p.v)} dos válidos`,
          `margem de ${fmtPP(p.margem)} sobre o 2º grupo`, `partido mais votado: ${p.partido}`, `${fmtInt.format(p.votos)} votos válidos no cargo`, "clique para ver a ficha"]] })) })) });
    painelGrafico(cartao, "municipio", (m) => { const x = forca[m]; return x?.lider ? [`${nomeG(x.lider.grupo)} lidera com ${fmtPct(x.lider.intensidade)} dos válidos`,
      `margem de ${fmtPP(x.lider.margem)} sobre o 2º grupo`, `partido mais votado: ${x.lider.partido_mais_votado}`, `${fmtInt.format(x.validos)} votos válidos no cargo`] : ["sem dados"]; }, (m) => abrirFicha(m));
    if (porVotos) cartao.append(notaFora(foraIds.map((m) => porTse.get(m).nome)));
    cartao.append(alternar("Tamanho", [["igual", "Igual"], ["votos", "Por votos"]], est.inTam, (v) => atualizar({ inTam: v }), true));
    cartao.append(el("div", { class: "rolagem" }, tabelaSimples(["Grupo", "Municípios", "Mínimo", "1º quartil", "Mediana", "3º quartil", "Máximo"],
      linhas.map((l) => [[chip(l.g), nomeG(l.g)], fmtInt.format(l.r.n), fmtPct(l.r.min), fmtPct(l.r.q1), fmtPct(l.r.mediana), fmtPct(l.r.q3), fmtPct(l.r.max)]))),
      el("ul", { class: "frases-quartis" }, ...linhas.filter((l) => l.r.n >= 4).map((l) => el("li", {}, el("b", { text: `${nomeG(l.g)}: ` }),
        `25% dos municípios que lidera estão abaixo de ${fmtPct(l.r.q1)}; a mediana é ${fmtPct(l.r.mediana)}; 25% estão acima de ${fmtPct(l.r.q3)}.`))),
      rodape({ fontes: ["tse", ...(ano === "2026" ? ["api"] : [])], cobertura: coberturaDe(ano, cargo === "13" ? "municipio" : "x"),
        nota: `${porVotos ? "Área de cada círculo proporcional aos votos válidos do município no cargo. " : ""}Faixa hachurada: do 1º ao 3º quartil; Med.: mediana. Linhas verticais finas: limites das faixas de intensidade do mapa (${CLASSES.join("%, ")}%). Eixo a partir de 20%.` }));
  }

  // ---- 5. Seu município
  function episodioMunicipio(sec) {
    if (!est.mun || !porTse.has(est.mun)) est.mun = muns.find((m) => m.nome === "Teresina")?.tse || muns[0].tse;
    const m = porTse.get(est.mun);
    if (volta) sec.append(el("button", { class: "voltar", text: `← Voltar para ${EPISODIOS[volta.ep][0]}`,
      onclick: () => { const v = volta; volta = null; history.replaceState({ y: 0 }, "", enderecoAtual()); est.ep = v.ep; render(true, true); scrollTo(0, v.y); } }));
    sec.append(...titulo("5. Seu município"),
      el("h3", {}, "Ficha de ", seletorTituloLista("Município", muns.map((x) => [x.tse, x.nome]), est.mun, (v) => atualizar({ mun: v }))),
      el("p", { class: "nota", text: `Região imediata: ${m.imediata} · Região intermediária: ${m.intermediaria} · Território de Desenvolvimento: ${m.territorio}` }));
    const prefeitos = ["2024", "2020"].map((a) => [a, cargoDe(a, "11").prefeito[m.tse]]).filter(([, p]) => p);
    if (prefeitos.length) sec.append(el("div", { class: "tiles" }, ...prefeitos.map(([a, pref]) => el("div", { class: "tile" },
      el("div", { class: "rot" }, chip(pref.grupo), `Prefeito(a) eleito(a) em ${a}`),
      el("div", { class: "val", text: pref.nome_urna }), el("div", { class: "nota", text: `${pref.partido} · grupo ${nomeG(pref.grupo)}` })))));
    sec.append(el("h3", { text: `Divisão dos votos em ${m.nome}, em cada eleição e cargo` }));
    const caixa = el("div", { class: "composicao cartao" });
    for (const [a, c] of ELEICOES) {
      const cg = cargoDe(a, c), x = cg.forca.municipio[m.tse];
      if (!x) { caixa.append(el("div", { class: "linha" }, el("span", { class: "rot", text: rotulo(a, c) }), el("span", { class: "vazio", text: "sem dados (lacuna da fonte)" }))); continue; }
      const l = x.lider;
      const ver = c === "13" ? cg.eleitos_municipio?.[m.tse] : null;
      caixa.append(Lab.linhaBarra100({ rotulo: rotulo(a, c),
        abaixo: [l ? `lidera: ${nomeG(l.grupo)} (${fmtPct(l.intensidade)}, margem ${fmtPP(l.margem)})` : null,
          ver ? `vereadores eleitos: ${G.filter((g) => ver[g]).map((g) => `${nomeG(g)} ${ver[g]}`).join(", ")}` : null].filter(Boolean).join(" · "),
        segmentos: G.map((g) => { const v = x.pct_grupo[g];
          return { cor: corGrupo(g), pct: v, texto: v >= 3 ? `${Math.round(v)}%` : null, dica: [`${nomeG(g)} · ${rotulo(a, c)}`, [`${fmtPct(v)} dos válidos`, `${fmtInt.format(x.votos_grupo[g])} votos`, ...resumoGrupo(g, a, x)]] }; }) }));
    }
    caixa.append(el("div", { class: "legenda" }, ...G.map((g) => chave(g))));
    caixa.append(rodape({ fontes: ["tse", "api"], cobertura: (base.eleicoes["2024"].lacunas || []).some((l) => l.municipio === m.tse) ? lacunaTexto("2024") : null, nota: NOTA_PP }));
    sec.append(caixa);
    // partidos (Deputado estadual 2026)
    const x = cargoDe("2026", "7").forca.municipio[m.tse];
    const gp = base.eleicoes["2026"].grupo_partido;
    sec.append(el("h3", { text: `Partidos mais votados em ${m.nome} — Deputado Estadual 2026` }),
      el("div", { class: "rolagem" }, tabelaSimples(["Partido", "Grupo", "Votos", "% válidos"],
        Object.entries(x.partidos).slice(0, 10).map(([p, v]) => [p, [chip(gp[p]), nomeG(gp[p])], fmtInt.format(v), fmtPct(100 * v / x.validos)]))));
  }

  // ---------------------------------------------------------- rodapé: Fontes de Dados, Metodologia e Códigos
  function baixarCSV() {
    const linhas = [["ano", "cargo", "municipio_tse", "municipio_ibge", "municipio", "territorio", "regiao_imediata", "regiao_intermediaria",
      "votos_validos", ...G.flatMap((g) => [`votos_${g}`, `pct_${g}`]), "grupo_lider", "intensidade_lider", "margem_lider", "partido_mais_votado"]];
    for (const [a, c] of ELEICOES) {
      for (const m of muns) {
        const x = cargoDe(a, c).forca.municipio[m.tse];
        if (!x) continue;
        const l = x.lider || {};
        linhas.push([a, cargoDe(a, c).nome, m.tse, m.ibge, m.nome, m.territorio, m.imediata, m.intermediaria, x.validos,
          ...G.flatMap((g) => [x.votos_grupo[g], x.pct_grupo[g] === null ? "" : x.pct_grupo[g].toFixed(4)]),
          l.grupo || "", l.intensidade == null ? "" : l.intensidade.toFixed(4), l.margem == null ? "" : l.margem.toFixed(4), l.partido_mais_votado || ""]);
      }
    }
    const csv = linhas.map((l) => l.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })), download: "forcas_politicas_pi_municipios.csv" });
    document.body.append(a); a.click(); a.remove();
  }
  Lab.rodapePagina(base.metodologia, { baixar: { rotulo: "⬇ Baixar os dados por município (CSV)", acao: baixarCSV },
    linkAutor: { href: "__PORTFOLIO__", texto: "Página do autor ↗", rotuloCurto: "Autor ↗" } });

  render();
})().catch((erro) => {
  document.getElementById("app").textContent = `Não foi possível carregar a página: ${erro}. Use um navegador atualizado.`;
});
