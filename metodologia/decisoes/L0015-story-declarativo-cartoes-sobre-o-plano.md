# L0015 — Story declarativo: cartões sobre o plano da Visualização

- **Escopo:** laboratório (tipo `story`; especificação, renderizador e registro de componentes)
- **Status:** aprovada
- **Data:** 2026-10-11
- **Aprovado por:** Alexandre (pesquisador) — briefing do story `eleicoes/2026-10_2-turno-na-sua-cidade`, resposta 6A
  ("construir sobre a Visualização declarativa") e validação do roteiro dos cartões
- **Decide em parte:** Q-066 (hospedeiro story; adaptadores de linhas, barras e quadros)
- **Complementa:** [L0007](L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md),
  [L0011](L0011-especificacao-v02-vistas-ligados-facetas-controles.md), [L0014](L0014-metodologia-na-folha-e-revisao-do-piloto.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs as opções, implementou e redigiu este registro; decisão do pesquisador.

## Contexto
O primeiro story do projeto eleições conta a mesma pergunta do piloto "votos em disputa" em cartões para o celular, ligados
à cidade escolhida. O story da Rouanet foi escrito à mão; repetir isso abriria um terceiro gerador de página (ponto de
atenção A-02 em `docs/arquitetura/sistema.yaml`).

## Opções consideradas
1. **Cartões sobre o plano da Visualização** (escolhida) — reaproveita moldura, barra fixa, folhas, imagem, embed,
   fatias e adaptadores / trabalho de fundação no renderizador.
2. **Story à mão** (como o da Rouanet) — mais rápido / código próprio, sem imagem por cartão nem embed comuns.

## Decisão
1. `tipo: story` no `viz.yaml` exige `cartoes`. Cada cartão tem `id`, `titulo`, `texto` e escolhe **uma** das formas:
   a vista do plano (`vista: principal | mapa`, com `destaque: false` para todos na mesma cor e `anotacoes: [ids]`), um
   componente registrado com dados próprios do Python (`componente` + `dados: "{e.…}"`), `capa` ou `fim` (com `links`).
2. `se: <condição>` (ou `!condição`), calculada no Python por fatia, tira o cartão quando é falsa: os casos de borda
   (sem local comparável, sem destaque, sem coordenada, poucos bairros) ficam no dado, não no JS.
3. Navegação por botões, deslizar e setas; o cartão fica no endereço (`#municipio=…&cartao=…`). Entre cartões de gráfico
   e de mapa, os mesmos pontos se movem (transição da L0013).
4. Imagem por cartão em 9:16 (1080 × 1920); prévia do link em 16:9 do cartão escolhido em `saidas.imagens.og.estado.cartao`.
5. Adaptadores novos em `lab-viz.js`, todos em SVG (tela e imagem iguais): `quadros` e `linhas` (estáveis no registro,
   agora também declarativos) e `barras` (horizontais ordenadas, **experimental**). Sem escala de cor, a cor do destaque
   é `grafico.opcoes.cor` e a legenda mostra "em destaque / fora do destaque".

## Consequências
- A Visualização não muda (o piloto renderiza igual); produtos publicados são retratos e não migram (L0010).
- O story da Rouanet pode migrar quando for revisto. Demais adaptadores (barras100, fluxos, distribuição, boxplot,
  tabela, mapa coroplético) seguem em Q-066, no próximo produto que pedir.

## Afeta
- Código: `nucleo/labdados/viz.py`, `nucleo/labdados/esquemas/visualizacao.schema.json`, `web/componentes/lab-viz.js`,
  `web/componentes/lab-viz.css`, `design/padrao/componentes.yaml`
- Produtos: `eleicoes/2026-10_2-turno-na-sua-cidade`

## Complemento (2026-10-12) — extensões para migrar os pilotos
- **Aprovado por:** Alexandre (pesquisador), ao decidir migrar os stories "Onde a Rouanet acontece" e "Quem lidera o
  voto no Piauí" para o formato declarativo ("Migrar p/ declarativo", 2026-10-12), como pilotos de publicação.
- **Uso de IA:** Claude (Claude Code, Anthropic) implementou e redigiu; decisão do pesquisador.

Para que os dois roteiros validados coubessem no formato sem mudar uma frase, o formato ganhou (todas genéricas):
1. **Base única** (`dados.fonte.base`): story sem fatias por lugar; a base vai embutida no plano da página.
2. **Story sem gráfico principal**: todos os cartões com componente próprio ou só texto (`grafico` passa a ser opcional
   no story; fora dele continua obrigatório). Uma Visualização também pode ter `grafico.dados` (componente com dados
   prontos do Python, sem ligações).
3. **Cartão**: `capitulo` (no lugar do chapéu), `nota` (curta, sob o gráfico) e `componentes` (pilha de 2 ou 3, ex.:
   mapa em cima e barras embaixo); cartão sem vista nem componente = só texto.
4. **Seletor no cartão**: um controle citado no texto do cartão (`{c.id}`) e marcadores que citam o valor escolhido
   (`{e.explore.$id.dados}`); frases e dados de cada opção vêm prontos do Python. Opções longas podem vir da base
   (`valores: "{e.opcoes.municipio}"`). No story, o limite de controles vale só para o título geral.
5. **Estado entre cartões** (matriz de transições, L0016): cartões seguidos com o mesmo componente não redesenham — o
   componente que sabe se atualizar (`atualizar`: mapa, fluxos) muda de estado; os demais interpolam as marcas com a
   mesma chave (`data-k`) e esmaecem o resto.
6. **Peças compartilhadas pelo nome** no mapa (`malha`, `unidades`, `referencia`, `rotulos`): ficam uma vez na base.
7. O gerador inclui o MapLibre (fundo vetorial) e o flubber (mapa ⇄ bolhas) só quando a peça usa.

Consequência: os dois stories passaram a usar o mesmo renderizador do 2º turno (`lab-viz.js`); as páginas escritas à
mão ficam em `src/legado/` de cada produto, só como registro.
