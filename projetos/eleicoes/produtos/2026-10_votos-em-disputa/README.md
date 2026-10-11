# Onde Lula perdeu espaço e há mais votos em disputa

**Tipo:** visualização (piloto do tipo declarativo, L0007–L0013) · **Projeto:** eleicoes · **Status:** rascunho, em teste
sem divulgação · **Origem:** `eleicoes/2026-10_locais-de-votacao@1.1#disputa` (promoção com linhagem, L0009)

## Pergunta
Em cada local de votação da cidade escolhida, onde Lula perdeu participação desde 2022 e onde há mais votos em
disputa (abstenções, brancos e nulos e votos fora da disputa principal) no 1º turno de 2026?

## Dados
| Origem | Uso |
|---|---|
| `2026-10_locais-de-votacao` (versão 1.1), `data/locais/<IBGE>.js` | totais por local em 2026 e 2022, turnos de 2022, coordenadas e contorno, já conferidos com o TSE |
| Bases herdadas (ver `produto.yaml › datasets`) | as do produto de origem; a peça não lê bruto novo |

Saída: `data/locais/<IBGE>.js` (uma cidade por arquivo, carregada ao escolher a cidade), `data/municipios.json`
(índice e dicionário das colunas) e `analise/relatorio_qualidade_votos_em_disputa.json` (5.570 cidades; 83.514 locais
comparáveis; 34 cidades sem local comparável; votos em disputa = soma das partes em todos os locais).

## Método e decisões
- EL0009 (mesmo local), EL0003 (válidos), EL0008 (grupos de 2026 aplicados a 2022), EL0002/L0001 (municípios).
- Contas iguais às do produto de origem (`votos_em_disputa`, `saldo_entre_turnos`); destaque = variação de Lula < 0 e
  votos em disputa ≥ mediana dos locais da cidade (quantil tipo 7).
- Forma: especificação `viz.yaml`, validada (`labdados.viz`) e desenhada pelos componentes do DS (`lab-viz.js`);
  comportamentos decididos na bancada de formatos (L0011–L0013).
- Decisões locais (pesquisador, 2026-10-11): todas as cidades, abre na cidade do link (padrão Teresina); só Lula;
  fundo de ruas do OpenStreetMap; uso por link (WhatsApp, com prévia) e embed. Revisão do piloto (2026-10-11, L0014):
  título mantido; metodologia na folha ✎ Notas e fontes; tamanho Fixo | Votos no gráfico e no mapa; "Baixar ou
  Compartilhar"; sem rastreamento; tema do leitor ou `?tema=`. Conferência humana dos números: `conferencia.md`.

## Como reproduzir
```bash
PYTHONPATH=nucleo:. python projetos/eleicoes/analise/preparar_votos_em_disputa.py   # dados e relatório (~20 s)
PYTHONPATH=nucleo:. python -m labdados.viz og projetos/eleicoes/produtos/2026-10_votos-em-disputa   # página e og.png (Chrome)
```
Depende do recorte publicado de `2026-10_locais-de-votacao` (`data/base.json` e `data/locais/`).

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Preparação, especificação, gerador e página (2026-10-11) | Claude (Claude Code, Anthropic) | Tabela por cidade e textos com números, `viz.yaml`, validador e gerador (`labdados.viz`), renderizador (`lab-viz.js`), testes e textos de metodologia | Pergunta, recorte e forma definidos pelo pesquisador (briefing e bancada); conferência automática sem divergência; revisão visual e dos números pendente |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
