# EL0005 — Indicadores de força, coesão e liderança territorial dos grupos

- **Escopo:** projeto eleicoes (primeiro uso: produto `2026-10_forcas-politicas-pi`)
- **Status:** aprovada
- **Data:** 2026-10-05
- **Aprovado por:** Alexandre (pesquisador), 2026-10-05 (com o acréscimo da intensidade da liderança, I6)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs as fórmulas e opções; as perguntas e as escolhas de briefing (votos + cadeiras + prefeitos; coesão por coerência entre cargos; Sankey de liderança sem inferência ecológica) são do pesquisador.

## Contexto

O produto responde a três perguntas: (4.1) onde cada grupo (EL0004) é forte em cada cargo; (4.2) onde o voto do grupo é coeso entre cargos e onde é fragmentado; (4.3) onde a liderança territorial mudou entre 2022, 2024 e 2026. Unidades: município, Região Geográfica Imediata e Intermediária (IBGE 2017) e Território de Desenvolvimento (`pi.territorios_desenvolvimento`), além do estado. Os cargos comparados são diferentes entre anos (deputados em 2022/2026, vereadores e prefeitos em 2024).

Notação: *g* = grupo; *c* = cargo; *u* = unidade; V(g,c,u) = votos válidos do grupo (nominais das candidaturas com destino válido + legenda dos partidos do grupo, EL0003/EL0004); T(c,u) = votos válidos oficiais do cargo.

## Indicadores (opções e decisão)

### I1. Força em votos — 4.1
**Decisão:** s(g,c,u) = 100 · V(g,c,u) / T(c,u), em %. Em unidades agregadas (região, território, estado), somar V e T dos municípios antes de dividir (nunca média de percentuais).
- Fonte de T: 2022 e 2024 — `QT_TOTAL_VOTOS_VALIDOS` do detalhe município/zona; 2026 — válidos reconstruídos por seção (EL0003), até o TSE publicar o detalhe municipal de 2026.
- Grupo sem candidatos no cargo: s indefinido ("sem candidatos"), não 0%.

### I2. Força em cadeiras — 4.1
**Decisão:** número de eleitos por grupo (`DS_SIT_TOT_TURNO` ∈ {ELEITO, ELEITO POR QP, ELEITO POR MÉDIA}).
- Deputados: as vagas são **estaduais** → contagem só no nível estado (não existe "deputado eleito num município").
- Vereadores 2024: contagem por município e soma por região/território/estado; também % das cadeiras da Câmara municipal.
- 2026: situação provisória até a diplomação; nota na página.

### I3. Prefeituras — 4.1
**Decisão:** número de prefeitos eleitos em 2024 por grupo (partido do prefeito, EL0004) e % dos municípios da unidade; mapa categórico pelo grupo do prefeito.

### I4. Coesão entre cargos — 4.2
Opções:
1. **Diferença absoluta** Δ(g,u) = |s(g, Dep. Estadual, u) − s(g, Dep. Federal, u)| em pontos percentuais, na mesma eleição. *(recomendada, com 2)*
2. **Correlação** de Pearson, entre municípios, de s(g, DE) e s(g, DF) — um número por grupo e eleição (coesão "do estado"), peso igual por município.
3. Razão s(DE)/s(DF) — instável quando um dos lados é pequeno; descartada.

**Decisão:** 1 + 2.
- Leitura: Δ baixo = voto do grupo semelhante para os dois cargos (coeso); Δ alto = voto do grupo diferente entre cargos (fragmentado). Sem limiar fixo para "coeso"; o mapa usa escala contínua de 0 ao máximo observado, ou quebras a validar no esboço.
- Comparação com vereador 2024: Δ entre s(g, Vereador 2024) e s(g, Dep. Estadual 2026) **como leitura complementar** e rotulada como comparação entre eleições diferentes (não é coesão no mesmo pleito).
- **Lacunas (2022):** PSD sem Dep. Estadual e MDB sem Dep. Federal → Δ e r indefinidos para esses grupos em 2022; informados como "sem candidatos em um dos cargos". Verificado em 2026-10-05 em três fontes independentes do TSE (cadastro de candidaturas, inclusive inaptas; votos por seção, sem nenhum voto nominal ou de legenda 55/DE e 15/DF; arquivo de partidos): as ausências são reais.

