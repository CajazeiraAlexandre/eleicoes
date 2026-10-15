# Onde o 2º turno para presidente pode ser decidido em sua cidade?

**Tipo:** story (primeiro story declarativo, L0015) · **Projeto:** eleicoes · **Status:** rascunho · **Origem:**
`eleicoes/2026-10_locais-de-votacao@1.1` (promoção com linhagem, L0009); forma do piloto `2026-10_votos-em-disputa`

## Pergunta
Em que lugares da sua cidade estão os votos que ainda podem decidir o 2º turno?

## Cartões (roteiro validado em 2026-10-11)
Capa · a cidade no 1º turno (números grandes; estado e Brasil numa linha) · 2018 → 2022 → 2026 (linhas, % do eleitorado
apto) · local a local · onde as duas coisas se juntam (destaque) · o maior deles · onde ficam (mapa) · por bairro (barras)
· fim. Cartões saem quando a cidade não tem o que mostrar (34 cidades sem local comparável; 2.739 com cartão de bairros).

## Dados
Saída de `analise/preparar_2_turno_na_sua_cidade.py`: `data/locais/<IBGE>.js` (tabela de locais do piloto + resumo,
série, bairros e textos de cada cartão), `data/municipios.json` e `analise/relatorio_qualidade_2_turno_na_sua_cidade.json`
(83.514 locais comparáveis, 42.364 em destaque, iguais ao piloto; soma dos bairros = soma dos destacados em todas as cidades).

## Método e decisões
- EL0009 (mesmo local), EL0003 (válidos), EL0010 (Presidente: em 2018 e 2022, a candidatura do partido), EL0002/L0001 (municípios).
- Resumo: % dos válidos de Lula (2026) e de Lula, PT (2022); estado e Brasil = soma dos municípios.
- Decisões locais (pesquisador, 2026-10-11): só Lula; bairro como consta no cadastro do TSE, agrupado só sem diferença
  de maiúsculas, acentos e espaços; medida = votos em disputa dos locais em destaque; 10 maiores; cartão só com 3 ou mais
  bairros com destaque; cor só do destaque (sem a escala do 2º turno de 2022).

## Como reproduzir
```bash
PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_2_turno_na_sua_cidade.py      # dados (~15 s)
PYTHONPATH=nucleo python -m labdados.viz og projetos/eleicoes/produtos/2026-10_2-turno-na-sua-cidade   # página e og.png (Chrome)
```

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Dados, especificação e hospedeiro story (2026-10-11) | Claude (Claude Code, Anthropic) | Script dos cartões, `viz.yaml`, story no `lab-viz.js`, adaptadores, testes e textos | Pergunta, roteiro e regras de bairro definidos pelo pesquisador; conferência automática sem divergência; revisão visual e dos números pendente |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
