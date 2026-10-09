# EL0008 — Conglomerados presidenciais de 2026, federações e linhagem partidária (2018–2026)

- **Escopo:** projeto eleições (primeiro uso: produto `2026-10_mapa-da-virada`)
- **Status:** aprovada
- **Data:** 2026-10-07
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) levantou coligações, federações e siglas nos arquivos do TSE, propôs a tabela e redigiu este ADR; o pesquisador decidiu o ponto de partida, o uso de federações, o tratamento do PSL e o corte de 2%.

## Contexto

O produto "O mapa da virada" compara o voto por município de 2018 a 2026 (Presidente, Senado, Câmara, prefeito e vereador) sem classificação ideológica dos partidos. É preciso agrupar votos de forma estável entre eleições em que partidos se fundiram, mudaram de nome ou formaram federações, e em que as coligações presidenciais mudam a cada pleito.

## Opções consideradas

1. **Classificação ideológica publicada** (ex.: Bolognesi, Ribeiro e Codato, 2023) — comparável no tempo, mas o pesquisador preferiu não entrar na discussão ideológica.
2. **Coligações presidenciais de cada ano** — fiéis a cada eleição, mas os grupos mudam de composição e a série perde comparabilidade.
3. **Coligações presidenciais de 2026 como ponto de partida, aplicadas para trás por partido, com federações como unidade** (escolhida).

## Decisão

**Unidade partidária = agremiação de 2026:** a federação, quando o partido integra uma em 2026; senão, o próprio partido. Federações de 2026 (cadastro de candidaturas do TSE):

| Federação 2026 | Partidos |
|---|---|
| Federação Brasil da Esperança (FE Brasil) | PT, PCdoB, PV |
| Federação PSOL REDE | PSOL, REDE |
| Federação PSDB Cidadania | PSDB, Cidadania |
| Federação Renovação Solidária | PRD, Solidariedade |
| Federação União Progressista | União, PP |

**Linhagem (siglas antigas → partido de 2026)**, conferida pelas siglas e números nos arquivos do TSE de cada ano:

| Partido 2026 | Recebe |
|---|---|
| PL | PR (2018); **PSL (2018 e 2020)** — decisão do pesquisador: PSL e PL caminham juntos, com destaque próprio para cada sigla (formalmente, o PSL se fundiu ao DEM no União Brasil em 2022) |
| União | DEM (2018 e 2020) |
| Republicanos | PRB (2018) |
| Cidadania | PPS (2018) |
| Podemos | PODE(19), PSC (até 2022), PHS (2018) |
| PRD | PTB e Patriota (até 2022), PRP (2018) |
| Solidariedade | PROS (até 2022) |
| PCdoB | PPL (2018) |
| Agir | PTC (até 2020) |
| Mobiliza | PMN (até 2022) |
| Democrata | PMB (até 2024) |

**Conglomerados (coligações presidenciais de 2026; nome próprio para candidaturas com ≥ 2% dos válidos no 1º turno):**

| Conglomerado | Agremiações de 2026 | 1º turno 2026 |
|---|---|---|
| Lula | FE Brasil, Federação PSOL REDE, PSB, PDT | 45,16% |
| Flávio Bolsonaro | PL (PSL destacado em 2018 e 2020) | 47,04% |
| Augusto Cury | Avante, Agir | 2,89% |
| Renan Santos | Missão | 2,24% |
| Ronaldo Caiado | PSD | 2,19% |
| Demais candidaturas | NOVO, PRTB, UP, PSTU, DC, PCB, PCO, Democrata | < 0,3% cada |
| Sem candidatura presidencial em 2026 | MDB, Federação União Progressista, Republicanos, Federação PSDB Cidadania, Podemos, Federação Renovação Solidária, Mobiliza | — |

**Regra de aplicação:** todo voto (Presidente, Senado, Câmara, prefeito, vereador; nominal e de legenda) vai para a agremiação de 2026 do partido pela linhagem, e daí para o conglomerado. Vale também para Presidente (pesquisador): PT 2018–2026 numa linha; PSL 2018 = PL 2022 e 2026. O produto mostra o total do conglomerado e, em destaque, o partido principal (PT; PL/PSL).

## Consequências

- Votos de partidos que estão na coligação de Lula em 2026 contam no conglomerado em anos anteriores, mesmo com candidaturas próprias à época (ex.: PDT de Ciro em 2018 e 2022; PSOL de Boulos e REDE de Marina em 2018). O destaque do PT permite separar.
- Em cada caso de fusão ou mudança de grupo, a página traz nota de perda de consistência (ex.: PSL → PL × PSL → União; DEM → União Progressista; PROS → Renovação Solidária).
- Partidos novos em 2026 (Missão, Democrata) não têm série anterior.
- Mudanças posteriores de federação ou de coligação exigem revisão deste ADR.

## Afeta
- Datasets: `tse.votacao_partido_munzona`, `tse.votacao_candidato_munzona`, `tse.candidatos`, `tse.resultados_2026_1t_presidente_municipios`
- Código: `projetos/eleicoes/analise/` (preparação do produto)
- Produtos: `projetos/eleicoes/produtos/2026-10_mapa-da-virada`
