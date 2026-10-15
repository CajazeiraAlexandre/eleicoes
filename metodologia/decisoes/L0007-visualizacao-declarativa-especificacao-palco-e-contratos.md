# L0007 — Visualização declarativa: especificação, palco e moldura, contrato de componentes e de dados

- **Escopo:** laboratório (tipo `visualizacao`, renderizador e gerador comuns, `design/padrao/`, `web/componentes/`)
- **Status:** aprovada
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador) — decisões D1, D2, D3, D8 e D12 da proposta
- **Complementa:** [L0002](L0002-produtos-autocontidos-calculo-hibrido.md), [L0003](L0003-design-system-componentes-e-bloco-de-metodologia.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) fez o diagnóstico, redigiu a proposta
  ([`docs/propostas/2026-10-10_visualizacao-declarativa.html`](../../docs/propostas/2026-10-10_visualizacao-declarativa.html), versão 3)
  e este registro; as decisões são do pesquisador.

## Contexto
Cada produto do laboratório é hoje um pequeno app: o story *Onde a Rouanet acontece* tem cerca de 1.000 linhas próprias
(`app.js`, `prancha.py`, `preparar.py`). Esse código é refeito, revisado e corrigido a cada produto. Os componentes `Lab.*`
têm interfaces diferentes entre si, e o catálogo do DS diz *quando* usar cada gráfico, mas não *o que entra* nem *o que sai*.
O tipo `visualizacao` estava definido em poucas linhas e sem nenhum produto.

## Opções consideradas
- **D1 · Formato da especificação:** (a) YAML validado por esquema; (b) Markdown com cabeçalho YAML; (c) JSON puro.
- **D2 · Onde o cálculo acontece:** (a) tudo pré-calculado em Python para todos os estados; (b) Python agrega e o JS filtra
  com paridade testada; (c) consulta no navegador (DuckDB-WASM).
- **D3 · Palco, moldura e hospedeiros:** separar a peça em palco (igual em todo lugar) e moldura (do hospedeiro), ou manter
  uma página por produto.
- **D8 · Contrato de componentes:** (a) `componentes.yaml` separado + adaptadores `Lab.grafico`; (b) estender o `design.yaml`;
  (c) reescrever os componentes.
- **D12 · Dados de fora (CSV):** (a) só na última fase, pela porta do manifesto; (b) desde já, para uso interno.

## Decisão
1. **Especificação (D1, com ajuste do pesquisador):** `viz.yaml` **ou** `viz.json`, com o mesmo esquema
   (`nucleo/labdados/esquemas/visualizacao.schema.json`), validada antes de gerar. O formulário de novo produto é a forma
   de preencher; o Markdown fica para o briefing e as notas.
2. **Cálculo (D2-a, com D2-b como saída):** o recorte é pré-calculado em Python para todos os estados dos controles. Quando
   os estados explodirem, o Python agrega e o JS filtra com função Python espelho e teste de paridade (L0002). Consulta no
   navegador está descartada.
3. **Palco e moldura (D3):** o **palco** (componente do DS + recorte + estado + cartão de detalhe + anotações) é idêntico em
   todo lugar; a **moldura** (cabeçalho, controles, rodapé, ações) é decidida pelo **hospedeiro**: avulsa, embutida, cartão
   de story/narrativa, relatório exploratório e imagem (lista aberta).
4. **Contrato de componentes (D8-a):** registro `design/padrao/componentes.yaml` (o `design.yaml` continua com as regras
   visuais) e interface comum por adaptadores sobre os `Lab.*` atuais:
   `Lab.grafico(tipo, alvo, {dados, ligacoes, opcoes, estado, formato, representacao})`, que devolve `atualizar`,
   `formato`, `tabela`, `svg` e `destruir`. Para não engessar um DS ainda novo:
   - contrato mínimo: obrigatórios só `implementa`, `papeis` e `tarefas`; o resto tem valor padrão;
   - status `experimental` → `estavel`: um gráfico novo nasce num produto (`extensao`), entra como experimental (uso com
     aviso) e vira estável depois de usado e revisto;
   - listas abertas (tarefas, formatos, anotações, gatilhos, hospedeiros) ficam no DS, não no esquema;
   - o build só é bloqueado por integridade dos dados (coluna inexistente, conferência que não fecha, supressão);
     escolha de forma fora do catálogo gera aviso com justificativa.
5. **Contrato de dados:** recorte em formato longo (tidy) com dicionário de colunas (tipo, unidade, casas, significado do
   nulo) e proveniência (fonte, versão, hash, consulta). O gerador empacota só as colunas usadas. Supressão de pequenos
   números é declarada (`supressao`) e conferida no build. Gráfico, cartão, tabela alternativa, imagem e CSV saem do mesmo recorte.
6. **Dados de fora (D12-a):** CSV externo só na última fase do plano, pela porta do manifesto (URL do arquivo, hash),
   validado por esquema e aprovado como fonte nova (CLAUDE.md 6.1). Bases restritas só agregadas (L0004).

## Consequências
- Peças novas (fase 1 do plano): esquema da especificação, `nucleo/labdados/viz.py` (`python -m labdados.viz`),
  `web/componentes/lab-viz.js`, `design/padrao/componentes.yaml` e adaptadores de `barras100`, `linhas` e `mapa`.
- Os `Lab.*` atuais continuam funcionando; os produtos publicados não migram (migram quando revistos, se valer a pena).
- Antes da fundação, a fase 0 testa a especificação no papel (`docs/arquitetura/teste-de-papel/`): ela deve descrever pelo
  menos 7 de 8 gráficos existentes sem `extensao`.

## Adendo A16 (pesquisador, 2026-10-14)
Componente do próprio produto, já previsto na especificação (`grafico.extensao`): quando o componente não está no
registro do DS, o `viz.yaml` aponta um arquivo JS da pasta do produto (ex.: `src/extensao.js`) que registra
`Lab.viz.adaptadores.<componente>`. O gerador (`labdados.viz.extensao_js`) o embute depois de `lab-viz.js` e recusa
arquivo ausente ou que não registre o adaptador. Sem `extensao`, a página não muda. O componente recebe o mesmo contexto
dos componentes com dados próprios (L0015) e segue os contratos da peça (folha de notas, Baixar ou Compartilhar,
imagem). Primeiro uso: animação da rede federal (`educacao/2026-10_evolucao-rede-federal`). No story, um cartão pode usar o
mesmo componente (`componente` igual a `grafico.componente`, com `grafico.extensao` declarado); o caminho pode apontar
para a extensão de outro produto do projeto (ex.: `../2026-10_evolucao-rede-federal/src/extensao.js`), declarado no
`produto.yaml` (story `educacao/2026-10_governos-e-rede-federal`, 2026-10-14). Se um segundo produto
precisar do mesmo componente, ele é promovido ao registro do DS (proposta ao pesquisador).

## Afeta
- Código (futuro): `nucleo/labdados/viz.py`, `nucleo/labdados/esquemas/`, `web/componentes/lab-viz.js`, `design/padrao/componentes.yaml`
- Documentos: `docs/TIPOS_DE_PRODUTO.md`, `docs/arquitetura/`
- Produtos: nenhum dos existentes; vale para os novos do tipo `visualizacao`
