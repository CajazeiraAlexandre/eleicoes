"""Nível de instrução das pessoas de 25 anos ou mais nos Censos 2010 e 2022, por Brasil, Grande Região e UF.

    PYTHONPATH=nucleo:. python fontes/ibge/consultar_escolaridade_censos.py

Base: ibge.censo_escolaridade_25mais (cópia local autorizada pelo pesquisador em 2026-10-14, Q6; < 100 kB).
- Censo 2010: SIDRA 3547, variável 1643 (pessoas), sexo = Total, cada nível de instrução (inclui "Não determinado").
- Censo 2022: SIDRA 10061, variável 2667 (pessoas), grupo de idade = 25 anos ou mais, sexo e cor ou raça = Total.
O Censo 2000 não publica "nível de instrução" (só anos de estudo): fica fora (Q6).
Mesma rotina de consulta e registro de fontes/ibge/consultar_regionais.py.
"""
from __future__ import annotations

import httpx

from fontes.ibge.consultar_regionais import TERRITORIO, consultar
from labdados.api import salvar_snapshot
from labdados.catalogo import raiz

DATASET = "ibge.censo_escolaridade_25mais"
NIVEIS_2010 = {"total": "0", "sem_fund": "9493", "fund": "9494", "medio": "9495", "superior": "99713", "nao_determinado": "11626"}
NIVEIS_2022 = {"total": "120704", "sem_fund": "9493", "fund": "9494", "medio": "9495", "superior": "99713"}
CONSULTAS = (
    [(f"c2010_{k}", "3547", "1643", {"2": "0", "1568": c}, TERRITORIO) for k, c in NIVEIS_2010.items()]
    + [(f"c2022_{k}", "10061", "2667", {"1568": c, "58": "108866", "2": "6794", "86": "95251"}, TERRITORIO)
       for k, c in NIVEIS_2022.items()]
)


def main() -> None:
    with httpx.Client(timeout=180, follow_redirects=True) as cliente:
        destino = salvar_snapshot(DATASET, consultar(DATASET, CONSULTAS, cliente), confirmado=True)  # Q6, 2026-10-14
    print(f"cópia local: {destino.relative_to(raiz())}")


if __name__ == "__main__":
    main()
