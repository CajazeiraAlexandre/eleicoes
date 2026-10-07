"""Coleta e consolida a captura mais recente dos resultados provisórios do TSE."""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from labdados.catalogo import raiz
from labdados.manifesto import registrar_arquivo, registrar_consulta

DATASET_ID = "tse.resultados_2026_1t"
# Presidente, 1º turno, todos os municípios do Brasil (produto "O mapa da virada", aprovado em 2026-10-07):
# guarda só o conteúdo de cada arquivo (assinatura verificada na coleta), fora do git.
DATASET_PRESIDENTE_MUN = "tse.resultados_2026_1t_presidente_municipios"
BASE_OFICIAL = "https://resultados.tse.jus.br/oficial"
URL_CONFIG_ELEICOES = f"{BASE_OFICIAL}/comum/config/ele-c.jws"
URL_JWK_PRODUCAO = f"{BASE_OFICIAL}/app/assets/assinatura-jws/prod.jwk.json"
CICLO = "ele2026"
TURNO = "1"
LIMITE_SNAPSHOT_MB = 50
MAX_WORKERS = 4


@dataclass(frozen=True)
class EndpointResultado:
    """Identifica uma resposta oficial e sua unidade territorial."""

    eleicao_id: str
    eleicao: str
    uf: str
    cargo_id: str
    cargo: str
    municipio_tse: str | None
    nivel: str
    url: str


def _decodificar_base64url(segmento: str) -> bytes:
    if not segmento or not re.fullmatch(r"[A-Za-z0-9_-]+", segmento):
        raise ValueError("Segmento base64url inválido no JWS.")
    return base64.urlsafe_b64decode(segmento + "=" * (-len(segmento) % 4))


