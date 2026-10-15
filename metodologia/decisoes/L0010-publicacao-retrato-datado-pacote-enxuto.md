# L0010 — Publicação: retrato datado, pacote enxuto e bibliotecas embutidas

- **Escopo:** laboratório (publicação de todos os produtos; `ferramentas/recorte_eleicoes.py`, `ferramentas/exportar.py`, `labdados.produto_web`)
- **Status:** aprovada
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — decisões D10 e D11 da proposta
- **Complementa:** [L0002](L0002-produtos-autocontidos-calculo-hibrido.md) (amplia o “autocontido” às bibliotecas) e a seção 7 do CLAUDE.md
- **Uso de IA:** Claude (Claude Code, Anthropic) redigiu a proposta
  ([`docs/propostas/2026-10-10_visualizacao-declarativa.html`](../../docs/propostas/2026-10-10_visualizacao-declarativa.html), seção 11)
  e este registro; as decisões são do pesquisador, inclusive o princípio do retrato datado.

## Contexto
Os produtos são publicados no GitHub como páginas simples. O recorte público de Eleições leva também
`design/padrao/design.yaml`, `tokens.css`, `autor/` e boa parte do laboratório (≈ 58 MB), embora os HTML já tragam tudo
embutido. Os produtos dependem de D3, flubber e MapLibre por CDN. E a primeira versão da proposta tratava a peça publicada
como algo a manter sincronizado com a base, o que o pesquisador corrigiu: uma publicação é um **retrato**.

## Opções consideradas
- **D10 · Reprodução no pacote público:** (a) link ao repositório do projeto num commit fixo; (b) script `reproduzir.py`
  gerado por peça; (c) as duas.
- **D11 · Bibliotecas:** (a) embutir no HTML publicado; (b) manter a CDN.

## Decisão
1. **Retrato datado:** uma peça publicada mostra a base numa data declarada no subtítulo ou no rodapé, na imagem e na
   metodologia, e leva embutidos os dados e os componentes com que foi gerada.
   - Ela não se atualiza sozinha, e não há árvore de dependências a percorrer quando uma base muda.
   - Uma nova edição é decisão do autor; a anterior pode ficar arquivada com a sua data (`…/<peça>/<AAAA-MM-DD>/`), com
     aviso de que existe edição mais recente.
   - Peças ligadas a dados ao vivo são exceção: se um dia houver caso, viram tipo próprio.
2. **Pacote em três camadas (D10-a):**
   - **página:** `index.html` autocontido, imagens e código de embed;
   - **dados:** `dados.csv` (o recorte que a peça mostra) e `dados.md` (dicionário, fonte oficial com URL do arquivo,
     data, hash, consulta, fórmulas, conferências e o texto dos ADRs aplicados);
   - **reprodução:** link ao código que refaz os números num commit fixo (o repositório do projeto).
   - **Não vão:** especificações do DS (`design.yaml`, `componentes.yaml`), `viz.yaml`, briefings, propostas, `CLAUDE.md`,
     `autor/` e ferramentas de autoria.
   - O script `reproduzir.py` por peça (opção b) fica para depois, para peças de cadeia curta.
3. **Bibliotecas embutidas (D11-a):** nas peças publicadas, D3 e as demais bibliotecas usadas vão dentro do HTML. CDN
   continua permitida no trabalho local. Fundos de mapa de terceiros seguem opcionais (L0006): o mapa é legível sem eles.

## Consequências
- Fase 4 do plano: separar “pacote de página” e “pacote de reprodução” no `recorte_eleicoes.py` e no `exportar.py`;
  `og:title`, `og:description` e `og:image` com endereço absoluto (a URL pública de cada projeto vira campo do `projeto.yaml`).
- `labdados.produto_web` passa a embutir as bibliotecas na montagem para publicação (+≈ 90 KB comprimidos com o D3 completo).
- Os produtos já publicados não mudam até a próxima edição.
- Como as publicadas levam os componentes embutidos, o DS pode evoluir sem alterar o que já saiu.

## Afeta
- Código (futuro): `ferramentas/recorte_eleicoes.py`, `ferramentas/exportar.py`, `nucleo/labdados/produto_web.py`, `projeto.yaml` (campo de URL pública)
- Produtos: todos os publicados, na próxima edição
