# EL0010 — Presidente: comparação entre eleições pela candidatura do partido, sem somar aliados de 2026

- **Escopo:** projeto eleições (cargo de Presidente; revisa a EL0008 só para esse cargo)
- **Status:** aprovada
- **Data:** 2026-10-12
- **Aprovado por:** Alexandre (pesquisador) — "na eleição presidencial, em especial no 1º turno, não faz sentido agrupar
  as alianças de 2026 ao PT nos anos anteriores: esses votos no 1T tradicionalmente são de protesto ou oposição ao PT,
  e a eleição presidencial é muito personificada" (2026-10-12); respostas: candidatura do partido, só Presidente, nova
  edição do painel publicado, rótulos com o nome do candidato.
- **Revisa:** [EL0008](EL0008-conglomerados-presidenciais-2026-e-linhagem-partidaria.md) (regra de aplicação, para Presidente)
- **Uso de IA:** Claude (Claude Code, Anthropic) levantou o impacto, propôs as opções, implementou e redigiu este
  registro; decisão do pesquisador.

## Contexto
A EL0008 aplicava as coligações presidenciais de 2026 para trás, por partido, em todos os cargos — inclusive
Presidente. Assim, o "grupo de Lula" de 2022 somava Lula e Ciro (PDT), e o de 2018 somava Haddad, Ciro, Boulos (PSOL) e
Marina (REDE). No Brasil, o grupo de 2022 teve 51,5% dos válidos no 1º turno, contra 48,4% de Lula: a queda de Lula
para 2026 (45,2%) aparecia como −6,3 p.p. em vez de −3,2 p.p., e a "variação de Lula desde 2022" por local (que define
os locais em destaque de "Votos em disputa" e do story do 2º turno) carregava o voto de Ciro. Num 1º turno
presidencial, votos em outras candidaturas costumam ser de oposição ou protesto, não do aliado de quatro anos depois.

## Opções consideradas
1. **Candidatura do partido** (escolhida) — 2026 × 2022 × 2018 pela candidatura presidencial do mesmo partido: Lula
   (PT) 2026 × Lula (PT) 2022 × Haddad (PT) 2018; Flávio Bolsonaro (PL) 2026 × Bolsonaro (PL) 2022 × Bolsonaro (PSL)
   2018 (linhagem PSL → PL da EL0008). Série completa, sem aliados / Haddad ≠ Lula (rotulado pelo nome).
2. **Só a mesma pessoa** — Lula 2026 × Lula 2022; sem 2018 para Lula e sem par para Flávio / mais estrito, perde a série
   e a comparação do lado de Flávio.
3. **Manter a EL0008** — série por coligação de 2026 / mistura votos de oposição ou protesto ao PT no grupo de Lula.

## Decisão
1. **Presidente, 2018 e 2022:** a candidatura de 2026 é comparada com a candidatura presidencial do mesmo partido
   (PT; PL, e PSL em 2018 pela linhagem). Todas as outras candidaturas daquele ano (Ciro, Tebet, Boulos, Marina, Alckmin…)
   ficam em "Outros". Augusto Cury e Renan Santos não têm par em 2018 e 2022 (como antes).
2. **2026:** sem mudança (cada candidatura é a sua; o conglomerado de 2026 só nomeia a coligação).
3. **Outros cargos** (Câmara, Senado, prefeito, vereador — ex.: "O mapa da virada"): a EL0008 segue como está.
4. **Rótulos:** pelo nome do candidato — "Lula" (2026 e 2022), "Haddad (PT)" (2018); "Flávio Bolsonaro", "Bolsonaro (PL)",
   "Bolsonaro (PSL)" — nunca "grupo de Lula" para Presidente.
5. O 2º turno de 2022 já era comparado por candidatura (PT × PL) e não muda.

## Consequências
- Nova edição do painel publicado "Onde o 2º turno se decide" (`2026-10_locais-de-votacao`), com nota de correção
  datada; os pilotos "Votos em disputa" e "2º turno na sua cidade" são refeitos com a base nova (a variação de Lula e,
  com ela, os locais em destaque mudam).
- Conferência de 2022 por candidatura: Σ locais = PT, PL e válidos oficiais do município (tolerância zero).

## Afeta
- Código: `projetos/eleicoes/analise/preparar_locais_votacao.py` (`bloco_presidente`, `destinos_2022`, `evolucao`,
  conferência), `preparar_votos_em_disputa.py`, `preparar_2_turno_na_sua_cidade.py`
- Produtos: `2026-10_locais-de-votacao` (publicado: nova edição), `2026-10_votos-em-disputa`, `2026-10_2-turno-na-sua-cidade`
