# Dicionário — Favelas e Comunidades Urbanas 2022 (`ibge.favelas_comunidades_urbanas_2022`)

**Fonte:** IBGE, Censo Demográfico 2022 — [Favelas e Comunidades Urbanas: resultados do universo](https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Favelas_e_comunidades_urbanas_Resultados_do_universo/)
**Arquivos (em `dados/bruto/ibge/favelas_comunidades_urbanas_2022/`, fora do git):**
`FavelaseComunidadesUrbanas2022Setores_20250417.xlsx`, `poligonos_FCUs_shp.zip`, `FCUs_nao_setorizadas_shp_20260410.zip`
**Baixado em:** 2026-10-08 (`fontes/ibge/baixar.py`; hashes no manifesto) · **Estado:** baixado, não usado em produto.
**Documentação oficial:** apresentação `Anexos/FavelasComunidadesUrbanas_Apresentacao_20250417.pdf` (não baixada; 18 MB).

## 1. Setores das FCUs (`FavelaseComunidadesUrbanas2022Setores_20250417.xlsx`, aba `Setores_FCUs`)

Uma linha por setor censitário que compõe uma Favela ou Comunidade Urbana. A aba `Dicionário` traz a descrição oficial.

| Variável | Tipo | Descrição | Domínio / observação |
|---|---|---|---|
| `CD_SETOR` | texto (15) | Geocódigo do setor censitário | único na tabela (33.272); cada setor pertence a uma só FCU |
| `CD_FCU` | texto (11) | Código da Favela ou Comunidade Urbana | 12.348 FCUs |
| `NM_FCU` | texto | Nome da FCU | |
| `CD_MUN` | texto (7) | Código IBGE do município | 656 municípios |
| `NM_MUN` | texto | Nome do município | |
| `CD_UF` | texto (2) | Código da UF | |
| `NM_UF` | texto | Nome da UF | |

## 2. Polígonos das FCUs (`poligonos_FCUs_shp.zip` → `qg_2022_670_fcu_agreg.shp`)

12.348 polígonos, SIRGAS 2000 (EPSG:4674): `cd_fcu`, `nm_fcu`, `cd_uf`, `nm_uf`, `sigla_uf`, `cd_mun`, `nm_mun`, `geometry`.

## 3. FCUs não setorizadas (`FCUs_nao_setorizadas_shp_20260410.zip` → `fcu_nset_cd2022_rev.shp`)

2.192 polígonos de FCUs (ou partes) que não coincidem com setores inteiros, revisão de 10/04/2026; mesmos campos e
`setorizado` (`NAO`). Quem estiver nessas áreas não é captado pela lista de setores — só por ponto no polígono.

## Uso previsto (proposta, não decidida)

Recorte intraurbano do proponente (D8 de CN0009): CEP do cadastro → endereços do CNEFE 2022 (`ibge.cnefe_2022`, que traz
`CEP`, `COD_SETOR`, `LATITUDE`, `LONGITUDE`) → setor → FCU. No CNEFE o `COD_SETOR` tem 16 caracteres (os 15 dígitos do
geocódigo + o sufixo `P`); a junção com `CD_SETOR` usa os 15 primeiros — conferir antes de usar. Um CEP pode cobrir vários
setores: a regra de atribuição (setor mais frequente, proporção, ponto) é decisão metodológica pendente.
