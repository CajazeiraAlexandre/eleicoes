# L0013 — Visualização: decisões da revisão no celular (fechamento da fase 0)

- **Escopo:** laboratório (moldura, legendas, anotações, imagem e mapa de pontos da Visualização; DS)
- **Status:** aprovada
- **Data:** 2026-10-11
- **Aprovado por:** Alexandre (pesquisador) — questões Q-022, Q-040 a Q-044, Q-046, Q-047, Q-049, Q-050 e Q-052 a Q-062 (mais Q-017, Q-018 e Q-051, no briefing do piloto) de
  `docs/arquitetura/questoes.yaml`, decididas ao revisar a bancada no celular (`docs/bancada.html`, publicada como página
  privada para o teste)
- **Complementa:** [L0006](L0006-componente-de-mapa-camera-interacao-fundo.md) (revisa o arrasto com um dedo), [L0008](L0008-visualizacao-tarefas-formatos-estatico-detalhe-anotacoes-sequencia.md), [L0011](L0011-especificacao-v02-vistas-ligados-facetas-controles.md) (revisa o item 2), [L0012](L0012-moldura-no-celular-barra-fixa-imagem-svg-limites-de-texto.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) construiu e ajustou a bancada a cada comentário e redigiu este registro. As
  decisões vieram dos comentários do pesquisador ao usar a bancada no celular.

## Contexto
O passo 5 da fase 0 levou a peça no estado decidido (L0012) para o celular, para o embed e para a imagem PNG, com três casos
reais (T1 composição, T6 votos em disputa com mapa companheiro, S1 sequência). A revisão do pesquisador gerou ajustes de
moldura, legenda, anotação, imagem e mapa.

## Decisão
**Moldura e controles**
1. **Navegação da sequência no topo (Q-040):** ‹ n de N › na linha do chapéu, com botões de 34 px; ‹ desativado no 1º passo;
   depois do último, os controles ficam livres.
2. **Cartão de detalhe com ✕ sempre visível (Q-041):** no canto do próprio cartão, com área de toque de 32 px.
3. **Chapéu curto e leve (Q-042):** até ~32 caracteres e dois itens (ex.: “1º turno de 2026 · Teresina”), sem caixa alta.
   O resto do recorte vai no título, no subtítulo ou em Notas e fontes, e a validação avisa acima do limite.
4. **Legenda recolhida por padrão (Q-043):** “◧ Legenda” abre no lugar, ao lado do gráfico. Na imagem, sempre visível.
5. **CSV em ↗ Compartilhar (Q-044):** “Baixar dados do gráfico (CSV)” com o estado atual (separador “;”, decimal com vírgula,
   UTF-8 com BOM). Onde o download é bloqueado, os dados aparecem para copiar.
6. **Mapa de pontos (Q-053, Q-054):** no mapa fica só a chave **“Tamanho: Fixo | Votos”** (Votos = área proporcional,
   círculos afastados o mínimo). A escolha do fundo fica em ⇄ Explorar, com o fundo ligado por padrão quando houver.

**Legendas**
7. **Toda legenda tem amostra e, quando os itens correspondem a elementos do gráfico, é interativa (Q-046):**
   - passar o mouse ou focar destaca, no gráfico e no companheiro;
   - clicar fixa; clicar de novo ou Esc desfaz;
   - a amostra de cor é do próprio item, sem depender do contêiner (corrige a fragilidade B9 do DS).
8. **Escala divergente em quadrados (Q-050):** cinco quadrados lado a lado, rótulo curto embaixo (65%+, 55–65%…) e os nomes só
   nas pontas (← Bolsonaro · Lula →). A mesma forma vale na imagem.

**Anotações**
9. **Padrão “ao tocar” (Q-047):**
   - o ponto ganha um ⓘ discreto e um anel; o texto abre num balão com ✕;
   - o balão fecha com toque fora, novo toque no ⓘ ou Esc;
   - a especificação pode escolher **rótulo leve** por anotação (`anotacoes[].estilo`), como no T6;
   - o lugar livre é procurado em 8 direções × 7 distâncias, sem cobrir dados nem rótulos;
   - na imagem: rótulo leve; sem lugar livre, nota acima do gráfico. A numerada fica só como último recurso.

**Imagem (PNG)**
10. **Altura flexível com teto (Q-049):** a imagem cresce na vertical o quanto o conteúdo pedir, a partir da base do formato,
    até um teto pensado para redes:

    | Formato | Base | Teto |
    |---|---|---|
    | Retrato | 4:5 | 9:16 |
    | Quadrado | 1:1 | 4:5 |
    | Paisagem | 16:9 | 4:3 |

    Melhor ampliar do que espremer.
11. **Assinatura (Q-022):** fonte e data da base e “**Alexandre Cajazeira** · Saiba mais em **cajazeiraalexandre.github.io**”,
    numa linha se couber. Quando a peça tiver endereço próprio (Q-018), o “Saiba mais” aponta para ele.
12. **A imagem é o que está na tela, inclusive o companheiro (Q-052):** com a aba do companheiro aberta, o PNG sai com ele (no
    T6, o mapa com o fundo de ruas em cinza e a atribuição). A legenda mostra só os itens da vista exportada. **Revisa o item 2
    da L0011**, que dizia “na imagem, só o gráfico principal”.
