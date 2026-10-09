"""Consulta o Bolsa Família por município no VIS DATA / MI Social (MDS) e salva cópia local.

    python fontes/mds/consultar_bolsa_familia.py [--anomes 202609]

Base: mds.bolsa_familia_municipios (aprovada pelo pesquisador em 2026-10-07, "O mapa da virada").
Campos: codigo_ibge (6 dígitos), sigla_uf, municipio, qtd_familias_beneficiarias_bolsa_familia_i,
qtd_pessoas_beneficiarias_bolsa_familia_i, valor_repassado_bolsa_familia_f.
"""
from __future__ import annotations

import argparse

import httpx

from labdados.api import salvar_snapshot
from labdados.manifesto import registrar_consulta

API = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial"
CAMPOS = ["codigo_ibge", "sigla_uf", "municipio", "anomes_s", "qtd_familias_beneficiarias_bolsa_familia_i",
          "qtd_pessoas_beneficiarias_bolsa_familia_i", "valor_repassado_bolsa_familia_f"]


def consultar(anomes: str) -> dict:
    params = {"q": "*", "fq": [f"anomes_s:{anomes}", "tipo_s:mes_mu"], "wt": "json", "rows": 10000,
              "fl": ",".join(CAMPOS)}
    with httpx.Client(timeout=120, follow_redirects=True) as cliente:
        resposta = cliente.get(API, params=params)
        resposta.raise_for_status()
        docs = resposta.json()["response"]["docs"]
    registrar_consulta("mds.bolsa_familia_municipios", str(resposta.url), n_registros=len(docs))
    return {"fonte": API, "anomes": anomes, "url": str(resposta.url), "municipios": docs}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--anomes", default="202609")
    dados = consultar(ap.parse_args().anomes)
    com_dado = sum(1 for d in dados["municipios"] if (d.get("qtd_familias_beneficiarias_bolsa_familia_i") or 0) > 0)
    print(f"{len(dados['municipios'])} municípios ({com_dado} com famílias beneficiárias) em {dados['anomes']}")
    print(f"cópia local: {salvar_snapshot('mds.bolsa_familia_municipios', dados, confirmado=True)}")  # aprovado em 2026-10-07


if __name__ == "__main__":
    main()
