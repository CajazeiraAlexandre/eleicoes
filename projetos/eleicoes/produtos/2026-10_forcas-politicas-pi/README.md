# Forças políticas no Piauí: PT, PSD, MDB e os demais (2018–2026)

**Tipo:** narrativa · **Projeto:** eleicoes · **Status:** publicado · **Versão:** 1.0 (2026-10-06)

## Pergunta
Como se distribuem as forças dos grandes grupos políticos do Piauí — federação do PT, União Progressista, PSD, MDB e demais — nas eleições gerais (2018, 2022, 2026) e municipais (2020, 2024): onde cada grupo é mais forte, onde seu voto é coeso entre cargos e como a liderança territorial muda no tempo?

## O que a página mostra (5 seções)
1. **Composição e distribuição de forças** — participação por cargo e eleição, mapas por município e recortes regionais.
2. **Evolução no tempo** — séries das eleições gerais e municipais (separadas), com detalhamento por partido.
3. **Consistência entre cargos** — correlação entre cargos e sua evolução por grupo.
4. **Migrações e viradas** — Sankey de liderança por município (padrão: Dep. Estadual 2018–2026, só gerais).
5. **Seu município** — ficha por município.

## Dados
`tse.votacao_candidato_munzona`, `tse.votacao_partido_munzona`, `tse.detalhe_votacao_munzona`, `tse.votacao_secao`, `tse.detalhe_votacao_secao`, `tse.resultados_2026_1t`, `tse.candidatos`, `ibge.municipios_regiao_imediata`, `ibge.malha_municipios_2022`, `pi.territorios_desenvolvimento` (ver `produto.yaml` e o bloco de fontes da página, com datas e hashes).

## Método e decisões
- **Grupos (EL0004):** PT/PV/PCdoB; União Progressista (PP + União; em 2018, PP + DEM + PSL); PSD; MDB; Outros. **Indicadores (EL0005)** e **paleta (EL0006)** aprovados.
- **Válidos (EL0003)**, municípios TSE ⇄ IBGE (L0001, EL0002), produto autocontido (L0002) e design system (L0003).
- **Conferência:** Σ partidos = válidos oficiais por cargo × município, tolerância zero (relatório `projetos/eleicoes/analise/relatorio_qualidade_forcas_pi.json`).
- **Lacuna registrada:** Caraúbas do Piauí, Vereador 2024 — sem dados nos arquivos do TSE; fora dos indicadores e marcada na página.

## Como reproduzir
```bash
PYTHONPATH=nucleo:. .venv/bin/python projetos/eleicoes/analise/forcas_pi.py        # grupos, qualidade e data/base_forcas_pi.json.gz
PYTHONPATH=nucleo:. .venv/bin/python projetos/eleicoes/analise/html_forcas_pi.py    # index.html autocontido
PYTHONPATH=nucleo:. .venv/bin/python -m pytest tests/test_eleicoes_forcas_pi.py
```
Interface em `src/` (`index.template.html`, `app.js`, `metodologia.yaml`); o `index.html` é gerado. D3 7.9.0, d3-sankey e flubber via jsDelivr.

## Pendências de validação (não impedem a versão 1.0)
Limites das 4 faixas de intensidade da liderança (40/50/60%); percentil 95 e escala logarítmica simétrica na evolução em votos; parâmetros das bolhas; fonte oficial dos Territórios (Lei 6.967/2017).

## Uso de IA
| Etapa | Ferramenta | Finalidade | Revisão humana |
|---|---|---|---|
| Briefing e ADRs | Claude (Claude Code, Anthropic) | Formular perguntas, levantar partidos e federações, redigir EL0004–EL0006 e validar a paleta | Pesquisador definiu grupos, cores, indicadores e aprovou os ADRs |
| Territórios | Claude (Claude Code, Anthropic) | Coletar a Wikipédia por revisão e conferir 224 municípios | Pesquisador escolheu a fonte e resolveu 3 lacunas |
| Base e qualidade | Claude (Claude Code, Anthropic) | Implementar conferência (tolerância zero) e indicadores | Pesquisador decidiu tratar Caraúbas como lacuna; números a revisar no esboço |
| Interface e design system | Claude (Claude Code, Anthropic) | Implementar as revisões de interface, extrair os componentes para o design system do laboratório (L0003) e conferir a paridade da página | Pesquisador definiu os padrões visuais e de interação e aprovou a promoção ao design system |
| 2018 e 2020 | Claude (Claude Code, Anthropic) | Estimar custo, baixar e conferir 2018/2020, revisar EL0004 (PT+PCdoB+PV; PP+DEM+PSL) e incorporar os anos à página | Pesquisador escolheu as etapas, as composições dos grupos de 2018 e o tratamento da eleição extraordinária |
| Revisão da versão 1.0 | Claude (Claude Code, Anthropic) | Testar todas as seções (computador e celular), atualizar declarações e versão | Pesquisador marcou a versão 1.0 e o status revisão (2026-10-06) |

## Licença
Código: MIT · Dados derivados: CC BY 4.0
