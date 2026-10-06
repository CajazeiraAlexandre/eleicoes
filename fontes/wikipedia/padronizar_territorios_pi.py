"""Tabela município → Território de Desenvolvimento do Piauí, a partir do bruto da Wikipédia.

Entrada: dados/bruto/wikipedia/territorios_pi/paginas.json (baixar_territorios_pi.py)
         dados/snapshots/ibge.municipios_regiao_imediata/<data>.json (nomes e códigos IBGE)
Saída:   dados/referencia/territorios_desenvolvimento_pi.csv

Casamento por nome normalizado (caixa, acentos, espaços — labdados.territorio,
mesma regra de L0001), usando o texto exibido do link e, se não casar, o título
da página sem o qualificador "(Piauí)". Depois aplica as decisões do pesquisador
em EXCECOES (só para municípios duplicados ou ausentes na fonte). Conferências
que interrompem o processo: 224 municípios, nenhum repetido, nenhum sem código
IBGE, 12 territórios, e cada exceção corresponde a um problema real da fonte.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from labdados.catalogo import raiz
from labdados.territorio import normalizar_nome

BRUTO = Path("dados/bruto/wikipedia/territorios_pi/paginas.json")
SNAPSHOT_IBGE = Path("dados/snapshots/ibge.municipios_regiao_imediata")
DESTINO = Path("dados/referencia/territorios_desenvolvimento_pi.csv")
# Decisões do pesquisador para falhas da fonte (duplicidade/ausência); versionado.
EXCECOES = Path("dados/referencia/territorios_desenvolvimento_pi_excecoes.csv")
N_MUNICIPIOS_PI = 224


def municipios_da_pagina(wikitext: str) -> list[tuple[str, str]]:
    """(título da página, texto exibido) de cada link na seção '== Municípios =='."""
    secao = re.split(r"^==\s*Municípios\s*==\s*$", wikitext, flags=re.M)
    if len(secao) != 2:
        raise ValueError("Seção '== Municípios ==' ausente ou repetida.")
    corpo = re.split(r"^==", secao[1], flags=re.M)[0]
    links = []
    for m in re.finditer(r"^\*\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", corpo, flags=re.M):
        titulo = m.group(1).strip()
        links.append((titulo, (m.group(2) or titulo).strip()))
    return links


def _nome_territorio(titulo: str) -> str:
    return re.sub(r"\s*\((Piauí|Território do Piauí)\)$", "", titulo)


def padronizar() -> Path:
    base = raiz()
    bruto = json.loads((base / BRUTO).read_text(encoding="utf-8"))
    snapshot = sorted((base / SNAPSHOT_IBGE).glob("*.json"))[-1]
    ibge = {}
    for m in json.loads(snapshot.read_text(encoding="utf-8")):
        imediata = m.get("regiao-imediata") or {}
        uf = ((imediata.get("regiao-intermediaria") or {}).get("UF") or {}).get("sigla")
        if uf == "PI":
            chave = normalizar_nome(m["nome"])
            if chave in ibge:
                raise ValueError(f"Nome IBGE ambíguo no PI: {m['nome']}")
            ibge[chave] = (str(m["id"]), m["nome"])

    linhas, sem_codigo = [], []
    for ordem, pagina in enumerate(bruto["territorios"], start=1):
        territorio = _nome_territorio(pagina["titulo"])
        for titulo, exibido in municipios_da_pagina(pagina["wikitext"]):
            achado = ibge.get(normalizar_nome(exibido)) or ibge.get(normalizar_nome(re.sub(r"\s*\(Piauí\)$", "", titulo)))
            if achado is None:
                sem_codigo.append((territorio, exibido))
                continue
            linhas.append({"cd_municipio_ibge": achado[0], "nm_municipio": achado[1],
                           "territorio": territorio, "ordem_norte_sul": ordem,
                           "nome_na_wikipedia": exibido, "wikipedia_revid": pagina["revid"],
                           "origem": "wikipedia"})

    ordem_territorio = {l["territorio"]: l["ordem_norte_sul"] for l in linhas}
    with (base / EXCECOES).open(encoding="utf-8") as f:
        for exc in csv.DictReader(f):
            cod, nome = ibge[normalizar_nome(exc["nm_municipio"])]
            atuais = [l for l in linhas if l["cd_municipio_ibge"] == cod]
            if exc["territorio"] not in ordem_territorio:
                raise ValueError(f"Território desconhecido na exceção: {exc['territorio']}")
            if exc["acao"] == "resolver_duplicidade":
                if len(atuais) < 2 or exc["territorio"] not in {l["territorio"] for l in atuais}:
                    raise ValueError(f"Exceção sem duplicidade correspondente na fonte: {exc['nm_municipio']}")
                linhas = [l for l in linhas if l["cd_municipio_ibge"] != cod or l["territorio"] == exc["territorio"]]
                for l in linhas:
                    if l["cd_municipio_ibge"] == cod:
                        l["origem"] = f"wikipedia; duplicidade resolvida por {exc['decidido_por']} em {exc['data']}"
            elif exc["acao"] == "incluir":
                if atuais:
                    raise ValueError(f"Exceção de inclusão para município já presente na fonte: {exc['nm_municipio']}")
                linhas.append({"cd_municipio_ibge": cod, "nm_municipio": nome, "territorio": exc["territorio"],
                               "ordem_norte_sul": ordem_territorio[exc["territorio"]], "nome_na_wikipedia": "",
                               "wikipedia_revid": "", "origem": f"decisão de {exc['decidido_por']} em {exc['data']}"})
            else:
                raise ValueError(f"Ação desconhecida: {exc['acao']}")

    codigos = [l["cd_municipio_ibge"] for l in linhas]
    repetidos = sorted({c for c in codigos if codigos.count(c) > 1})
    faltantes = sorted(set(v[0] for v in ibge.values()) - set(codigos))
    erros = []
    if sem_codigo:
        erros.append(f"sem código IBGE: {sem_codigo}")
    if repetidos:
        erros.append(f"em mais de um território: {repetidos}")
    if faltantes:
        erros.append(f"municípios do PI sem território: {[ibge_nome for c in faltantes for ibge_nome in [next(n for k, (i, n) in ibge.items() if i == c)]]}")
    if len({l['territorio'] for l in linhas}) != 12 or len(set(codigos)) != N_MUNICIPIOS_PI:
        erros.append(f"{len({l['territorio'] for l in linhas})} territórios e {len(set(codigos))} municípios (esperado 12 e {N_MUNICIPIOS_PI})")
    if erros:
        raise ValueError("Conferência falhou — " + " | ".join(erros))

    destino = base / DESTINO
    with destino.open("w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=list(linhas[0]))
        escritor.writeheader()
        escritor.writerows(sorted(linhas, key=lambda l: (l["ordem_norte_sul"], l["nm_municipio"])))
    return destino


if __name__ == "__main__":
    caminho = padronizar()
    print(f"Tabela: {caminho.relative_to(raiz())}")
