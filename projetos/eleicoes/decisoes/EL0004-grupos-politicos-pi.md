# EL0004 — Grupos políticos do Piauí (PT, PSD, MDB, PP e Outros)

- **Escopo:** projeto eleicoes (primeiro uso: produto `2026-10_forcas-politicas-pi`)
- **Status:** aprovada
- **Data:** 2026-10-05
- **Aprovado por:** Alexandre (pesquisador), 2026-10-05
- **Uso de IA:** Claude (Claude Code, Anthropic) levantou partidos e federações nos arquivos do TSE e redigiu a proposta; os grupos foram definidos pelo pesquisador no briefing.

## Contexto

O produto compara a força de grupos políticos no Piauí em 2022 (deputados), 2024 (vereadores e prefeitos) e 2026 (deputados). O pesquisador definiu quatro grupos — federação do PT, PSD, MDB e PP — e um agregado "Outros". Classificar partidos é decisão metodológica (princípio 6): a regra precisa ser explícita, reprodutível e neutra. Os rótulos são **nomes de partidos/federações**; o produto não atribui posição (governo, oposição, ideologia) a nenhum grupo.

Levantamento nos arquivos `votacao_candidato_munzona` do TSE (PI, eleição ordinária, 1º turno; % dos votos nominais válidos):

| Eleição/cargo | PT* | PSD | MDB | PP | Maiores em "Outros" |
|---|---|---|---|---|---|
| 2022 Dep. Estadual | 35,6% (PT 33,5 + PCdoB 1,1 + PV 1,0) | **sem candidatos** | 31,0% | 20,4% | Republicanos 6,0; Solidariedade 3,1; PL 1,8 |
| 2022 Dep. Federal | 38,1% (PT 33,6 + PV 4,5) | 22,6% | **sem candidatos** | 20,6% | Republicanos 5,3; Solidariedade 4,8; União 4,1 |
| 2024 Vereador | ~21,6% (PT 20,8 + PV 0,8 + PCdoB) | 17,5% | 19,9% | 11,6% | PDT 5,7; Republicanos 4,6; PRD 3,0 |
| 2024 Prefeito (votos) | 31,1% | 18,4% | 20,1% | 12,1% | União 11,3 |
| 2026 Dep. Estadual | 46,3% (PT 39,9 + PV 4,1 + PCdoB 2,3) | 15,7% | 27,3% | 8,8% (+ União 0,1) | PL 1,4 |
| 2026 Dep. Federal | 37,2% (PT 27,8 + PV 9,4) | 17,2% | 17,3% | 12,0% (+ União 2,9) | Republicanos 10,1; PL 2,1 |

\* Federação Brasil da Esperança (PT, PCdoB, PV), conforme `SG_FEDERACAO` = "PT/PC do B/PV" nos três anos. Valores do levantamento exploratório; a base do produto recalcula com legenda e válidos oficiais (EL0003, EL0005).

Fatos que a regra precisa tratar:
1. **Federações** existem nas três eleições e o TSE as registra por candidatura (`SG_FEDERACAO`).
2. **PP em 2026** concorreu na Federação União Progressista (União + PP); em 2022 e 2024, União e PP concorreram separados.
3. **Siglas mudam de grafia** entre arquivos (ex.: "PC do B" em 2022/2024, "PCDOB" em 2026) e partidos mudam de nome/fundem-se (ex.: PRD em 2024).
4. **Ausências reais:** PSD sem candidatos a Dep. Estadual e MDB sem candidatos a Dep. Federal em 2022 no PI.
5. Prefeitos concorrem por **coligações** com vários partidos.

## Opções consideradas

**A. Unidade de classificação**
1. **Partido da candidatura, com a federação do PT tratada como grupo** — regra simples; respeita a escolha do pesquisador; o PP fica só com os votos do PP em todos os anos.
2. **Federação como unidade sempre** — em 2026 o grupo seria "União Progressista" (União + PP), não comparável com o PP sozinho de 2022/2024.

**B. PP em 2026**
1. Só o PP (votos das candidaturas do PP e legenda do PP), mesmo dentro da federação — comparável no tempo.
2. **Federação União Progressista inteira** — reflete a disputa por vagas em 2026, mas muda o grupo entre anos. *(escolhida pelo pesquisador)*
3. União + PP em todos os anos — comparável, mas cria um grupo que não existia em 2022/2024.

**C. Prefeitos (coligações)**
1. **Partido do prefeito eleito** — o grupo do prefeito é o do seu partido, não o da coligação. *(recomendado)*
2. Coligação — exigiria classificar coligações mistas; descartada.

