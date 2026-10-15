# L0016 — Acervo de gráficos: uma família de componentes, contrato v2, portões de maturidade e bancada

- **Escopo:** laboratório (design system: `design/padrao/componentes.yaml`, `design.yaml`, `web/componentes/`, `labdados.viz`)
- **Status:** aprovada
- **Data:** 2026-10-11
- **Aprovado por:** Alexandre (pesquisador) — respostas D1–D6 da proposta
  [`docs/propostas/2026-10-12_acervo-de-graficos.html`](../../docs/propostas/2026-10-12_acervo-de-graficos.html)
- **Revisa:** [L0007](L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md) — critério de "estável" (item 8
  do contrato de componentes): passa a ser por hospedeiro, com portões
- **Decide:** Q-072 a Q-076 (`docs/arquitetura/questoes.yaml`)
- **Uso de IA:** Claude (Claude Code, Anthropic) fez o diagnóstico, redigiu a proposta e este registro; decisões do pesquisador.

## Contexto
Ao montar o story `eleicoes/2026-10_2-turno-na-sua-cidade`, quase todos os cartões tinham algo faltando (legenda, contexto
do número grande, transição). O diagnóstico (proposta, seção 2): duas famílias de componentes (`Lab.*` clássicos e
adaptadores de `lab-viz.js`, só 5 dos 11 componentes com adaptador); "estável" medindo o componente clássico numa página,
não o adaptador nem o story; contrato mínimo sem legenda, contexto, bordas e transições; nenhum lugar para ver o
componente antes do produto; transições definidas só para dois casos.

## Opções consideradas
Ver a proposta (seção 5): para cada decisão, a opção recomendada e as alternativas.

## Decisão
1. **Uma família (D1-a).** O adaptador declarativo em SVG (`Lab.viz.adaptadores.<id>`) é a implementação de cada
   componente; o `Lab.*` clássico vira invólucro dele, migrando um componente por vez (na ordem da fase C). Enquanto não
   migra, o clássico continua como está.
2. **Contrato v2 e portões (D2-a).** O registro ganha `codificacoes` (o que cada codificação exige de legenda),
   `elementos_implicitos`, `contexto`, `bordas`, `transicoes` e `hospedeiros` (status por hospedeiro: `pagina`,
   `visualizacao`, `story`, `imagem` — `estavel`, `experimental`, `sem_adaptador` ou `nao_se_aplica`).
   - **experimental** num hospedeiro: contrato v2 completo e ficha na bancada de componentes com dados reais;
   - **estável** num hospedeiro: usado em dois hospedeiros (ou dois produtos) e revisto no celular pelo pesquisador.
   - `sem_adaptador` no hospedeiro da peça é **erro ao gerar** (a peça não desenharia) e aviso na validação pura (que
     serve a especificações de papel); `experimental`, aviso.
3. **Contexto do número grande caso a caso (D3).** O contrato lista o contexto recomendado (unidade, período, referência
   ou variação); o validador apenas **informa** — a avaliação é feita em cada situação, na revisão do produto.
4. **Revisão visual nos produtos (D4, ajustada).** Não há folhas de contato à parte: a bancada de componentes mostra cada
   componente com dados reais para conferência rápida, e a revisão de imagem e visual acontece nos produtos. Componentes
   devem ser leves (poucas camadas de processamento) para gerar bem já no primeiro uso.
5. **Matriz de transições (D5)** em `design.yaml › padroes.transicoes`, ampliada e ajustada ao longo do tempo; cada
   adaptador declara o que suporta.
6. **Ordem da fase C (D6):** mapa coroplético → barras 100% → fluxos → distribuição e boxplot → tabela, com foco no
   story em curso (que fica pausado até a conclusão).

## Consequências
- `design/padrao/componentes.yaml` em contrato v2; `labdados.viz.validar` confere hospedeiro e contexto.
- Bancada de componentes: `docs/bancada-componentes.html`, gerada por `ferramentas/bancada_componentes.py` (no
  `make design`), com fichas declaradas em `design/padrao/bancada.yaml`.
- Diagnóstico de `docs/arquitetura.html` aponta componente sem adaptador declarativo ou sem ficha na bancada.
- **Sem migração em massa (pesquisador, 2026-10-11):** produtos já gerados não são ajustados pela fase C. O HTML é
  autocontido (L0002) e os publicados são retratos (L0010); como o `Lab.*` clássico mantém a mesma forma de chamar, um
  produto antigo só recebe os componentes novos quando for regerado por outro motivo — e então com comparação automática
  antes/depois (capturas no celular e no computador, console e testes), para o pesquisador olhar só o que mudou.

## Afeta
- `design/padrao/componentes.yaml`, `design/padrao/design.yaml`, `design/padrao/bancada.yaml`, `nucleo/labdados/viz.py`,
  `ferramentas/bancada_componentes.py`, `ferramentas/arquitetura_pagina.py`, `Makefile`, `docs/arquitetura/*`
