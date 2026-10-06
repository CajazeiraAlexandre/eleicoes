# Dicionário preliminar — candidaturas

**Fonte:** Tribunal Superior Eleitoral (TSE), [Candidatos — 2022](https://dadosabertos.tse.jus.br/dataset/candidatos-2022)  
**Arquivo:** `consulta_cand_2022_PI.csv` — Piauí  
**Leia-me oficial:** `leiame.pdf`, incluído no ZIP  
**Estado:** campos usados no seletor conferidos com `tse.votacao_secao`; padronização ainda pendente.

## Campos utilizados pelo produto

| Variável | Uso |
|---|---|
| `SQ_CANDIDATO` | Chave de vínculo com a votação |
| `CD_CARGO`, `DS_CARGO` | Identificação e filtro de cargo |
| `NR_CANDIDATO` | Número de campanha |
| `NM_CANDIDATO`, `NM_URNA_CANDIDATO` | Busca e apresentação do nome |
| `NR_PARTIDO`, `SG_PARTIDO`, `NM_PARTIDO` | Filtro e apresentação do partido |

O ZIP bruto contém outros campos não necessários ao produto, inclusive identificadores pessoais. Eles não serão copiados para os dados derivados nem servidos pela aplicação.
