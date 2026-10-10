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

  Lab.blocoMetodologia = (m, { baixar = null, linkAutor = null } = {}) => {
    const secao = (titulo, ...filhos) => el("section", { class: "met-secao" }, el("h3", { text: titulo }), ...filhos);
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
    const citar = `${m.citacao || ""} Disponível em: ${location.href.split("#")[0]}. Acesso em: ${new Date().toLocaleDateString("pt-BR")}.`.trim();
    return el("details", { class: "metodologia", id: Lab.cfg.ancoraMetodologia },
      el("summary", {}, el("span", { class: "met-titulo", text: "Fontes de Dados, Metodologia e Códigos" }),
        el("span", { class: "met-sub", text: "bases oficiais, passo a passo, códigos e decisões" })),
      el("div", { class: "met-corpo" },
        secao("Sobre este produto", el("p", { text: m.apresentacao })),
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
          el("p", {}, el("b", { text: "Como citar: " }), citar))));
  };

  /** Rodapé da página: bloco de metodologia + assinatura com link para a página do autor. */
  Lab.rodapePagina = (m, { baixar = null, linkAutor = null } = {}) => {
    const rodape = document.getElementById(Lab.cfg.ancoraRodape);
    rodape.replaceChildren(Lab.blocoMetodologia(m, { baixar, linkAutor }),
      el("p", { class: "assinatura-final" }, `Análise e visualização: ${Lab.cfg.autor}`,
        linkAutor ? " · " : null, linkAutor ? el("a", { href: linkAutor.href, target: "_blank", rel: "noopener", text: linkAutor.rotuloCurto || linkAutor.texto }) : null));
    // só o link interno ("Fontes, métodos e códigos ↓") leva à metodologia; o nome do autor abre o portfólio em nova aba
    for (const a of document.querySelectorAll('.assinatura a[href^="#"]')) a.addEventListener("click", Lab.irRodape);
  };
})();