def verificar_jws(token: str, jwk: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Valida assinatura EdDSA e devolve (cabeçalho, payload JSON)."""
    partes = token.strip().split(".")
    if len(partes) != 3:
        raise ValueError("JWS deve usar a serialização compacta de três segmentos.")

    cabecalho = json.loads(_decodificar_base64url(partes[0]))
    if not isinstance(cabecalho, dict) or cabecalho.get("alg") != "EdDSA":
        raise ValueError("Algoritmo JWS ausente ou não suportado; esperado EdDSA.")
    if jwk.get("kty") != "OKP" or jwk.get("crv") != "Ed25519" or jwk.get("alg") != "EdDSA":
        raise ValueError("Chave pública JWK incompatível; esperado OKP/Ed25519/EdDSA.")
    if jwk.get("use") != "sig" or "verify" not in jwk.get("key_ops", []):
        raise ValueError("A chave JWK não está autorizada para verificação de assinatura.")
    if cabecalho.get("kid") != jwk.get("kid"):
        raise ValueError("O identificador da chave JWS não corresponde à chave pública.")

    chave = Ed25519PublicKey.from_public_bytes(_decodificar_base64url(str(jwk.get("x", ""))))
    assinatura = _decodificar_base64url(partes[2])
    try:
        chave.verify(assinatura, f"{partes[0]}.{partes[1]}".encode("ascii"))
    except InvalidSignature as erro:
        raise ValueError("Assinatura do JWS inválida.") from erro

    payload = json.loads(_decodificar_base64url(partes[1]))
    if not isinstance(payload, dict):
        raise ValueError("Payload JWS não contém um objeto JSON.")
    return cabecalho, payload


def eleicoes_gerais_2026(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Seleciona os pleitos federal e estadual do primeiro turno de 2026."""
    ciclos = [item for item in config.get("pl", []) if item.get("c") == CICLO]
    if len(ciclos) != 1:
        raise ValueError(f"Configuração TSE deve conter exatamente um ciclo {CICLO}.")

    encontradas: dict[str, dict[str, Any]] = {}
    for eleicao in ciclos[0].get("e", []):
        nome = str(eleicao.get("nm", ""))
        if eleicao.get("t") != TURNO:
            continue
        tipo = "Federal" if "Federal" in nome else "Estadual" if "Estadual" in nome else None
        if tipo is None:
            continue
        if tipo in encontradas:
            raise ValueError(f"Mais de uma eleição {tipo} para o primeiro turno de 2026.")
        encontradas[tipo] = eleicao

    if set(encontradas) != {"Federal", "Estadual"}:
        raise ValueError("A configuração oficial não contém os pleitos federal e estadual esperados.")
    return [encontradas["Federal"], encontradas["Estadual"]]


def _cargos(eleicao: dict[str, Any]) -> list[tuple[str, str]]:
    cargos: dict[str, str] = {}
    for abrangencia in eleicao.get("abr", []):
        for cargo in abrangencia.get("cp", []):
            codigo = str(cargo.get("cd", ""))
            nome = str(cargo.get("ds", ""))
            if not codigo or not nome:
                raise ValueError(f"Cargo incompleto na configuração da eleição {eleicao.get('cd')}.")
            cargos[codigo] = nome
    if not cargos:
        raise ValueError(f"Nenhum cargo encontrado na eleição {eleicao.get('cd')}.")
    return sorted(cargos.items())


def url_resultado(ciclo: str, eleicao_id: str, uf: str, cargo_id: str,
                  municipio_tse: str | None = None) -> str:
    """Monta o caminho de resultados observado na aplicação oficial do TSE."""
    if not re.fullmatch(r"[a-z]{2}", uf):
        raise ValueError(f"Sigla territorial inválida para o endpoint TSE: {uf!r}.")
    if not eleicao_id.isdigit() or not cargo_id.isdigit():
        raise ValueError("Identificadores de eleição e cargo devem ser numéricos.")
    if municipio_tse is not None and not re.fullmatch(r"\d{5}", municipio_tse):
        raise ValueError(f"Código municipal TSE inválido: {municipio_tse!r}.")
    prefixo = f"{uf}{municipio_tse or ''}"
    nome = f"{prefixo}-c{cargo_id.zfill(4)}-e{eleicao_id.zfill(6)}-u.jws"
    return f"{BASE_OFICIAL}/{ciclo}/{eleicao_id}/dados/{uf}/{nome}"


def montar_endpoints(eleicoes: list[dict[str, Any]],
                     configuracoes: dict[str, dict[str, Any]]) -> list[EndpointResultado]:
    """Lista arquivos por UF e por município no Piauí, conforme as configurações TSE."""
    endpoints: list[EndpointResultado] = []
    urls: set[str] = set()

    def adicionar(eleicao: dict[str, Any], uf: str, cargo_id: str, cargo: str,
                  municipio_tse: str | None, nivel: str) -> None:
        eleicao_id = str(eleicao["cd"])
        url = url_resultado(CICLO, eleicao_id, uf, cargo_id, municipio_tse)
        if url not in urls:
            urls.add(url)
            endpoints.append(EndpointResultado(
                eleicao_id=eleicao_id, eleicao=str(eleicao["nm"]), uf=uf,
                cargo_id=cargo_id.zfill(4), cargo=cargo, municipio_tse=municipio_tse,
                nivel=nivel, url=url,
            ))

    for eleicao in eleicoes:
        eleicao_id = str(eleicao["cd"])
        config = configuracoes.get(eleicao_id)
        if config is None:
            raise ValueError(f"Configuração territorial ausente para a eleição {eleicao_id}.")
        abrangencias = config.get("abr")
        if not isinstance(abrangencias, list):
            raise ValueError(f"Lista de abrangências ausente na configuração {eleicao_id}.")
        cargos = _cargos(eleicao)

        if "Federal" in str(eleicao["nm"]):
            cargo_presidente = next((item for item in cargos if item[0] == "1"), None)
            if cargo_presidente is None:
                raise ValueError("Cargo Presidente (código 1) não encontrado na configuração federal.")
            adicionar(eleicao, "br", cargo_presidente[0], cargo_presidente[1], None, "br")

        area_pi: dict[str, Any] | None = None
        for area in abrangencias:
            uf = str(area.get("cd", "")).lower()
            if not re.fullmatch(r"[a-z]{2}", uf):
                raise ValueError(f"Abrangência territorial inválida na configuração {eleicao_id}.")
            for cargo_id, cargo in cargos:
                # DF elege Deputado Distrital (8) e não Deputado Estadual (7).
                if (cargo_id == "8" and uf != "df") or (cargo_id == "7" and uf == "df"):
                    continue
                adicionar(eleicao, uf, cargo_id, cargo, None, "uf")
            if uf == "pi":
                area_pi = area

        if area_pi is None:
            raise ValueError(f"A configuração {eleicao_id} não contém municípios do Piauí.")
        municipios = area_pi.get("mu")
        if not isinstance(municipios, list) or not municipios:
            raise ValueError(f"Lista de municípios do Piauí ausente na configuração {eleicao_id}.")
        cargos_pi = [(codigo, nome) for codigo, nome in cargos if codigo != "8"]
        for municipio in municipios:
            codigo_municipio = str(municipio.get("cd", ""))
            if not codigo_municipio:
                raise ValueError(f"Município sem código TSE na configuração {eleicao_id}.")
            for cargo_id, cargo in cargos_pi:
                adicionar(eleicao, "pi", cargo_id, cargo, codigo_municipio, "municipio")

    return endpoints


def montar_endpoints_presidente_municipios(eleicoes: list[dict[str, Any]],
                                           configuracoes: dict[str, dict[str, Any]]) -> list[EndpointResultado]:
    """Presidente (cargo 1) em todos os municípios do Brasil, conforme a configuração da eleição federal.
    O exterior (abrangência ZZ) fica de fora."""
    federal = next(e for e in eleicoes if "Federal" in str(e["nm"]))
    eleicao_id = str(federal["cd"])
    config = configuracoes.get(eleicao_id)
    if config is None or not isinstance(config.get("abr"), list):
        raise ValueError(f"Configuração territorial ausente para a eleição federal {eleicao_id}.")
    nome_cargo = dict(_cargos(federal)).get("1")
    if nome_cargo is None:
        raise ValueError("Cargo Presidente (código 1) não encontrado na configuração federal.")
    endpoints: list[EndpointResultado] = []
    for area in config["abr"]:
        uf = str(area.get("cd", "")).lower()
        if uf in ("zz", "br"):
            continue
        if not re.fullmatch(r"[a-z]{2}", uf):
            raise ValueError(f"Abrangência territorial inválida na configuração {eleicao_id}.")
        for municipio in area.get("mu") or []:
            codigo = str(municipio.get("cd", ""))
            if not codigo:
                raise ValueError(f"Município sem código TSE em {uf}.")
            endpoints.append(EndpointResultado(
                eleicao_id=eleicao_id, eleicao=str(federal["nm"]), uf=uf, cargo_id="0001", cargo=nome_cargo,
                municipio_tse=codigo, nivel="municipio", url=url_resultado(CICLO, eleicao_id, uf, "1", codigo)))
    if len(endpoints) < 5000:
        raise ValueError(f"Lista de municípios incompleta: {len(endpoints)}.")
    return endpoints


def _solicitar(client: httpx.Client, url: str) -> httpx.Response:
    ultimo_erro: httpx.HTTPError | None = None
    for tentativa in range(3):
        try:
            resposta = client.get(url, params={"nocache": time.time_ns() // 1_000_000})
            resposta.raise_for_status()
            return resposta
        except httpx.HTTPError as erro:
            ultimo_erro = erro
            if tentativa < 2:
                time.sleep(2**tentativa)
    raise RuntimeError(f"Falha ao consultar endpoint oficial: {url}") from ultimo_erro


def _metadados_resposta(resposta: httpx.Response) -> dict[str, str]:
    chaves = ("date", "last-modified", "etag", "content-length")
    return {chave: resposta.headers[chave] for chave in chaves if chave in resposta.headers}


def _obter_jwk(client: httpx.Client) -> dict[str, Any]:
    resposta = _solicitar(client, URL_JWK_PRODUCAO)
    try:
        jwk = resposta.json()
    except ValueError as erro:
        raise RuntimeError("A chave pública do TSE não retornou JSON válido.") from erro
    if not isinstance(jwk, dict):
        raise ValueError("A chave pública do TSE não é um objeto JWK.")
    return jwk


def _obter_payload(client: httpx.Client, url: str,
                   jwk: dict[str, Any]) -> dict[str, Any]:
    resposta = _solicitar(client, url)
    cabecalho, payload = verificar_jws(resposta.text, jwk)
    return {
        "url": url,
        "jws": resposta.text.strip(),
        "cabecalho_jws": cabecalho,
        "payload": payload,
        "cabecalhos_http": _metadados_resposta(resposta),
    }


def _obter_configuracao(client: httpx.Client, url: str,
                        jwk: dict[str, Any]) -> dict[str, Any]:
    return _obter_payload(client, url, jwk)


def _fora_do_git(caminho: Path) -> bool:
    """Indica se o caminho está coberto pelo .gitignore do laboratório."""
    resultado = subprocess.run(
        ["git", "check-ignore", "-q", str(caminho)], cwd=raiz(), check=False,
    )
    return resultado.returncode == 0


def _salvar_snapshot(snapshot: dict[str, Any], tamanho_maximo_mb: float = LIMITE_SNAPSHOT_MB,
                     permitir_grande: bool = False) -> Path:
    destino = raiz() / "dados" / "snapshots" / DATASET_ID / "atual.json"
    conteudo = (json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    tamanho_mb = len(conteudo) / 1_000_000
    if permitir_grande and not _fora_do_git(destino):
        raise RuntimeError("--permitir-grande exige que a pasta do snapshot esteja no .gitignore.")
    if tamanho_mb > tamanho_maximo_mb and not permitir_grande:
        raise RuntimeError(
            f"Snapshot com {tamanho_mb:.1f} MB excede o limite de {tamanho_maximo_mb:.0f} MB. "
            "Nada foi salvo; valide se deve ficar fora do Git ou ser descartado."
        )

    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(".json.part")
    try:
        parcial.write_bytes(conteudo)
        parcial.replace(destino)
    finally:
        parcial.unlink(missing_ok=True)
    registrar_arquivo(DATASET_ID, URL_CONFIG_ELEICOES, destino, tipo="snapshot")
    return destino


def coletar_presidente_municipios(simular: bool = False) -> Path | None:
    """Coleta Presidente, 1º turno, por município (Brasil). Cada arquivo tem a assinatura EdDSA verificada;
    o snapshot guarda o conteúdo (payload) e os metadados, sem repetir o JWS, e fica fora do git."""
    destino = raiz() / "dados" / "snapshots" / DATASET_PRESIDENTE_MUN / "atual.json"
    if not simular and not _fora_do_git(destino):
        raise RuntimeError(f"{destino.parent} precisa estar no .gitignore antes da coleta.")
    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(45.0, connect=20.0)) as client:
        jwk = _obter_jwk(client)
        config_eleicoes = _obter_configuracao(client, URL_CONFIG_ELEICOES, jwk)
        eleicoes = eleicoes_gerais_2026(config_eleicoes["payload"])
        configuracoes = {}
        for eleicao in eleicoes:
            eid = str(eleicao["cd"])
            url = f"{BASE_OFICIAL}/{CICLO}/{eid}/config/mun-e{eid.zfill(6)}-cm.jws"
            configuracoes[eid] = _obter_configuracao(client, url, jwk)["payload"]
        endpoints = montar_endpoints_presidente_municipios(eleicoes, configuracoes)
        if simular:
            print(f"{len(endpoints)} municípios seriam consultados; nenhum foi baixado.")
            for endpoint in endpoints[:5]:
                print(endpoint.url)
            return None

        def baixar(endpoint: EndpointResultado) -> dict[str, Any]:
            r = _obter_payload(client, endpoint.url, jwk)
            return {**asdict(endpoint), "payload": r["payload"], "cabecalho_jws": r["cabecalho_jws"],
                    "cabecalhos_http": r["cabecalhos_http"], "assinatura_verificada": True}

        resultados, erros = [], []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futuros = {executor.submit(baixar, e): e for e in endpoints}
            for futuro in as_completed(futuros):
                try:
                    resultados.append(futuro.result())
                except (RuntimeError, ValueError, httpx.HTTPError) as erro:
                    erros.append((futuros[futuro].url, erro))
        registrar_consulta(DATASET_PRESIDENTE_MUN, f"{BASE_OFICIAL}/{CICLO}/", n_registros=len(resultados))
        if erros:
            raise RuntimeError(f"{len(erros)} de {len(endpoints)} municípios falharam; primeira: {erros[0][0]}: {erros[0][1]}")
    resultados.sort(key=lambda item: item["url"])
    snapshot = {"coletado_em": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "ciclo": CICLO,
                "turno": int(TURNO), "escopo": "Presidente, 1º turno, por município (Brasil, sem exterior)",
                "jwk_publica": jwk, "resultados": resultados}
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(".json.part")
    parcial.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    parcial.replace(destino)
    registrar_arquivo(DATASET_PRESIDENTE_MUN, f"{BASE_OFICIAL}/{CICLO}/", destino, tipo="snapshot")
    print(f"{len(resultados)} municípios com assinatura verificada: {destino.relative_to(raiz())} "
          f"({destino.stat().st_size / 1_000_000:.1f} MB)")
    return destino


def coletar(simular: bool = False, permitir_grande: bool = False) -> Path | None:
    """Baixa, valida e consolida uma captura; --simular lista URLs sem baixá-las."""
    with httpx.Client(
        follow_redirects=True,
        timeout=httpx.Timeout(45.0, connect=20.0),
    ) as client:
        jwk = _obter_jwk(client)
        registrar_consulta(DATASET_ID, URL_JWK_PRODUCAO, n_registros=1)
        config_eleicoes = _obter_configuracao(client, URL_CONFIG_ELEICOES, jwk)
        eleicoes = eleicoes_gerais_2026(config_eleicoes["payload"])
        configuracoes: dict[str, dict[str, Any]] = {}
        snapshots_config = [config_eleicoes]
        for eleicao in eleicoes:
            eleicao_id = str(eleicao["cd"])
            url = f"{BASE_OFICIAL}/{CICLO}/{eleicao_id}/config/mun-e{eleicao_id.zfill(6)}-cm.jws"
            snapshot_config = _obter_configuracao(client, url, jwk)
            configuracoes[eleicao_id] = snapshot_config["payload"]
            snapshots_config.append(snapshot_config)
        registrar_consulta(
            DATASET_ID, URL_CONFIG_ELEICOES, n_registros=len(snapshots_config)
        )

        endpoints = montar_endpoints(eleicoes, configuracoes)
        if simular:
            print(f"{len(endpoints)} arquivos de resultado seriam consultados; nenhum foi baixado.")
            for endpoint in endpoints[:10]:
                print(endpoint.url)
            return None

        def baixar(endpoint: EndpointResultado) -> dict[str, Any]:
            resultado = _obter_payload(client, endpoint.url, jwk)
            return {**asdict(endpoint), **resultado}

        resultados: list[dict[str, Any]] = []
        erros: list[tuple[str, Exception]] = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futuros = {
                executor.submit(baixar, endpoint): endpoint
                for endpoint in endpoints
            }
            for futuro in as_completed(futuros):
                endpoint = futuros[futuro]
                try:
                    resultados.append(futuro.result())
                except (RuntimeError, ValueError) as erro:
                    erros.append((endpoint.url, erro))
        resultados.sort(key=lambda item: item["url"])
        registrar_consulta(
            DATASET_ID, f"{BASE_OFICIAL}/{CICLO}/",
            n_registros=len(resultados),
        )
        if erros:
            primeira_url, primeiro_erro = erros[0]
            raise RuntimeError(
                f"{len(erros)} de {len(endpoints)} endpoints de resultados falharam; "
                f"primeira falha em {primeira_url}: {primeiro_erro}"
            ) from primeiro_erro

    snapshot = {
        "coletado_em": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "ciclo": CICLO,
        "turno": int(TURNO),
        "escopo": "resumo por UF no Brasil e por município no Piauí",
        "jwk_publica": jwk,
        "configuracoes": snapshots_config,
        "resultados": resultados,
    }
    destino = _salvar_snapshot(snapshot, permitir_grande=permitir_grande)
    print(
        f"Captura validada de {len(resultados)} arquivos; snapshot atual substituído: "
        f"{destino.relative_to(raiz())} ({destino.stat().st_size / 1_000_000:.1f} MB)."
    )
    return destino


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--simular", action="store_true",
        help="consulta e valida as configurações, mas não baixa resultados nem salva snapshot",
    )
    parser.add_argument(
        "--permitir-grande", action="store_true",
        help="grava snapshot acima de 50 MB, somente se a pasta estiver no .gitignore (seção 4.2)",
    )
    parser.add_argument(
        "--presidente-municipios", action="store_true",
        help="Presidente, 1º turno, em todos os municípios do Brasil (snapshot separado, fora do git)",
    )
    args = parser.parse_args()
    if args.presidente_municipios:
        coletar_presidente_municipios(simular=args.simular)
    else:
        coletar(simular=args.simular, permitir_grande=args.permitir_grande)


if __name__ == "__main__":
    main()
