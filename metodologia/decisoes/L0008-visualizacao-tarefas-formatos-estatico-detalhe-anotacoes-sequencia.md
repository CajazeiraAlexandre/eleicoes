# L0008 — Forma e interação da Visualização: tarefas, formatos, representação estática, cartão de detalhe, anotações e sequência

- **Escopo:** laboratório (design system e componentes; vale para Visualizações e para todo produto que usar os componentes)
- **Status:** aprovada (o item 3 foi ajustado ao receio do pesquisador e confirmado em 2026-10-10; limites de controles revistos pela L0011)
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — decisões D4, D5, D6, D7, D15 e D16 da proposta
- **Complementa:** [L0003](L0003-design-system-componentes-e-bloco-de-metodologia.md), [L0006](L0006-componente-de-mapa-camera-interacao-fundo.md), [L0007](L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) redigiu a proposta
  ([`docs/propostas/2026-10-10_visualizacao-declarativa.html`](../../docs/propostas/2026-10-10_visualizacao-declarativa.html), seções 3.3,
  3.4, 4 e 5) e este registro; as decisões são do pesquisador, inclusive as referências de tarefa sugeridas por ele.

## Contexto
Uma Visualização circula sozinha (link, rede social), embutida em sites e dentro de stories, e precisa ser exportada como
imagem. Hoje as quebras do DS são pela largura da tela (erram em embeds e cartões); o detalhe sob demanda tem duas soluções
(dica junto ao ponteiro e card do mapa); anotações só têm um token; o PNG é feito por produto com html2canvas; e o catálogo
de gráficos é organizado por gráfico, não pela pergunta do leitor.

