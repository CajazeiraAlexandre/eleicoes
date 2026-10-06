# Onde estão os votos? Distribuição territorial de candidaturas no Piauí

**Tipo:** exploratório · **Projeto:** eleicoes · **Status:** publicado · **Versão:** 1.0 (2026-10-06)

## Pergunta
Como os votos de uma candidatura se distribuem pelo território do Piauí, do município ao local de votação, e quais candidaturas de outros cargos têm distribuição mais parecida ou mais oposta à dela?

## O que a página mostra
- **Resumo** da candidatura escolhida (votos, % dos válidos, municípios ou locais com voto).
- **Distribuição territorial:** mapa (municípios, Regiões Imediatas e Intermediárias do IBGE, Territórios de Desenvolvimento ou pontos dos locais de votação; zona em tabela), 10 maiores valores, gráfico de evolução e tabela (recolhida). Clique no mapa seleciona a unidade; o card permite abrir os locais de votação do município.
- **Comparar com** outra eleição: a mesma pessoa (EL0007) e, em Presidente e Governador, o mesmo partido — mapa de variação (ganhou/perdeu) por município e recortes regionais.
- **Correlação** (Pearson) com candidaturas de outros cargos no nível escolhido, com dispersão.
- Bloco **Fontes de Dados, Metodologia e Códigos** no fim da página (L0003).

## Recorte
Piauí; eleições gerais de 2018 (1º turno e 2º de Presidente), 2022 (1º e 2º turnos) e 2026 (1º turno). O nível mais detalhado é o local de votação; a seção eleitoral é a base do cálculo, mas não é exibida.

## Dados
| Dataset | Uso | Fonte |
|---|---|---|
| `tse.votacao_secao` | votos por seção (PI: cargos estaduais; BR: Presidente, filtrado ao PI), 2018–2026 | TSE |
| `tse.detalhe_votacao_secao` | conferência por seção, 2022 e 2026 | TSE |
| `tse.detalhe_votacao_munzona`, `tse.votacao_partido_munzona`, `tse.votacao_candidato_munzona` | destino dos votos e conferências (2018 por município/zona; 2022) | TSE |
| `tse.resultados_2026_1t` | destino dos votos e conferência de 2026 (API, assinatura verificada) | TSE |
| `tse.candidatos` | nomes, partidos, situação e ligação entre eleições (EL0007) | TSE |
| `tse.eleitorado_local_votacao` | locais e coordenadas, 2018–2026 | TSE |
| `ibge.municipios`, `ibge.municipios_regiao_imediata`, `ibge.malha_municipios_2022`, `pi.territorios_desenvolvimento` | recortes e geometrias | IBGE; Governo do PI (via Wikipédia, EL0004) |

## Método e decisões
- **Votos válidos por seção (EL0003):** reconstruídos com o destino oficial dos votos e conferidos com tolerância zero — 2018: 12.030.734 (adendo 2018: conferência por município/zona); 2022: 11.800.321; 2026: 12.022.196, todos iguais aos oficiais.
- **Agregação:** soma de votos e válidos antes de dividir; nunca média de percentuais. Candidatura sem linha numa seção = 0 votos.
- **Municípios TSE ⇄ IBGE:** L0001 + EL0002 (224 de 224).
- **Mesma pessoa entre eleições (EL0007):** nome civil completo + data de nascimento, única por eleição; CPF só para conferir (fora da base). 159 pessoas ligadas.
- **Cores por grupo (EL0004/EL0006)**; cálculo em Python e somas/Pearson no navegador com teste de paridade (L0002; 344 casos, 0 falhas).
- **Correlação:** Pearson com peso igual por unidade; mínimo de 3 municípios ou 10 unidades nos demais níveis. Descreve associação, não causalidade nem voto conjunto.

### Decisões locais (só deste produto)

- Escala temática recalculada a cada candidatura e seleção territorial/métrica, aprovada pelo pesquisador em 2026-10-03. Consequência: a legenda e uma nota de não comparabilidade acompanham o mapa; a mesma cor entre duas candidaturas pode representar valores diferentes.
- Zona eleitoral em tabela/ranking, sem polígonos derivados de municípios, aprovada pelo pesquisador em 2026-10-03. A conferência dos arquivos nacionais do TSE para 2022 encontrou 1.632 zonas ligadas a mais de um município e 189 municípios ligados a mais de uma zona; os casos mais extensos observados foram 8 municípios por zona e 58 zonas em um município. A busca por uma fonte oficial de limites permanece aberta.

- **Cor do PL (só neste produto, pesquisador, 2026-10-06):** candidaturas do PL deixam o grupo "Outros" e ganham cor própria, `#3a8fd0` — azul mais claro que o da União Progressista (`#22508f`, EL0006). A paleta com o PL passou no validador de paleta (skill `dataviz`) sem alerta novo em relação à EL0006. Os demais produtos seguem a EL0004/EL0006 sem o PL. Código: `preparar_distribuicao_pi.py` (`COR_PL`, `grupo_do_partido`).

- **Continuidade partidária em Presidente (só neste produto, pesquisador, 2026-10-06):** em 2018, a candidatura presidencial associada ao atual PL foi a do PSL (Jair Bolsonaro). Para "Comparar com → mesmo partido" e para a linha do partido no gráfico de evolução, PSL 2018 (Presidente) equivale a PL. Não altera as cores dos grupos (EL0004: PSL 2018 segue no grupo União Progressista) nem outros cargos. Código: `ASSOCIADOS` em `src/app.js`.

