# Dicionário — `pi.territorios_desenvolvimento`

Arquivo: `dados/referencia/territorios_desenvolvimento_pi.csv` (gerado por `fontes/wikipedia/padronizar_territorios_pi.py`).
Fonte: Wikipédia em português (fonte secundária; revisões fixadas em `dados/bruto/wikipedia/territorios_pi/paginas.json` e no manifesto), que cita SEPLAN-PI, *Territórios de Desenvolvimento do Piauí*. Base legal: LC 87/2007 e Lei 6.967/2017. Licença do texto de origem: CC BY-SA 4.0.

| Variável | Tipo | Descrição | Domínio | Origem |
|---|---|---|---|---|
| `cd_municipio_ibge` | texto (7) | Código IBGE do município | 224 códigos do PI | snapshot `ibge.municipios_regiao_imediata` |
| `nm_municipio` | texto | Nome oficial IBGE | — | idem |
| `territorio` | texto | Território de Desenvolvimento | 12 valores (lista abaixo) | Wikipédia / decisão do pesquisador |
| `ordem_norte_sul` | inteiro | Ordem do território no sentido Norte–Sul | 1–12 | página principal da Wikipédia |
| `nome_na_wikipedia` | texto | Nome como aparece no link da Wikipédia | vazio quando incluído por decisão | Wikipédia |
| `wikipedia_revid` | inteiro | Revisão da página do território | — | API MediaWiki |
| `origem` | texto | `wikipedia`, duplicidade resolvida ou decisão do pesquisador (com data) | — | `territorios_desenvolvimento_pi_excecoes.csv` |

**Territórios (Norte–Sul):** Planície Litorânea, Cocais, Carnaubais, Entre Rios, Vale do Sambito, Vale do Rio Guaribas, Chapada do Vale do Rio Itaim, Vale do Canindé, Serra da Capivara, Vale dos Rios Piauí e Itaueiras, Tabuleiros do Alto Parnaíba, Chapada das Mangabeiras.

**Lacunas da fonte resolvidas pelo pesquisador (2026-10-05):** São Miguel do Fidalgo (duplicado → Vale dos Rios Piauí e Itaueiras); Barras (ausente → Cocais); São Francisco do Piauí (ausente → Vale do Canindé).
