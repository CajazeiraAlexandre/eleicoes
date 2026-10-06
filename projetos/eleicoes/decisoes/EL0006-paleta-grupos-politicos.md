# EL0006 — Paleta dos grupos políticos

- **Escopo:** projeto eleicoes (paleta semântica; sobrepõe a categórica do design system — CLAUDE.md seção 8)
- **Status:** aprovada (modos claro e escuro)
- **Data:** 2026-10-05
- **Aprovado por:** Alexandre (pesquisador), 2026-10-05
- **Uso de IA:** Claude (Claude Code, Anthropic) rodou o validador de paleta da skill `dataviz` e propôs ajustes; os matizes são escolha do pesquisador.

## Contexto

O pesquisador indicou: PT `#fb8072`, PSD `#8da0cb`, MDB `#a6d854`, PP `#386cb0`, Outros a definir. No validador (superfície clara `#fcfcfb`), essa combinação falha: claridade do MDB fora da faixa, saturação do PSD abaixo do mínimo (lê como cinza) e contraste < 3:1 em quatro cores. Pares vermelho × verde (PT × MDB) também se confundem com deuteranopia quando têm claridade parecida.

## Opções consideradas
1. **Manter os matizes pedidos, ajustando claridade e saturação** até passar no validador. *(recomendada)*
2. Usar as cores exatas pedidas com codificação secundária (rótulos/padrões) — não resolve a saturação do PSD nem o contraste.
3. Paleta categórica do design system — neutra, mas descarta a escolha do pesquisador.

## Decisão

| Grupo | Pedido | Modo claro (validado) | Modo escuro |
|---|---|---|---|
| PT | `#fb8072` → **`#d73027`** (revisão 2026-10-06) | `#d73027` | igual ao claro |
| PSD | `#8da0cb` → **laranja** (revisão 2026-10-06) | `#f28e2b` | igual ao claro |
| MDB | `#a6d854` | `#3d7a18` (verde escuro, separa do PT por claridade) | igual ao claro |
| PP (em 2026: Federação União Progressista) | `#386cb0` | `#22508f` | igual ao claro |
| Outros | — | cinza neutro (token `--cor-texto-suave`) | idem |

Resultado do validador (modo claro, todos os pares): claridade, saturação, separação para daltonismo e piso de visão normal **passam**; contraste do PT (2,5:1) gera aviso → exigência de rótulos diretos e tabela, que o produto já terá.

- Ordem fixa: PT, PSD, MDB, PP, Outros — a cor segue o grupo, nunca a posição no ranking.
- Arquivo: `dados/referencia/cores_grupos_politicos.yaml`, lido pelo script de preparação e embutido no HTML.
- **Modo escuro:** usa as mesmas cores do modo claro; aprovado pelo pesquisador após ver o esboço (2026-10-05). Ressalva registrada: no validador, essas cores não passam todos os testes contra a superfície escura (faixa de claridade); a identidade nunca depende só da cor (legenda, rótulos diretos, tabelas).

## Consequências
- Cores próximas, mas não idênticas, às pedidas; o MDB fica visivelmente mais escuro.
- Identidade nunca só pela cor: legenda + rótulos diretos + tabela.

## Afeta
- Produtos: `2026-10_forcas-politicas-pi`

## Revisão de 2026-10-06 (pesquisador)

PT passou a `#d73027` (indicado pelo pesquisador) e PSD a laranja. Laranja escolhido pelo validador entre cinco candidatos: `#f28e2b` é o único que passa em todos os testes com PT `#d73027`, MDB `#3d7a18` e PP `#22508f` (todos os pares, superfície clara). Avisos registrados: PT × MDB com ΔE 7,3 em deuteranopia (faixa 6–8, permitida com codificação secundária — legenda, rótulos diretos, tabelas) e contraste do laranja 2,4:1 (rótulos e tabela). Laranjas mais claros (`#f5a03c`, `#f7a541`, `#fdae61`) falharam em claridade e/ou separação vermelho × verde.
