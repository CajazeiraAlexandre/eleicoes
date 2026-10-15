# L0014 — Metodologia na folha ✎ Notas e fontes (Visualização e story) e decisões da revisão do piloto

- **Escopo:** laboratório (tipos `visualizacao` e `story`; DS: moldura, controles, imagem; publicação)
- **Status:** aprovada
- **Data:** 2026-10-11
- **Aprovado por:** Alexandre (pesquisador) — questões Q-019, Q-020, Q-063 a Q-065, Q-067 a Q-070 de
  `docs/arquitetura/questoes.yaml`, ao revisar o piloto `eleicoes/2026-10_votos-em-disputa` publicado em teste
- **Revisa:** [L0003](L0003-design-system-componentes-e-bloco-de-metodologia.md), item 4 (bloco de metodologia ao final de
  todo produto), para Visualizações e stories
- **Complementa:** [L0010](L0010-publicacao-retrato-datado-pacote-enxuto.md), [L0011](L0011-especificacao-v02-vistas-ligados-facetas-controles.md),
  [L0012](L0012-moldura-no-celular-barra-fixa-imagem-svg-limites-de-texto.md), [L0013](L0013-revisao-no-celular-fechamento-da-fase-0.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) levantou o que faltava para a versão 1.0, propôs as opções, implementou
  as mudanças no DS e no piloto e redigiu este registro; as decisões são do pesquisador.

## Contexto
Na revisão do piloto pelo link publicado, o pesquisador aprovou embed, imagem e interação, e apontou uma duplicação: a
L0003 manda todo produto terminar com o bloco "Fontes de Dados, Metodologia e Códigos", mas na Visualização (e no story)
a L0012 já levou notas, fonte e decisões para a folha ✎ Notas e fontes. O bloco tem mais que a folha (passo a passo com
código, bases com datas e hashes, ADRs resumidos, limitações, perguntas, uso de IA, licença, versão e citação), então não
bastava apagá-lo. A revisão também pediu o controle de tamanho nas duas vistas e um rótulo mais claro para a ação de
compartilhar.

## Opções consideradas (bloco de metodologia)
1. **Folha em camadas** (escolhida) — ✎ Notas e fontes abre com notas, fonte e data; embaixo, as seções do bloco,
   recolhidas. Um lugar só, a mesma fonte (`labdados.metodologia`), também no embed e no cartão de story / conteúdo
   longo numa folha com rolagem própria.
2. **Página própria** (`metodologia.html` ao lado) — espaço para tabelas e código / segundo arquivo; o leitor sai da peça.
3. **Bloco no fim, sem o que a folha já tem** — mudança mínima / duplicação parcial; embed e story seguem sem o bloco.

## Decisão
1. **Metodologia na folha (Q-068).** Em Visualizações e stories, ✎ Notas e fontes traz a metodologia inteira em camadas
   (`Lab.metodologiaEmCamadas`, mesmo conteúdo de `Lab.blocoMetodologia`); a página termina na peça. Painel, narrativa,
   exploratório e nota técnica continuam com o bloco ao final. Os links para as decisões abrem a seção dentro da folha.
2. **Fonte e data sempre visíveis** (L0010, princípio 5): a segunda linha da barra mostra "por <autor>" e, embaixo, a
   fonte curta com a data da base (`texto.fonte_curta` + "base de dd/mm/aaaa", gerado).
3. **Tamanho em todas as vistas (Q-069).** O controle "Tamanho: Fixo | Votos" vale para o gráfico e para o
   companheiro (um só estado, L0011); até o leitor escolher, cada vista usa o seu padrão (`opcoes.forma`; no piloto:
   gráfico fixo, mapa por votos). Atalho no mapa e entrada em ⇄ Explorar (`controles[].explorar: true`). Com tamanho
   variável, a legenda de tamanho aparece também no gráfico (L0013) e acompanha o zoom no mapa — raio na tela = r × √zoom.
4. **"↗ Baixar ou Compartilhar" (Q-070)** no lugar de "↗ Compartilhar", na barra e no título da folha.
5. **Título do piloto (Q-067):** "Onde Lula perdeu espaço e há mais votos em disputa".
6. **Dados de peças fatiadas (Q-063):** o CSV de cada fatia em ↗ Baixar ou Compartilhar e o `dados.md` gerado; sem CSV
   nacional. A base completa se refaz com o script.
7. **Contagem de visitas (Q-019).** Decidido primeiro "sem rastreamento"; revisto no mesmo dia pelo pesquisador:
   GoatCounter (código aberto, sem cookies, sem dados pessoais), só nas páginas publicadas do projeto eleições, inserido
   pelo recorte (`contador` no `projeto.yaml`), com versão fixa e hash de integridade (SRI). Ampliado em 2026-10-14 a
   todas as páginas do ambiente de pilotos (L0017, adendo).
8. **Tema (Q-020):** a peça segue o tema do leitor; `?tema=claro` ou `?tema=escuro` fixa (no embed e na página).
9. **Ajustes visuais da revisão:** no escuro, a classe neutra da escala divergente fica mais clara, para não se confundir
   com o cinza de fora do destaque (Q-064); na imagem paisagem do mapa, a legenda vai para uma coluna à direita (Q-065).
10. **`mapa_pontos` passa a estável** (L0007), com o controle de tamanho do item 3.

## Consequências
- Mudam `lab-metodologia.js` (seções reaproveitáveis; o bloco do fim continua igual para os demais tipos),
  `lab-viz.js`/`lab-viz.css`, o modelo `modelos/visualizacao/` (sem rodapé), `labdados.viz` (fonte curta, data em
  formato brasileiro), o esquema (`texto.fonte_curta`, `controles[].explorar`, `companheiro.vazio`) e o registro de
  componentes.
- O story piloto da Rouanet adota a folha em camadas quando for revisto; produtos publicados são retratos (L0010) e
  não migram.
- Casos de borda corrigidos na mesma revisão (sem decisão nova): enquadramento mínimo do mapa para cidades com um ou
  dois locais; aviso no lugar do mapa quando nenhum local tem coordenada; sem abas e legenda quando a cidade não tem
  local comparável; concordância dos textos de N.

## Afeta
- Código: `web/componentes/lab-metodologia.js`, `lab-viz.js`, `lab-viz.css`, `lab.css`, `nucleo/labdados/viz.py`,
  `nucleo/labdados/esquemas/visualizacao.schema.json`, `design/padrao/componentes.yaml`, `modelos/visualizacao/`
- Documentos: `CLAUDE.md` (seção 8), `docs/TIPOS_DE_PRODUTO.md`, `design/padrao/design.yaml › padroes`
- Produtos: `eleicoes/2026-10_votos-em-disputa`
