/* app.js — interface do produto. Cálculos: só funções de nucleo.js (L0002).
 * Textos de apoio, seletores no título, rodapés e bloco de metodologia: componentes do design system
 * (window.Lab, web/componentes/lab-*; ADR L0003). Textos vindos dos dados entram por textContent. */
(async function () {
  "use strict";
  const fmtInt = new Intl.NumberFormat("pt-BR");
  const fmtPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...filhos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const f of filhos) if (f !== null && f !== undefined) n.append(f);
    return n;
  };
  const token = (nome) => getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim();

  const base = await decodificarBase($("#dados").textContent.trim());
  const app = $("#app");
  Lab.configurar({ raiz: app, autor: "__AUTOR__", artigos: { TSE: "do TSE" }, orgaos: { tse: "TSE", api: "TSE", malha: "IBGE", ibge: "IBGE", td: "Governo do Piauí (via Wikipédia)" } });
  const { instrucao, placar, rodape } = Lab;
  // cor de cada candidatura = cor do grupo do partido (EL0004/EL0006), a mesma do produto "Forças políticas no PI"
  const GR = base.grupos || { cores: {}, nomes: {}, partido_grupo: {} };
  const corToken = (c) => (c && c.startsWith("var(") ? token(c.slice(6, -1)) : c);
  const grupoCand = (c) => GR.partido_grupo[c.partido] || "Outros";
  const corCand = (c) => corToken(GR.cores[grupoCand(c)]) || token("cor-destaque");
  const nomeGrupo = (g) => GR.nomes[g] || g;
  const MIN_LOCAIS = base.meta.min_locais_pearson;
  const muns = base.municipios;
  const idxMun = new Map(muns.map((m, i) => [m.tse, i]));
  const nomeMun = (tse) => muns[idxMun.get(tse)].nome;
  // recortes regionais (como no produto "Forças políticas no PI"): IBGE (imediata, intermediária) e Territórios de Desenvolvimento
  const REG = ["imediata", "intermediaria", "territorio"];
  const regioes = Object.fromEntries(REG.map((nv) => { const nomes = [...new Set(muns.map((m) => m[nv]).filter(Boolean))].sort((x, y) => x.localeCompare(y));
    return [nv, { nomes, idx: new Map(nomes.map((x, i) => [x, i])) }]; }));
  const NIVEIS = [["municipio", "Município"], ["imediata", "Região imediata"], ["intermediaria", "Região intermediária"], ["territorio", "Território de desenvolvimento"],
    ["zona", "Zona eleitoral"], ["local", "Local de votação"]];
  const nivelTxt = (nv) => NIVEIS.find(([k]) => k === nv)[1].toLowerCase();

  // ---------------------------------------------------------- índices por ano
  const anos = {};
  for (const [ano, a] of Object.entries(base.anos)) {
    const n = a.secoes.municipio.length;
    const grupoMun = Int32Array.from(a.secoes.municipio, (m) => idxMun.get(m));
    const zonas = [...new Set(a.secoes.zona)].sort((x, y) => x - y);
    const idxZona = new Map(zonas.map((z, i) => [z, i]));
    const grupoZona = Int32Array.from(a.secoes.zona, (z) => idxZona.get(z));
    const munsZona = zonas.map(() => new Set());
    a.secoes.zona.forEach((z, i) => munsZona[idxZona.get(z)].add(a.secoes.municipio[i]));
    const grupoReg = Object.fromEntries(REG.map((nv) => [nv, Int32Array.from(a.secoes.municipio, (m) => regioes[nv].idx.get(muns[idxMun.get(m)][nv]) ?? -1)]));
    anos[ano] = { ...a, n, grupoMun, zonas, grupoZona, munsZona, grupoReg, grupoLocal: Int32Array.from(a.secoes.local) };
  }

  // ---------------------------------------------------------- estado
  const estado = { e: base.eleicoes.length - 1, c: 0, ci: 0, medida: "pct", municipio: "",
                   nivel: "municipio", ci2: null, cmp: "", forma: "mapa", animarDe: null };
  // estado no endereço (#e=..&c=..): permite compartilhar uma visão
  function lerEndereco() {
    const p = new URLSearchParams(location.hash.slice(1));
    const num = (k, max) => { const v = parseInt(p.get(k), 10); return Number.isInteger(v) && v >= 0 && v < max ? v : null; };
    const e = num("e", base.eleicoes.length); if (e !== null) estado.e = e;
    const c = num("c", base.eleicoes[estado.e].cargos.length); if (c !== null) estado.c = c;
    const ci = num("ci", base.eleicoes[estado.e].cargos[estado.c].candidaturas.length); if (ci !== null) estado.ci = ci;
    if (idxMun.has(p.get("m"))) estado.municipio = p.get("m");
    if (NIVEIS.some(([k]) => k === p.get("nivel"))) estado.nivel = p.get("nivel");
    else if (p.get("nivel") === "secao") estado.nivel = "local";   // nível retirado (pesquisador): o mais detalhado é o local
    if (/^\d+\|\d+\|\d+$/.test(p.get("cmp") || "")) estado.cmp = p.get("cmp");
    if (p.get("medida") === "votos") estado.medida = "votos";
    if (p.get("forma") === "bolhas" || p.get("tamanho") === "votos") estado.forma = "bolhas";
    const e2 = num("e2", base.eleicoes.length) ?? estado.e;
    if (base.eleicoes[e2].ano === base.eleicoes[estado.e].ano) {
      const k = num("k", base.eleicoes[e2].cargos.length);
      if (k !== null && base.eleicoes[e2].cargos[k].nome !== base.eleicoes[estado.e].cargos[estado.c].nome) {
        const j = num("j", base.eleicoes[e2].cargos[k].candidaturas.length); if (j !== null) estado.ci2 = { e: e2, k, j };
      }
    }
  }
  function gravarEndereco() {
    const p = new URLSearchParams({ e: estado.e, c: estado.c, ci: estado.ci, nivel: estado.nivel, medida: estado.medida, forma: estado.forma });
    if (estado.municipio) p.set("m", estado.municipio);
    if (estado.cmp) p.set("cmp", estado.cmp);
    if (estado.ci2) { p.set("e2", estado.ci2.e); p.set("k", estado.ci2.k); p.set("j", estado.ci2.j); }
    history.replaceState(null, "", `#${p}`);
  }
  lerEndereco();
  const eleicao = () => base.eleicoes[estado.e];
  const cargo = () => eleicao().cargos[estado.c];
  const cand = () => cargo().candidaturas[estado.ci];
  const ano = () => anos[eleicao().ano];

  // ---------------------------------------------------------- cálculos (via núcleo)
  function grupoFiltrado(grupo, a = ano()) {
    if (!estado.municipio) return grupo;
    const g = new Int32Array(grupo.length);
    for (let i = 0; i < g.length; i++) g[i] = a.secoes.municipio[i] === estado.municipio ? grupo[i] : -1;
    return g;
  }
  function unidades(nivel, cargoObj, ci, a = ano()) {
    const vs = votosPorSecao(cargoObj, ci, a.n);
    const cfg = {
      municipio: [a.grupoMun, muns.length, (g) => ({ nome: muns[g].nome, municipio: muns[g].tse })],
      zona: [a.grupoZona, a.zonas.length, (g) => ({ nome: `Zona ${a.zonas[g]}`, sub: [...a.munsZona[g]].map(nomeMun).sort().join(", ") })],
      local: [a.grupoLocal, a.locais.length, (g) => ({ nome: a.locais[g][3], sub: a.locais[g][4], municipio: a.locais[g][0], situacao: a.locais[g][8] })],
      ...Object.fromEntries(REG.map((nv) => [nv, [a.grupoReg[nv], regioes[nv].nomes.length, (g) => ({ nome: regioes[nv].nomes[g] })]])),
    }[nivel];
    const grupo = estado.municipio && nivel !== "municipio" ? grupoFiltrado(cfg[0], a) : cfg[0];
    const ag = agregar(vs, cargoObj.validos, grupo, cfg[1]);
    const linhas = [];
    for (let g = 0; g < cfg[1]; g++) {
      if (ag.validos[g] === 0 && ag.votos[g] === 0) continue; // unidade fora do recorte/filtro
      linhas.push({ id: g, ...cfg[2](g), votos: ag.votos[g], validos: ag.validos[g], pct: percentual(ag.votos[g], ag.validos[g]) });
    }
    return linhas;
  }
  const valorDe = (u) => (estado.medida === "pct" ? u.pct : u.votos);
  const fmtValor = (v) => (v === null ? "—" : estado.medida === "pct" ? `${fmtPct.format(v)}%` : fmtInt.format(v));

  // ---------------------------------------------------------- controles
  // eleição, cargo, nível e medida ficam na frase dos títulos; a barra fixa guarda candidatura e município
  const selM = $("#sel-municipio");
  muns.forEach((m) => selM.append(el("option", { value: m.tse, text: m.nome })));
  selM.value = estado.municipio;
  function mudarEleicao(v) {
    const nomeCargo = cargo().nome;
    estado.e = +v;
    const c = eleicao().cargos.findIndex((x) => x.nome === nomeCargo);
    estado.c = c >= 0 ? c : 0; estado.ci = 0; estado.ci2 = null; estado.cmp = "";
    atualizarBusca(); render();
  }
  function mudarCargo(v) { estado.c = +v; estado.ci = 0; estado.ci2 = null; estado.cmp = ""; atualizarBusca(); render(); }
  /** Cargo primeiro: se a eleição atual não tem o cargo, vai para a mais recente que tem (2026 tem prioridade). */
  function mudarCargoNome(nome) {
    let k = eleicao().cargos.findIndex((x) => x.nome === nome);
    if (k < 0) {
      const e = [...base.eleicoes.keys()].reverse().find((i) => base.eleicoes[i].cargos.some((x) => x.nome === nome));
      estado.e = e; k = eleicao().cargos.findIndex((x) => x.nome === nome);
    }
    mudarCargo(k);
  }
  const NOMES_CARGO = [...new Set(base.eleicoes.flatMap((e) => e.cargos.map((x) => x.nome)))];

  // painel de filtros (barra fixa): tudo num lugar só, alcançável de qualquer ponto da página;
  // no celular abre pelo botão "Filtros"; em telas largas fica sempre aberto (CSS)
  const selFE = $("#f-eleicao"), selFC = $("#f-cargo"), selFN = $("#f-nivel"), altMed = $("#f-medida");
  NOMES_CARGO.forEach((nome) => selFC.append(el("option", { value: nome, text: nome })));
  NIVEIS.forEach(([v, r]) => selFN.append(el("option", { value: v, text: r })));
  selFE.addEventListener("change", () => mudarEleicao(selFE.value));
  selFC.addEventListener("change", () => mudarCargoNome(selFC.value));
  const selFCmp = $("#f-cmp");
  selFCmp.addEventListener("change", () => { estado.cmp = selFCmp.value; render(); });
  selFN.addEventListener("change", () => { estado.nivel = selFN.value; estado.ci2 = null; render(); });
  altMed.addEventListener("click", (ev) => { const b = ev.target.closest("button[data-v]"); if (b && !b.disabled) { estado.medida = b.dataset.v; render(); } });
  const painelF = $("#painel-filtros"), btnF = $("#btn-filtros");
  const abrirFiltros = (abrir) => { painelF.hidden = !abrir; btnF.setAttribute("aria-expanded", String(abrir)); btnF.textContent = abrir ? "Fechar" : "Filtros"; };
  btnF.addEventListener("click", () => abrirFiltros(painelF.hidden));
  $("#btn-fechar").addEventListener("click", () => abrirFiltros(false));
  addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !painelF.hidden) abrirFiltros(false); });
  function sincronizarFiltros() {
    selFC.value = cargo().nome;
    selFE.replaceChildren(...base.eleicoes.map((e, i) => [e, i]).filter(([e]) => e.cargos.some((x) => x.nome === cargo().nome))
      .map(([e, i]) => el("option", { value: i, text: e.rotulo })));
    selFE.value = estado.e; selFN.value = estado.nivel; selM.value = estado.municipio;
    const outras = opcoesCmp();
    const nivelSemCmp = ["zona", "local"].includes(estado.nivel);
    selFCmp.replaceChildren(el("option", { value: "", text: !outras.length ? "— sem outras eleições —" : nivelSemCmp ? "— só por município ou região —" : "— nenhuma —" }),
      ...[["pessoa", "Mesma pessoa"], ["partido", "Mesmo partido (outra candidatura)"]].map(([t, rot]) => {
        const ops = outras.filter((o) => o.tipo === t);
        return ops.length ? el("optgroup", { label: rot }, ...ops.map((o) => el("option", { value: o.v, text: o.rot }))) : "";
      }));
    selFCmp.disabled = !outras.length || nivelSemCmp; selFCmp.value = nivelSemCmp ? "" : estado.cmp;
    selFCmp.title = nivelSemCmp && outras.length ? "Zonas e locais de votação mudam entre eleições: a comparação funciona por município e nos recortes regionais." : "";
    const valido = cand().destino === "valido";
    for (const b of altMed.querySelectorAll("button")) { b.setAttribute("aria-pressed", String(b.dataset.v === estado.medida)); b.disabled = b.dataset.v === "pct" && !valido; }
    $("#filtros-texto").textContent = `${cand().nome_urna} · ${cargo().nome} · ${eleicao().rotulo} · ${estado.municipio ? nomeMun(estado.municipio) : "Todo o Piauí"}`;
  }
  selM.addEventListener("change", () => {
    estado.municipio = selM.value;
    estado.ci2 = null; render();
  });

  /** Abre um município: filtra a página e, nos níveis acima dele, desce para os locais de votação. */
  function abrirMunicipio(tse) {
    estado.municipio = tse; estado.ci2 = null;
    if (estado.nivel === "municipio" || REG.includes(estado.nivel)) { estado.nivel = "local"; estado.cmp = ""; }
    render();
    document.querySelector("[data-escopo='mapa-dist']")?.scrollIntoView({ block: "start" });
  }

  // busca de candidatura (combobox simples)
  const busca = $("#busca-cand"), lista = $("#lista-cand");
  const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rotuloCand = (c) => `${c.nome_urna} (${c.numero}${c.partido ? " · " + c.partido : ""})`;
  function atualizarBusca() { busca.value = rotuloCand(cand()); lista.hidden = true; busca.setAttribute("aria-expanded", "false"); }
  function abrirLista() {
    const q = normalizar(busca.value === rotuloCand(cand()) ? "" : busca.value.trim());
    const itens = [];
    cargo().candidaturas.forEach((c, i) => {
      if (q && !normalizar(`${c.nome_urna} ${c.nome} ${c.numero} ${c.partido}`).includes(q)) return;
      if (itens.length >= 200) return;
      itens.push(el("li", { role: "option", "aria-selected": i === estado.ci, "data-i": i,
        onmousedown: (ev) => { ev.preventDefault(); escolher(i); } },
        el("span", { text: rotuloCand(c) }),
        el("span", { class: "sec", text: c.destino === "valido" ? fmtInt.format(c.total) : "não válido" })));
    });
    lista.replaceChildren(...(itens.length ? itens : [el("li", { text: "Nenhuma candidatura encontrada" })]));
    lista.hidden = false; busca.setAttribute("aria-expanded", "true");
  }
  function escolher(i) { estado.ci = i; estado.ci2 = null; estado.cmp = ""; atualizarBusca(); render(); }
  busca.addEventListener("focus", () => { busca.select(); abrirLista(); });
  busca.addEventListener("input", abrirLista);
  busca.addEventListener("blur", () => setTimeout(atualizarBusca, 100));
  busca.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { const p = lista.querySelector("li[data-i]"); if (p) escolher(+p.dataset.i); busca.blur(); }
    if (ev.key === "Escape") busca.blur();
  });
  atualizarBusca();

  // ---------------------------------------------------------- dica (tooltip)
  const dica = $("#dica");
  function mostrarDica(ev, titulo, linhas) {
    dica.replaceChildren(el("b", { text: titulo }), ...linhas.map((t) => el("div", { text: t })));
    dica.style.display = "block";
    const x = Math.min(ev.clientX + 14, innerWidth - dica.offsetWidth - 8);
    dica.style.left = `${x}px`; dica.style.top = `${ev.clientY + 14}px`;
  }
  const esconderDica = () => { dica.style.display = "none"; };

  // ---------------------------------------------------------- render
  function render() { Lab.noLugar(desenharPagina); }
  function desenharPagina() {
    const c = cand(), valido = c.destino === "valido";
    if (!valido && estado.medida === "pct") estado.medida = "votos";
    if (estado.cmp && !opcoesCmp().some((o) => o.v === estado.cmp)) estado.cmp = "";
    gravarEndereco();
    Lab.limparPaineis();
    app.replaceChildren(
      secaoResumo(c, valido),
      secaoDistribuicao(),
      secaoComparacao(valido),
    );
    sincronizarFiltros();
    Lab.aplicarSelecoes();
  }
  const fontesAno = () => ["tse", ...(eleicao().ano === "2026" ? ["api"] : [])];

  function secaoResumo(c, valido) {
    const a = ano();
    const vs = votosPorSecao(cargo(), estado.ci, a.n);
    let votos = 0, validos = 0, nMun = new Set();
    for (let i = 0; i < a.n; i++) {
      if (estado.municipio && a.secoes.municipio[i] !== estado.municipio) continue;
      votos += vs[i]; validos += cargo().validos[i];
      if (vs[i] > 0) nMun.add(a.secoes.municipio[i]);
    }
    const onde = estado.municipio ? nomeMun(estado.municipio) : "Piauí";
    const frag = el("section", { "aria-label": "Resumo" },
      el("h2", { text: `${c.nome_urna} — ${cargo().nome} · ${eleicao().rotulo}` }),
      el("p", { class: "nota" }, Lab.chip(corCand(c)), `${c.nome} · nº ${c.numero}${c.partido ? " · " + c.partido : ""} · grupo ${nomeGrupo(grupoCand(c))}`));
    if (!valido) frag.append(el("p", { class: "aviso", text: `Votos com destino “${c.destino}” pelo TSE: não são votos válidos (EL0003). A candidatura aparece só com votos absolutos, sem percentual e fora das correlações.` }));
    frag.append(el("div", { class: "tiles" },
      tile(`Votos · ${onde}`, fmtInt.format(votos)),
      valido ? tile(`% dos válidos · ${onde}`, validos > 0 ? `${fmtPct.format(percentual(votos, validos))}%` : "—") : null,
      tile(estado.municipio ? "Locais de votação com voto" : "Municípios com voto",
           estado.municipio ? fmtInt.format(new Set(Array.from(a.secoes.local).filter((l, i) => vs[i] > 0 && a.secoes.municipio[i] === estado.municipio)).size) : `${nMun.size} de ${muns.length}`),
      tile(`Válidos do cargo · ${onde}`, fmtInt.format(validos))));
    return frag;
  }
  /** Opções de "Comparar com": a mesma pessoa em outras eleições (EL0007) e, só para Presidente e Governador,
   *  candidaturas do mesmo partido ao mesmo cargo em outras eleições (pedido do pesquisador). */
  const CARGOS_PARTIDO = ["Presidente", "Governador"];
  // continuidade partidária (decisão local do pesquisador, 2026-10-06): em 2018, a candidatura presidencial
  // associada ao atual PL foi a do PSL (Bolsonaro). Vale só para "mesmo partido" e para a linha do partido;
  // as cores dos grupos (EL0004) não mudam.
  const ASSOCIADOS = [{ ano: "2018", cargo: "Presidente", sigla: "PSL", equivale: "PL" }];
  const siglaContinua = (sigla, ano, cargoNome) => ASSOCIADOS.find((x) => x.ano === ano && x.cargo === cargoNome && x.sigla === sigla)?.equivale || sigla;
  const mesmoPartido = (cc, ano, cargoNome, ref) => Boolean(cc.partido) && siglaContinua(cc.partido, ano, cargoNome) === ref;
  function opcoesCmp() {
    const atual = `${estado.e}|${estado.c}|${estado.ci}`;
    const pessoa = (ocorrencias.get(atual) || []).filter(([ei]) => ei !== estado.e)
      .map(([ei, k, j]) => ({ v: `${ei}|${k}|${j}`, tipo: "pessoa", rot: `${base.eleicoes[ei].cargos[k].nome} · ${base.eleicoes[ei].rotulo}` }));
    const ops = [...pessoa];
    const c = cand();
    if (CARGOS_PARTIDO.includes(cargo().nome) && c.partido) {
      const ref = siglaContinua(c.partido, eleicao().ano, cargo().nome);
      const mesmaPessoa = new Set((ocorrencias.get(atual) || []).map((o) => o.join("|")));
      base.eleicoes.forEach((ee, ei) => {
        if (ei === estado.e) return;
        const k = ee.cargos.findIndex((x) => x.nome === cargo().nome);
        if (k < 0) return;
        ee.cargos[k].candidaturas.forEach((cc, j) => {
          const v = `${ei}|${k}|${j}`;
          if (mesmoPartido(cc, ee.ano, cargo().nome, ref) && !mesmaPessoa.has(v)) ops.push({ v, tipo: "partido", rot: `${cc.nome_urna} (${cc.partido}) · ${ee.rotulo}` });
        });
      });
    }
    return ops;
  }
  // ---- evolução da candidatura entre eleições (mesma pessoa: nome completo + nascimento, EL0007)
  const ocorrencias = new Map();
  for (const occ of base.pessoas || []) for (const o of occ) ocorrencias.set(o.join("|"), occ);
  /** Votos e % dos válidos de uma candidatura (ei, k, j) no recorte (Piauí ou município filtrado). */
  function pontoEvolucao([ei, k, j]) {
    const e = base.eleicoes[ei], cg = e.cargos[k], cc = cg.candidaturas[j], a = anos[e.ano];
    const vs = votosPorSecao(cg, j, a.n);
    let votos = 0, validos = 0;
    for (let i = 0; i < a.n; i++) {
      if (estado.municipio && a.secoes.municipio[i] !== estado.municipio) continue;
      votos += vs[i]; validos += cg.validos[i];
    }
    return { ei, rotulo: e.rotulo, cargo: cg.nome, nome: cc.nome_urna, partido: cc.partido, votos,
             pct: cc.destino === "valido" && validos > 0 ? percentual(votos, validos) : null };
  }
  // ---- evolução: a mesma pessoa (EL0007) e, em Presidente e Governador, o partido no mesmo cargo (como em "Comparar com")
  function secaoEvolucao(c) {
    const occ = ocorrencias.get(`${estado.e}|${estado.c}|${estado.ci}`) || [[estado.e, estado.c, estado.ci]];
    const porPartido = CARGOS_PARTIDO.includes(cargo().nome) && c.partido;
    const ref = porPartido ? siglaContinua(c.partido, eleicao().ano, cargo().nome) : "";
    const doPartido = [];
    if (porPartido) base.eleicoes.forEach((ee, ei) => {
      const k = ee.cargos.findIndex((x) => x.nome === cargo().nome);
      if (k < 0) return;
      const j = ee.cargos[k].candidaturas.findIndex((cc) => mesmoPartido(cc, ee.ano, cargo().nome, ref));
      if (j >= 0) doPartido.push([ei, k, j]);
    });
    const chave = (o) => o.join("|");
    const noPartido = new Set(doPartido.map(chave));
    const pessoaExtra = occ.some((o) => !noPartido.has(chave(o)));
    if (doPartido.length < 2 && occ.length < 2) return null;
    const usarPartido = doPartido.length >= 2;
    const usarPessoa = !usarPartido || pessoaExtra;
    const eis = [...new Set([...(usarPartido ? doPartido : []), ...(usarPessoa ? occ : [])].map((o) => o[0]))].sort((x, y) => x - y);
    const emPct = estado.medida === "pct";
    const val = (pt) => (emPct ? pt.pct : pt.votos);
    const serie = (lista, cor, rotulo) => {
      const pts = new Map(lista.map((o) => [o[0], pontoEvolucao(o)]));
      return { pts, cor, rotulo, valores: eis.map((ei) => (pts.has(ei) ? val(pts.get(ei)) : null)),
        dicas: eis.map((ei) => { const pt = pts.get(ei); return pt ? [`${pt.nome} · ${pt.cargo} · ${pt.rotulo}`, [pt.partido ? `partido: ${pt.partido}` : null,
          `${fmtInt.format(pt.votos)} votos`, pt.pct === null ? "sem % (votos não válidos)" : `${fmtPct.format(pt.pct)}% dos válidos`]] : null; }) };
    };
    const series = [];
    const assoc = ASSOCIADOS.filter((x) => x.equivale === ref && x.cargo === cargo().nome && doPartido.some(([ei]) => base.eleicoes[ei].ano === x.ano));
    const rotPartido = `${ref}${assoc.map((x) => ` + ${x.sigla} ${x.ano}`).join("")}`;
    if (usarPartido) series.push(serie(doPartido, corCand(c), `${rotPartido} (${cargo().nome})`));
    if (usarPessoa) series.push(serie(occ, usarPartido ? token("cor-texto-secundario") : corCand(c), c.nome_urna));
    const onde = estado.municipio ? nomeMun(estado.municipio) : "Piauí";
    const caixa = el("div", { class: "cartao" });
    const resumo = (sr) => [...sr.pts.values()].map((pt) => `${pt.nome}${usarPartido ? "" : ` · ${pt.cargo}`} ${pt.rotulo}${pt.partido && !usarPartido ? ` (${pt.partido})` : ""}`).join(" · ");
    caixa.append(el("h3", { text: usarPartido
        ? `${emPct ? "% dos válidos" : "Votos"} do ${rotPartido} para ${cargo().nome} em cada eleição${usarPessoa ? ` e de ${c.nome_urna}` : ""} — ${onde}`
        : `${emPct ? "% dos válidos" : "Votos"} de ${c.nome_urna} em cada eleição — ${onde}` }),
      placar(series.map((sr) => (series.length > 1 ? `${sr.rotulo}: ` : "") + resumo(sr)).join(" | ")),
      instrucao(...(usarPartido
        ? ["Em Presidente e Governador, a linha colorida segue o partido no mesmo cargo, qualquer que seja a candidatura (o nome está em cada ponto, ao passar o mouse).",
           usarPessoa ? `A linha cinza segue ${c.nome_urna} como pessoa (nome completo + nascimento, EL0007), inclusive em outro partido ou cargo.` : null]
        : ["A mesma pessoa é reconhecida em eleições diferentes pelo nome civil completo e pela data de nascimento no cadastro de candidaturas do TSE (EL0007).",
           "O cargo pode mudar de uma eleição para outra (veja o subtítulo)."]),
        "O percentual é sempre sobre os votos válidos do cargo disputado naquela eleição. Passe o mouse num ponto para ver candidatura, partido, votos e percentual."));
    Lab.linhasPontas(caixa, { pontas: eis.map((ei) => base.eleicoes[ei].rotulo), fmt: emPct ? Lab.fmtPct : Lab.fmtCompacto, largura: 680,
      aria: series.map((sr) => `${sr.rotulo}: ${[...sr.pts.values()].map((pt) => `${pt.nome} ${pt.rotulo}, ${fmtInt.format(pt.votos)} votos`).join("; ")}`).join(". "),
      // a pessoa (cinza) é desenhada antes, para o partido ficar por cima onde coincidem
      series: [...series].reverse().map(({ cor, valores, rotulo, dicas }) => ({ cor, valores, rotulo, dicas })) });
    if (series.length > 1) caixa.append(Lab.legendaCategorias(series.map((sr) => [sr.cor, sr.rotulo])));
    caixa.append(rodape({ fontes: ["tse", "api"], nota: usarPartido ? `Partido pela sigla no cadastro do TSE${assoc.length ? `; ${assoc.map((x) => `em ${x.ano}, a candidatura a ${x.cargo} associada ao ${x.equivale} foi a do ${x.sigla} (decisão do pesquisador)`).join("; ")}` : ""}. Pessoa: nome completo + nascimento (EL0007).`
      : "Ligação entre candidaturas por nome completo + data de nascimento (EL0007); casos ambíguos não são ligados." }));
    return el("section", { "aria-label": "Evolução da candidatura" }, caixa);
  }
  const tile = (rot, val) => el("div", { class: "tile" }, el("div", { class: "rot", text: rot }), el("div", { class: "val", text: val }));

  // ---- distribuição: nível, mapa, top 10, tabela
  function secaoDistribuicao() {
    const sec = el("section", { "aria-label": "Distribuição territorial" }, el("h2", { text: `Onde estão os votos de ${cand().nome_urna}, por ${nivelTxt(estado.nivel)}` }));
    const linhas = unidades(estado.nivel, cargo(), estado.ci);
    // comparação com outra eleição da mesma pessoa (EL0007): só em municípios e recortes regionais (mesmas unidades)
    cmpInfo = null;
    if (estado.cmp) {
      const [ei, k, j] = estado.cmp.split("|").map(Number), e2 = base.eleicoes[ei];
      if (estado.nivel === "municipio" || REG.includes(estado.nivel)) {
        const chave = (u) => (estado.nivel === "municipio" ? u.municipio : u.nome);
        const antes = new Map(unidades(estado.nivel, e2.cargos[k], j, anos[e2.ano]).map((u) => [chave(u), u]));
        for (const u of linhas) {
          const a0 = antes.get(chave(u));
          u.ant = a0 || null;
          u.dif = !a0 ? null : estado.medida === "pct" ? (u.pct === null || a0.pct === null ? null : u.pct - a0.pct) : u.votos - a0.votos;
        }
        const op = opcoesCmp().find((o) => o.v === estado.cmp), c2 = e2.cargos[k].candidaturas[j];
        cmpInfo = { rotulo: op?.tipo === "partido" ? `${c2.nome_urna} (${c2.partido}) · ${e2.cargos[k].nome} · ${e2.rotulo}` : `${e2.cargos[k].nome} · ${e2.rotulo}` };
      }
    }
    const outrasEl = opcoesCmp();
    if (!cmpInfo && outrasEl.length && SUBMUN.includes(estado.nivel)) {
      sec.append(el("p", { class: "aviso" },
        `${estado.cmp ? "A comparação com outra eleição não funciona" : "A comparação com outras eleições (filtro “Comparar com”) não está disponível"} no nível ${nivelTxt(estado.nivel)}: zonas e locais de votação mudam de uma eleição para outra e não podem ser pareados. Ela funciona por município e nos recortes regionais. `,
        el("button", { class: "voltar", type: "button", text: "Comparar por município →", onclick: () => { estado.nivel = "municipio"; if (!estado.cmp) estado.cmp = outrasEl[0].v; render(); } })));
    }
    const grade = el("div", { class: "grade2" });
    const colMapa = el("div", { class: "cartao", "data-escopo": "mapa-dist" });
    const colTop = el("div", { class: "cartao" });
    grade.append(colMapa, colTop);
    sec.append(grade);
    desenharMapa(colMapa, linhas);
    desenharTop(colTop, linhas);
    sec.append(secaoEvolucao(cand()) || "", tabela(linhas));
    return sec;
  }

  let cmpInfo = null;
  const fmtDif = (d) => (d === null || d === undefined ? "—" : estado.medida === "pct" ? Lab.comSinal(d, Lab.fmtPP) : Lab.comSinal(d, (v) => fmtInt.format(v)));
  function escalaCor(max) {
    // um matiz, claro → escuro, na cor do grupo da candidatura (EL0006)
    const base_ = d3.color(corCand(cand()));
    const interp = d3.interpolateLab(d3.interpolateRgb(token("cor-superficie"), base_)(0.12), base_.darker(0.6));
    const passos = d3.range(7).map((k) => interp(k / 6));
    return { cor: (v) => (v === null ? token("cor-grade") : interp(max > 0 ? Math.min(1, v / max) : 0)), passos };
  }

  // ---- mapa: coroplético/pontos ou bolhas (cartograma de Dorling, sem sobreposição)
  const caminhoCirculo = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  const semAnimacao = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Contorno externo do maior polígono de um município (forma inicial do morph). */
  function anelPrincipal(f, caminho) {
    const g = f.geometry;
    const poligonos = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const maior = d3.greatest(poligonos, (p) => d3.geoArea({ type: "Polygon", coordinates: p }));
    return caminho({ type: "Polygon", coordinates: [maior[0]] });
  }

  /** Posições sem sobreposição: cada círculo parte da posição real e é afastado o mínimo. */
  function posicionarBolhas(nos) {
    const sim = d3.forceSimulation(nos)
      .force("x", d3.forceX((n) => n.x0).strength(0.2))
      .force("y", d3.forceY((n) => n.y0).strength(0.2))
      .force("colisao", d3.forceCollide((n) => (n.r > 0 ? n.r + 0.8 : 0)).iterations(3))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
  }

  function desenharMapa(alvo, linhas) {
    const largura = 640, altura = 640;
    const nivelMapa = estado.nivel === "local" ? "local" : REG.includes(estado.nivel) ? estado.nivel : "municipio";
    const poligonos = nivelMapa !== "local";
    const titulo = nivelMapa === "local" ? "Locais de votação" : nivelMapa === "municipio" ? "Municípios" : NIVEIS.find(([k]) => k === nivelMapa)[1];
    const valido = cand().destino === "valido";
    const bolhas = estado.forma === "bolhas";
    const animarDe = semAnimacao() ? null : estado.animarDe;
    estado.animarDe = null;
    const medidaTxt = estado.medida === "pct" ? "% dos válidos" : "votos";
    const descricao = bolhas ? `área = votos · cor = ${medidaTxt}` : medidaTxt;
    const unidadeTxt = nivelMapa === "local" ? `local de votação${estado.municipio ? ` em ${nomeMun(estado.municipio)}` : ""}` : nivelTxt(nivelMapa);
    if (cmpInfo) alvo.append(el("h3", { text: `Variação ${estado.medida === "pct" ? "em p.p. dos válidos" : "em votos"} de ${cand().nome_urna} por ${unidadeTxt}, de ${cmpInfo.rotulo} para ${cargo().nome} · ${eleicao().rotulo}` }));
    else alvo.append(el("h3", { text: bolhas ? (estado.medida === "pct" ? `Votos (área) e % dos válidos (cor) de ${cand().nome_urna} por ${unidadeTxt}` : `Votos (área e cor) de ${cand().nome_urna} por ${unidadeTxt}`)
      : `${estado.medida === "pct" ? "% dos válidos" : "Votos"} de ${cand().nome_urna} por ${unidadeTxt}` }));
    const comValor = linhas.filter((u) => valorDe(u) !== null);
    const topo = comValor.length ? comValor.reduce((m, u) => (valorDe(u) > valorDe(m) ? u : m)) : null;
    if (cmpInfo) { const g = linhas.filter((u) => (u.dif ?? 0) > 0).length, pr = linhas.filter((u) => (u.dif ?? 0) < 0).length;
      alvo.append(placar(`${estado.medida === "pct" ? "Ampliou" : "Ganhou votos"} em ${g} e ${estado.medida === "pct" ? "reduziu" : "perdeu"} em ${pr} de ${linhas.length} unidades`)); }
    else if (topo && estado.nivel === nivelMapa) alvo.append(placar(`Maior ${estado.medida === "pct" ? "percentual" : "votação"}: ${topo.nome} (${fmtValor(valorDe(topo))})`));
    alvo.append(instrucao(bolhas ? `Cada círculo é uma unidade: a área é proporcional aos votos e a cor, ${estado.medida === "pct" ? "ao % dos válidos" : "aos votos"}; a posição é aproximada (os círculos são afastados o mínimo para não se sobrepor).`
        : "Quanto mais escuro, maior o valor. A escala é recalculada para esta candidatura e seleção: cores de mapas diferentes não são comparáveis.",
      nivelMapa === "municipio" ? "Clique num município para ver os dados dele e abrir seus locais de votação."
        : nivelMapa === "local" ? "Locais sem coordenada ou com coordenada fora do próprio município ficam fora do mapa e marcados na tabela." : null,
      "Passe o mouse para ver votos, percentual e válidos do cargo."));
    const alt = el("div", { class: "alternar", role: "group", "aria-label": "Representação do mapa" });
    for (const [v, rot] of [["mapa", nivelMapa === "local" ? "Pontos" : "Mapa"], ["bolhas", "Bolhas"]]) {
      alt.append(el("button", { "aria-pressed": estado.forma === v, text: rot,
        onclick: () => { if (estado.forma !== v) { estado.animarDe = estado.forma; estado.forma = v; render(); } } }));
    }
    alvo.append(el("div", { class: "campo" }, "Representação", alt));
    if (estado.nivel === "zona") {
      alvo.append(el("p", { class: "nota", text: "Sem geometria oficial de zonas: o mapa mostra municípios; as zonas estão na tabela." }));
    }

    const feats = nivelMapa === "local" || nivelMapa === "municipio" ? base.malha.features : base.contornos[nivelMapa].features;
    const idF = (f) => (nivelMapa === "municipio" || nivelMapa === "local" ? f.properties.tse : f.properties.id);
    const nomeF = (f) => (nivelMapa === "municipio" ? nomeMun(f.properties.tse) : f.properties.id);
    // municípios: sempre o estado inteiro (o município escolhido fica destacado); locais: zoom no município
    const foco = nivelMapa === "local" && estado.municipio ? feats.filter((f) => f.properties.tse === estado.municipio) : feats;
    const proj = d3.geoMercator().fitExtent([[24, 24], [largura - 24, altura - 24]], { type: "FeatureCollection", features: foco });
    const caminho = d3.geoPath(proj);
    const svg = d3.select(alvo).append("svg").attr("viewBox", `0 0 ${largura} ${altura}`).attr("class", "mapa")
      .attr("role", "img").attr("aria-label", `Mapa do Piauí: ${titulo.toLowerCase()}, ${descricao}; valores na tabela abaixo.`)
      .style("width", "100%").style("height", "auto");
    const a = ano();

    // unidades desenhadas
    let nos;
    if (poligonos) {
      const doNivel = estado.nivel === nivelMapa ? linhas : unidades(nivelMapa, cargo(), estado.ci);
      const porUn = new Map(doNivel.map((u) => [nivelMapa === "municipio" ? u.municipio : u.nome, u]));
      nos = feats.map((f) => { const c = caminho.centroid(f); return { f, u: porUn.get(idF(f)) || null, x0: c[0], y0: c[1] }; });
    } else {
      nos = linhas.filter((u) => u.situacao === "ok").map((u) => {
        const c = proj([a.locais[u.id][7], a.locais[u.id][6]]);
        return { u, x0: c[0], y0: c[1] };
      });
    }
    const corBolha = bolhas;
    const valorCor = valorDe;       // a cor segue a medida escolhida, também nos círculos
    const fmtCor = fmtValor;
    const max = d3.max(nos, (n) => (n.u ? valorCor(n.u) : null)) || 0;
    const { cor, passos } = escalaCor(max);
    let corDe = (n) => (!n.u ? token("cor-grade") : cor(valorCor(n.u)));
    let legendaDif = null;
    if (cmpInfo) {
      // divergente: cinza = perdeu ← 0 (claro) → cor do grupo = ganhou; em votos, satura no percentil 95 (como no produto "Forças políticas")
      const cg = d3.color(corCand(cand())), neutro = d3.color(token("cor-texto-secundario"));
      const absV = nos.map((n) => Math.abs(n.u?.dif ?? 0)).sort(d3.ascending);
      const maxDif = (estado.medida === "votos" ? Math.round(d3.quantileSorted(absV, 0.95)) : d3.max(absV)) || 1;
      const corDiv = (d) => { const t = Math.max(-1, Math.min(1, d / maxDif));
        return t >= 0 ? d3.interpolateLab(token("cor-superficie"), cg.darker(0.4))(t) : d3.interpolateLab(token("cor-superficie"), neutro)(-t); };
      corDe = (n) => (!n.u || n.u.dif === null || n.u.dif === undefined ? token("cor-grade") : corDiv(n.u.dif));
      const sat = estado.medida === "votos" && absV.some((v) => v > maxDif) ? " ou mais" : "";
      legendaDif = Lab.legendaRampa(d3.range(-4, 5).map((k) => corDiv((k / 4) * maxDif)), `${estado.medida === "pct" ? "reduziu" : "perdeu"} ${fmtDif(maxDif).slice(1)}${sat}`, `${estado.medida === "pct" ? "ampliou" : "ganhou"} ${fmtDif(maxDif).slice(1)}${sat}`);
    }
    const chaveNo = (n) => (poligonos ? idF(n.f) : `l${n.u.id}`);
    // Tamanho das bolhas: a soma das áreas ocupa uma fração fixa do território desenhado
    // (polígonos dos municípios; nos locais, a envoltória convexa dos pontos), com teto de raio.
    // teto "fora de escala": se a maior unidade passa de 3× a segunda (Teresina), a escala vai até a segunda (L0003)
    const ea = Lab.escalaArea(nos.map((n) => (n.u ? n.u.votos : 0)), 1);
    const totalVotos = d3.sum(nos, (n) => (n.u ? Math.min(n.u.votos, ea.teto) : 0)) || 1;
    const maxVotos = ea.teto || 1;
    let areaTerritorio;
    if (poligonos) areaTerritorio = d3.sum(feats, (f) => caminho.area(f));
    else {
      const casco = d3.polygonHull(nos.map((n) => [n.x0, n.y0]));
      areaTerritorio = Math.max(casco ? Math.abs(d3.polygonArea(casco)) : 0, 0.02 * largura * altura);
    }
    const FRACAO = nivelMapa === "municipio" ? 0.3 : 0.45;
    const rTeto = nivelMapa === "municipio" ? 60 : nivelMapa === "local" ? 30 : 120;
    const rMax = Math.min(rTeto, Math.sqrt((FRACAO * areaTerritorio * maxVotos) / (Math.PI * totalVotos)));
    const escalaR = d3.scaleSqrt().domain([0, maxVotos]).range([0, rMax]).clamp(true);
    for (const n of nos) { n.r = n.u ? escalaR(n.u.votos) : 0; n.fora = Boolean(n.u) && ea.fora(n.u.votos); n.x = n.x0; n.y = n.y0; }
    const nomeNo = (n) => (poligonos ? nomeF(n.f) : n.u.nome);
    if (bolhas || animarDe) posicionarBolhas(nos);
    const raioPonto = estado.municipio ? 5 : 3;
    const animar = (sel) => sel.transition().duration(900).ease(d3.easeCubicInOut);
    const dica = (ev, n) => {
      if (poligonos) mostrarDica(ev, nomeF(n.f), linhasDica(n.u));
      else mostrarDica(ev, n.u.nome, [`${nomeMun(n.u.municipio)} · ${n.u.sub || ""}`, ...linhasDica(n.u)]);
    };

    if (poligonos) {
      const regiaoMun = estado.municipio && nivelMapa !== "municipio" ? muns[idxMun.get(estado.municipio)][nivelMapa] : null;
      const destaque = (n) => (!estado.municipio ? 1 : nivelMapa === "municipio" ? (n.f.properties.tse !== estado.municipio ? 0.3 : 1) : (idF(n.f) !== regiaoMun ? 0.3 : 1));
      if (bolhas) svg.append("g").selectAll("path").data(feats).join("path").attr("class", "contorno").attr("d", caminho).attr("opacity", 0.6);
      const formas = svg.append("g").selectAll("path").data(bolhas ? [...nos].sort((p, q) => q.r - p.r) : nos).join("path")
        .attr("class", "mun u").attr("data-u", chaveNo).classed("fora-escala", (n) => bolhas && n.fora).attr("fill", corDe).attr("opacity", destaque)
        .on("pointermove", dica).on("pointerleave", esconderDica)
        .on("click", (ev, n) => { if (n.u) Lab.selecionar(chaveNo(n), ev.currentTarget); });
      const final = (n) => (bolhas ? caminhoCirculo(n.x, n.y, Math.max(n.r, 0.01)) : caminho(n.f));
      if (animarDe && typeof flubber !== "undefined") {
        formas.attr("d", (n) => (bolhas ? anelPrincipal(n.f, caminho) : caminhoCirculo(n.x, n.y, Math.max(n.r, 0.01))))
          .call((sel) => animar(sel).attrTween("d", (n) => {
            const r = Math.max(n.r, 0.5);
            const interp = bolhas ? flubber.toCircle(anelPrincipal(n.f, caminho), n.x, n.y, r, { maxSegmentLength: 4 })
                                  : flubber.fromCircle(n.x, n.y, r, anelPrincipal(n.f, caminho), { maxSegmentLength: 4 });
            return (t) => (t < 1 ? interp(t) : final(n));
          }));
      } else {
        formas.attr("d", final);
        if (animarDe) animar(formas.attr("opacity", 0)).attr("opacity", destaque);
      }
    } else {
      svg.append("g").selectAll("path").data(foco).join("path").attr("class", "contorno").attr("d", caminho);
      const ordem = bolhas ? [...nos].sort((p, q) => q.r - p.r) : [...nos].sort((p, q) => (valorDe(p.u) ?? -1) - (valorDe(q.u) ?? -1));
      const circulos = svg.append("g").selectAll("circle").data(ordem).join("circle")
        .attr("class", "ponto").attr("data-u", chaveNo).classed("fora-escala", (n) => bolhas && n.fora).attr("fill", corDe).attr("fill-opacity", bolhas ? 0.9 : 1)
        .on("pointermove", dica).on("pointerleave", esconderDica)
        .on("click", (ev, n) => Lab.selecionar(chaveNo(n), ev.currentTarget));
      const fim = (sel) => sel.attr("cx", (n) => (bolhas ? n.x : n.x0)).attr("cy", (n) => (bolhas ? n.y : n.y0))
        .attr("r", (n) => (bolhas ? Math.max(n.r, 1.2) : raioPonto));
      if (animarDe) {
        circulos.attr("cx", (n) => (bolhas ? n.x0 : n.x)).attr("cy", (n) => (bolhas ? n.y0 : n.y))
          .attr("r", (n) => (bolhas ? raioPonto : Math.max(n.r, 1.2)));
        fim(animar(circulos));
      } else fim(circulos);
    }

    // fora de escala: rótulo na margem esquerda, na altura do círculo, ligado por uma linha
    if (bolhas) {
      const gf = svg.append("g").attr("pointer-events", "none");
      nos.filter((n) => n.fora).sort((p, q) => p.y - q.y).forEach((n, i) => {
        const tx = 10, ty = Math.max(16, n.y - 4 + i * 34);
        const t = gf.append("text").attr("class", "rotulo-fora").attr("x", tx).attr("y", ty);
        t.append("tspan").attr("x", tx).text(nomeNo(n));
        t.append("tspan").attr("x", tx).attr("dy", 14).text(`${Lab.fmtCompacto(n.u.votos)} votos · fora de escala`);
        const larg = t.node().getBBox().width, x0 = tx + larg + 6, x1 = n.x - n.r - 2;
        if (x1 > x0) gf.append("path").attr("d", `M${x0},${ty + 3} L${x1 - 6},${ty + 3} L${x1},${n.y}`)
          .attr("fill", "none").attr("stroke", token("cor-texto-secundario")).attr("stroke-width", 1);
      });
    }
    // card da unidade clicada (logo abaixo do mapa): dados + filtrar a página por ela (municípios) + limpar
    const porChave = new Map(nos.filter((n) => n.u).map((n) => [chaveNo(n), n]));
    const painel = el("div", { class: "painel-sel", "aria-live": "polite" });
    painel.hidden = true;
    alvo.append(painel);
    const escMapa = Lab.escopoDe(alvo);
    Lab.registrarPainel(escMapa, () => {
      const k = Lab.selecoes.get(escMapa), n = k && porChave.get(k);
      painel.hidden = !n;
      if (!n) return;
      Lab.conteudoPainel(painel, { u: k, nome: nomeNo(n), linhas: [...(poligonos ? [] : [`${nomeMun(n.u.municipio)} · ${n.u.sub || ""}`]), ...linhasDica(n.u)], esc: escMapa,
        abrir: nivelMapa === "municipio" ? (tse) => { Lab.selecionar("", escMapa); abrirMunicipio(tse); } : null,
        rotuloAbrir: estado.nivel === "zona" ? "Filtrar a página por este município →" : "Ver os locais de votação deste município →" });
    });
    alvo.append(legendaDif || legenda(max, passos, fmtCor));
    queueMicrotask(() => alvo.append(rodape({ fontes: [...fontesAno(), "malha", ...(nivelMapa === "territorio" ? ["td"] : REG.includes(nivelMapa) ? ["ibge"] : [])], nota: "Escala de cor recalculada para esta candidatura e seleção: cores de mapas diferentes não são comparáveis." })));
    if (bolhas) {
      alvo.append(legendaTamanho(escalaR), Lab.notaFora(nos.filter((n) => n.fora).map(nomeNo)));
      alvo.append(el("p", { class: "nota", text: "Bolhas: cada círculo parte da posição real e é afastado o mínimo necessário para não se sobrepor; a posição é aproximada." }));
    }
    if (nivelMapa === "local") {
      const fora = linhas.length - nos.length;
      if (fora) alvo.append(el("p", { class: "nota", text: `${fmtInt.format(fora)} local(is) fora do mapa (sem coordenada ou com coordenada fora do próprio município); estão na tabela, marcados.` }));
    }
  }
  const linhasDica = (u) => (u ? [`${fmtInt.format(u.votos)} votos`, u.pct === null || cand().destino !== "valido" ? "" : `${fmtPct.format(u.pct)}% dos válidos`, `${fmtInt.format(u.validos)} válidos do cargo`,
    cmpInfo && u.ant ? `em ${cmpInfo.rotulo}: ${fmtInt.format(u.ant.votos)} votos${u.ant.pct === null ? "" : ` (${fmtPct.format(u.ant.pct)}%)`}` : "",
    cmpInfo ? `variação: ${fmtDif(u.dif)}` : ""].filter(Boolean) : ["sem dados"]);

  function legenda(max, passos, fmt = fmtValor) {
    const barra = el("span", { class: "barra" });
    barra.style.background = `linear-gradient(90deg, ${passos.join(",")})`;
    return el("div", { class: "legenda" }, el("span", { text: fmt(0) }), barra, el("span", { text: fmt(max) }));
  }

  /** Legenda de área: círculos de referência em valores arredondados. */
  function legendaTamanho(escalaR) {
    const max = escalaR.domain()[1];
    const ref = [...new Set(d3.ticks(0, max, 3).filter((v) => v > 0).concat([d3.tickStep(0, max, 1) > max ? max : null]).filter(Boolean))].slice(-3);
    const rMax = escalaR(d3.max(ref));
    const W = 220, H = 2 * rMax + 8;
    const svg = d3.create("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", `Legenda de tamanho: ${ref.map((v) => fmtInt.format(v)).join(", ")} votos`);
    let x = 4;
    for (const v of ref) {
      const r = escalaR(v);
      const cx = x + Math.max(r, 22);
      svg.append("circle").attr("cx", cx).attr("cy", H - 4 - r).attr("r", r)
        .attr("fill", "none").attr("stroke", token("cor-texto-secundario"));
      svg.append("text").attr("x", cx).attr("y", H - 4 - 2 * r - 2).attr("text-anchor", "middle").text(fmtInt.format(v));
      x += Math.max(2 * r, 44) + 12;   // espaço fixo para o rótulo não encavalar
    }
    svg.attr("height", H + 14).attr("viewBox", `0 -14 ${W} ${H + 14}`);
    return el("div", { class: "legenda" }, el("span", { text: "Área ∝ votos" }), svg.node());
  }

  function desenharTop(alvo, linhas) {
    const nomeNivel = { municipio: "municípios", imediata: "regiões imediatas", intermediaria: "regiões intermediárias", territorio: "territórios de desenvolvimento",
      zona: "zonas", local: "locais de votação" }[estado.nivel];
    const vTop = cmpInfo ? (u) => u.dif ?? null : valorDe;
    alvo.append(el("h3", { text: cmpInfo ? `10 ${nomeNivel} onde mais ${estado.medida === "pct" ? "ampliou" : "ganhou votos"} desde ${cmpInfo.rotulo}`
      : `10 ${nomeNivel} com maior ${estado.medida === "pct" ? "% dos válidos" : "número de votos"}` }));
    const top = linhas.filter((u) => vTop(u) !== null && (!cmpInfo || vTop(u) > 0)).sort((x, y) => vTop(y) - vTop(x)).slice(0, 10);
    const max = top.length ? vTop(top[0]) : 0;
    if (cmpInfo && !top.length) alvo.append(el("p", { class: "nota", text: `Em nenhuma unidade ${estado.medida === "pct" ? "o percentual aumentou" : "houve ganho de votos"} em relação a ${cmpInfo.rotulo}.` }));
    const caixa = el("div", { class: "barras" });
    for (const u of top) {
      const trilho = el("div", { class: "trilho" }, el("div"));
      trilho.firstChild.style.width = `${max > 0 ? (100 * vTop(u)) / max : 0}%`;
      trilho.firstChild.style.background = corCand(cand());
      const linha = el("div", { class: "barra-linha", tabindex: 0 },
        el("span", { class: "nome", text: estado.nivel === "municipio" ? u.nome : `${u.nome}${u.municipio ? " · " + nomeMun(u.municipio) : ""}` }),
        el("span", { class: "valor", text: cmpInfo ? fmtDif(vTop(u)) : fmtValor(valorDe(u)) }), trilho);
      linha.addEventListener("pointermove", (ev) => mostrarDica(ev, u.nome, linhasDica(u)));
      linha.addEventListener("pointerleave", esconderDica);
      caixa.append(linha);
    }
    alvo.append(caixa);
    alvo.append(rodape({ fontes: fontesAno(), nota: estado.medida === "pct" ? "Unidades pequenas podem ter percentuais altos com poucos votos; confira os votos na tabela." : null }));
  }

  function tabela(linhas) {
    const LIMITE = 1000;
    const comMun = estado.nivel === "local";
    const colunas = [["nome", estado.nivel === "municipio" ? "Município" : "Unidade"]];
    if (comMun) colunas.push(["municipio", "Município"]);
    colunas.push(["votos", "Votos", true], ["validos", "Válidos do cargo", true]);
    if (cand().destino === "valido") colunas.push(["pct", "% dos válidos", true]);
    if (cmpInfo) colunas.push(["dif", `Variação desde ${cmpInfo.rotulo}`, true]);
    if (estado.nivel === "local") colunas.push(["situacao", "No mapa"]);
    let ordem = estado.medida === "pct" && cand().destino === "valido" ? "pct" : "votos", desc = true;
    const wrap = el("details", {}, el("summary", { text: `Tabela (${fmtInt.format(linhas.length)} unidades)` }));
    const caixa = el("div", { class: "tabela-rolagem" });
    const t = el("table");
    const corpo = el("tbody");
    const cab = el("tr");
    for (const [k, r, num] of colunas) {
      cab.append(el("th", { class: num ? "n" : "", scope: "col", text: r, onclick: () => { desc = ordem === k ? !desc : true; ordem = k; preencher(); } }));
    }
    t.append(el("thead", {}, cab), corpo);
    const rotSit = { ok: "sim", sem_coordenada: "não · sem coordenada", fora_do_municipio: "não · coordenada fora do município" };
    function preencher() {
      const ord = [...linhas].sort((x, y) => {
        const a = x[ordem] ?? -Infinity, b = y[ordem] ?? -Infinity;
        return (typeof a === "string" ? a.localeCompare(b) : a - b) * (desc ? -1 : 1);
      });
      corpo.replaceChildren(...ord.slice(0, LIMITE).map((u) => el("tr", {},
        el("td", {}, el("div", { text: u.nome }), u.sub && estado.nivel !== "municipio" ? el("div", { class: "nota", text: u.sub }) : null),
        comMun ? el("td", { text: nomeMun(u.municipio) }) : null,
        el("td", { class: "n", text: fmtInt.format(u.votos) }),
        el("td", { class: "n", text: fmtInt.format(u.validos) }),
        cand().destino === "valido" ? el("td", { class: "n", text: u.pct === null ? "—" : `${fmtPct.format(u.pct)}%` }) : null,
        cmpInfo ? el("td", { class: "n", text: fmtDif(u.dif) }) : null,
        estado.nivel === "local" ? el("td", {}, el("span", { class: `selo ${u.situacao === "ok" ? "" : "atencao"}`, text: rotSit[u.situacao] })) : null)));
    }
    preencher();
    caixa.append(t);
    wrap.append(caixa);
    if (linhas.length > LIMITE) wrap.append(el("p", { class: "nota", text: `Mostrando ${fmtInt.format(LIMITE)} de ${fmtInt.format(linhas.length)} linhas; filtre por município para ver todas.` }));
    return wrap;
  }

  // ---- comparação (Pearson)
  const cacheVetores = new Map();
  function vetor(nivel, eIdx, cargoIdx, ci, grupo, n) {
    const chave = `${eIdx}|${nivel}|${estado.municipio}|${cargoIdx}|${ci}`;
    if (!cacheVetores.has(chave)) {
      const c = base.eleicoes[eIdx].cargos[cargoIdx];
      const ag = agregar(votosPorSecao(c, ci, ano().n), c.validos, grupo, n);
      cacheVetores.set(chave, Array.from(ag.votos, (v, k) => percentual(v, ag.validos[k])));
    }
    return cacheVetores.get(chave);
  }

  const PLURAL = { municipio: "municípios", imediata: "regiões imediatas", intermediaria: "regiões intermediárias", territorio: "territórios de desenvolvimento",
    zona: "zonas eleitorais", local: "locais de votação" };
  const SUBMUN = ["zona", "local"];
  const recorteComp = () => `${PLURAL[estado.nivel]}${SUBMUN.includes(estado.nivel) ? (estado.municipio ? ` de ${nomeMun(estado.municipio)}` : " do Piauí") : ""}`;
  /** Agrupamento das seções nas unidades do nível escolhido (mesmo usado pelo mapa e pela tabela). */
  function grupoComparacao(a) {
    const nv = estado.nivel;
    if (nv === "municipio") return { grupo: a.grupoMun, n: muns.length, nomes: muns.map((m) => m.nome) };
    if (REG.includes(nv)) return { grupo: a.grupoReg[nv], n: regioes[nv].nomes.length, nomes: regioes[nv].nomes };
    if (nv === "zona") return { grupo: grupoFiltrado(a.grupoZona, a), n: a.zonas.length, nomes: a.zonas.map((z) => `Zona ${z}`) };
    return { grupo: grupoFiltrado(a.grupoLocal, a), n: a.locais.length, nomes: a.locais.map((l) => `${l[3]} · ${nomeMun(l[0])}`) };
  }

  function secaoComparacao(valido) {
    const sec = el("section", { "aria-label": "Comparação entre candidaturas" },
      el("h2", { text: `Candidaturas de outros cargos com distribuição parecida e oposta à de ${cand().nome_urna}, por ${recorteComp()}` }),
      instrucao("Correlação de Pearson entre os percentuais dos votos válidos da candidatura escolhida e os de cada candidatura de outro cargo, na mesma eleição, com o mesmo peso para cada unidade.",
        "Perto de +1: as duas sobem e descem juntas entre os lugares; perto de −1: onde uma vai bem, a outra vai mal. Correlação alta não significa que os mesmos eleitores votaram nas duas.",
        "A unidade da comparação é o nível escolhido no painel de filtros (zonas e locais de votação: só os do município filtrado, se houver).",
        "Clique numa candidatura da lista para ver a dispersão."));
    if (!valido) { sec.append(el("p", { class: "aviso", text: "Candidatura sem votos válidos: fora das correlações (EL0003)." })); return sec; }

    const a = ano();
    const { grupo, n, nomes: unidadesNomes } = grupoComparacao(a);
    // mínimo de unidades com dado (produto.yaml): 3 municípios; nos demais níveis, o mesmo mínimo dos locais
    const minimo = estado.nivel === "municipio" ? 3 : MIN_LOCAIS;
    const x = vetor(estado.nivel, estado.e, estado.c, estado.ci, grupo, n);
    const resultados = [];
    // outros cargos do mesmo ano (mesmas seções): na eleição escolhida e, no 2º turno, também os do 1º turno
    base.eleicoes.forEach((ee, ei) => {
      if (ee.ano !== eleicao().ano) return;
      ee.cargos.forEach((c, k) => {
        if (c.nome === cargo().nome) return;
        c.candidaturas.forEach((cc, j) => {
          if (cc.destino !== "valido") return;
          const r = pearson(x, vetor(estado.nivel, ei, k, j, grupo, n), minimo);
          if (r.r !== null) resultados.push({ e: ei, k, j, cc, cargo: ei === estado.e ? c.nome : `${c.nome} (${ee.rotulo})`, ...r });
        });
      });
    });
    const nComDado = x.filter((v) => v !== null).length;
    if (nComDado < minimo) {
      sec.append(el("p", { class: "aviso", text: `Há ${nComDado} ${PLURAL[estado.nivel]} com dado neste recorte; a correlação exige pelo menos ${minimo}. Escolha outro nível ou outro município.` }));
      return sec;
    }
    resultados.sort((p, q) => q.r - p.r);
    const lista = (titulo, itens) => el("div", {}, el("h3", { text: titulo }), el("ol", {}, ...itens.map((it) => {
      const li = el("li", { class: estado.ci2 && estado.ci2.e === it.e && estado.ci2.k === it.k && estado.ci2.j === it.j ? "ativo" : "", tabindex: 0,
        onclick: () => { estado.ci2 = { e: it.e, k: it.k, j: it.j }; render(); } },
        el("span", {}, Lab.chip(corCand(it.cc)), `${it.cc.nome_urna} (${it.cc.partido || it.cc.numero})`),
        el("span", { class: "r", text: fmtR.format(it.r) }),
        el("span", { class: "sub", text: `${it.cargo} · n = ${it.n}` }));
      li.addEventListener("keydown", (ev) => { if (ev.key === "Enter") li.click(); });
      return li;
    })));
    sec.append(el("div", { class: "ranking" },
      lista("Mais parecidas (maior r)", resultados.slice(0, 10)),
      lista("Mais opostas (menor r)", resultados.slice(-10).reverse())));
    sec.append(el("p", { class: "nota", text: `${fmtInt.format(resultados.length)} candidaturas comparadas. Clique numa delas para ver a dispersão.` }),
      rodape({ fontes: fontesAno(), nota: `Pearson com peso igual por unidade; mínimo de ${minimo} unidades com dado (L0002: cálculo no navegador conferido por paridade com o Python).` }));
    if (estado.ci2) sec.append(dispersao(x, grupo, n, unidadesNomes, minimo));
    return sec;
  }

  function dispersao(x, grupo, n, nomes, minimo) {
    const { e: e2, k, j } = estado.ci2;
    const c2 = base.eleicoes[e2].cargos[k].candidaturas[j];
    const y = vetor(estado.nivel, e2, k, j, grupo, n);
    const r = pearson(x, y, minimo);
    const pts = x.map((v, i) => ({ x: v, y: y[i], nome: nomes[i] })).filter((p) => p.x !== null && p.y !== null);
    const W = 640, H = 420, m = { t: 16, r: 16, b: 48, l: 56 };
    const sx = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.x) || 1]).nice().range([m.l, W - m.r]);
    const sy = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.y) || 1]).nice().range([H - m.b, m.t]);
    const card = el("div", { class: "cartao" },
      el("h3", { text: `% dos válidos de ${cand().nome_urna} × ${c2.nome_urna}, por ${recorteComp()}` }),
      placar(`Correlação: r = ${fmtR.format(r.r)} · ${r.n} ${PLURAL[estado.nivel]}`),
      instrucao("Cada ponto é uma unidade: posição horizontal = % dos válidos da candidatura escolhida; vertical = % da candidatura comparada.", "Passe o mouse num ponto para ver o nome e os dois percentuais."));
    const svg = d3.select(card).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("max-width", `${W}px`).style("height", "auto")
      .attr("role", "img").attr("aria-label", `Dispersão: % dos válidos de ${cand().nome_urna} (eixo horizontal) e de ${c2.nome_urna} (eixo vertical).`);
    svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(sx).ticks(6).tickFormat((v) => `${v}%`))
      .call((g) => g.selectAll("line,path").attr("stroke", token("cor-eixo")));
    svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(sy).ticks(6).tickFormat((v) => `${v}%`))
      .call((g) => g.selectAll("line,path").attr("stroke", token("cor-eixo")));
    svg.append("text").attr("x", W - m.r).attr("y", H - 8).attr("text-anchor", "end").text(`% dos válidos — ${cand().nome_urna} (${cargo().nome})`);
    svg.append("text").attr("x", m.l).attr("y", 12).text(`% dos válidos — ${c2.nome_urna} (${base.eleicoes[e2].cargos[k].nome})`);
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (p) => sx(p.x)).attr("cy", (p) => sy(p.y)).attr("r", 4)
      .attr("fill", corCand(cand())).attr("fill-opacity", 0.7).attr("stroke", token("cor-superficie")).attr("stroke-width", 1.5)
      .on("pointermove", (ev, p) => mostrarDica(ev, p.nome, [`${cand().nome_urna}: ${fmtPct.format(p.x)}%`, `${c2.nome_urna}: ${fmtPct.format(p.y)}%`]))
      .on("pointerleave", esconderDica);
    card.append(rodape({ fontes: fontesAno() }));
    return card;
  }

  // ---------------------------------------------------------- rodapé: Fontes de Dados, Metodologia e Códigos (L0003)
  Lab.rodapePagina(base.metodologia, { linkAutor: { href: "__PORTFOLIO__", texto: "Página do autor ↗", rotuloCurto: "Autor ↗" } });

  render();
})().catch((erro) => {
  document.getElementById("app").textContent = `Não foi possível carregar os dados: ${erro}. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari recentes).`;
});
