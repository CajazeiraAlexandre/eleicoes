# Dicionário — Malha de setores censitários 2022 (`ibge.setores_censitarios_2022`)

**Fonte:** IBGE, [malhas de setores censitários — Censo 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/)
**Arquivos (em `dados/bruto/ibge/setores_censitarios_2022/`, fora do git):** `BR_setores_CD2022.gpkg` (camada
`BR_setores_CD2022`, 1,49 GB) e `Dicionario_de_dados_malha_agregados.xlsx` (dicionário oficial)
**Baixado em:** 2026-10-08 (`fontes/ibge/baixar.py`; hashes no manifesto) · **Estado:** baixado, não usado em produto.

472.780 polígonos (SIRGAS 2000, EPSG:4674) para **468.099 setores**: 4.681 setores aparecem em mais de uma parte (dissolver
por `CD_SETOR` antes de contar ou calcular área). Esta malha **não** traz as variáveis de agregados (`V0001`–`V0007`, total
de pessoas e domicílios), embora o dicionário oficial as descreva — vêm dos Agregados por Setores Censitários.

| Variável | Tipo | Descrição | Domínio / observação |
|---|---|---|---|
| `CD_SETOR` | texto (15) | Geocódigo do setor censitário | chave; no CNEFE vem com o sufixo `P` (16 caracteres) |
| `SITUACAO` | texto | Situação do setor | Urbana, Rural |
| `CD_SIT` | texto | Situação detalhada | [listas/setor_situacao_2022.csv](listas/setor_situacao_2022.csv) |
| `CD_TIPO` | texto | Tipo do setor | [listas/setor_tipo_2022.csv](listas/setor_tipo_2022.csv); `1` = Favela e Comunidade Urbana (33.277 polígonos) |
| `AREA_KM2` | real | Área em km² | |
| `CD_REGIAO`, `NM_REGIAO` | texto | Grande Região | |
| `CD_UF`, `NM_UF` | texto | Unidade da Federação | |
| `CD_MUN`, `NM_MUN` | texto (7) | Município | |
| `CD_DIST`, `NM_DIST` | texto | Distrito | |
| `CD_SUBDIST`, `NM_SUBDIST` | texto | Subdistrito | no dicionário oficial, `CD_SUBDIS` |
| `CD_BAIRRO`, `NM_BAIRRO` | texto | Bairro | preenchido em 168.443 polígonos (só municípios com bairros oficiais) |
| `CD_NU`, `NM_NU` | texto | Núcleo urbano | |
| `CD_FCU`, `NM_FCU` | texto (11) | Favela ou Comunidade Urbana | preenchido exatamente nos setores de `CD_TIPO = 1`; idêntico à lista de `ibge.favelas_comunidades_urbanas_2022` (33.272 setores, conferido em 2026-10-08) |
| `CD_AGLOM`, `NM_AGLOM` | texto | Aglomerado | |
| `CD_RGINT`, `NM_RGINT` | texto | Região Geográfica Intermediária | |
| `CD_RGI`, `NM_RGI` | texto | Região Geográfica Imediata | |
| `CD_CONCURB`, `NM_CONCURB` | texto | Concentração Urbana | |

## Uso previsto (proposta, não decidida)
Ponto geocodificado (`labdados.geocodificacao`, L0005) ou CEP (CNEFE) → setor (ponto no polígono, ou `COD_SETOR` do
CNEFE) → favela/comunidade (`CD_FCU`), bairro e situação. Para renda e população por setor, falta incluir os Agregados por
Setores Censitários (Censo 2022) — fonte nova, a propor.
