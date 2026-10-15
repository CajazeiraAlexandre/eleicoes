# L0006 — Componente de mapa: câmera, interação, camada de referência e fundo opcional

- **Escopo:** laboratório (design system e `web/componentes/lab-mapa.js`, usados por todos os produtos com mapa)
- **Status:** aprovada — **revisada pela [L0013](L0013-revisao-no-celular-fechamento-da-fase-0.md)** em 2026-10-11: um dedo nunca move o mapa (dois dedos movem e ampliam) e mapas de cidade publicados por http(s) podem usar o fundo raster do OpenStreetMap
- **Data:** 2026-10-10
- **Aprovado por:** Alexandre (pesquisador)
- **Complementa:** [L0003](L0003-design-system-componentes-e-bloco-de-metodologia.md)
- **Uso de IA:** Claude (Claude Code, Anthropic) diagnosticou os problemas, redigiu a proposta, testou os provedores de
  fundo e implementou o componente; as decisões são do pesquisador.

## Contexto
O primeiro story com mapas ("Quem lidera o voto no Piauí") desenhou um mapa próprio, fora do design system, e ficou ruim:
o fundo do OpenStreetMap foi bloqueado no navegador do pesquisador (a política de uso dos servidores do OSM recusa
páginas abertas por arquivo — o caso de todo produto autocontido, L0002); não havia zoom, dica nem card; e o mapa
mostrava sempre o estado inteiro, sem como focar um território ou município. Nos produtos de página, o `Lab.mapa`
funcionava bem, mas também não tinha zoom nem câmera. A proposta completa, com o teste dos provedores, está em
`design/propostas/2026-10_componente-mapa.html` e `design/propostas/teste-fundos-mapa.html`.

## Opções consideradas
1. **Um só componente (`Lab.mapa`) ampliado**, com câmera, zoom, card e camadas opcionais, comandado também pelo story.
2. Um componente de mapa próprio para stories — duplicaria regras e já mostrou os problemas acima.
3. Trocar o SVG por um mapa vetorial (MapLibre) em todos os produtos — dependência pesada (~800 KB, WebGL) e a troca
   Mapa | Círculos ficaria muito mais complexa.

Fundo testado em 10/10/2026: OSM padrão (bloqueado para páginas por arquivo), CARTO (passou a exigir chave), Esri cinza
(funciona; pouco detalhe no zoom do estado) e OpenFreeMap Positron vetorial (funciona; avaliado como "muito bom" pelo
pesquisador).

## Decisão
Opção 1, com as escolhas do pesquisador (proposta, perguntas 1–6):
1. **Fundo:** sem fundo de terceiros por padrão; camada de **referência própria** (UFs vizinhas e cidades de referência,
   da malha do IBGE — `labdados.mapa`), que funciona offline. Fundo de terceiros como **opção por produto**:
   `fundo: "vetorial"` (OpenFreeMap + MapLibre GL 4; preferido) ou `fundo: "esri-cinza"`; some sem quebrar o mapa
   quando bloqueado ou offline; atribuição sempre visível.
2. **Arrastar no celular:** no enquadramento inicial, um dedo rola a página (no story, passa o cartão); ampliado, um dedo
   move o mapa; pinça com dois dedos.
3. **Card:** no computador, flutuando perto da unidade; no celular, logo abaixo do desenho.
4. **Câmera no roteiro do story:** editável cartão a cartão, com o modo de edição `?editar=1` ("Copiar câmera"); mudar a
   câmera é ajuste de apresentação e não volta o roteiro para rascunho.
5. **Bolhas:** regra do "fora de escala" do design system, com a exceção declarada `escalaBolhas: "fiel"`.
6. **Zoom ligado em todos os mapas** de uma vez (os produtos existentes são regerados).

Regras detalhadas em `design/padrao/design.yaml › padroes.mapa_camera`.

## Consequências
- `web/componentes/lab-mapa.js`: opções `camera`, `zoom`, `referencia`, `rotulos`, `fundo`, `escalaBolhas`; retorna um
  controle (`camera()`, `redesenhar()`). Compatível com as chamadas existentes.
- `nucleo/labdados/mapa.py`: `referencia_ufs` e `rotulos_municipios` (datasets `ibge.malha_ufs_2022` e
  `ibge.malha_municipios_2022`, que o produto declara ao usá-las).
- `labdados.produto_web.exigir_maplibre`: recusa montar produto com `fundo: "vetorial"` sem o MapLibre no modelo.
- Produtos com `Lab.mapa` (PNCV, Forças políticas, SALIC, Mapa da virada) regerados com zoom; o story "Quem lidera o
  voto no Piauí" deve trocar o mapa próprio pelo `Lab.mapa` (pendente, a pedido do pesquisador).
- Fundo de terceiros depende de internet e de termos de uso de terceiros (OpenFreeMap: gratuito, com atribuição; Esri:
  uso não comercial com atribuição).