### I5. Liderança territorial e Sankey — 4.3
Opções para "quem lidera a unidade":
1. **Grupo do partido mais votado**: identifica o partido com maior s(c,u) individualmente e atribui o seu grupo — "Outros" só lidera quando um partido isolado de fora dos 4 grupos é o mais votado. *(recomendada)*
2. Grupo com maior soma — "Outros" (agregado de muitos partidos) pode "liderar" sem ser uma força; distorce.

Opções para a cadeia do Sankey:
1. **Mesmo cargo legislativo, eleições gerais:** Dep. Estadual 2022 → Dep. Estadual 2026 e Dep. Federal 2022 → Dep. Federal 2026, com uma etapa intermediária selecionável em 2024 (Vereador ou Prefeito). *(recomendada)*
2. Soma de cargos por eleição — mistura votos de cargos diferentes (o mesmo eleitor conta duas vezes); descartada.

Peso dos fluxos:
1. **Número de municípios** (cada município = 1). *(recomendado como padrão)*
2. Votos válidos do cargo (dá mais peso a municípios grandes) — opção alternativa no seletor.

**Decisão:** cadeia = opção 1; peso padrão = municípios, com alternância para votos válidos (peso único por município: válidos do cargo em 2026, para os fluxos de cada etapa fecharem).

**Regra de liderança revista em 2026-10-05 (pesquisador, opção "a"):** na base, a opção 1 fazia o líder divergir do grupo com mais votos em 6–20 municípios por cargo (ex.: MDB com o partido mais votado, mas a federação do PT somando mais), gerando margens negativas. Nova regra: **líder = grupo com mais votos somados entre os elegíveis** — PT, PSD, MDB e PP sempre; "Outros" só quando o partido mais votado da unidade é de fora dos quatro grupos (o agregado não lidera por somar partidos pequenos). Intensidade = % do grupo líder; margem = p.p. sobre o segundo elegível (sempre ≥ 0). Empate no topo = categoria "empate".
- **Empate** no topo (mesmo número de votos): categoria "empate", fluxo próprio.
- **MDB em Dep. Federal 2022 e PSD em Dep. Estadual 2022** não podem liderar esses cargos (sem candidatos) — limitação dita no texto do episódio.
- O Sankey descreve **mudança de liderança**, não transferência de votos entre eleitores (sem inferência ecológica — decisão de 2026-10-05).

### I6. Intensidade da liderança — 4.3 (pedido do pesquisador na aprovação)
Liderar com 70% dos votos é diferente de liderar com 30%.
**Decisão:** intensidade = s(g\*, c, u), a participação do **grupo** líder (g\* = grupo do partido mais votado, I5) no cargo e unidade, em %; e, como medida complementar, a **margem** = s(g\*) − s(segundo grupo), em p.p.
- Mapa de liderança: cor = grupo líder (EL0006); intensidade por claridade da cor do grupo em classes — **quebras a validar no esboço visual** (proposta inicial: < 40%, 40–60%, ≥ 60%).
- Sankey: nós e fluxos coloridos pelo grupo; a intensidade aparece no detalhe do município (tooltip/tabela) e na distribuição de intensidades por grupo ao lado do diagrama.
- Seção exploratória: intensidade e margem por município, região e território.

## Consequências
- Comparações entre 2024 e 2022/2026 são entre cargos diferentes; o produto sempre as rotula assim.
- Liderança por partido mais votado (I5-1) pode diferir de "grupo com mais votos somados"; a tabela da seção exploratória mostra os dois números.
- Cada indicador vira uma função Python testada; agregações e correlações no navegador seguem L0002 (paridade JS × Python).

## Afeta
- Datasets: `tse.votacao_candidato_munzona`, `tse.votacao_partido_munzona`, `tse.detalhe_votacao_munzona`, `tse.votacao_secao`, `tse.detalhe_votacao_secao`, `tse.resultados_2026_1t`, `ibge.municipios_regiao_imediata`, `pi.territorios_desenvolvimento`
- Decisões relacionadas: EL0003, EL0004, L0002
- Produtos: `2026-10_forcas-politicas-pi`
