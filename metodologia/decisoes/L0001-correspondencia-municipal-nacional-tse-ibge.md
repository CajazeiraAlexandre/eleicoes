# L0001 — Correspondência municipal nacional TSE–IBGE

- **Escopo:** laboratório
- **Status:** aprovada
- **Data:** 2026-10-03
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs a auditoria inicial e implementou a tabela; o pesquisador aprovou a regra e o escopo compartilhado.

## Contexto

Produtos que relacionam resultados municipais do TSE a regiões ou geometrias oficiais do IBGE precisam de uma correspondência auditável. O TSE usa códigos municipais próprios; eles não podem ser tratados como códigos IBGE. O ADR [EL0002](../../projetos/eleicoes/decisoes/EL0002-correspondencia-municipal-tse-ibge.md) cobre especificamente os municípios do Piauí e suas exceções aprovadas, não a correspondência nacional.

Para o pleito de 2022, o arquivo oficial TSE de detalhe por município/zona apresentou 5.570 códigos municipais brasileiros e 181 códigos `ZZ` associados a localidades fora do Brasil. O snapshot autorizado da API de Localidades do IBGE contém 5.571 registros municipais e vínculos a Regiões Geográficas Imediatas.

## Opções consideradas

1. **Pareamento estrito por UF e nome único normalizado** — normalizar caixa, acentos e espaços e preservar pontuação. É conservador e consistente com EL0002; deixa algumas localidades sem vínculo, que ficam sem geometria ou agregação regional.
2. **Converter/remover pontuação ou usar aproximação** — pode ampliar a cobertura, mas altera nomes e pode criar falsos pares; exige regra adicional e revisão de ambiguidades.
3. **Usar códigos TSE e IBGE como se fossem equivalentes** — simples, mas os identificadores têm sistemas diferentes e isso produziria junções incorretas.

## Decisão

Adotar a opção 1 como regra compartilhada. Só aceitar pareamento automático quando UF e nome normalizado por caixa, acentos e espaços identificarem exatamente um registro em cada fonte. Pontuação é preservada; não se aplicam correspondência aproximada nem exceções automáticas.

A auditoria inicial encontrou 5.511 pareamentos únicos entre os 5.570 códigos brasileiros e 59 registros sem correspondência exata. Os 59 permanecem sem código IBGE; não recebem geometria nem Região Geográfica Imediata, e a lacuna deve ser contabilizada e comunicada. Os registros municipais TSE continuam disponíveis por seus próprios códigos para tabelas e análises que não exijam vínculo IBGE. As 181 localidades `ZZ` ficam fora da correspondência e não são atribuídas a uma UF brasileira.

A tabela compartilhada é `dados/referencia/correspondencia_tse_ibge_municipios_2022.csv`. Ela mantém uma linha de auditoria para cada código municipal TSE, inclusive os casos sem vínculo e fora do escopo geográfico. A regra não altera as exceções aprovadas especificamente para o produto coberto por EL0002.

## Consequências

- Mapas municipais que dependem da malha IBGE e agregações por Região Imediata não cobrem os 59 municípios sem vínculo; a cobertura deve ser visível e não pode ser apresentada como completa.
- Métricas e tabelas no nível municipal podem manter esses registros, pois usam o código municipal TSE sem convertê-lo para IBGE.
- A API do IBGE é corrente; o snapshot de 2026-10-03 foi autorizado e versionado. Sua compatibilidade com a edição municipal de 2022 precisa ser verificada antes de declarar as geometrias e regiões validadas.
- Revisões futuras da regra ou inclusão de correspondências pontuais exigem novo registro e aprovação humana.

## Afeta

- Datasets: `tse.detalhe_votacao_munzona`, `tse.votacao_candidato_munzona`, `ibge.municipios_regiao_imediata`, `ibge.malha_municipios_2022`
- Código: `nucleo/labdados/territorio.py`, `ferramentas/correspondencia_tse_ibge.py`
- Referência: `dados/referencia/correspondencia_tse_ibge_municipios_2022.csv`
- Produtos: produtos eleitorais que relacionem municípios TSE e IBGE
