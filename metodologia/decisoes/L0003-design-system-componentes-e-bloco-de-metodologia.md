# L0003 — Padrões de interface, componentes comuns e bloco de metodologia no design system do laboratório

- **Escopo:** laboratório
- **Status:** aprovada
- **Data:** 2026-10-06
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs as opções, extraiu os componentes do produto "Forças políticas no Piauí", montou a galeria e redigiu este ADR; o pesquisador definiu os padrões ao longo das revisões do produto e escolheu escopo, profundidade, dados da galeria e alcance do bloco de metodologia.

## Contexto

Nas revisões do produto `projetos/eleicoes/produtos/2026-10_forcas-politicas-pi` (out/2026), o pesquisador definiu um conjunto de padrões de interface: títulos descritivos com os seletores na própria frase, números no subtítulo, "ⓘ Como ler o gráfico" recolhido, legendas logo abaixo dos mapas, barra de busca e Mapa | Círculos no topo do mapa, seleção independente por bloco, card da unidade perto do toque no celular, fonte curta sob cada gráfico, fora de escala, legendas de classes com o texto sobre a cor, e o bloco "Fontes de Dados, Metodologia e Códigos" (modelo do Agregador O POVO/DATADOC). Também se firmou um catálogo de gráficos (barras 100%, linhas de duas pontas, mapa com círculos, distribuição, dispersão, boxplot, fluxos, quadros, tabela).

Tudo isso existia só no `app.js` daquele produto. O design system do laboratório (`design/padrao/design.yaml`) tinha apenas tokens, e a página `docs/design-system.html` mostrava dois gráficos com dados ilustrativos.

## Opções consideradas

1. **Escopo — padrão do laboratório** (escolhida) × DS próprio do projeto eleições (`herda: padrao`). Nada nos padrões é específico de eleições; as cores de partido continuam como paleta semântica de domínio (EL0006, `dados/referencia/`).
2. **Profundidade — regras + componentes JS reutilizáveis** (escolhida) × só regras e galeria. Com componentes, o próximo produto não copia código e a exportação leva os mesmos arquivos; exige refatorar o produto 4 e retestar.
3. **Dados da galeria — recorte real do produto 4** (escolhida) × dados fictícios marcados. A escolha respeita o princípio 2 (nada inventado).
4. **Bloco de metodologia — padrão de todos os produtos do laboratório** (escolhida) × só do projeto eleições.

## Decisão

- **Regras** em `design/padrao/design.yaml`, seções `padroes` (estrutura do gráfico, títulos, controles, mapa, seleção, escalas e legendas, textos de apoio, navegação, metodologia, celular), `graficos` (catálogo: quando usar, componente, regras) e `componentes`.
- **Componentes** em `web/componentes/`: `lab.css` e `lab-nucleo.js`, `lab-selecao.js`, `lab-escalas.js`, `lab-mapa.js`, `lab-graficos.js`, `lab-sankey.js`, `lab-metodologia.js` (objeto global `Lab`). Só desenham: nenhum cálculo analítico (L0002).
- **Montagem** de produtos em HTML único por `nucleo/labdados/produto_web.py` (`montar_html`; `gerar_produto` / `python -m labdados.produto_web <pasta>` para produtos novos). Os componentes usados vão em `componentes_web` no `produto.yaml`.
- **Bloco de metodologia** comum: `nucleo/labdados/metodologia.py` (`montar`) + `Lab.rodapePagina`; textos em `<produto>/src/metodologia.yaml` (modelo em `modelos/produto/src/`).
- **Galeria** em `docs/design-system.html` (seções "Padrões de interface", "Catálogo de gráficos" e "Componentes"), com exemplos interativos montados pelos próprios componentes sobre `design/padrao/exemplos.json` — recorte real gerado por `ferramentas/design_exemplos.py` a partir da base validada do produto 4. Os dois gráficos ilustrativos da página foram removidos.
- **Modelo de produto** (`modelos/produto/`): `src/index.template.html`, `src/app.js` de partida e `src/metodologia.yaml`; `componentes_web` já lista os componentes.

## Consequências

- O produto 4 passou a usar os componentes. Paridade conferida em 14 estados da página (texto, contagem de SVG, caminhos, círculos, controles e tabelas idênticos; nenhum erro). Única diferença visível: o título na citação do bloco de metodologia, agora no `metodologia.yaml`.
- Corrigido nos componentes um defeito antigo: o "null" escrito sob o mapa em círculos quando nenhuma unidade fica fora de escala.
- Mudança num componente afeta todos os produtos que o embutem na próxima geração do HTML; produtos já gerados não mudam (o HTML é autocontido). Mudanças de regra: editar `design.yaml` e o componente, rodar `make design` e regenerar os produtos afetados.
- Os produtos 1 e 2 do projeto eleições ainda não usam os componentes nem o bloco de metodologia; a adaptação fica para quando forem revisados.
- `exemplos.json` precisa ser regerado (`make design-exemplos`) quando a base do produto 4 mudar.

## Afeta
- Código: `web/componentes/*`, `nucleo/labdados/produto_web.py`, `nucleo/labdados/metodologia.py`, `ferramentas/design.py`, `ferramentas/design_template.html`, `ferramentas/design_galeria.js`, `ferramentas/design_exemplos.py`, `modelos/produto/*`, `projetos/eleicoes/analise/html_forcas_pi.py`
- Design system: `design/padrao/design.yaml` (seções `padroes`, `graficos`, `componentes`), `design/padrao/exemplos.json`
- Produtos: `projetos/eleicoes/produtos/2026-10_forcas-politicas-pi` (já migrado); novos produtos a partir de `modelos/produto`