## Opções consideradas
- **D15 · Tarefas:** (a) oito tarefas (as cinco categorias do #30DayChartChallenge + parte do todo, fluxo e espaço) com o
  vocabulário de ação e alvo de Munzner; (b) só as cinco do desafio; (c) manter o catálogo por gráfico.
- **D4 · Formatos:** (a) retrato, quadrado, paisagem e fluido, pelo contêiner; (b) só fluido; (c) mais formatos.
- **D5 · Representação estática:** regra por elemento no contrato; imagem gerada no build; rodapé mínimo inviolável.
- **D6 · Cartão de detalhe:** promover o card da L0006 a componente de todos os gráficos.
- **D7 · Anotações:** (a) componente próprio, âncora em dados, prioridade e marcadores numerados; (b) d3-annotation com
  posições fixas por formato.
- **D16 · Sequência:** (a) até quatro passos sobre o mesmo gráfico, com gatilho do hospedeiro; (b) sem sequência; (c) sem limite.

## Decisão
1. **Tarefas (D15-a):** a especificação começa por `tarefa: {categoria, alvo, pergunta}`. Categorias, em lista aberta no
   `design.yaml › tarefas`: `comparacao`, `parte_do_todo`, `distribuicao`, `relacao`, `evolucao`, `fluxo`, `espaco`,
   `incerteza`. Os alvos usam o vocabulário de Munzner (tendência, extremos, fora da curva, distribuição, correlação,
   dependência, forma espacial). O contrato de cada componente declara as tarefas que atende; a escolha fora delas gera aviso.
   O catálogo do DS é agrupado por tarefa. Referências: T. Munzner, *Visualization Analysis and Design* (2014) e “A Nested
   Model for Visualization Design and Validation” (IEEE TVCG, 2009); #30DayChartChallenge.
2. **Formatos (D4-a):** retrato 4:5 (9:16 no story), quadrado 1:1, paisagem 16:9 e fluido. A escolha é feita pelo tamanho do
   **contêiner** (container queries e `ResizeObserver`). Ajustes por formato ficam no contrato do componente (posição da
   legenda, rótulos, forma das anotações).
3. **Representação estática e imagem (D5, com o ajuste confirmado pelo pesquisador):**
   - regras por elemento: o seletor no título vira texto; Explorar, zoom, busca e compartilhar somem; o cartão de detalhe
     some (ou vira anotação, se declarado); as anotações ficam; a legenda fica fixa; o rodapé mínimo (fonte e data,
     endereço curto, autoria) nunca é cortado;
   - **imagem do leitor (caminho principal):** o botão “baixar imagem” exporta **o estado atual**, com os filtros, o zoom, a
     seleção e o passo escolhidos pelo leitor, no modo estático, desenhando o SVG num canvas no navegador;
   - **imagem do build:** só para a prévia em redes sociais (`og:image`) e para o carrossel da sequência, onde não há leitor;
   - html2canvas não é usado em produtos novos.
4. **Cartão de detalhe (D6):** componente único para todos os gráficos. A especificação declara o conteúdo (título,
   contexto, linhas com rótulo, valor, unidade e variação, minigráfico e ação opcionais). O DS fixa o comportamento:
   - mouse: aparece ao passar, some ao sair;
   - clique ou toque: fica fixo até tocar fora, tocar no × ou apertar Esc;
   - teclado: Tab percorre as unidades, Enter abre;
   - no celular: encaixa no pé do palco, sem cobrir o elemento tocado;
   - leitor de tela: conteúdo anunciado (`aria-live`).

   **Nada de nome solto numa linha abaixo do gráfico.**
5. **Anotações (D7-a):** componente próprio (balão, seta, círculo, linha e faixa de referência), com quatro regras:
   - âncora nos dados (`alvo`), recalculada a cada formato, zoom e estado;
   - lado preferido com alternativas quando colide;
   - em retrato, ou quando não cabe, a anotação vira marcador numerado com o texto abaixo do gráfico;
   - prioridade: 1 sempre, 2 a partir do quadrado, 3 só em paisagem.

   Em stories, as anotações vêm do cartão. O texto aceita marcadores da base e entra na descrição acessível.
6. **Sequência (D16-a):** até quatro passos sobre o mesmo gráfico; cada passo muda o estado do palco (filtro, destaque,
   câmera, medida, anotações) e a frase, nunca o gráfico. O gatilho é do hospedeiro:
   - avulsa: botões ‹ ›, pontos, deslize e setas;
   - story: toque ou deslize, com os passos desdobrados em cartões;
   - embed: botões; no futuro, a rolagem da página que embute, por `postMessage`;
   - imagem: um PNG por passo.

   O primeiro passo se sustenta sozinho, o endereço guarda o passo (`?passo=`) e nada avança sem o leitor.
7. **Controles (decorrência da seção 5.1 da proposta):** o título pode citar controles (`{controle.ano}`), desenhados na frase
   (`Lab.seletorTitulo`/`Lab.seletorTituloLista`), no máximo dois; a gaveta Explorar mostra todos; os dois são vistas do
   mesmo estado, refletido no endereço. Limites por lugar (título, gráfico, Explorar) na L0011.

## Consequências
- `design/padrao/design.yaml`: seção `tarefas` e campo `tarefas` em cada gráfico do catálogo (feito na fase 0). Na fase 1
  e na 2 entram as seções `formatos`, `padroes.detalhe`, `padroes.anotacao`, `padroes.estatico`, `padroes.controles` e
  `padroes.sequencia`, junto com os componentes (`lab-detalhe.js`, `lab-anotacao.js`).
- Lacunas assumidas no catálogo, a preencher uma por vez como experimentais: ranking longo, pequenos múltiplos, dispersão
  com escalas diferentes, série temporal longa e incerteza.
- Produtos existentes continuam com `Lab.mostrarDica` e o card do mapa até serem revistos.

## Afeta
- Código (futuro): `web/componentes/lab-viz.js`, `lab-detalhe.js`, `lab-anotacao.js`, adaptadores dos `Lab.*`
- DS: `design/padrao/design.yaml`, `docs/design-system.html`
- Produtos: novos do tipo `visualizacao`; stories e narrativas que usarem Visualizações