## Decisão

- **Grupo de uma candidatura = partido da candidatura na própria eleição** (`SG_PARTIDO`, normalizado), com estas regras:
  - **PT**: partidos da Federação Brasil da Esperança na eleição — PT, PCdoB, PV (identificados por `SG_FEDERACAO` = "PT/PC do B/PV" e conferidos pela lista; grafias "PC do B"/"PCDOB" unificadas).
  - **PSD**: PSD. **MDB**: MDB.
  - **PP**: PP em 2022 e 2024; em **2026, a Federação União Progressista (União + PP)** (opção B2). Nota de rodapé obrigatória em toda visualização com 2026: "Em 2026, o grupo PP inclui o União Brasil, federado ao PP; em 2022 e 2024 o União está em Outros."
  - **Outros**: todos os demais partidos, agregados; a página traz a tabela de partidos em "Outros" por eleição e cargo.
- **Votos de legenda** seguem o partido do número votado (2 dígitos), com o mesmo mapeamento.
- **Prefeitos**: grupo = partido do prefeito eleito (C1).
- **Ausência de candidaturas** (ex.: PSD/Dep. Estadual 2022) é registrada como "grupo sem candidatos no cargo", não como 0% de votos; indicadores que dependem do par de cargos ficam indefinidos (EL0005).
- A regra é aplicada por uma tabela versionada `dados/referencia/grupos_politicos_pi.csv` (eleição, partido, grupo, motivo), gerada a partir dos arquivos do TSE e conferida: todo partido com voto no PI em cada eleição/cargo tem grupo; nenhum partido em dois grupos na mesma eleição.

## Consequências

- O grupo PP muda de composição em 2026 (passa a incluir o União): variações do PP entre 2022/2024 e 2026 refletem também a federação — nota de rodapé obrigatória, e a tabela da seção exploratória mostra PP e União separados em 2026.
- "Outros" é um agregado heterogêneo; liderança de "Outros" não significa liderança de um partido (ver EL0005, regra de liderança).
- Mudanças de partido de pessoas entre eleições **não** são tratadas aqui (fora do escopo; o produto não segue candidatos).

## Afeta
- Datasets: `tse.votacao_candidato_munzona`, `tse.votacao_partido_munzona`, `tse.votacao_secao` (legenda 2026)
- Código: tabela `dados/referencia/grupos_politicos_pi.csv` e o script de preparação do produto
- Produtos: `2026-10_forcas-politicas-pi`

## Revisão de 2026-10-06 (pesquisador)

**O União Brasil passa a integrar o grupo PP também em 2022 e 2024** (antes ficava em “Outros” nesses anos). Motivo: em 2026 PP e União concorreram federados; manter o União em “Outros” nos anos anteriores tornava a comparação do grupo PP no tempo inconsistente (o grupo mudava de composição). Com a revisão, o grupo PP = PP + União nas três eleições.

Consequências: (1) a composição do grupo PP é a mesma em 2022, 2024 e 2026 — some a ressalva de composição nas comparações no tempo; (2) números de 2022 e 2024 mudam (ex.: Teresina, prefeito do União em 2024, passa a contar para o PP); (3) em 2022 e 2024 PP e União eram partidos distintos, não federados — o agrupamento é analítico e está declarado na página.

## Revisão de 2026-10-06 — inclusão de 2018 e 2020 (pesquisador)

Para estender a série a 2018 (Deputado Estadual e Federal) e 2020 (Vereador e Prefeito), quando ainda não havia federações nem o União Brasil:

- **Grupo PT/PV/PCdoB = PT + PCdoB + PV** também em 2018 e 2020 (mesma composição da Federação Brasil da Esperança), para manter o grupo comparável no tempo.
- **Grupo União Progressista = PP + DEM + PSL** em 2018 e 2020 (o União Brasil nasceu da fusão de DEM e PSL). Nota obrigatória: o PSL de 2018 era o partido do candidato eleito presidente, o que eleva o grupo naquele ano.
- **Prefeito eleito em 2020:** eleito no 1º turno ou no 2º turno (Teresina); onde a eleição ordinária não elegeu ninguém (votos do mais votado anulados), vale o eleito na eleição extraordinária do mesmo ano — Juazeiro do Piauí (PCdoB) e Murici dos Portelas (PSD). Força e liderança continuam calculadas com os votos da ordinária.
- Regras aplicadas só antes de 2022 (`forcas_pi.grupo_de`); 2022–2026 não mudam. Conferência de tolerância zero sem divergências em 2018 e 2020 (448 combinações município × cargo em cada ano).

