# Malhas e referências territoriais do IBGE

Os limites administrativos são obtidos do servidor oficial de malhas do IBGE, sem usar uma cópia local da API:

- Malhas de unidades da Federação e municípios, edição 2022: <https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/>
- Malha de setores censitários 2022, por UF: <https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/setores/shp/UF/>
- API de localidades do IBGE (consulta direta; snapshots exigem autorização): <https://servicodados.ibge.gov.br/api/docs/localidades>

Arquivos previstos neste primeiro recorte:

| Dataset | Arquivo | Escopo | Tamanho compactado conferido no servidor |
|---|---|---|---:|
| `ibge.malha_ufs_2022` | `BR_UF_2022.zip` | Brasil | 13.717.460 bytes |
| `ibge.malha_municipios_2022` | `BR_Municipios_2022.zip` | Brasil | 203.627.589 bytes |
| `ibge.setores_censitarios_pi_2022` | `PI_setores_CD2022.zip` | Piauí | 20.273.494 bytes |

Incluídos em 2026-10-08 (recorte intraurbano — D8 de CN0009; ainda não usados em produto):

| Dataset | Arquivo | Escopo | Tamanho |
|---|---|---|---:|
| `ibge.setores_censitarios_2022` | `BR_setores_CD2022.gpkg` + `Dicionario_de_dados_malha_agregados.xlsx` | Brasil | 1,4 GB |
| `ibge.favelas_comunidades_urbanas_2022` | `FavelaseComunidadesUrbanas2022Setores_20250417.xlsx`, `poligonos_FCUs_shp.zip`, `FCUs_nao_setorizadas_shp_20260410.zip` | Brasil | 11 MB |

Dicionários em `dicionarios/`. `baixar.py` aceita vários arquivos por base e confere ZIP/XLSX (membros) e GeoPackage (cabeçalho SQLite).

Todos são arquivos originais, baixados para `dados/bruto/ibge/` e registrados no manifesto. A seleção de malha não aprova por si só qualquer junção com chaves eleitorais; examine os códigos e valide correspondências e compatibilidade temporal antes de cruzar.
