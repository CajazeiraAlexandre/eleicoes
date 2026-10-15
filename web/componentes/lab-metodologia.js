/* lab-metodologia.js — bloco "Fontes de Dados, Metodologia e Códigos", padrão de todos os produtos (ADR L0003).
 * Modelo: README do Agregador de Pesquisas (O POVO/DATADOC). O conteúdo vem pronto do Python
 * (labdados.metodologia.montar): textos do produto (src/metodologia.yaml) + partes automáticas
 * (fontes com datas e hashes do manifesto, ADRs, trechos de código, conferência de qualidade, versão).
 *
 * Lab.blocoMetodologia(m, { baixar: { rotulo, acao }, linkAutor: { href, texto } })
 * Lab.rodapePagina(m, opts) → bloco + assinatura final (preenche o <footer id="rodape">).
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;

  /** Diagrama de fluxo dos dados (pesquisador, 2026-10-12; vale para os exploratórios): bases que entram → operações
   *  (cruzamentos, filtros, agrupamentos…) → saídas do produto. Declarado em src/metodologia.yaml › fluxo:
   *    entradas: [{id, rotulo, nota?, restrita?}] · operacoes: [{id, rotulo, tipo, de: [ids], nota?}] · saidas: [{id, rotulo, de, link?, nota?}]
   *    transversais: [{id, rotulo, tipo, nota?, exceto?: [ids de saídas]}] — operações que valem para todas as saídas (ex.:
   *    supressão de 1 a 4): ficam numa faixa à parte, sob o diagrama, sem uma ligação para cada saída; passar o mouse na
   *    faixa acende as saídas a que ela se aplica (pesquisador, 2026-10-14).
   *  Colunas por profundidade (uma operação que parte de outra vai para a coluna seguinte); ligações em SVG redesenhadas a
   *  cada mudança de tamanho. Passar o mouse (ou focar) num nó acende o caminho dele — de onde vem e para onde vai. No
   *  celular, uma coluna só, e cada nó diz de onde vem ("← …"). */
  const TIPOS_FLUXO = { base: "base", cruzamento: "⨝ cruzamento", filtro: "⧩ filtro", agrupamento: "Σ agrupamento", derivacao: "ƒ derivação",
    conferencia: "✓ conferência", supressao: "▦ supressão", saida: "saída" };
  Lab.diagramaFluxo = (f) => {
    const nos = new Map();
    const add = (n, papel) => nos.set(n.id, { ...n, papel, de: [].concat(n.de || []) });
    (f.entradas || []).forEach((n) => add(n, "entrada"));
    (f.operacoes || []).forEach((n) => add(n, "operacao"));
    (f.saidas || []).forEach((n) => add(n, "saida"));
    const prof = new Map();
    const nivel = (id, pilha = new Set()) => {
      if (prof.has(id)) return prof.get(id);
      const n = nos.get(id);
      if (!n || pilha.has(id)) return 0;
      pilha.add(id);
      const v = n.papel === "entrada" ? 0 : 1 + Math.max(0, ...n.de.map((d) => nivel(d, pilha)));
      prof.set(id, v);
      return v;
    };
    [...nos.keys()].forEach((id) => nivel(id));
    // três faixas: bases | operações (uma coluna, na ordem do caminho — profundidade, depois a ordem declarada) | saídas
    const ordemDecl = [...nos.keys()];
    const faixa = (papel) => [...nos.values()].filter((n) => n.papel === papel).sort((a, b) => (papel === "operacao" ? prof.get(a.id) - prof.get(b.id) : 0) || ordemDecl.indexOf(a.id) - ordemDecl.indexOf(b.id));
    const colunas = [["Bases que entram", faixa("entrada")], ["Operações", faixa("operacao")], ["Saídas", faixa("saida")]];
    const cor = { entrada: Lab.token("cor-cat-1"), operacao: Lab.token("cor-cat-3"), saida: Lab.token("cor-cat-2") };
    const caixa = el("div", { class: "fluxo", role: "group", "aria-label": "Fluxo dos dados: bases, operações e saídas" });
    const els = new Map();
    for (const [k, [titulo, col]] of colunas.entries()) {
      caixa.append(el("div", { class: `fluxo-col fluxo-col-${k}` }, el("h4", { text: titulo }), ...col.map((n) => {
        const tipo = n.papel === "entrada" ? "base" : n.papel === "saida" ? "saida" : n.tipo || "derivacao";
        const nomeDe = n.de.map((d) => nos.get(d)?.rotulo || d).join(", ");
        const no = el("div", { class: `fluxo-no${n.restrita ? " restrita" : ""}`, tabindex: "0", "data-id": n.id,
          "aria-label": `${n.rotulo}${nomeDe ? `, a partir de: ${nomeDe}` : ""}${n.nota ? `. ${n.nota}` : ""}` },
          el("span", { class: "tipo", text: TIPOS_FLUXO[tipo] || tipo }),
          n.link ? el("b", {}, el("a", { href: n.link, text: n.rotulo })) : el("b", { text: n.rotulo }),
          n.nota ? el("span", { class: "nota", text: n.nota }) : null,
          nomeDe ? el("span", { class: "de", text: `← ${nomeDe}` }) : null);
        no.style.setProperty("--cor-fluxo", cor[n.papel]);
        els.set(n.id, no);
        return no;
      })));
    }
    const svg = d3.select(caixa).append("svg").attr("aria-hidden", "true");
    const arestas = [...nos.values()].flatMap((n) => n.de.filter((d) => nos.has(d)).map((d) => ({ de: d, para: n.id })));
    const desenhar = () => {
      const r0 = caixa.getBoundingClientRect();
      if (!r0.width) return;
      const ops = faixa("operacao").map((n) => n.id);
      svg.selectAll("path").data(arestas).join("path").attr("d", (a) => {
        const A = els.get(a.de).getBoundingClientRect(), B = els.get(a.para).getBoundingClientRect();
        const y1 = A.top + A.height / 2 - r0.top, y2 = B.top + B.height / 2 - r0.top;
        if (nos.get(a.de).papel === "operacao" && nos.get(a.para).papel === "operacao") {   // dentro da coluna: arco pela margem esquerda
          const x1 = A.left - r0.left, x2 = B.left - r0.left, g = 10 + 5 * Math.min(4, Math.abs(ops.indexOf(a.para) - ops.indexOf(a.de)) - 1);
          return `M${x1},${y1}C${x1 - g},${y1} ${x2 - g},${y2} ${x2},${y2}`;
        }
        const x1 = A.right - r0.left, x2 = B.left - r0.left, m = (x1 + x2) / 2;
        return `M${x1},${y1}C${m},${y1} ${m},${y2} ${x2},${y2}`;
      });
    };
    new ResizeObserver(desenhar).observe(caixa);
    // operações transversais: faixa à parte, aplicada a todas as saídas (menos as de `exceto`)
    const transv = (f.transversais || []).map((t) => {
      const exceto = new Set(t.exceto || []), alvo = faixa("saida").filter((n) => !exceto.has(n.id)).map((n) => n.id);
      const nomesExc = [...exceto].map((id) => nos.get(id)?.rotulo || id);
      const no = el("div", { class: "fluxo-no fluxo-transversal", tabindex: "0", "data-id": t.id,
        "aria-label": `${t.rotulo}: vale para todas as saídas${nomesExc.length ? `, exceto ${nomesExc.join(", ")}` : ""}${t.nota ? `. ${t.nota}` : ""}` },
        el("span", { class: "tipo", text: `${TIPOS_FLUXO[t.tipo] || t.tipo || "operação"} · transversal` }), el("b", { text: t.rotulo }),
        t.nota ? el("span", { class: "nota", text: t.nota }) : null,
        el("span", { class: "nota alcance", text: `Vale para todas as saídas${nomesExc.length ? `, exceto: ${nomesExc.join(", ")}` : ""}.` }));
      no.style.setProperty("--cor-fluxo", cor.operacao);
      return { t, no, alvo };
    });
    const faixaT = transv.length ? el("div", { class: "fluxo-transversais" }, el("h4", { text: "Operações transversais" }), ...transv.map((x) => x.no)) : null;
    const focarT = (x) => {
      caixa.classList.toggle("focado", !!x);
      const lig = new Set(x ? x.alvo : []);
      for (const [k, no] of els) no.classList.toggle("ligado", lig.has(k));
      svg.selectAll("path").classed("ligado", false);
      for (const y of transv) y.no.classList.toggle("ligado", y === x);
    };
    for (const x of transv) {
      x.no.addEventListener("pointerenter", () => focarT(x)); x.no.addEventListener("pointerleave", () => focarT(null));
      x.no.addEventListener("focus", () => focarT(x)); x.no.addEventListener("blur", () => focarT(null));
    }
    // caminho de um nó: ancestrais e descendentes
    const sobe = (id, s = new Set()) => { for (const a of arestas) if (a.para === id && !s.has(a.de)) { s.add(a.de); sobe(a.de, s); } return s; };
    const desce = (id, s = new Set()) => { for (const a of arestas) if (a.de === id && !s.has(a.para)) { s.add(a.para); desce(a.para, s); } return s; };
    const focar = (id) => {
      caixa.classList.toggle("focado", !!id);
      const lig = id ? new Set([id, ...sobe(id), ...desce(id)]) : new Set();
      for (const [k, no] of els) no.classList.toggle("ligado", lig.has(k));
      svg.selectAll("path").classed("ligado", (a) => lig.has(a.de) && lig.has(a.para));
      // a faixa transversal acende junto quando o caminho chega a uma saída a que ela se aplica
      for (const x of transv) x.no.classList.toggle("ligado", !!id && x.alvo.some((s) => lig.has(s)));
    };
    for (const [k, no] of els) {
      no.addEventListener("pointerenter", () => focar(k)); no.addEventListener("pointerleave", () => focar(null));
      no.addEventListener("focus", () => focar(k)); no.addEventListener("blur", () => focar(null));
    }
    caixa.classList.toggle("com-transversais", !!faixaT);
    return faixaT ? el("div", { class: "fluxo-envelope" }, caixa, faixaT) : caixa;
  };

  /** Seções do bloco (o mesmo conteúdo no fim da página ou em camadas na folha ✎ Notas e fontes — L0014). */
  const secoesMetodologia = (m, { baixar = null, linkAutor = null, endereco = null } = {}, secao) => {
    const fontes = el("div", { class: "rolagem" }, Lab.tabela(["Base", "Órgão", "Arquivos (gerado na fonte · baixado em · hash)", "Link"],
      m.fontes.map((f) => [
        [el("code", { text: f.id }), el("div", { class: "nota", text: f.descricao })],
        f.orgao,
        [el("ul", { class: "arquivos" }, ...f.arquivos.map((a) => el("li", {}, el("code", { text: a.arquivo }),
          ` · ${a.gerado_na_fonte ? a.gerado_na_fonte.replace(/ \d\d:\d\d:\d\d GMT$/, "") : "—"} · ${a.baixado_em || "—"} · ${a.sha256 || "—"}`)))],
        f.url ? [el("a", { href: f.url, target: "_blank", rel: "noopener", text: "página oficial ↗" })] : "—"])));
    const passos = el("ol", { class: "passos" }, ...m.passos.map((p) => el("li", {},
      el("b", { text: p.titulo }), el("p", { text: p.texto }),
      p.adrs ? el("div", { class: "nota" }, "Decisões: ", ...p.adrs.flatMap((id, k) => [k ? ", " : "", el("a", { href: `#adr-${id}`, text: id })])) : null,
      p.trecho ? el("details", { class: "codigo" }, el("summary", {}, "Ver código"), el("pre", {}, el("code", { text: p.trecho }))) : null)));
    const q = m.qualidade || {};
    const adrs = el("ul", { class: "adrs" }, ...m.adrs.map((a) => el("li", { id: `adr-${a.id}` },
      el("b", { text: `${a.id} — ${a.titulo}` }), el("span", { class: "nota", text: ` (${a.status})` }), el("div", { text: a.decisao }),
      el("div", { class: "nota" }, "No repositório: ", el("code", { text: a.arquivo })))));
    const codigos = el("div", { class: "rolagem" }, Lab.tabela(["Arquivo", "O que faz"], m.codigos.map((c) => [[el("code", { text: c.arquivo })], c.papel])));
    const v = m.versao;
    const citar = `${m.citacao || ""} Disponível em: ${endereco || location.href.split("#")[0]}. Acesso em: ${new Date().toLocaleDateString("pt-BR")}.`.trim();
    return [
        secao("Sobre este produto", el("p", { text: m.apresentacao })),
        m.fluxo ? secao("Fluxo dos dados", el("p", { class: "nota", text: "Das bases oficiais às saídas desta página: passe o mouse (ou toque) num item para ver de onde ele vem e para onde vai." }), Lab.diagramaFluxo(m.fluxo)) : null,
        secao("Fontes de dados", fontes,
          el("p", { class: "nota", text: "Datas de geração informadas pela própria fonte; o hash identifica a versão exata de cada arquivo usado." }),
          baixar ? el("button", { type: "button", class: "voltar", text: baixar.rotulo, onclick: baixar.acao }) : null),
        secao("Passo a passo da metodologia", passos),
        q.colunas ? secao("Conferência de qualidade", el("p", { text: `Situação: ${m.status_qualidade}. ${q.texto || ""}` }),
          el("div", { class: "rolagem" }, Lab.tabela(q.colunas, q.linhas))) : null,
        secao("Decisões metodológicas", adrs),
        secao("Principais códigos", codigos, el("p", { class: "nota", text: "Os códigos estão no repositório do laboratório; o pacote reprodutível deste produto (dados, códigos e decisões) é gerado com ferramentas/exportar.py." })),
        m.limitacoes?.length ? secao("Limitações", el("ul", {}, ...m.limitacoes.map((t) => el("li", { text: t })))) : null,
        m.perguntas?.length ? secao("Perguntas frequentes", ...m.perguntas.map((p) => el("details", { class: "pergunta" }, el("summary", { text: p.p }), el("p", { text: p.r })))) : null,
        secao("Autoria, uso de IA e licença",
          el("p", {}, m.sobre, " ", linkAutor ? el("a", { href: linkAutor.href, target: "_blank", rel: "noopener", text: linkAutor.texto }) : null),
          el("p", {}, el("b", { text: "Uso de IA: " }), m.uso_de_ia),
          el("p", {}, el("b", { text: "Licença: " }), m.licenca),
          el("p", {}, el("b", { text: "Versão: " }), `${v.numero ? `${v.numero}${v.data_versao ? ` (${new Date(v.data_versao + "T12:00").toLocaleDateString("pt-BR")})` : ""} · ` : ""}${v.status_produto}, dados gerados em ${new Date(v.gerado_em).toLocaleString("pt-BR")}`,
            v.commit ? ` · código no commit ${v.commit}${v.alteracoes_nao_commitadas ? " (com alterações ainda não registradas)" : ""}` : ""),
          el("p", {}, el("b", { text: "Como citar: " }), citar))].filter(Boolean);
  };

  Lab.blocoMetodologia = (m, opts = {}) => {
    const secao = (titulo, ...filhos) => el("section", { class: "met-secao" }, el("h3", { text: titulo }), ...filhos);
    return el("details", { class: "metodologia", id: Lab.cfg.ancoraMetodologia },
      el("summary", {}, el("span", { class: "met-titulo", text: "Fontes de Dados, Metodologia e Códigos" }),
        el("span", { class: "met-sub", text: "bases oficiais, passo a passo, códigos e decisões" })),
      el("div", { class: "met-corpo" }, ...secoesMetodologia(m, opts, secao)));
  };

  /** O bloco em camadas, para a folha ✎ Notas e fontes de Visualizações e stories (L0014): cada seção recolhida; os
   *  links para as decisões abrem a seção e rolam até o ADR dentro da folha (sem mexer no endereço da página). */
  Lab.metodologiaEmCamadas = (m, opts = {}) => {
    const secao = (titulo, ...filhos) => el("details", { class: "met-camada" }, el("summary", { text: titulo }), el("div", { class: "met-corpo-camada" }, ...filhos));
    const caixa = el("div", { class: "met-camadas" }, ...secoesMetodologia(m, opts, secao));
    caixa.addEventListener("click", (ev) => {
      const a = ev.target.closest('a[href^="#adr-"]');
      if (!a) return;
      ev.preventDefault();
      const alvo = caixa.querySelector(a.getAttribute("href"));
      if (!alvo) return;
      alvo.closest("details.met-camada").open = true;
      alvo.scrollIntoView({ block: "nearest", behavior: Lab.semMovimento() ? "auto" : "smooth" });
    });
    return caixa;
  };

  /** Rodapé da página: bloco de metodologia + assinatura com link para a página do autor. */
  Lab.rodapePagina = (m, { baixar = null, linkAutor = null } = {}) => {
    const rodape = document.getElementById(Lab.cfg.ancoraRodape);
    rodape.replaceChildren(Lab.blocoMetodologia(m, { baixar, linkAutor }),
      el("p", { class: "assinatura-final" }, `Análise e visualização: ${Lab.cfg.autor}`,
        linkAutor ? " · " : null, linkAutor ? el("a", { href: linkAutor.href, target: "_blank", rel: "noopener", text: linkAutor.rotuloCurto || linkAutor.texto }) : null));
    // só o link interno ("Fontes, métodos e códigos ↓") leva à metodologia; o nome do autor abre o portfólio em nova aba
    // o mesmo para o item do menu do topo marcado com data-metodologia (exploratórios; pesquisador, 2026-10-12)
    for (const a of document.querySelectorAll('.assinatura a[href^="#"], a[data-metodologia]')) a.addEventListener("click", Lab.irRodape);
  };
})();
