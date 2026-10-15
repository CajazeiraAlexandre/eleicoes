# Eleições no Piauí

Produtos interativos sobre a geografia do voto e as forças políticas no Piauí, com dados oficiais do
TSE e do IBGE, e o código para refazê-los do zero. Site: <https://cajazeiraalexandre.github.io/eleicoes/>

## Produtos

- **[Onde o 2º turno para presidente pode ser decidido em sua cidade?](https://cajazeiraalexandre.github.io/eleicoes/2-turno-na-sua-cidade/)** — `projetos/eleicoes/produtos/2026-10_2-turno-na-sua-cidade`
- **[Onde estão os votos? Distribuição territorial de candidaturas no Piauí](https://cajazeiraalexandre.github.io/eleicoes/onde-estao-os-votos/)** — `projetos/eleicoes/produtos/2026-10_distribuicao-votos-candidato-pi`
- **[Forças políticas no Piauí: PT, PSD, MDB e os demais (2018–2026)](https://cajazeiraalexandre.github.io/eleicoes/forcas-politicas/)** — `projetos/eleicoes/produtos/2026-10_forcas-politicas-pi`
- **[Onde o 2º turno pode ser decidido em sua cidade: locais de votação, Presidente 2026](https://cajazeiraalexandre.github.io/eleicoes/onde-o-2-turno-se-decide/)** — `projetos/eleicoes/produtos/2026-10_locais-de-votacao`
- **[Onde estão os votos no Piauí](https://cajazeiraalexandre.github.io/eleicoes/onde-estao-os-votos-pi/)** — `projetos/eleicoes/produtos/2026-10_onde-estao-os-votos-story`
- **[Quem lidera o voto no Piauí](https://cajazeiraalexandre.github.io/eleicoes/quem-lidera-o-voto-pi/)** — `projetos/eleicoes/produtos/2026-10_quem-lidera-o-voto-pi`

Cada produto é uma página HTML única (abre com duplo clique, sem servidor) com o bloco
"Fontes de Dados, Metodologia e Códigos" no fim. O README de cada pasta resume método, decisões,
limitações e o uso de IA.

## O que este repositório contém

Só o necessário para a transparência e para refazer os números a partir das fontes oficiais: as páginas
publicadas e seus dados, o código (núcleo, pipelines das fontes, análises), os relatórios de conferência, os
testes, as decisões metodológicas (ADRs) citadas e o recorte do catálogo de bases. Ferramentas de autoria, a
especificação do design system, briefings e anotações internas do laboratório ficam de fora. Cada página é um
retrato datado das bases: não se atualiza sozinha, e a data dos dados está no rodapé.

## Como refazer

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[geo,dev]"
export PYTHONPATH=nucleo:.

# 1. baixar as bases oficiais (TSE, IBGE) — URLs, datas e hashes originais em dados/manifesto.json
python fontes/tse/baixar.py --help
python fontes/ibge/baixar.py --help
python fontes/tse/coletar_resultados_2026.py --help     # API de resultados de 2026 (cópia local de 122 MB)
python fontes/tse/coletar_resultados_2026.py --presidente-municipios --permitir-grande   # Presidente por município (43 MB)

# 2. "Onde estão os votos?"
python projetos/eleicoes/analise/validar_distribuicao_pi.py     # conferência de qualidade (tolerância zero)
python projetos/eleicoes/analise/preparar_distribuicao_pi.py    # base + página + teste de paridade

# 3. "Forças políticas no Piauí"
python projetos/eleicoes/analise/forcas_pi.py                   # grupos, indicadores e conferência
python projetos/eleicoes/analise/html_forcas_pi.py              # página

# 4. "Onde o 2º turno se decide em sua cidade"
python projetos/eleicoes/analise/preparar_mapa_virada.py        # base municipal 2018–2026 (intermediária, ~2 min)
python -m projetos.eleicoes.analise.preparar_locais_votacao     # locais, conferência com o TSE e página (~3 min)

python -m pytest tests
```

Os dados brutos não acompanham o repositório (são baixados de novo); as cópias de referência que
os produtos usam (`dados/referencia/`, `dados/snapshots/`) e os recortes web de cada produto
(`projetos/eleicoes/produtos/*/data/`) estão versionados.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `projetos/eleicoes/produtos/` | os produtos publicados (página, interface em `src/`, recorte de dados em `data/`) |
| `projetos/eleicoes/analise/` | preparação das bases, indicadores e conferências de qualidade |
| `projetos/eleicoes/decisoes/`, `metodologia/decisoes/` | decisões metodológicas registradas (ADRs) |
| `fontes/` | download e padronização das bases oficiais |
| `nucleo/labdados/` | funções comuns (download com hash, manifesto, território, montagem das páginas) |
| `web/componentes/`, `design/padrao/` | componentes de interface e estilo |
| `catalogo/`, `dados/manifesto.json` | bases usadas, com origem, datas e hashes |
| `tests/` | testes, inclusive a paridade entre os cálculos em Python e no navegador |

## Bases usadas

`ibge.censo2022_municipios`, `ibge.malha_municipios_2022`, `ibge.malha_ufs_2022`, `ibge.municipios`, `ibge.municipios_regiao_imediata`, `ibge.pib_municipios`, `mds.bolsa_familia_municipios`, `pi.territorios_desenvolvimento`, `tse.candidatos`, `tse.detalhe_votacao_munzona`, `tse.detalhe_votacao_secao`, `tse.eleitorado_local_votacao`, `tse.resultados_2026_1t`, `tse.resultados_2026_1t_presidente_municipios`, `tse.votacao_candidato_munzona`, `tse.votacao_partido_munzona`, `tse.votacao_secao`

## Decisões metodológicas

- `projetos/eleicoes/decisoes/EL0002-correspondencia-municipal-tse-ibge.md`
- `projetos/eleicoes/decisoes/EL0003-votos-validos-por-secao.md`
- `projetos/eleicoes/decisoes/EL0004-grupos-politicos-pi.md`
- `projetos/eleicoes/decisoes/EL0005-indicadores-forca-coesao-lideranca.md`
- `projetos/eleicoes/decisoes/EL0006-paleta-grupos-politicos.md`
- `projetos/eleicoes/decisoes/EL0007-ligacao-de-candidaturas-entre-eleicoes.md`
- `projetos/eleicoes/decisoes/EL0008-conglomerados-presidenciais-2026-e-linhagem-partidaria.md`
- `projetos/eleicoes/decisoes/EL0009-pareamento-de-locais-de-votacao-entre-eleicoes.md`
- `projetos/eleicoes/decisoes/EL0010-presidente-comparacao-pela-candidatura-do-partido.md`
- `metodologia/decisoes/L0001-correspondencia-municipal-nacional-tse-ibge.md`
- `metodologia/decisoes/L0002-produtos-autocontidos-calculo-hibrido.md`
- `metodologia/decisoes/L0003-design-system-componentes-e-bloco-de-metodologia.md`
- `metodologia/decisoes/L0006-componente-de-mapa-camera-interacao-fundo.md`
- `metodologia/decisoes/L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md`
- `metodologia/decisoes/L0008-visualizacao-tarefas-formatos-estatico-detalhe-anotacoes-sequencia.md`
- `metodologia/decisoes/L0009-relacoes-entre-produtos-e-tipo-visualizacao.md`
- `metodologia/decisoes/L0010-publicacao-retrato-datado-pacote-enxuto.md`
- `metodologia/decisoes/L0011-especificacao-v02-vistas-ligados-facetas-controles.md`
- `metodologia/decisoes/L0012-moldura-no-celular-barra-fixa-imagem-svg-limites-de-texto.md`
- `metodologia/decisoes/L0013-revisao-no-celular-fechamento-da-fase-0.md`
- `metodologia/decisoes/L0014-metodologia-na-folha-e-revisao-do-piloto.md`
- `metodologia/decisoes/L0015-story-declarativo-cartoes-sobre-o-plano.md`
- `metodologia/decisoes/L0016-acervo-de-graficos-contrato-v2-maturidade-bancada.md`
- `metodologia/decisoes/L0017-ambiente-de-pilotos-no-github-pages.md`

## Origem e uso de IA

Recorte do laboratório de dados do autor (commit de origem `51ae0dc5`, 2026-10-15). O uso de IA generativa
(Claude, Anthropic) está declarado no README de cada produto, conforme a Portaria CNPq nº 2.664/2026;
as decisões metodológicas e a revisão são do pesquisador.

## Licença

Código: MIT. Dados derivados e textos: CC BY 4.0. Os dados originais pertencem ao TSE, ao IBGE e às
demais fontes listadas em `catalogo/fontes.yaml`, com suas próprias licenças.

Autor: [Alexandre Cajazeira](https://cajazeiraalexandre.github.io/).
