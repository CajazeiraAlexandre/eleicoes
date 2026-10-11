# L0012 — Moldura da Visualização no celular: altura livre, barra fixa, cartão abaixo do desenho, imagem em SVG e limites de texto

- **Escopo:** laboratório (moldura do renderizador de Visualizações, componentes do DS, exportação de imagem)
- **Status:** aprovada
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — questões Q-034 a Q-039 de `docs/arquitetura/questoes.yaml`, decididas sobre as
  maquetes da bancada (`docs/bancada.html`, seção 3)
- **Complementa:** [L0006](L0006-componente-de-mapa-camera-interacao-fundo.md), [L0008](L0008-visualizacao-tarefas-formatos-estatico-detalhe-anotacoes-sequencia.md), [L0011](L0011-especificacao-v02-vistas-ligados-facetas-controles.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) construiu a bancada (`ferramentas/bancada.py` e `ferramentas/bancada/`),
  levantou os achados B1–B8 e redigiu este registro; a barra fixa e a legenda recolhível foram pedidas pelo pesquisador, e
  as decisões são dele.

## Contexto
A bancada mostrou três casos reais (T1 composição, T6 votos em disputa com mapa companheiro, S1 sequência) nos três
formatos, nas versões interativa e estática e nos hospedeiros. Com a moldura completa (ações e rodapé longo), o retrato
4:5 interativo não comportava o gráfico: na dispersão sobravam menos de 120 px. Também apareceram a questão da imagem com
componentes desenhados em HTML, a falta de limite para textos longos e a dúvida sobre o companheiro e o cartão de detalhe
no celular.

## Opções consideradas
- **Q-034 · Retrato interativo:**
  - (a) altura livre na página avulsa, com 4:5 fixo só para imagem e embed;
  - (b) 9:16 fixo;
  - (c) 4:5 fixo com a moldura cortada.
- **Q-039 · Moldura interativa:** a linha de ações + rodapé longo da proposta, ou a barra fixa do story piloto (pedido do pesquisador).
- **Q-035 · Imagem com componentes em HTML:**
  - (a) gráficos em SVG, com tabela e quadros por SVG `foreignObject`;
  - (b) `foreignObject` para a moldura inteira.
- **Q-036 · Texto longo:** limite por formato ou sem limite.
- **Q-037 · Companheiro no quadrado:** (a) abas; (b) lado a lado.
- **Q-038 · Cartão de detalhe no celular:**
  - (i) sobre o palco, em formato fixo;
  - (ii) sobre o palco, com altura livre;
  - (iii) abaixo do desenho, empurrando o conteúdo.

## Decisão
1. **Altura livre no celular (Q-034-a):** na página avulsa, a peça em retrato tem a altura do conteúdo, e a página rola.
   Formatos de altura fixa valem só onde não há página para rolar: a **imagem** (4:5, 1:1, 16:9) e o **embed** (o quadro do iframe).
2. **Barra fixa no pé (Q-039)**, no padrão do story *Onde a Rouanet acontece*:
   - 1ª linha: **ⓘ Como ler · ✎ Notas e fontes · ⇄ Explorar**. Cada botão abre uma folha que sobe por cima da peça, com
     alça e ✕; o Esc fecha;
   - 2ª linha: **“por <nome do autor>”** (portfólio, em nova aba) e **↗ Compartilhar**. As formas de compartilhar ficam
     recolhidas: link com o estado atual, WhatsApp, e-mail, código para embutir e baixar a imagem do que está na tela;
   - a fonte sai da vista e vai para “Notas e fontes”, com as notas, as decisões e o link para a metodologia;
   - a **legenda pode ser recolhida** (“◧ Legenda”) e abre no lugar, ao lado do gráfico, nunca numa folha por cima;
   - na **imagem**, o rodapé mínimo continua visível (fonte e data, endereço, autoria): a imagem circula sem a página (L0008).
3. **Gráficos em SVG (Q-035-a):** todo componente de gráfico desenha em SVG; a barra 100% (`Lab.linhaBarra100`, hoje em
   HTML) migra. A tabela e os quadros entram na imagem por SVG `foreignObject`, com os estilos embutidos. A imagem do
   leitor é montada como um SVG único (textos da moldura + gráfico + legenda + rodapé mínimo) e convertida em PNG no
   navegador. Nada de bibliotecas de captura de HTML.
4. **Limite de texto por formato (Q-036):** cerca de 110 caracteres no retrato, 140 no quadrado e 200 no paisagem, para
   subtítulo e textos de passo.
   - Se a especificação passar disso, a interativa corta com “…”, e o clique mostra o texto inteiro.
   - Na estática, o texto vai inteiro, e a validação avisa se ele não couber.
   - Os limites ficam no DS (`design.yaml › formatos`, fase 1), não no esquema.
5. **Companheiro no quadrado (Q-037-a):** em abas (“Gráfico | Ver no mapa”), como no retrato. Lado a lado só no paisagem
   e no fluido largo. Na imagem, só o gráfico principal (L0011).
6. **Cartão de detalhe no celular (Q-038-iii):** na página avulsa, o cartão abre **logo abaixo do desenho e empurra o
   conteúdo**, sem cobrir o gráfico. Isso confirma a regra da L0006 (“no celular, logo abaixo do desenho, antes das
   legendas”). Onde a altura é fixa e não há como empurrar (embed e cartão de story), o cartão fica sobre o palco, do lado
   oposto ao toque. Este último ponto é decorrência, não escolha explícita do pesquisador; revisar se a revisão no celular
   mostrar problema.

## Consequências
- `design.yaml`: seções `formatos` (com os limites de texto e a regra de altura livre), `padroes.moldura` (barra fixa),
  `padroes.detalhe` (abaixo do desenho no celular) e `padroes.estatico` (rodapé mínimo), na fase 1.
- `web/componentes/`: `Lab.linhaBarra100` passa a SVG (os produtos existentes que o usam são regerados quando revistos;
  os publicados são retratos e não mudam, L0010); `lab-viz.js` monta a imagem do leitor como SVG.
- A barra do story piloto passa a ser componente do DS (moldura comum a Visualização e story), em vez de código do produto.
- Bancada: `docs/bancada.html` passa a mostrar o estado decidido como referência do passo 5 (revisão no celular, embed e PNG).

## Afeta
- DS: `design/padrao/design.yaml`, `web/componentes/lab.css`, `lab-nucleo.js` (barra 100%), futuro `lab-viz.js`
- Produtos: novos; o story piloto (`2026-10_rouanet-onde-acontece`) é a origem da barra
- Documentos: `docs/arquitetura/` (glossário, princípios, fase 0)
