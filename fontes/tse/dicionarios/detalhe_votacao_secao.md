# Dicionário preliminar — detalhe da votação por seção

**Fonte:** Tribunal Superior Eleitoral (TSE), [Resultados — 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022)  
**Arquivo:** `detalhe_votacao_secao_2022.zip` — arquivo nacional, com recorte de trabalho no Piauí  
**Leia-me oficial:** `leiame.pdf`, incluído no ZIP  
**Licença informada no catálogo do TSE:** Creative Commons Atribuição (CC BY)  
**Estado:** campos abaixo conferidos no leia-me oficial; cobertura, domínio e consistência dos registros ainda precisam de validação.

O leia-me informa codificação Latin-1, campos entre aspas separados por ponto e vírgula, `#NULO` para informação em branco e `#NE` para informação não registrada naquele ano. Para campos numéricos, os códigos correspondentes são `-1` e `-3`. O leia-me não declara tipos técnicos para cada coluna; não foram inferidos aqui.

## Campos relevantes ao produto

| Variável | Descrição oficial resumida | Domínio/observação oficial |
|---|---|---|
| `ANO_ELEICAO` | Ano de referência da eleição | Suplementares usam o ano da eleição ordinária correspondente |
| `NR_TURNO` | Número do turno | Turno da eleição |
| `CD_ELEICAO` | Código único da eleição e do turno | Identificador da Justiça Eleitoral |
| `TP_ABRANGENCIA` | Abrangência territorial do cargo | Municipal, Estadual ou Federal |
| `SG_UF` | UF em que ocorreu a eleição | Pode também ser `BR`, `VT` ou `ZZ` |
| `SG_UE` | Unidade eleitoral da candidatura | UF, código TSE municipal ou `BR`, conforme abrangência |
| `CD_MUNICIPIO` | Código TSE do município da votação | Não presumir equivalência com o código IBGE |
| `NM_MUNICIPIO` | Nome do município da votação | Texto |
| `NR_ZONA` | Número da zona eleitoral | Unidade territorial da votação |
| `NR_SECAO` | Número da seção eleitoral | Unidade territorial da votação |
| `CD_CARGO` | Código do cargo | Usar junto de `DS_CARGO` |
| `DS_CARGO` | Descrição do cargo | Texto |
| `QT_APTOS` | Eleitorado apto na seção | Quantidade |
| `QT_COMPARECIMENTO` | Eleitores que compareceram | Quantidade |
| `QT_ABSTENCOES` | Eleitores aptos que não compareceram | Quantidade |
| `QT_VOTOS_NOMINAIS` | Votos nominais totalizados para o cargo na seção | Quantidade |
| `QT_VOTOS_LEGENDA` | Votos em legenda totalizados para o cargo na seção | Quantidade |
| `QT_VOTOS_BRANCOS` | Votos brancos totalizados para o cargo na seção | Quantidade |
| `QT_VOTOS_NULOS` | Votos nulos totalizados para o cargo na seção | Quantidade |
| `QT_VOTOS_ANULADOS_APU_SEP` | Votos anulados e apurados em separado, ainda sem classificação como válidos ou nulos até decisão judicial | Manter separado; não tratar silenciosamente como válido ou nulo |
| `NR_LOCAL_VOTACAO` | Número do local de votação | Identificador informado pelo TSE |
| `NM_LOCAL_VOTACAO` | Nome do local de votação | Texto |
| `DS_LOCAL_VOTACAO_ENDERECO` | Endereço do local de votação | Texto; não é coordenada geográfica |
| `ST_SECAO_INSTALADA` | Indica se a seção foi instalada | `S` ou `N` |
| `ST_SECAO_ANULADA` | Indica se a seção foi anulada | `S` ou `N` |

Este documento é um recorte preliminar das variáveis relevantes, não substitui o leia-me integral. O leia-me e o arquivo bruto permanecem preservados no ZIP registrado em `dados/manifesto.json`.

## Pendências de validação

- Confirmar tipos técnicos, valores ausentes e domínios observados no arquivo PI.
- Verificar unicidade da chave de seção/cargo/turno e cobertura dos cargos.
- Comparar os totais por seção com os registros de votação nominal e, depois, os totais agregados oficiais.
- Aprovar a fórmula de votos válidos antes de calcular percentuais.
- Validar qualquer relação com os arquivos de seções efetivas do TRE-PI e com identificadores IBGE.
