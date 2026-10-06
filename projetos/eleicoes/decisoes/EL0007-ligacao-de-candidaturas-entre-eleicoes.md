# EL0007 — Ligação da mesma pessoa candidata entre eleições

- **Escopo:** projeto eleições
- **Status:** aprovada
- **Data:** 2026-10-06
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs as opções, implementou a ligação e redigiu este ADR; o pesquisador escolheu a chave.

## Contexto

O produto "Onde estão os votos?" (`2026-10_distribuicao-votos-candidato-pi`) passou a mostrar a evolução de uma candidatura quando a mesma pessoa disputa mais de uma eleição (ex.: 2022 1º turno, 2022 2º turno, 2026). O TSE gera um código de candidatura (`SQ_CANDIDATO`) novo a cada eleição; é preciso uma chave para reconhecer a mesma pessoa.

## Opções consideradas

1. **Nome civil completo + data de nascimento** (escolhida) — dados públicos do cadastro de candidaturas, presentes em todas as eleições; homônimos ficam separados pela data.
2. **Só nome completo** — mais simples, mas pode juntar homônimos.
3. **CPF** — mais forte, mas é dado pessoal sensível e vem mascarado em parte dos arquivos recentes; não deve ir para a página.

## Decisão

- Chave = `NM_CANDIDATO` normalizado (maiúsculas, sem acentos, espaços simples) + `DT_NASCIMENTO`, do `consulta_cand_<ano>` (arquivos do PI e nacional).
- Só se liga quando a chave aparece **uma vez em cada eleição**; chave repetida na mesma eleição não é ligada (ambígua).
- O CPF, quando disponível, é usado **apenas para conferir** a ligação: se a mesma chave tiver CPFs diferentes, não se liga. O CPF não entra na base nem na página.
- Código: `projetos/eleicoes/analise/preparar_distribuicao_pi.py` (`ligar_candidaturas`).

## Consequências

- 2022 (1º e 2º turnos) e 2026: 104 pessoas ligadas, 0 chaves ambíguas, 0 conflitos de CPF, 0 candidaturas sem chave (conferência de 2026-10-06).
- Quem mudou de nome civil entre eleições, ou teve data de nascimento corrigida, não é ligado (lacuna aceita, não preenchida).
- Vale para os próximos produtos do projeto que precisem seguir candidaturas no tempo.

## Afeta
- Datasets: `tse.candidatos`
- Código: `projetos/eleicoes/analise/preparar_distribuicao_pi.py`
- Produtos: `projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi`