## Como reproduzir
```bash
PYTHONPATH=nucleo:. .venv/bin/python projetos/eleicoes/analise/validar_distribuicao_pi.py         # QA 2018, 2022, 2026 (obrigatória)
PYTHONPATH=nucleo:. .venv/bin/python projetos/eleicoes/analise/preparar_distribuicao_pi.py        # base + index.html + paridade
PYTHONPATH=nucleo:. .venv/bin/python projetos/eleicoes/analise/preparar_distribuicao_pi.py --so-html   # só a interface (src/)
PYTHONPATH=nucleo:. .venv/bin/python -m pytest tests/test_eleicoes_distribuicao_pi_paridade.py tests/test_eleicoes_distribuicao_pi_qa.py
```
O `index.html` é gerado (não editar à mão): interface em `src/` (`index.template.html`, `app.js`, `nucleo.js`, `metodologia.yaml`), componentes em `web/componentes/`. Abre com duplo clique; D3 7.9.0 e flubber 0.4.2 via jsDelivr. A seleção fica no endereço (`#e=…&c=…&ci=…`).

## Limitações
- Zonas eleitorais sem geometria oficial: no nível zona, o mapa mostra municípios e as zonas ficam na tabela.
- Locais sem coordenada ou com coordenada fora do próprio município ficam fora do mapa, marcados na tabela.
- 2026: 1º turno, sujeito a revisão (ex.: votos sub judice). 2018: conferência por município/zona, não por seção.
- Quem mudou de nome civil entre eleições não é reconhecido como a mesma pessoa.

## Histórico
- 2026-10-05: escopo revisto para o Piauí e formato autocontido (L0002); a versão nacional de 2022 com servidor Python local foi substituída e removida na versão 1.0 (2026-10-06), com seus dados (450 MB) e scripts.
- 2026-10-06: versão 1.0 — 2018 incluído, comparações entre eleições, níveis regionais, design system (L0003).

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Briefing e estrutura inicial | Claude (Claude Code, Anthropic) | Registrar o escopo e criar a estrutura do produto | Pesquisador definiu e confirmou os recortes e as escolhas listadas no briefing |
| Consulta de referência geográfica | Claude (Claude Code, Anthropic) | Consultar a API oficial do IBGE e salvar o snapshot município–Região Imediata | Fonte e gravação da cópia autorizadas pelo pesquisador; vínculos do snapshot conferidos contra a malha municipal |
| Correspondência municipal nacional | Claude (Claude Code, Anthropic) | Gerar tabela auditável com pareamentos únicos conforme L0001 | Pesquisador aprovou a regra, a cobertura parcial e a promoção da referência ao laboratório |
| Revisão de escopo e arquitetura | Claude (Claude Code, Anthropic) | Medir volumes, inspecionar arquivos de 2026 do TSE, propor formato autocontido e redigir L0002 e o novo briefing | Pesquisador escolheu o modelo híbrido, o recorte, os níveis, a regra de ausência e o mínimo de locais (2026-10-05) |
| Qualidade por seção e votos válidos (PI) | Claude (Claude Code, Anthropic) | Implementar `validar_distribuicao_pi.py`, investigar as divergências de denominador, corrigir o coletor da API (DF/cargo 7) e redigir EL0003 | Pesquisador aprovou a reconstrução dos válidos (opção 1) e a cópia da API fora do git; totais conferidos com tolerância zero |
| Conferência dos votos válidos | Claude (Claude Code, Anthropic) | Implementar QA reproduzível das partições nacionais do TSE, das chaves e dos totais nominais, de legenda e válidos | Pesquisador aprovou as partições `BRASIL.csv`, o filtro da eleição geral e a exclusão territorial de `ZZ`; os totais conferiram sem divergências |
| Interface e design system | Claude (Claude Code, Anthropic) | Aplicar os padrões e componentes do design system (L0003) e o bloco de metodologia | Pesquisador definiu os padrões e o escopo (migração completa em duas etapas) |
| Ligação de candidaturas (EL0007) | Claude (Claude Code, Anthropic) | Propor chaves, implementar a ligação por nome completo + nascimento e redigir EL0007 | Pesquisador escolheu a chave; CPF só para conferência, fora da base |
| Mapa de variação e comparações | Claude (Claude Code, Anthropic) | Implementar "Comparar com" (mesma pessoa; mesmo partido em Presidente/Governador), seleção no mapa, níveis e gráfico de evolução | Pesquisador definiu os comportamentos; escala divergente e percentil 95 pendentes de validação |
| Inclusão de 2018 | Claude (Claude Code, Anthropic) | Estimar tamanhos, baixar 355 MB (opção B), implementar a conferência por município/zona e redigir o adendo 2018 da EL0003 | Pesquisador escolheu a opção B; a anulação dos votos de Elizeu Aguiar foi identificada pelos totais oficiais, sem suposição |
| Decisões locais de cor e partido | Claude (Claude Code, Anthropic) | Validar a cor do PL com o validador de paleta e aplicar PSL 2018 = PL em Presidente | Pesquisador pediu as duas mudanças |
| Revisão da versão 1.0 | Claude (Claude Code, Anthropic) | Testar a página (níveis, comparações, celular), excluir o rascunho de convergência, atualizar declarações e versão | Pesquisador marcou a versão 1.0 e o status revisão (2026-10-06) |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
