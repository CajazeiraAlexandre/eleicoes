# EL0002 — Correspondência municipal TSE–IBGE para o Piauí

- **Escopo:** projeto `eleicoes`
- **Status:** aprovada
- **Data:** 2026-10-03
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) propôs e implementou a tabela auditável e a geração do GeoJSON; o pesquisador revisou e aprovou os pareamentos excepcionais.

## Contexto

O produto `2026-10_convergencia-candidaturas-pi` precisa relacionar os códigos municipais do TSE usados nos resultados eleitorais de 2022 aos códigos e geometrias da malha municipal do IBGE, para permitir consultas espaciais futuras. A normalização de UF, caixa, acentos e espaços produziu 221 pares únicos em 224 municípios; três diferenças de pontuação impediram a correspondência automática.

Fontes: [resultados eleitorais do TSE de 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022) e [malha municipal do IBGE de 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/BR_Municipios_2022.zip).

## Opções consideradas

1. **Manter apenas pareamentos exatos após normalização de caixa, acentos e espaços** — evita associações ambíguas, mas deixa três municípios sem código IBGE e impede cobertura completa.
2. **Aprovar individualmente os três pares restantes, conferindo código e nome oficial do IBGE** — mantém a regra estrita para os demais nomes, completa a cobertura e deixa as exceções auditáveis.
3. **Remover pontuação de todos os nomes ou aplicar correspondência aproximada** — pode aumentar a cobertura, mas amplia o risco de associações incorretas sem revisão caso a caso.

## Decisão

Adotar a opção 2. Manter pareamento automático apenas quando UF e nome oficial normalizado por caixa, acentos e espaços forem únicos. Não remover pontuação genericamente nem aplicar correspondência aproximada. Aprovar e validar explicitamente estes pares:

| Código municipal TSE | Código municipal IBGE | Nome oficial IBGE |
|---|---|---|
| `10600` | `2201176` | Barra D'Alcântara |
| `12483` | `2207108` | Olho D'Água do Piauí |
| `12718` | `2207793` | Pau D'Arco do Piauí |

A tabela CSV registra método e situação dos 224 pares. A malha GeoJSON só é gerada se cada município TSE tiver exatamente um código IBGE e se o conjunto corresponder às geometrias do Piauí. Esta decisão valida a correspondência e a geometria de suporte; não define a medida, escala ou legenda do mapa.

## Consequências

- A cobertura municipal aprovada passa a ser de 224/224 municípios, com 221 pares únicos normalizados e três exceções explícitas.
- A preparação da base pode incluir o código IBGE; a API municipal devolve esse código junto dos resultados.
- A geometria municipal é reproduzida em `data/municipios_pi.geojson`, sem simplificação.
- A escolha da medida e da escala visual é específica do produto e está registrada em suas decisões locais, sem alterar esta correspondência.

## Afeta

- Datasets: `tse.votacao_secao`, `ibge.malha_municipios_2022`
- Código: `analise/propor_correspondencia_tse_ibge.py`, `analise/preparar_convergencia.py`, `analise/convergencia.py`, `analise/servir_convergencia.py`
- Produto: `produtos/2026-10_convergencia-candidaturas-pi` (rascunho excluído em 2026-10-06; scripts `convergencia.py`, `preparar_convergencia.py` e `servir_convergencia.py` removidos com ele); a correspondência segue em uso em `2026-10_distribuicao-votos-candidato-pi` e `2026-10_forcas-politicas-pi`
