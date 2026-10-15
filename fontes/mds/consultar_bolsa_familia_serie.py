"""Série mensal do Bolsa Família / Auxílio Brasil por município (VIS DATA / MI Social, MDS) e cópia local compacta.

    python fontes/mds/consultar_bolsa_familia_serie.py [--inicio 200601] [--fim 202609] [--confirmar-ate-mb 35]

Base: mds.bolsa_familia_municipios_serie (aprovada pelo pesquisador em 2026-10-13, "Laboratório de hipóteses").
Campos (um valor por município e mês; null = campo vazio na API, nunca preenchido):
  qtd_familias_beneficiarias_bolsa_familia_i   famílias beneficiárias do Bolsa Família (até out/2021 e desde mar/2023)
  pab_qtd_fam_benef_i                          famílias beneficiárias do Auxílio Brasil (nov/2021–fev/2023)
  qtd_pessoas_beneficiarias_bolsa_familia_i    pessoas beneficiárias (desde dez/2013; sem o período do Auxílio Brasil)
  qtd_cancelamentos_pbf_i                      cancelamentos no mês, todos os motivos (desde dez/2013)

Formato compacto: `meses` (lista AAAAMM) e, por campo, {codigo_ibge: [valor por mês]}. O código é o do MDS
(6 dígitos, sem o verificador do IBGE). Nada é agregado ou corrigido aqui: a agregação anual fica na análise do projeto.
"""
from __future__ import annotations

import argparse
import datetime as dt

import httpx

from labdados.api import salvar_snapshot, tamanho_estimado
from labdados.manifesto import registrar_consulta

ID = "mds.bolsa_familia_municipios_serie"
API = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial"
CAMPOS = ["qtd_familias_beneficiarias_bolsa_familia_i", "pab_qtd_fam_benef_i",
          "qtd_pessoas_beneficiarias_bolsa_familia_i", "qtd_cancelamentos_pbf_i"]


def meses(inicio: str, fim: str) -> list[str]:
    """Lista de AAAAMM de `inicio` a `fim`, inclusive."""
    a, m = int(inicio[:4]), int(inicio[4:])
    saida = []
    while f"{a}{m:02d}" <= fim:
        saida.append(f"{a}{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return saida


def consultar_mes(cliente: httpx.Client, anomes: str) -> list[dict]:
    params = {"q": "*", "fq": [f"anomes_s:{anomes}", "tipo_s:mes_mu"], "wt": "json", "rows": 10000,
              "fl": ",".join(["codigo_ibge", "sigla_uf", "municipio"] + CAMPOS)}
    for tentativa in range(3):
        try:
            r = cliente.get(API, params=params)
            r.raise_for_status()
            return r.json()["response"]["docs"]
        except httpx.HTTPError:
            if tentativa == 2:
                raise
    return []


def consultar(inicio: str, fim: str) -> dict:
    lista = meses(inicio, fim)
    nomes: dict[str, dict] = {}
    valores: dict[str, dict[str, list]] = {c: {} for c in CAMPOS}
    n = 0
    with httpx.Client(timeout=180, follow_redirects=True) as cliente:
        for i, am in enumerate(lista):
            docs = consultar_mes(cliente, am)
            n += len(docs)
            for d in docs:
                cod = str(d["codigo_ibge"])
                nomes.setdefault(cod, {"uf": d.get("sigla_uf"), "municipio": d.get("municipio")})
                for c in CAMPOS:
                    serie = valores[c].setdefault(cod, [None] * len(lista))
                    serie[i] = d.get(c)
            print(f"  {am}: {len(docs)} registros", flush=True)
    url = f"{API}?q=*&fq=anomes_s:<AAAAMM>&fq=tipo_s:mes_mu&fl={','.join(CAMPOS)}"
    registrar_consulta(ID, url, n_registros=n)
    return {"fonte": API, "consulta_modelo": url, "consultado_em": dt.date.today().isoformat(),
            "meses": lista, "campos": CAMPOS, "municipios": nomes, "valores": valores}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inicio", default="200601")
    ap.add_argument("--fim", default="202609")
    ap.add_argument("--confirmar-ate-mb", type=float, default=0,
                    help="salva sem perguntar se a cópia tiver até este tamanho (aprovação do pesquisador)")
    a = ap.parse_args()
    dados = consultar(a.inicio, a.fim)
    mb = tamanho_estimado(dados)
    print(f"{len(dados['municipios'])} municípios × {len(dados['meses'])} meses; cópia: {mb:.1f} MB")
    if mb <= a.confirmar_ate_mb:   # aprovado em 2026-10-13: cerca de 30 MB, versionado no git
        print(f"cópia local: {salvar_snapshot(ID, dados, confirmado=True)}")
    else:
        print("Cópia NÃO salva: pergunte ao pesquisador (tamanho acima do aprovado).")


if __name__ == "__main__":
    main()
