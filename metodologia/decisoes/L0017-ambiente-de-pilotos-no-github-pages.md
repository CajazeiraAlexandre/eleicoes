# L0017 — Ambiente de pilotos e testes no GitHub Pages pessoal

- **Escopo:** laboratório (publicação de produtos em avaliação, de qualquer projeto)
- **Status:** aprovada
- **Data:** 2026-10-12
- **Aprovado por:** Alexandre (pesquisador) — "Você pode criar uma pasta no repositório do meu githubpages com projetos
  piloto-testes, e publica os pilotos lá. Aproveita pra tirar do repositório eleições" (2026-10-12); "Votos em disputa
  → pilotos" (2026-10-12)
- **Complementa:** [L0010](L0010-publicacao-retrato-datado-pacote-enxuto.md) (publicação); Q-018 (teste sem divulgação)
- **Uso de IA:** Claude (Claude Code, Anthropic) implementou o publicador e redigiu este registro; decisão do pesquisador.

## Contexto
Os pilotos de formato (a Visualização "Votos em disputa" e os stories "Onde a Rouanet acontece", "Quem lidera o voto
no Piauí" e "2º turno na sua cidade") precisam ser avaliados "pra valer", no celular e em links reais, antes da versão
definitiva. Até aqui, o único lugar público era o repositório temático (eleicoes), com teste sem divulgação (Q-018), o
que misturava pilotos com produtos definitivos e não servia a produtos de outros projetos (Rouanet, da Cultura).

## Opções consideradas
1. **Pasta `pilotos/` no repositório do GitHub Pages pessoal** (escolhida) — um endereço só para avaliação
   (`https://cajazeiraalexandre.github.io/pilotos/<endereco>/`), de qualquer projeto / o repositório tem gerador
   próprio (gerar.py), então o publicador precisa ficar restrito à pasta.
2. **Teste sem divulgação nos repositórios temáticos** (como era) — já existe / mistura piloto com definitivo e não
   cobre projetos sem repositório público.

## Decisão
1. Produto em avaliação declara `publicacao: {destino: pilotos, endereco, url, teste}` no produto.yaml; `url` é
   `https://cajazeiraalexandre.github.io/pilotos/<endereco>/` (links, prévia do link e assinatura da imagem).
2. `ferramentas/publicar_pilotos.py` copia, para `<repositório do GitHub Pages>/pilotos/<endereco>/`, a página, a
   prévia, os dados que a página carrega e o README, e monta `pilotos/index.html` (fora dos buscadores) e
   `pilotos/README.md`. **Só escreve dentro de `pilotos/`** e só remove pastas que ele mesmo criou (marcador
   `.piloto`). Toda página do ambiente leva o contador sem cookies (L0014; ver adendo).
3. Piloto (`teste: true`, status diferente de `publicado`): selo "Versão de teste" e `noindex`.
4. Os recortes temáticos (ex.: `recorte_eleicoes.py`) ignoram produtos com `destino: pilotos`.
5. O laboratório faz commit nos repositórios de publicação; o envio (push) é do pesquisador.
6. "Votos em disputa" (1.0) saiu do repositório eleicoes e mora no ambiente de pilotos; o endereço antigo
   (`/eleicoes/votos-em-disputa/`) deixa de existir.

## Consequências
- Pilotos de qualquer projeto ganham um lugar público para revisão real, sem tocar no portfólio nem nos recortes
  temáticos. Quando um piloto for aprovado como definitivo, troca `destino` e vai para o repositório do projeto.
- O ambiente de pilotos leva só as páginas (publicação enxuta, L0010): o código que refaz os números fica no
  laboratório até a versão definitiva. Peças fatiadas por cidade pesam (≈ 25 MB cada, com as 5.570 fatias).

## Adendo (pesquisador, 2026-10-14)
O contador de visitas (GoatCounter, sem cookies nem dados pessoais, versão fixa com SRI — L0014, item 7) passa a valer
para **todas as páginas do ambiente de pilotos**, de qualquer projeto e status, e para o índice `pilotos/index.html`.
Usa o `contador` do `projeto.yaml` quando houver; senão, o do laboratório
(`https://cajazeiraalexandre.goatcounter.com/count`). O laboratório local continua sem contador. Motivo: medir o uso
real dos pilotos (ex.: material didático em aula).

## Afeta
- Código: `ferramentas/publicar_pilotos.py`, `ferramentas/recorte_eleicoes.py`
- Produtos: `eleicoes/2026-10_votos-em-disputa`, `eleicoes/2026-10_2-turno-na-sua-cidade`,
  `eleicoes/2026-10_quem-lidera-o-voto-pi`, `cultura/2026-10_rouanet-onde-acontece`
- Repositórios: `CajazeiraAlexandre.github.io` (pasta `pilotos/`), `eleicoes` (sem "Votos em disputa")
