/* lab-escalas.js — escalas de tamanho e legendas de cor. ADR L0003.
 *
 * Regras (design.yaml › padroes): legendas de escala ocupam ~70% da largura do gráfico; nos mapas
 * ficam logo abaixo do desenho; texto da legenda em tinta de texto, nunca na cor da série.
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;

  /** Escala de área (raiz) com teto "fora de escala": se a maior unidade tem mais de 3× o valor da segunda,
   *  a escala vai até a segunda e a maior fica no tamanho máximo, com contorno tracejado (decisão de 2026-10-06). */
  Lab.escalaArea = (valores, rMax) => {
    const ord = valores.filter((v) => v > 0).sort((a, b) => b - a);
    const fora = ord.length > 2 && ord[0] > 3 * ord[1];
    const teto = fora ? ord[1] : ord[0] || 1;
    const s = d3.scaleSqrt().domain([0, teto]).range([0, rMax]).clamp(true);
    return { s, teto, fora: (v) => fora && v > teto };
  };
  /** Nota sob o gráfico com as unidades fora de escala. Sem unidades, devolve "" (pode ir direto em append:
   *  o append nativo escreveria "null"). */
  Lab.notaFora = (nomes) => (nomes.length ? el("p", { class: "nota", text: `Fora de escala (contorno tracejado): ${nomes.join(", ")}. O valor é mais de três vezes o da segunda maior unidade; o círculo fica no tamanho máximo para não esmagar os demais.` }) : "");

  /** Legenda de tamanho: três círculos de referência ("Área ∝ …"). */
  Lab.legendaTamanho = (escalaR, rotuloTamanho) => {
    const max = escalaR.domain()[1];
    const ref = d3.ticks(0, max, 3).filter((v) => v > 0).slice(-3);
    const H = 2 * escalaR(d3.max(ref)) + 22;
    const svg = d3.create("svg").attr("width", 260).attr("height", H).attr("role", "img").attr("aria-label", `Legenda de tamanho: ${ref.map((v) => Lab.fmtInt.format(v)).join(", ")}`);
    let x = 4;
    for (const v of ref) {
      const r = escalaR(v), cx = x + Math.max(r, 26);
      svg.append("circle").attr("cx", cx).attr("cy", H - 4 - r).attr("r", r).attr("fill", "none").attr("stroke", Lab.token("cor-texto-secundario"));
      svg.append("text").attr("x", cx).attr("y", H - 6 - 2 * r).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", Lab.token("cor-texto-secundario")).text(Lab.fmtInt.format(v));
      x += Math.max(2 * r, 52) + 10;
    }
    svg.attr("width", x + 4);   // largura conforme os círculos (não corta o maior)
    return el("div", { class: "legenda" }, el("span", { text: `Área ∝ ${rotuloTamanho}` }), svg.node());
  };

  /** Rampa de cores (quadros iguais). */
  Lab.rampa = (cores) => el("span", { class: "rampa" }, ...cores.map((c) => { const s = el("span"); s.style.background = c; return s; }));
  /** Escala contínua: rampa na largura toda e rótulos das pontas embaixo (sequencial ou divergente). */
  Lab.legendaRampa = (cores, esquerda, direita) => el("div", { class: "legenda legenda-larga" }, el("span", { text: esquerda }), Lab.rampa(cores), el("span", { text: direita }));
  /** Escala divergente com três marcos: início, centro (neutro) e fim. */
  Lab.legendaTres = (cores, inicio, centro, fim) => el("div", { class: "legenda legenda-tres" }, Lab.rampa(cores), el("span", { text: inicio }), el("span", { text: centro }), el("span", { text: fim }));
  /** Legenda de classes por categoria: uma linha por categoria, quadros de largura fixa com a faixa escrita sobre a cor.
   *  linhas: [{nome, cores: [uma por classe]}] · rotulos: texto de cada classe ("< 40%", "40–50%"…). */
  Lab.legendaClasses = (linhas, rotulos, aria) => {
    const caixa = el("div", { class: "legenda-intensidade", role: "img", "aria-label": aria || `Legenda: ${rotulos.join(", ")}` });
    for (const l of linhas) {
      caixa.append(el("span", { class: "nome", text: l.nome.replaceAll("/", "/​") }));   // quebra após "/" no celular
      l.cores.forEach((cor, i) => { const q = el("span", { class: "quadro", text: rotulos[i] }); q.style.background = cor; Lab.comHalo(q, cor); caixa.append(q); });
    }
    return caixa;
  };
  /** Legenda que filtra/foca (design.yaml › padroes.legendas; pesquisador, 2026-10-12 — o mesmo recurso da Visualização,
   *  Q-079): passar o mouse destaca a categoria em `alvo` (segmentos e linhas com data-cat; os demais esmaecem); tocar fixa
   *  e leva a categoria para a base das barras 100% (à esquerda); tocar de novo desfaz. itens: [[cor, texto, id]].
   *  `alvo`: elemento ou função que o devolve (ex.: o cartão inteiro, para acender também as linhas da tabela). */
  Lab.legendaFoco = (itens, alvo_, ...extras) => {
    let fixa = null;
    const A = () => (typeof alvo_ === "function" ? alvo_() : alvo_);
    const leg = el("div", { class: "legenda legenda-interativa", role: "group", "aria-label": "Categorias: passe o mouse ou toque para destacar" });
    const ordem = new Map();
    const reordenar = () => {
      for (const barra of A().querySelectorAll(".barra")) {
        const sps = [...barra.children];
        if (!ordem.has(barra)) ordem.set(barra, sps);
        const orig = ordem.get(barra);
        const lista = fixa === null ? orig : [...orig.filter((s) => s.dataset.cat === fixa), ...orig.filter((s) => s.dataset.cat !== fixa)];
        barra.replaceChildren(...lista);
      }
    };
    const aplicar = (id) => {
      const foco = id ?? fixa;
      for (const n of A().querySelectorAll("[data-cat]")) { n.classList.toggle("esmaecido", foco !== null && n.dataset.cat !== foco); n.classList.toggle("em-foco", foco !== null && n.dataset.cat === foco); }
      leg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.foco === fixa)));
    };
    leg.append(...itens.map(([cor, texto, id]) => {
      const am = el("span", { class: "amostra" }); am.style.background = cor;
      return el("button", { type: "button", class: "item-legenda", "data-foco": String(id), "aria-pressed": "false",
        onpointerenter: () => aplicar(String(id)), onpointerleave: () => aplicar(null), onfocus: () => aplicar(String(id)), onblur: () => aplicar(null),
        onclick: () => { fixa = fixa === String(id) ? null : String(id); reordenar(); aplicar(null); } }, am, texto);
    }), ...extras);
    return leg;
  };
  /** Legenda categórica: amostra + nome, na ordem fixa das categorias. itens: [[cor, texto]]. */
  Lab.legendaCategorias = (itens, ...extras) => el("div", { class: "legenda" }, ...itens.map(([cor, texto]) => Lab.chave(cor, texto)), ...extras);
})();
