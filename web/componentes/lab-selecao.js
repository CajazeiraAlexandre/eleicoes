/* lab-selecao.js — seleção de unidades (clique no mapa, no gráfico ou na busca). ADR L0003.
 *
 * Cada bloco (um mapa e o gráfico ligado a ele, ou um gráfico sozinho) marca-se com
 * data-escopo="nome" e tem a sua seleção: selecionar num bloco não afeta os outros.
 * As marcas selecionáveis levam data-u="<id>". A seleção fica só na memória da página.
 */
(function () {
  "use strict";
  const Lab = window.Lab;
  const el = Lab.el;
  const selecoes = new Map();   // escopo → unidade
  const paineis = [];           // [escopo, atualizar, chave?] — registrados a cada desenho
  Lab.selecoes = selecoes;

  /** Escopo de um nó (o data-escopo mais próximo) ou o próprio nome, se for texto. */
  Lab.escopoDe = (n) => (typeof n === "string" ? n : n?.closest?.("[data-escopo]")?.dataset.escopo || "geral");
  Lab.selecaoDe = (n) => selecoes.get(Lab.escopoDe(n)) || "";
  /** Seleciona `u` no bloco de `noh` (clicar de novo desfaz); `u` vazio limpa a seleção do bloco. */
  Lab.selecionar = (u, noh) => {
    const esc = Lab.escopoDe(noh);
    if (u && selecoes.get(esc) !== u) selecoes.set(esc, u); else selecoes.delete(esc);
    Lab.aplicarSelecao(esc);
  };
  /** Marca .selecionado nas marcas do bloco, traz a selecionada para a frente e atualiza os painéis. */
  Lab.aplicarSelecao = (esc) => {
    const u = selecoes.get(esc) || "";
    for (const bloco of Lab.cfg.raiz.querySelectorAll(`[data-escopo="${CSS.escape(esc)}"]`)) {
      for (const n of bloco.querySelectorAll("[data-u]")) {
        const sim = Boolean(u) && n.dataset.u === u;
        n.classList.toggle("selecionado", sim);
        if (sim && n.parentNode) n.parentNode.appendChild(n);   // por cima dos vizinhos
      }
      for (const sv of bloco.querySelectorAll("svg")) sv.classList.toggle("com-selecao", Boolean(u) && Boolean(sv.querySelector(".selecionado")));
    }
    for (const [e, atualizar] of paineis) if (e === esc) atualizar();
  };
  /** Reaplica todas as seleções (chamar depois de redesenhar a página). */
  Lab.aplicarSelecoes = () => { for (const esc of selecoes.keys()) Lab.aplicarSelecao(esc); };
  /** Registra um painel; com `chave`, substitui o registro anterior da mesma chave (redesenho não acumula). */
  Lab.registrarPainel = (esc, atualizar, chave = null) => {
    const reg = chave ? paineis.find((p) => p[2] === chave) : null;
    if (reg) reg[1] = atualizar; else paineis.push([esc, atualizar, chave]);
  };
  /** Esquece os painéis (chamar no início de cada redesenho da página). */
  Lab.limparPaineis = () => { paineis.length = 0; };

  /** Conteúdo do painel da unidade: nome, linhas de dados, "Ver ficha" (opcional) e "Limpar seleção". */
  Lab.conteudoPainel = (painel, { u, nome, linhas, abrir = null, rotuloAbrir = "Ver ficha →", esc }) =>
    painel.replaceChildren(el("b", { text: nome }), ...linhas.filter(Boolean).map((t) => el("span", { text: t })),
      el("div", { class: "acoes-sel" },
        abrir ? el("button", { type: "button", class: "voltar", text: rotuloAbrir, onclick: () => abrir(u) }) : null,
        el("button", { type: "button", class: "voltar", text: "Limpar seleção", onclick: () => Lab.selecionar("", esc) })));

  /** Painel da unidade selecionada sob um gráfico. Em telas largas, dentro de .grade2 (mapa ao lado), fica oculto
   *  por CSS; no celular aparece logo abaixo do gráfico tocado. opts: {nome(u), dica(u) → linhas, abrir(u), rotuloAbrir}. */
  Lab.painelGrafico = (alvo, { nome, dica, abrir = null, rotuloAbrir } = {}) => {
    const painel = el("div", { class: "painel-sel painel-grafico", "aria-live": "polite" });
    alvo.append(painel);
    const esc = Lab.escopoDe(alvo);
    const atualizar = () => {
      const u = selecoes.get(esc) || "";
      const existe = u && alvo.querySelector(`[data-u="${CSS.escape(u)}"]`);
      painel.hidden = !existe;
      if (existe) Lab.conteudoPainel(painel, { u, nome: nome(u), linhas: dica(u), abrir, rotuloAbrir, esc });
    };
    Lab.registrarPainel(esc, atualizar);
    atualizar();
    return painel;
  };

  /** Destaque ligado: passar o mouse numa unidade acende a mesma unidade em todos os gráficos da grade. */
  Lab.ligarDestaque = (grade) => {
    const acender = (ev, sim) => { const u = ev.target.closest("[data-u]")?.dataset.u; if (u) for (const n of grade.querySelectorAll(`[data-u="${CSS.escape(u)}"]`)) n.classList.toggle("ligado", sim); };
    grade.addEventListener("pointerover", (ev) => acender(ev, true));
    grade.addEventListener("pointerout", (ev) => acender(ev, false));
  };
})();
