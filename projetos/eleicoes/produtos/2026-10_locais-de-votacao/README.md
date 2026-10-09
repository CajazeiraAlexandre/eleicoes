# Onde o 2º turno se decide em sua cidade: locais de votação, Presidente 2026

**Tipo:** painel · **Projeto:** eleicoes · **Status:** publicado (1.0, 2026-10-09) · **Deriva de:** `2026-10_mapa-da-virada`

## Pergunta
Em cada local de votação de uma cidade: eleitores aptos, votos para Presidente no 1º turno de 2026 (Lula, Flávio
Bolsonaro, Augusto Cury, Renan Santos, Outros) e abstenção, com a variação em relação ao 1º turno de 2022 no mesmo local.

## Dados
| Dataset | Uso |
|---|---|
| `tse.votacao_secao` (2022 e 2026, `_BR`) | votos por seção |
| `tse.detalhe_votacao_secao` (2022 e 2026) | aptos e abstenções por seção |
| `tse.eleitorado_local_votacao` (2022 e 2026) | local, endereço, tipo e coordenadas |
| `tse.votacao_candidato_munzona` 2022, `tse.resultados_2026_1t_presidente_municipios` | destino dos votos (EL0003) e conferência |
| `tse.detalhe_votacao_munzona`, `tse.votacao_partido_munzona` 2022 | conferência |
| `ibge.malha_municipios_2022` | contorno e coordenada dentro/fora |

## Método e decisões
- EL0003 (válidos), EL0008 (grupos de 2026 aplicados a 2022), EL0009 (mesmo local), EL0002/L0001 (municípios).
- Decisões locais (pesquisador, 2026-10-08): colunas Lula, Flávio, Cury, Renan e Outros (Caiado e demais); votos em
  % dos válidos com o número de votos, variação em p.p.; abstenção em % dos aptos; exportação em CSV e PNG.
- Conferência com tolerância zero em `analise/relatorio_qualidade_locais_votacao.json`.
- Cortes de cor do mapa (quintis por cidade; variação −10/−5/−2/+2/+5/+10 p.p. nos votos e −6/−3/−1/+1/+3/+6 na
  abstenção) são PROPOSTA a validar.

## Como reproduzir
```bash
python -m projetos.eleicoes.analise.preparar_mapa_virada         # base municipal 2018–2026 (pré-requisito)
python -m projetos.eleicoes.analise.preparar_locais_votacao      # dados (data/locais/<IBGE>.js), relatório e HTML (~3 min)
python -m projetos.eleicoes.analise.preparar_locais_votacao --so-html
```
Depende de `projetos/eleicoes/produtos/2026-10_mapa-da-virada/data/base_mapa_virada.json.gz` (conferência de 2022).

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Preparação, página e exportação (2026-10-08) | Claude (Claude Code, Anthropic) | Somar votos por local, ligar 2026 a 2022, conferir com os totais oficiais, construir a página (mapa, tabela, CSV, PNG) e redigir a metodologia | Recorte, colunas, comparação e regras definidas pelo pesquisador; conferência automática sem divergência; revisão visual e dos números pendente |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
