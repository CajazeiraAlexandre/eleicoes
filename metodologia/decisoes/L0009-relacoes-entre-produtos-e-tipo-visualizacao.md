# L0009 — Relações entre produtos (promoção e referência) e definição do tipo `visualizacao`

- **Escopo:** laboratório (tipos de produto, `novo.py`, stories, narrativas e exploratórios)
- **Status:** aprovada
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — decisões D9 e D14 da proposta
- **Complementa:** [L0007](L0007-visualizacao-declarativa-especificacao-palco-e-contratos.md), [L0008](L0008-visualizacao-tarefas-formatos-estatico-detalhe-anotacoes-sequencia.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) redigiu a proposta
  ([`docs/propostas/2026-10-10_visualizacao-declarativa.html`](../../docs/propostas/2026-10-10_visualizacao-declarativa.html), seção 10)
  e este registro; as decisões são do pesquisador.

## Contexto
Uma Visualização pode nascer de um gráfico de relatório exploratório (subproduto) e pode ser usada como cartão de story ou
de narrativa. Era preciso decidir quando o vínculo é por cópia e quando é por referência, e redefinir o tipo `visualizacao`
(`docs/TIPOS_DE_PRODUTO.md`), que existia só como esboço.

## Opções consideradas
1. **Referência congelada** para todo uso — uma fonte da verdade; não serve à promoção, em que a origem é rascunho e muda.
2. **Cópia** para todo uso — simples, mas duplica dados e regras e cria duas versões do “mesmo” gráfico.
3. **Pelo sentido da relação** — promoção por cópia com linhagem; uso por referência congelada; palco local quando a peça
   só existe num story.

## Decisão
Opção 3 (D9):
- **Promoção (exploratório → Visualização):** cópia com linhagem. A Visualização nasce como produto próprio, com
  `origem: <projeto>/<exploratorio>@<versão>#<grafico>`, e recebe a validação que o exploratório não exige (conferências,
  ADRs, textos, revisão). No relatório local, cada gráfico tem a ação “Transformar em visualização”, que baixa a
  especificação pré-preenchida e mostra o comando `python -m labdados.viz promover …`. A ação não aparece em nada publicado.
- **Uso (story, narrativa, site → Visualização):** referência `viz: <projeto>/<id>@<edição>` no roteiro, com estado,
  câmera e anotações do cartão. Na geração, a especificação e o recorte daquela edição são **copiados** para dentro do HTML
  (o produto continua autocontido, L0002), com os hashes num `story.lock.json`. Cartões seguidos com a mesma peça
  transformam o palco; se a peça tem sequência, o story pode desdobrar os passos em cartões ou usar um só.
- **Palco local:** peça que só existe no story, declarada no roteiro com a mesma sintaxe; pode ser promovida depois.
- O inventário registra que Visualizações cada produto usa e em que edição, para saber de onde veio cada palco, não para
  propagar mudanças (L0010).

Tipo `visualizacao` (D14): definição atualizada em `docs/TIPOS_DE_PRODUTO.md`:
- uma pergunta, uma tarefa principal e um gráfico (com um companheiro opcional, L0011);
- controles nos limites da L0011 (2 no título, 3 em título + gráfico, 5 no Explorar) e até quatro passos;
- formatos declarados, representação estática e rodapé mínimo.

Os pilotos só começam depois da fase 0: um palco do story *Onde a Rouanet acontece* e uma peça de Eleições promovida de
um exploratório.

## Consequências
- Responde às questões em aberto 2 (produto derivado: `origem:`) e 4 (exploratório “gradua” por promoção, com ID novo) do
  `docs/TIPOS_DE_PRODUTO.md`.
- Fase 3 do plano: comando `promover`, `lab-story.js` comum e `story.lock.json`. Os stories existentes continuam com app
  próprio até serem revistos.

## Afeta
- Documentos: `docs/TIPOS_DE_PRODUTO.md`
- Código (futuro): `nucleo/labdados/viz.py` (`promover`), `web/componentes/lab-story.js`, `ferramentas/novo.py`
- Produtos: stories e narrativas novos; `projetos/cultura/produtos/2026-10_rouanet-onde-acontece` (piloto)