13. **A imagem leva o estado do momento (Q-055):**
    - o enquadramento do mapa (centro geográfico e zoom, guardados no estado);
    - o destaque fixado na legenda;
    - o local selecionado pelo cartão, com anel e nome, quando cabe no quadro da imagem.

    Vale para o mapa, a dispersão e as barras.
14. **Um dedo nunca move o mapa (Q-056):** com um dedo, a página rola. Mover e ampliar exigem dois dedos (pinça), e um aviso
    aparece se o leitor tentar com um dedo no mapa ampliado. No computador: Ctrl/⌘ + roda e arrastar quando ampliado.
    **Revisa a L0006**, que permitia um dedo depois de ampliar.
15. **O que vai para a imagem, em detalhe (Q-057):**
    - o local em destaque sai com anel, nome **e o número que representa** (no T6: votos em disputa e variação da candidatura);
    - a anotação “ao tocar” **só sai se estiver aberta**; as de rótulo leve, sempre;
    - o item da legenda correspondente ao que está destacado (pela legenda ou por um local escolhido no gráfico ou no mapa)
      sai **marcado**, com contorno e negrito, e os demais esmaecidos.
16. **Tamanho da amostra visível (Q-058):** abaixo do desenho e na imagem, “N = 261 locais de votação · em cor, os 131 em
    destaque”. No mapa: “N = … locais de votação no mapa”, com os locais sem coordenada, quando houver. O texto vem do Python.
17. **Transição entre gráfico e companheiro (Q-059, em teste):**
    - cada círculo se desloca da posição no gráfico para a do mapa, e o inverso, com d3 transition (1 s, `easeCubicInOut`);
    - eixos e linhas somem enquanto fundo, contorno e controles surgem;
    - sem animação com `prefers-reduced-motion`.
18. **Embeds mais altos (Q-060):** os quadros de teste passam a 400×640 (retrato) e 640×560 (quadrado), com a legenda
    recolhida. O código de embed sugere a altura que cabe; o ajuste automático de altura (`postMessage`) fica para a fase 2.
19. **Legenda recolhida também no cartão de story (Q-061).**
20. **Legenda de tamanho obrigatória (Q-062):** sempre que o tamanho dos círculos codifica um valor (mapa em “Tamanho: Votos”,
    bolhas, dispersão por peso), a legenda traz “Área ∝ <medida>” com círculos de referência. Ela acompanha o zoom (raio ÷ √zoom)
    e sai na imagem. No contrato do DS (fase 1): componente que liga o papel `tamanho` gera a legenda de tamanho; a validação
    recusa um tamanho variável sem ela.
21. **Publicação do piloto (Q-017, Q-018, Q-051):**
    - o projeto eleições fica em `https://cajazeiraalexandre.github.io/eleicoes/`;
    - cada peça ganha um nome curto, e o piloto fica em `/eleicoes/votos-em-disputa/`;
    - o teste usa o mesmo endereço, sem divulgação e com selo “versão de teste”;
    - mapas de cidade publicados podem ter o fundo de ruas do OpenStreetMap (raster, em cinza, com atribuição, sumindo sem erro
      quando indisponível). Isso **revisa a L0006** só para esses mapas; nos demais, segue o vetorial.
22. **Decorrência para a fase 1:** a imagem copia o **mesmo desenho SVG da tela** (como na dispersão do T6), em vez de redesenhar
    o gráfico. Na bancada, o redesenho das barras esqueceu a linha de 50%, que a página tinha. Com os gráficos em SVG (L0012),
    o redesenho deixa de ser necessário.

## Ficam em aberto
- **Q-045:** rótulo direto e item de legenda para todo elemento que não é dado (aplicado na bancada; aguarda confirmação).
- **Q-048:** mapa de pontos no componente do DS (o `Lab.mapa` é de polígonos; protótipo `mapa_pontos` na bancada).
- Q-019 a Q-021: publicação (medição de uso, tema do embed, afirmações).

## Consequências
- A fase 0 está concluída. Os critérios de saída (especificação descreve 7 de 8 gráficos; maquetes aprovadas nos formatos e
  nas representações) foram atingidos. Segue a fase 1 (fundação), que parte da especificação v0.2 e destas decisões.
- `docs/arquitetura/especificacao.md` ganha:
  - `anotacoes[].estilo`;
  - o limite do chapéu;
  - a legenda de escala divergente;
  - a imagem com teto;
  - o CSV em Compartilhar.
- A bancada (`ferramentas/bancada.py`, `ferramentas/bancada/`) continua como referência visual e, na fase 1, vira teste visual
  do renderizador.
- A página publicada da bancada embute 75 tiles OSM de Teresina (zooms 11 a 13), só para o teste no claude.ai, que não carrega
  imagens de fora. Os produtos não fazem isso.

## Afeta
- Documentos: `docs/arquitetura/` (especificação, fase 0, questões, glossário, princípios)
- DS (fase 1): `design.yaml › padroes` (moldura, legenda, anotação, imagem), `lab.css` (estilos próprios por componente, `@container`)
- Código (fase 1): `lab-viz.js`, componente experimental `mapa_pontos`
