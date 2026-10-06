# Dados do TSE

Fonte: <https://dadosabertos.tse.jus.br/>. Arquivos de resultados e candidaturas estão disponíveis no CDN indicado no catálogo. A aquisição salva arquivos originais em `dados/bruto/tse/` e registra URL, hash, tamanho e datas no manifesto.

Exemplos:

```bash
python fontes/tse/baixar.py tse.votacao_candidato_munzona --anos 2022 2024
python fontes/tse/baixar.py tse.votacao_partido_munzona --anos 2022 2024
python fontes/tse/baixar.py tse.detalhe_votacao_munzona --anos 2022 2024
python fontes/tse/baixar.py tse.votacao_secao --anos 2022 2024 --uf PI
python fontes/tse/baixar.py tse.detalhe_votacao_secao --anos 2022
python fontes/tse/baixar.py tse.candidatos --anos 2022 2026
```

Use `--simular` para conferir URLs e destinos sem baixar. Use `--sobrescrever` apenas quando quiser substituir um arquivo local por uma nova versão publicada pelo TSE. Arquivos brutos não são alterados; a padronização e as verificações de esquema são etapas separadas.

`tse.detalhe_votacao_secao` baixa o arquivo nacional publicado no conjunto [Resultados — 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022). A ficha do TSE informa atualização ao fim de cada turno e licença CC BY. O ZIP tem aproximadamente 244 MB; valide o leia-me, os campos e os totais antes de usar seus valores como denominadores.

## Resultados provisórios de 2026

A aplicação oficial publica respostas JWS compactas assinadas. O coletor valida a assinatura EdDSA/Ed25519, consulta a configuração oficial para descobrir os códigos da eleição e dos cargos, e salva os payloads assinados e decodificados em um único snapshot consolidado:

```bash
python -m fontes.tse.coletar_resultados_2026
```

O escopo é resumo por UF no Brasil e resultados por município no Piauí para os cargos aplicáveis. Cada execução substitui `dados/snapshots/tse.resultados_2026_1t/atual.json`; ela **não** mantém uma série temporal de capturas no disco. O coletor só grava após baixar e validar todos os arquivos. Não o execute antes da apuração sem intenção de substituir o snapshot atual. Capturas acima de 50 MB não são salvas automaticamente. Se o arquivo for versionado, commits posteriores ainda conservarão seu conteúdo anterior no histórico do Git.

Referências observadas na aplicação oficial: [página de resultados](https://resultados.tse.jus.br/oficial/app/index.html), [configuração de eleições](https://resultados.tse.jus.br/oficial/comum/config/ele-c.jws) e [chave pública JWS de produção](https://resultados.tse.jus.br/oficial/app/assets/assinatura-jws/prod.jwk.json). A aplicação pode alterar os caminhos e chaves; o coletor verifica a configuração e falha explicitamente se o protocolo esperado mudar.
