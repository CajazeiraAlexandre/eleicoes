# L0011 — Especificação de Visualização v0.2: vistas, gráfico companheiro, facetas, escala bivariada, limite de controles, `mapa_pontos` e tabelas de análise

- **Escopo:** laboratório (especificação de Visualização, DS, scripts de `analise/` dos projetos)
- **Status:** aprovada
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — questões Q-027 a Q-033 de `docs/arquitetura/questoes.yaml`
- **Complementa:** [L0007](L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md), [L0008](L0008-visualizacao-tarefas-formatos-estatico-detalhe-anotacoes-sequencia.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) fez o teste de papel (especificações de 8 gráficos existentes e de uma
  sequência, em `docs/arquitetura/teste-de-papel/`), levantou os achados A1–A21 e redigiu este registro; as decisões são do pesquisador.

## Contexto
O teste de papel da fase 0 mostrou que a especificação da proposta (v0.1) descrevia por completo só 1 de 8 gráficos
reais do laboratório. Os gráficos dependem de tabelas de análise do projeto, de textos que mudam com o estado, de paletas
de domínio, de vistas alternativas, de pares de gráficos ligados e de mais controles do que o limite proposto. Com os
campos acrescentados no rascunho v0.2, 7 de 8 passam a ser expressos, desde que sete pontos sejam aprovados.

## Opções consideradas
- **Q-027 · Vistas:** aprovar ou não configurações alternativas do mesmo componente, escolhidas pelo leitor.
- **Q-028 · Gráficos ligados:**
  - (a) o par vira painel ou duas Visualizações;
  - (b) gráfico companheiro;
  - (c) vários gráficos por peça.
- **Q-029 · Facetas** (pequenos múltiplos): aprovar ou não.
- **Q-030 · Escala bivariada** (categoria × classe) como escala experimental: aprovar ou não.
- **Q-031 · Limite de controles:**
  - (1) até 2 no título, até 3 em título + gráfico, até 5 no Explorar;
  - (2) manter 3 no total.
- **Q-032 · `mapa_pontos`** como componente experimental: aprovar ou deixar como extensão de produto.
- **Q-033 · Tabelas tidy nos scripts de análise:** só produtos novos, ou migrar também os existentes.

## Decisão
1. **Vistas (Q-027):** aprovadas. Uma Visualização pode ter `vistas`, que são configurações alternativas do **mesmo**
   componente, escolhidas pelo leitor por um controle `tipo: vista`. Cada vista pode sobrescrever ligações, escalas, textos
   e anotações. Trocar de componente continua sendo outra Visualização. Na sequência, quem conduz é o autor; nas vistas, é o leitor.
2. **Gráfico companheiro (Q-028-b):** uma Visualização pode ter **um** gráfico principal e **um** secundário (`companheiro`)
   sobre as **mesmas unidades**, ligados pelo destaque. Passar o mouse ou tocar numa unidade a acende nos dois. Regras:
   - em retrato, o companheiro vira uma aba ao lado do principal (“Ver no mapa”, “Ver distribuição”);
   - na imagem estática, só o principal aparece;
   - a tarefa da peça é a do principal.
3. **Facetas (Q-029):** aprovadas. `facetas: {campo, max: 4}` repete o palco por categoria, com a mesma escala. Em retrato,
   as facetas empilham. Isso preenche a lacuna “pequenos múltiplos” do catálogo.
4. **Escala bivariada (Q-030):** aprovada como escala **experimental** do DS (cor da categoria × tom da classe), como no
   mapa de lideranças de *Forças políticas* (EL0006).
5. **Limite de controles (Q-031, opção 1):** até 2 controles na frase do título; até 3 somando título e gráfico (tamanho,
   forma, vista); até 5 na gaveta Explorar. Substitui o “até três controles” da L0009 e do `TIPOS_DE_PRODUTO.md`.
6. **`mapa_pontos` (Q-032):** aprovado como primeiro componente experimental, vindo do mapa de locais de votação: pontos
   ou bolhas (Dorling), com câmera, zoom, cartão e fundo opcional herdados da L0006.
7. **Tabelas de análise (Q-033):** produtos novos leem tabelas tidy (formato longo, com dicionário) gravadas pelos scripts de
   `projetos/<p>/analise/` (`dados.fonte: {analise, tabela}`). A migração dos scripts e produtos existentes **não** é
   automática: o pesquisador decide caso a caso, no futuro.
8. **Demais campos do v0.2** (sem decisão própria, por decorrerem da L0002 e da L0007):
   - marcadores por estado `{e.…}`;
   - derivadas por função Python declarada;
   - `escalas` com paletas de `dados/referencia/`;
   - `geo.niveis`;
   - destaque e rótulos por coluna booleana calculada no Python;
   - filtro que esmaece ou remove;
   - referências com valor do estado;
   - `detalhe.lista` e `detalhe.acao`;
   - colunas compostas e limite de linhas na imagem das tabelas;
   - `fatiar_por` e controle `obrigatorio`.

   Especificação de referência: `docs/arquitetura/especificacao.md` (v0.2).

## Consequências
- O critério de saída do teste de papel foi atingido: 7 de 8 gráficos sem `extensao`. O 8º (mapa de locais) passa a ter
  componente previsto (`mapa_pontos`).
- O contrato de componentes (`componentes.yaml`, fase 1) ganha `facetas` e `companheiro` como recursos do renderizador,
  não dos componentes. Também ganha `mapa_pontos` (experimental) e a escala bivariada em `lab-escalas.js` (experimental).
- `docs/TIPOS_DE_PRODUTO.md` e `docs/arquitetura/` foram atualizados com os novos limites e termos.
- Nenhum produto existente muda.

## Afeta
- Documentos: `docs/arquitetura/especificacao.md`, `glossario.md`, `principios.md`, `docs/TIPOS_DE_PRODUTO.md`
- DS: `design/padrao/design.yaml › lacunas_por_tarefa`
- Código (futuro): `lab-viz.js` (vistas, facetas, companheiro), `lab-escalas.js` (bivariada), novo `mapa_pontos`, scripts de `analise/` de produtos novos
