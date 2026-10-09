# EL0009 — Pareamento de locais de votação entre eleições (2022 × 2026)

- **Escopo:** projeto eleicoes (vale para todo produto que compare o mesmo local de votação em eleições diferentes)
- **Status:** aprovada
- **Data:** 2026-10-08
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) mediu as alternativas nos dados, propôs as opções, implementou o pareamento e a conferência e redigiu este ADR; o pesquisador escolheu a regra e o tratamento dos locais especiais.

## Contexto
O produto `2026-10_mapa-da-virada` passou a mostrar a abstenção por local de votação no município escolhido
(Presidente, 1º turno de 2026) e a variação em relação ao 1º turno de 2022 no mesmo local. O TSE não publica um
identificador de local estável entre eleições: o local é identificado por município + zona + número
(`NR_LOCAL_VOTACAO`), e números são reaproveitados, nomes mudam de grafia e locais são criados ou fechados.

Dados usados: `tse.detalhe_votacao_secao` 2026 (`_BR.csv`) e 2022 (`_BRASIL.csv`), linha de Presidente;
`tse.eleitorado_local_votacao` 2026 e 2022 (local, nome, tipo e coordenadas por seção). No detalhe de 2026 o
local vem vazio (`-1`/`#NULO#`) em todas as seções; o local é tirado do cadastro pela seção principal
(as 499.248 seções do detalhe casam com seções principais do cadastro; seções agregadas já vêm somadas na principal).

Medição nacional (94.087 locais de 2026; mesma chave em 2022 para 85.958):

| Regra (mesma chave e…) | Locais com par |
|---|---|
| nome idêntico | 68.635 (73%) |
| nome normalizado | 70.065 (74%) |
| nome normalizado **ou** coordenadas a até 100 m | ~83.700 (89%) |
| só a chave | 85.958 (91%) |

Com a mesma chave e nome diferente, 13.624 locais estão a até 100 m (mesmo prédio com outra grafia, ex.:
"EBM José Amaro Cordeiro" × "Escola Básica Municipal José Amaro Cordeiro") e 505 a mais de 1 km (provável
reaproveitamento do número).

## Opções consideradas
1. **Mesma chave e nome idêntico** — a mais literal; perde um quarto dos locais por diferenças de grafia.
2. **Mesma chave e nome normalizado** — conservadora; ainda perde os locais com nome abreviado ou reescrito.
3. **Mesma chave e (nome normalizado ou coordenadas a até 100 m)** — recupera os prédios com grafia alterada;
   depende da qualidade das coordenadas do cadastro (566 locais de 2026 sem coordenada).
4. **Só a chave** — máxima cobertura; junta locais diferentes que reaproveitaram o número.

## Decisão
Opção 3.
- **Chave:** município TSE + zona + `NR_LOCAL_VOTACAO`.
- **Par pelo nome:** nome do local sem acentos, em maiúsculas, com tudo o que não é letra ou dígito trocado por
  espaço e espaços repetidos removidos (`normalizar_nome`), igual a algum nome do local de 2022 com a mesma chave.
- **Par pela localização:** se o nome difere, distância de grande círculo (haversine) entre as coordenadas de
  2026 e 2022 ≤ 100 m (`distancia_m`, `DISTANCIA_PAR_M`).
- **Sem par:** chave inexistente em 2022 (`sem_chave`) ou nome diferente com distância > 100 m ou sem
  coordenada (`sem_par`). Nada é completado.
- **Locais especiais** (voto em trânsito, preso provisório, temporário): aparecem com o tipo indicado, sem
  comparação (`especial`) — o eleitorado deles não é residente fixo.
- **Abstenção:** `QT_ABSTENCOES / QT_APTOS` da linha de Presidente, somadas as seções do local.
- **Coordenadas:** fora do polígono do próprio município (malha IBGE 2022) ou ausentes → o local fica fora do
  mapa e aparece na tabela; a posição não é estimada.

## Consequências
Resultado em 2026-10-08 (`analise/relatorio_qualidade_locais_mapa_virada.json`):
- par pelo nome 69.915 locais (121,6 mi aptos); pela localização 13.599 (23,2 mi); sem par 2.257 (3,3 mi);
  chave nova 7.298 (8,7 mi); especiais 1.018 (1,0 mi).
- coordenadas: 92.487 dentro do município, 1.034 fora, 566 sem coordenada.
- conferência com tolerância zero: Σ locais por município = API oficial de 2026 (aptos e abstenções) e
  = `detalhe_votacao_munzona` 2022 (1º turno, Presidente) nos 5.570 municípios — sem divergência.
- Pares pela localização podem juntar dois locais vizinhos diferentes (ex.: duas escolas no mesmo quarteirão
  que trocaram de número). A dica de cada local mostra o nome de 2022 e a distância para conferência.
- Com novos arquivos do TSE (correção de coordenadas, regeração após decisões judiciais), reprocessar.

## Afeta
- Datasets: `tse.detalhe_votacao_secao`, `tse.eleitorado_local_votacao`, `tse.detalhe_votacao_munzona`, `tse.resultados_2026_1t_presidente_municipios`, `ibge.malha_municipios_2022`
- Código: `projetos/eleicoes/analise/preparar_locais_mapa_virada.py` (`normalizar_nome`, `distancia_m`, `situacao_par`), `tests/test_eleicoes_locais_mapa_virada.py`
- Produtos: `2026-10_mapa-da-virada`, `2026-10_locais-de-votacao`
