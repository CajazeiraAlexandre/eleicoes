import base64
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import fontes.tse.coletar_resultados_2026 as coletor
from fontes.tse.coletar_resultados_2026 import (
    eleicoes_gerais_2026,
    montar_endpoints,
    _salvar_snapshot,
    url_resultado,
    verificar_jws,
)


def _base64url(valor: bytes) -> str:
    return base64.urlsafe_b64encode(valor).decode("ascii").rstrip("=")


def _jws_teste(payload: dict, kid: str = "chave-teste") -> tuple[str, dict]:
    chave_privada = Ed25519PrivateKey.generate()
    chave_publica = chave_privada.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    jwk = {
        "kty": "OKP",
        "use": "sig",
        "key_ops": ["verify"],
        "alg": "EdDSA",
        "kid": kid,
        "crv": "Ed25519",
        "x": _base64url(chave_publica),
    }
    protegido = _base64url(json.dumps(
        {"alg": "EdDSA", "kid": kid, "typ": "JOSE"},
        separators=(",", ":"),
    ).encode())
    conteudo = _base64url(json.dumps(payload, separators=(",", ":")).encode())
    assinar = f"{protegido}.{conteudo}".encode("ascii")
    assinatura = _base64url(chave_privada.sign(assinar))
    return f"{protegido}.{conteudo}.{assinatura}", jwk


def test_verificar_jws_assinado_ed25519():
    token, jwk = _jws_teste({"ele": "2026", "v": {"tv": "0"}})

    cabecalho, payload = verificar_jws(token, jwk)

    assert cabecalho["alg"] == "EdDSA"
    assert payload == {"ele": "2026", "v": {"tv": "0"}}


def test_verificar_jws_rejeita_assinatura_invalida():
    token, jwk = _jws_teste({"ele": "2026"})
    partes = token.split(".")
    token_alterado = f"{partes[0]}.{partes[1]}.{_base64url(b'0' * 64)}"

    with pytest.raises(ValueError, match="Assinatura do JWS inválida"):
        verificar_jws(token_alterado, jwk)


def test_verificar_jws_rejeita_chave_com_kid_diferente():
    token, jwk = _jws_teste({"ele": "2026"})
    jwk["kid"] = "outra-chave"

    with pytest.raises(ValueError, match="não corresponde"):
        verificar_jws(token, jwk)


def test_url_resultado_municipal():
    assert url_resultado("ele2026", "6259", "pi", "3", "12327") == (
        "https://resultados.tse.jus.br/oficial/ele2026/6259/"
        "dados/pi/pi12327-c0003-e006259-u.jws"
    )


def test_url_resultado_rejeita_codigo_municipal_invalido():
    with pytest.raises(ValueError, match="Código municipal TSE inválido"):
        url_resultado("ele2026", "6259", "pi", "3", "2200053")


def test_eleicoes_gerais_seleciona_federal_e_estadual_do_primeiro_turno():
    payload = {
        "pl": [
            {
                "c": "ele2026",
                "e": [
                    {"cd": "6257", "nm": "Eleição Ordinária Federal - 2026 1º Turno", "t": "1"},
                    {"cd": "6259", "nm": "Eleição Ordinária Estadual - 2026 1º Turno", "t": "1"},
                    {"cd": "6261", "nm": "Eleição Ordinária Municipal - 2026 1º Turno", "t": "1"},
                    {"cd": "6258", "nm": "Eleição Ordinária Federal - 2026 2º Turno", "t": "2"},
                ],
            }
        ]
    }

    assert [item["cd"] for item in eleicoes_gerais_2026(payload)] == ["6257", "6259"]


def test_montar_endpoints_inclui_ufs_e_municipios_pi():
    federal = {
        "cd": "6257",
        "nm": "Eleição Ordinária Federal - 2026 1º Turno",
        "abr": [{"cd": "br", "cp": [{"cd": "1", "ds": "Presidente"}]}],
    }
    estadual = {
        "cd": "6259",
        "nm": "Eleição Ordinária Estadual - 2026 1º Turno",
        "abr": [{
            "cd": "br",
            "cp": [
                {"cd": "3", "ds": "Governador"},
                {"cd": "5", "ds": "Senador"},
                {"cd": "6", "ds": "Deputado Federal"},
                {"cd": "7", "ds": "Deputado Estadual"},
                {"cd": "8", "ds": "Deputado Distrital"},
            ],
        }],
    }
    territorios = {
        "6257": {"abr": [
            {"cd": "pi", "mu": [{"cd": "12327"}]},
            {"cd": "df", "mu": [{"cd": "97012"}]},
        ]},
        "6259": {"abr": [
            {"cd": "pi", "mu": [{"cd": "12327"}]},
            {"cd": "df", "mu": [{"cd": "97012"}]},
        ]},
    }

    endpoints = montar_endpoints([federal, estadual], territorios)

    assert len(endpoints) == 16
    assert sum(endpoint.nivel == "municipio" for endpoint in endpoints) == 5
    assert any(endpoint.url.endswith("/dados/br/br-c0001-e006257-u.jws") for endpoint in endpoints)
    assert any(endpoint.url.endswith("/dados/df/df-c0008-e006259-u.jws") for endpoint in endpoints)
    assert not any("pi-c0008" in endpoint.url for endpoint in endpoints)
    assert not any("df-c0007" in endpoint.url for endpoint in endpoints)


def test_salvar_snapshot_substitui_unico_arquivo_atual(tmp_path, monkeypatch):
    registros = []

    def registrar_arquivo_falso(
        dataset_id: str, origem: str, caminho: Path, *, tipo: str
    ) -> None:
        registros.append((dataset_id, origem, caminho, tipo))

    monkeypatch.setattr(coletor, "raiz", lambda: tmp_path)
    monkeypatch.setattr(coletor, "registrar_arquivo", registrar_arquivo_falso)

    primeiro = _salvar_snapshot({"versao": 1})
    segundo = _salvar_snapshot({"versao": 2})

    assert primeiro == segundo
    assert json.loads(segundo.read_text(encoding="utf-8")) == {"versao": 2}
    assert list(segundo.parent.iterdir()) == [segundo]
    assert len(registros) == 2


def test_salvar_snapshot_nao_grava_acima_do_limite(tmp_path, monkeypatch):
    registros = []

    def registrar_arquivo_falso(
        dataset_id: str, origem: str, caminho: Path, *, tipo: str
    ) -> None:
        registros.append((dataset_id, origem, caminho, tipo))

    monkeypatch.setattr(coletor, "raiz", lambda: tmp_path)
    monkeypatch.setattr(coletor, "registrar_arquivo", registrar_arquivo_falso)

    with pytest.raises(RuntimeError, match="Nada foi salvo"):
        _salvar_snapshot({"versao": 1}, tamanho_maximo_mb=0)

    assert not (tmp_path / "dados/snapshots/tse.resultados_2026_1t/atual.json").exists()
    assert not registros
