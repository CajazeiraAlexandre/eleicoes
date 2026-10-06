# Dicionário preliminar — votação nominal por seção

**Fonte:** Tribunal Superior Eleitoral (TSE), [Resultados — 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022)  
**Arquivo:** `votacao_secao_2022_PI.zip` — Piauí  
**Leia-me oficial:** `leiame.pdf`, incluído no ZIP  
**Licença informada no catálogo do TSE:** Creative Commons Atribuição (CC BY)  
**Estado:** definições consultadas no leia-me; domínios, cobertura e consistência ainda sujeitos a validação.

O leia-me informa codificação Latin-1, campos entre aspas separados por ponto e vírgula, `#NULO` para informação em branco e `#NE` para informação não registrada naquele ano. Os correspondentes numéricos são `-1` e `-3`. O leia-me não declara tipos técnicos para cada coluna; não foram inferidos aqui.

## Campos relevantes ao produto

| Variável | Descrição oficial resumida | Domínio/observação oficial |
|---|---|---|
| `ANO_ELEICAO` | Ano de referência da eleição | Suplementares usam o ano da eleição ordinária correspondente |
| `NR_TURNO` | Número do turno | Turno da eleição |
| `CD_ELEICAO` | Código único da eleição e do turno | Identificador da Justiça Eleitoral |
| `SG_UF` | Sigla da UF da votação | Pode também haver abrangências nacionais, voto em trânsito ou exterior |
| `CD_MUNICIPIO` | Código TSE do município da votação | Não presumir equivalência com código IBGE |
| `NR_ZONA` | Número da zona eleitoral | Unidade territorial da votação |
| `NR_SECAO` | Número da seção eleitoral | Unidade territorial da votação |
| `CD_CARGO` | Código do cargo | Usar junto de `DS_CARGO` |
| `DS_CARGO` | Descrição do cargo | Texto |
| `NR_VOTAVEL` | Número do votável, candidato ou partido | `95` branco, `96` nulo, `97` anulado e apurado em separado |
| `NM_VOTAVEL` | Nome do votável | Candidato, partido ou descrição de branco/nulo/anulado |
| `QT_VOTOS` | Quantidade de votos recebidos pelo votável na seção | Contagem |
| `NR_LOCAL_VOTACAO` | Número do local de votação | Identificador informado pelo TSE |
| `SQ_CANDIDATO` | Número sequencial da candidatura, utilizável como chave de cruzamento | Não é o número de campanha |
| `NM_LOCAL_VOTACAO` | Nome do local de votação | Texto |
| `DS_LOCAL_VOTACAO_ENDERECO` | Endereço do local de votação | Texto; não é coordenada geográfica |

## Tratamento aprovado para este produto

O pesquisador aprovou selecionar candidaturas com `SQ_CANDIDATO` positivo. Na inspeção do arquivo PI, `-1` ocorreu em registros de votos em branco/nulos e `-3` em votos de legenda; os códigos especiais de `NR_VOTAVEL` representam branco, nulo e voto anulado em separado. Esses registros não são opções nem votos nominais de candidatura; serão contabilizados no QA e não alteram os arquivos brutos.

Este dicionário é preliminar e não substitui o leia-me integral. Os tipos técnicos, os domínios observados e a cobertura do conjunto serão detalhados após a validação completa.
