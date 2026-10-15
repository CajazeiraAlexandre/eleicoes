# MDS — VIS DATA / MI Social (SAGICAD)

Dados do Ministério do Desenvolvimento e Assistência Social por município e mês, pela API pública
`https://aplicacoes.mds.gov.br/sagi/servicos/misocial` (Solr, JSON).

- `consultar_bolsa_familia.py` → `mds.bolsa_familia_municipios`: famílias e pessoas beneficiárias do
  Bolsa Família e valor repassado no mês de referência (padrão: setembro de 2026, anterior à eleição).
- `consultar_bolsa_familia_serie.py` → `mds.bolsa_familia_municipios_serie`: série mensal jan/2006–set/2026
  (famílias do Bolsa Família e do Auxílio Brasil, pessoas, cancelamentos), em formato compacto; lacunas da API
  ficam como `null` (ver `observacoes` no catálogo).
- O código municipal da fonte tem 6 dígitos (IBGE sem o dígito verificador); a ligação com os 7 dígitos
  é feita pelos 6 primeiros dígitos do código IBGE.
