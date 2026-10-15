# Onde estão os votos no Piauí (story)

**Tipo:** story (piloto) · **Projeto:** eleicoes · **Status:** rascunho, no ambiente de pilotos (L0017) · **Deriva de:** `2026-10_distribuicao-votos-candidato-pi`

## Pergunta
Onde estão os votos das candidaturas mais votadas no Piauí em 2026 — espalhados ou concentrados — e quais mapas de
votos andam juntos?

## Dados
Base do produto publicado "Onde estão os votos?" (`data/base_pi.json.gz`: votos por seção conferidos com o TSE; válidos
do EL0003). Contornos municipais do IBGE (via `analise/html_forcas_pi.py`).

## Método e decisões
`produto.yaml › decisoes_locais`: escala do mapa (5 faixas iguais), indicadores de concentração (novos, só do piloto),
Senado (mais votado entre os três), correlação de Pearson (a do produto de origem), cores dos grupos.

## Como reproduzir
```bash
PYTHONPATH=nucleo:. python projetos/eleicoes/produtos/2026-10_onde-estao-os-votos-story/src/preparar_story.py
PYTHONPATH=nucleo:. python -m labdados.viz og projetos/eleicoes/produtos/2026-10_onde-estao-os-votos-story
```

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Roteiro, preparo dos dados e textos | Claude (Claude Code) | piloto com autonomia | pendente |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
