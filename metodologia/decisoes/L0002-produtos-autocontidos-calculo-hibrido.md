# L0002 — Produtos autocontidos com cálculo híbrido Python/JS

- **Escopo:** laboratório
- **Status:** aprovada
- **Data:** 2026-10-05
- **Aprovado por:** Alexandre (pesquisador)
- **Uso de IA:** Claude (Claude Code, Anthropic) mediu os volumes de dados, propôs as opções e redigiu este ADR; o pesquisador escolheu a opção híbrida e o formato de entrega.

## Contexto

O pesquisador quer compartilhar produtos como HTML que funcione sem a estrutura do laboratório (sem servidor Python, sem o repositório). O produto `2026-10_distribuicao-votos-candidato-pi` dependia de um serviço Python local que calculava percentuais, rankings e Pearson a cada requisição, sobre uma base JSON de 471 MB.

Medição em 2026-10-05 (votação municipal 2022, Brasil): 72% dos 8,3 milhões de pares candidatura × município têm zero voto; sem eles, em CSV enxuto, a base nacional ocupa 49 MB (10 MB compactada); o maior recorte UF × cargo (SP, Deputado Estadual) ocupa 5,5 MB (1,2 MB compactado). Pearson entre ~3.500 candidaturas e ~650 unidades leva milissegundos no navegador.

O princípio 3 do `CLAUDE.md` proibia qualquer cálculo analítico no front-end.

## Opções consideradas

1. **Python pré-calcula tudo; JS só filtra e desenha** — preserva o princípio 3 sem ressalva; arquivos maiores e rígidos (ex.: Pearson por local em cada município exigiria pré-calcular rankings para todas as candidaturas e municípios).
2. **Híbrido** — Python gera e valida a base publicada; JS faz cálculos leves e sob demanda; Python pré-calcula o que deixaria o navegador lento. Flexível e compacto; exige testes de paridade e altera o princípio 3.
3. **DuckDB-WASM + Parquet no navegador** — muito flexível; ~30 MB de motor e não abre com duplo clique (exige servidor). Descartada.

## Decisão

Adotar a opção 2 para este e os próximos produtos do laboratório.

**Formato de entrega padrão:** produto autocontido, que abre com duplo clique, sem servidor. Preferência por um único `index.html` com dados embutidos (compactados quando necessário); bibliotecas de CDN permitidas (seção 5). Pasta com `data/*.js` carregados por `<script>` é alternativa quando o volume não couber em um arquivo; CSV/JSON lidos por `fetch` só funcionam com servidor e não são o padrão.

**Divisão de responsabilidades:**

| Camada | Responsável | Exemplos |
|---|---|---|
| Base publicada | **Python, sempre** | votos por unidade, denominadores (votos válidos), percentuais na menor unidade, códigos e chaves territoriais, junções, tratamento de ausentes, conferências de qualidade |
| Cálculo sob demanda leve | JS permitido | somas para níveis agregados a partir da base, Pearson entre vetores já publicados, ordenações, filtros, escalas de cor |
| Cálculo pesado | Python pré-calcula | o que tornaria a interação perceptivelmente lenta no navegador (referência: > ~200 ms em um notebook comum) |

**Regras para todo cálculo feito em JS:**
- a fórmula é a mesma de uma função Python de referência, documentada e testada (seção 9);
- um teste de paridade compara JS e Python em uma amostra declarada (tolerância declarada no teste; para contagens, zero);
- o JS nunca imputa, corrige ou completa dados: lacunas chegam marcadas da base Python e são exibidas como lacunas;
- parâmetros metodológicos (ex.: mínimo de unidades para Pearson) vêm do `produto.yaml` e são embutidos pelo Python, não fixados no JS.

## Consequências

- O princípio 3 do `CLAUDE.md` passa a ser: separação estrita entre **dados** (Python), **cálculo** (Python, ou JS sob as regras deste ADR) e **apresentação**.
- A rastreabilidade (princípio 4) continua: todo número exibido é reconstruível pelos scripts do repositório, inclusive os calculados em JS, via a função Python de referência.
- Produtos com serviço Python local (ex.: `servir_distribuicao.py`, `servir_convergencia.py`) devem migrar para o formato autocontido quando forem retomados; o código de cálculo passa a gerar os arquivos embutidos.
- Testes de paridade JS×Python passam a fazer parte do ciclo de produto (seção 6.4).

## Afeta
- Documentos: `CLAUDE.md` (princípio 3), `docs/TIPOS_DE_PRODUTO.md` (quando revisado)
- Código: `projetos/eleicoes/analise/preparar_distribuicao_pi.py` (antes `distribuicao_votos.py` e `servir_distribuicao.py`, removidos em 2026-10-06); futuramente `servir_convergencia.py`
- Produtos: `2026-10_distribuicao-votos-candidato-pi` (primeiro a aplicar); `2026-10_convergencia-candidaturas-pi` (rascunho excluído em 2026-10-06)
