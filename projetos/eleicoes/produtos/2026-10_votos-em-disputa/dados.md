# Dados — Onde Lula perdeu espaço e há mais votos em disputa

Gerado por `labdados.viz` a partir de `viz.yaml`. Edição (data da base): 2026-10-09. Fonte: TSE (1º turno de 2026 e de 2022, por local de votação) · base de 09/10/2026.

Produzidos por `projetos/eleicoes/analise/preparar_votos_em_disputa.py`; conferências:
- disputa = abstenções + brancos e nulos + outras, em todo local (relatorio_qualidade_votos_em_disputa.json)
- contas idênticas às do produto de origem (votos_em_disputa, saldo_entre_turnos; testes)

Uma tabela por fatia (`municipio`): `data/locais/<chave>.js` (JSON em gzip e base64, em `window.VIZ_FATIAS[<chave>]`, com `colunas` e `linhas` no formato longo, e os textos com números em `textos`). Índice das chaves em `data/municipios.json`. O CSV de cada fatia sai em ↗ Compartilhar → Baixar dados do gráfico; a base completa se refaz com o script acima.

| Coluna | Tipo | Unidade | Descrição | Ausência significa |
|---|---|---|---|---|
| `id` | rotulo |  | zona e número do local de votação em 2026 (zona-local) |  |
| `local` | rotulo |  | nome do local de votação (cadastro do TSE, 2026) |  |
| `endereco` | texto |  | endereço do local (cadastro do TSE, 2026) |  |
| `bairro` | texto |  | bairro do local (cadastro do TSE, 2026) |  |
| `lat` | geo |  | latitude do local | sem coordenada no cadastro do TSE |
| `lon` | geo |  | longitude do local | sem coordenada no cadastro do TSE |
| `aptos` | medida | eleitores | eleitores aptos no local em 2026 |  |
| `variacao` | medida | p.p. | % dos válidos de Lula em 2026 menos % do grupo de Lula em 2022, no mesmo local (EL0008) |  |
| `disputa` | medida | votos | abstenções + brancos e nulos + votos nas candidaturas fora da disputa Lula × Flávio Bolsonaro |  |
| `abstencoes` | medida | eleitores | eleitores aptos que não votaram em 2026 |  |
| `brancos_nulos` | medida | votos | votos brancos e nulos em 2026 |  |
| `outras` | medida | votos | votos nas demais candidaturas em 2026 (sem Lula e Flávio Bolsonaro) |  |
| `perdas` | medida | votos | votos que Lula tem a menos que o grupo de Lula em 2022 no local (0 se ganhou) | sem par em 2022 |
| `fatia` | medida | % | parte de Lula no ganho somado de Lula e Jair Bolsonaro entre o 1º e o 2º turno de 2022 | sem ganho somado no 2º turno de 2022 |
| `pct_2026` | medida | % | % dos votos válidos de Lula em 2026 |  |
| `votos_2026` | medida | votos | votos de Lula em 2026 |  |
| `destaque` | booleano |  | variação < 0 e votos em disputa ≥ mediana dos locais da cidade |  |

Decisões metodológicas: L0001, L0002, EL0002, EL0003, EL0008, EL0009.
