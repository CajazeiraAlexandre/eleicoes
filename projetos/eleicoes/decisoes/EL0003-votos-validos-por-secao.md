# EL0003 — Votos válidos por seção eleitoral

- **Escopo:** projeto eleicoes (vale para todo produto que use resultados por seção)
- **Status:** aprovada
- **Data:** 2026-10-05
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) identificou a divergência, propôs as opções, implementou a reconstrução e a conferência e redigiu este ADR; o pesquisador escolheu a opção 1.

## Contexto

O produto `2026-10_distribuicao-votos-candidato-pi` usa o percentual dos votos válidos do cargo em cada seção, local, zona e município. No detalhe por seção do TSE (`detalhe_votacao_secao`), `QT_VOTOS_NOMINAIS` inclui votos dados a candidaturas cujos votos o TSE **não** considera válidos. Por isso, "nominais + legenda" do detalhe por seção difere dos válidos oficiais.

Conferência no PI (relatório `projetos/eleicoes/analise/relatorio_qualidade_distribuicao_pi.json`):

| Eleição | Cargo | Excesso de "nominais + legenda" sobre os válidos oficiais | Origem |
|---|---|---|---|
| 2022, 1º turno | Governador | 30.721 (+1,6%) | 15.133 anulados + 15.588 de candidatura INAPTA ausente do arquivo município/zona |
| 2022, 1º turno | Dep. Federal | 2.806 | anulados, 2 candidaturas INAPTAS ausentes e 127 votos de legenda anulada (partido 20) |
| 2022, 1º turno | Dep. Estadual | 882 | anulados + 1 candidatura INAPTA ausente |
| 2026, 1º turno | Governador, Senador, deputados | 5.075 / 25.524 / 4.995 + 634 / 827 | votos "Anulado sub judice" (candidaturas e legendas de 4 partidos para Dep. Federal) |
| 2026, 1º turno | Presidente, Senador, deputados | 52 / 6.188 / 674 / 31 | votos de 9 candidaturas ausentes da API, contados pelo TSE como **nulos técnicos** |

Os arquivos município/zona de 2026 estavam publicados só com cabeçalho em 2026-10-05.

## Opções consideradas

1. **Reconstruir os válidos oficiais por seção** — válidos = votos nominais de candidaturas com destino válido + votos de legenda de partidos com legenda válida, com o destino tirado de fonte oficial. Reproduz o total do TSE; exige uma segunda fonte para o destino.
2. **Usar "nominais + legenda" do detalhe por seção** — simples; inclui votos anulados e diverge do TSE em até 1,6%.
3. **Opção 1, mas tratando "Anulado sub judice" como válido provisório** — antecipa possíveis reversões judiciais; diverge do critério oficial vigente.

## Decisão

Adotar a opção 1.

- **Válidos por seção** = Σ votos nominais de candidaturas com destino `Válido` ou `Válido (legenda)` + Σ votos de legenda de partidos cuja legenda não foi anulada, no mesmo turno e cargo.
- **Não válidos:** destino `Anulado`, `Anulado sub judice` e votos de candidaturas tratadas como nulo técnico.
- **Fonte do destino:**
  - 2022 — `NM_TIPO_DESTINACAO_VOTOS` de `votacao_candidato_munzona`; legenda anulada quando `QT_VOTOS_LEGENDA_ANULADOS + QT_VOTOS_LEGENDA_ANUL_SUBJUD > 0` em `votacao_partido_munzona` (anulação parcial interrompe o processamento). Candidaturas com voto na seção e ausentes do arquivo município/zona são tratadas como anuladas **somente se** constarem como `INAPTO` em `consulta_cand`; caso contrário, o processamento para.
  - 2026 — campo `dvt` de candidaturas e partidos na API de resultados do TSE (snapshot `tse.resultados_2026_1t`, assinaturas JWS verificadas). Candidaturas com voto e ausentes da API são nulo técnico, condicionado a a soma por município e cargo igualar o campo `vnt` da API.
- **Conferência obrigatória, tolerância zero:** 2022 — soma dos válidos reconstruídos por município/zona/cargo = `QT_TOTAL_VOTOS_VALIDOS` do detalhe município/zona; 2026 — por município/cargo = `vv` da API, e votos por candidatura × município = `vap`. Quando o TSE publicar os arquivos município/zona de 2026, a conferência de 2022 deve ser repetida para 2026.
- **Exibição:** candidaturas com votos não válidos aparecem no seletor apenas com votos absolutos e aviso do destino; não recebem percentual e não entram no ranking de Pearson.

## Consequências

- Percentuais e correlações por seção são coerentes com os totais oficiais do TSE.
- Resultado verificado em 2026-10-05: 2022 — 11.800.321 válidos, 1.380 chaves município/zona/cargo sem divergência; 2026 — 12.022.196 válidos, 1.120 chaves município/cargo e 75.595 candidatura × município sem divergência.
- "Anulado sub judice" pode ser revertido: ao reprocessar 2026 com novos dados oficiais, os destinos podem mudar e os percentuais devem ser regenerados.
- O destino de 2026 depende da API enquanto os arquivos município/zona não forem publicados; o snapshot (122 MB) fica fora do git por decisão do pesquisador.

## Adendo 2018 (2026-10-06, aprovado pelo pesquisador — opção B)

- **Contexto:** incluir 2018 no produto sem baixar o detalhe por seção (256 MB) nem o arquivo de candidaturas por município/zona (395 MB).
- **Destino 2018:** `DS_SITUACAO_CANDIDATURA` de `consulta_cand_2018` — `APTO` = `Válido`; `INAPTO` = anulado. Quando, num cargo, os nominais válidos somados das seções passam de `QT_VOTOS_NOMINAIS_VALIDOS` do detalhe município/zona, procura-se a candidatura apta cujos votos são **iguais à diferença em todas as zonas**; achada uma única, ela é `Anulado (totais oficiais)`. Outro caso interrompe o processamento. Votos nominais convertidos para a legenda interrompem (não houve em 2018 no PI).
- **Conferência 2018 (tolerância zero):** por turno × cargo × município × zona, seções somadas × detalhe município/zona por categoria (nominais válidos; legenda; brancos; nulos + nominais não válidos, que o TSE conta como nulos em 2018) e válidos reconstruídos × `QT_TOTAL_VOTOS_VALIDOS`.
- **Resultado:** 1.380 chaves sem divergência; 12.030.734 válidos reconstruídos = oficiais; 13 candidaturas INAPTAS com voto; Elizeu Aguiar (Senador, PSL), apto no cadastro, teve os 79.781 votos contados como nulos — identificado em 230 de 230 zonas.
- **Limite aceito:** a conferência de 2018 é por zona, não por seção.
- Código: `destinos_2018`, `conferir_categorias_munzona` em `validar_distribuicao_pi.py`; teste `test_categorias_munzona_2018_nominal_nao_valido_conta_como_nulo`.

## Afeta
- Datasets: `tse.votacao_secao`, `tse.detalhe_votacao_secao`, `tse.votacao_candidato_munzona`, `tse.votacao_partido_munzona`, `tse.detalhe_votacao_munzona`, `tse.candidatos`, `tse.resultados_2026_1t`
- Código: `projetos/eleicoes/analise/validar_distribuicao_pi.py` (`validos_por_secao`, `destinos_2022`, `legendas_anuladas_2022`, `ler_api_2026`), `tests/test_eleicoes_distribuicao_pi_qa.py`
- Produtos: `2026-10_distribuicao-votos-candidato-pi`; `2026-10_convergencia-candidaturas-pi` foi excluído em 2026-10-06
