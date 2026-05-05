#!/usr/bin/env python3
"""Povoamento de recursos na plataforma.

Estrutura do diretório de entrada:
  a) Apenas ficheiros → cada ficheiro é um recurso.
  b) Subpastas       → cada subpasta é um recurso (pode ter vários ficheiros).

Metadados opcionais via metadata.csv na raiz do diretório:
  key,titulo,tipo,visibilidade,subtitulo,descricao,tema,ano,hashtags
  (key = nome do ficheiro ou subpasta)

Exemplos:
  python3 seed_resources.py data/recursos --token <TOKEN>
  python3 seed_resources.py data/recursos --token <TOKEN> --dry-run
  python3 seed_resources.py data/recursos --token <TOKEN> --verificar
  python3 seed_resources.py data/recursos --token <TOKEN> --limpar
  python3 seed_resources.py data/recursos --token <TOKEN> --limpar --aplicar
"""
from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import requests

URL_BASE = "http://localhost:16020"
TIPO_OMISSAO = "artigo"
VISIBILIDADE_OMISSAO = "publico"
LIMITE_FICHEIRO_MB = 50
LIMITE_TOTAL_MB = 100
MAX_FICHEIROS_POR_RECURSO = 20


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def cabecalho_auth(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def obter_token(base_url: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{base_url}/auth/sessions",
        json={"username": username, "password": password},
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"Login falhou ({resp.status_code}): {resp.text}")
    token = resp.json().get("token")
    if not token:
        raise RuntimeError("Login não devolveu token.")
    return str(token)


def resolver_token(args: argparse.Namespace) -> str:
    if args.token:
        return args.token
    if args.admin_username and args.admin_password:
        return obter_token(args.base_url, args.admin_username, args.admin_password)
    raise RuntimeError("É necessário --token ou (--admin-username + --admin-password).")


# ---------------------------------------------------------------------------
# Ficheiros e metadados
# ---------------------------------------------------------------------------

def corrigir_encoding(valor: str) -> str:
    """Corrige mojibake latin1→utf-8 comum em nomes de ficheiros."""
    try:
        return valor.encode("latin1").decode("utf-8")
    except UnicodeError:
        return valor


def normalizar_nome_ficheiro(valor: str) -> Set[str]:
    """Devolve variantes normalizadas do basename de um caminho."""
    raw = str(valor or "").replace("\\", "/").strip()
    if not raw:
        return set()
    base = raw.rsplit("/", 1)[-1]
    return {s.strip() for s in (base, corrigir_encoding(base)) if s.strip()}


def titulo_a_partir_do_nome(caminho: Path) -> str:
    return caminho.stem.replace("_", " ").replace("-", " ").strip() or caminho.stem


def carregar_metadata_csv(caminho_csv: Path) -> Dict[str, Dict[str, str]]:
    if not caminho_csv.exists():
        return {}
    dados: Dict[str, Dict[str, str]] = {}
    with caminho_csv.open(newline="", encoding="utf-8") as fh:
        for linha in csv.DictReader(fh):
            chave = (linha.get("key") or linha.get("file") or linha.get("folder") or "").strip()
            if chave:
                dados[chave] = {k: (v or "").strip() for k, v in linha.items()}
    return dados


def detetar_items(diretorio: Path, nome_csv: str) -> Tuple[str, List[Path]]:
    """Devolve ('pasta', subpastas) ou ('ficheiro', ficheiros)."""
    subpastas = sorted(p for p in diretorio.iterdir() if p.is_dir())
    if subpastas:
        return "pasta", subpastas
    ficheiros = sorted(p for p in diretorio.iterdir() if p.is_file() and p.name != nome_csv)
    return "ficheiro", ficheiros


def recolher_ficheiros(item: Path, modo: str) -> List[Path]:
    if modo == "pasta":
        return [p for p in sorted(item.rglob("*")) if p.is_file()]
    return [item]


def aplicar_filtro_only(items: List[Path], args: argparse.Namespace) -> List[Path]:
    apenas: Set[str] = {s.strip() for s in args.only.split(",") if s.strip()}
    if args.only_file and Path(args.only_file).exists():
        apenas |= {l.strip() for l in Path(args.only_file).read_text(encoding="utf-8").splitlines() if l.strip()}
    if not apenas:
        return items
    for em_falta in sorted(apenas - {item.name for item in items}):
        print(f"Aviso: item em --only não encontrado: {em_falta}")
    return [item for item in items if item.name in apenas]


# ---------------------------------------------------------------------------
# Recursos existentes na plataforma
# ---------------------------------------------------------------------------

def obter_todos_recursos(base_url: str, token: str = "") -> List[Dict[str, Any]]:
    headers = cabecalho_auth(token) if token else {}
    recursos: List[Dict[str, Any]] = []
    pagina = 1
    while True:
        resp = requests.get(
            f"{base_url}/api/resources",
            params={"page": pagina, "limit": 50},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        dados = resp.json()
        recursos.extend(dados.get("items") or [])
        if pagina >= int(dados.get("totalPages") or 1):
            return recursos
        pagina += 1


def conjuntos_existentes(recursos: List[Dict[str, Any]]) -> Tuple[Set[str], Set[str]]:
    """Devolve (títulos, nomes originais de ficheiros) de todos os recursos."""
    titulos: Set[str] = set()
    originais: Set[str] = set()
    for r in recursos:
        titulo = r.get("metadata", {}).get("resource", {}).get("titulo")
        if titulo:
            titulos.add(str(titulo).strip())
        for fi in r.get("metadata", {}).get("submissao", {}).get("ficheiros") or []:
            originais |= normalizar_nome_ficheiro(str(fi.get("nomeOriginal") or ""))
    return titulos, originais


# ---------------------------------------------------------------------------
# Ingestão
# ---------------------------------------------------------------------------

def validar_tamanhos(ficheiros: List[Path], max_ficheiro: int, max_total: int) -> List[str]:
    erros = []
    if len(ficheiros) > MAX_FICHEIROS_POR_RECURSO:
        erros.append(f"demasiados ficheiros: {len(ficheiros)} > {MAX_FICHEIROS_POR_RECURSO}")
    for f in ficheiros:
        tamanho = f.stat().st_size
        if tamanho > max_ficheiro:
            erros.append(f"{f.name}: {tamanho/1e6:.1f} MB > {max_ficheiro/1e6:.0f} MB")
    total = sum(f.stat().st_size for f in ficheiros)
    if total > max_total:
        erros.append(f"total: {total/1e6:.1f} MB > {max_total/1e6:.0f} MB")
    return erros


def enviar_simples(base_url: str, token: str, payload: Dict[str, str],
                   ficheiros: List[Path]) -> Tuple[bool, str, str]:
    handles = []
    multipart = []
    try:
        for fp in ficheiros:
            mime = mimetypes.guess_type(fp.name)[0] or "application/octet-stream"
            fh = fp.open("rb")
            handles.append(fh)
            multipart.append(("ficheiros", (fp.name, fh, mime)))
        resp = requests.post(
            f"{base_url}/api/oais/ingest/simples",
            files=multipart, data=payload,
            headers=cabecalho_auth(token),
            timeout=60,
        )
    finally:
        for fh in handles:
            fh.close()

    if resp.ok:
        dados = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
        return True, dados.get("resourceId") or dados.get("recursoId") or "?", ""
    try:
        msg = json.dumps(resp.json(), ensure_ascii=False)
    except Exception:
        msg = resp.text
    return False, "", f"HTTP_{resp.status_code}: {msg}"


def enviar_sip(base_url: str, token: str, pasta_recurso: Path) -> Tuple[bool, str, str]:
    manifesto = pasta_recurso / "manifest.json"
    pasta_data = pasta_recurso / "data"
    if not manifesto.exists():
        return False, "", "manifest.json em falta"
    if not pasta_data.is_dir():
        return False, "", "pasta data/ em falta"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    zip_path = Path(tmp.name)
    tmp.close()
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(manifesto, "manifest.json")
            for opcional in ("bagit.txt", "checksums.txt"):
                if (pasta_recurso / opcional).exists():
                    zf.write(pasta_recurso / opcional, opcional)
            for fp in pasta_data.rglob("*"):
                if fp.is_file():
                    zf.write(fp, fp.relative_to(pasta_recurso).as_posix())
        with zip_path.open("rb") as fh:
            resp = requests.post(
                f"{base_url}/api/oais/ingest",
                files={"sip": (zip_path.name, fh, "application/zip")},
                headers=cabecalho_auth(token),
                timeout=60,
            )
    finally:
        zip_path.unlink(missing_ok=True)

    if resp.ok:
        dados = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
        return True, dados.get("resourceId") or dados.get("recursoId") or "?", ""
    try:
        msg = json.dumps(resp.json(), ensure_ascii=False)
    except Exception:
        msg = resp.text
    return False, "", f"HTTP_{resp.status_code}: {msg}"


def ingerir(args: argparse.Namespace, token: str, diretorio: Path) -> int:
    modo, items = detetar_items(diretorio, args.metadata_csv)
    items = aplicar_filtro_only(items, args)
    metadata = carregar_metadata_csv(diretorio / args.metadata_csv)

    omissoes = {k: v for k, v in {
        "tipo": args.tipo, "visibilidade": args.visibilidade,
        "tema": args.tema, "ano": args.ano, "hashtags": args.hashtags,
    }.items() if v}

    max_ficheiro = int(args.max_ficheiro_mb * 1024 * 1024)
    max_total = int(args.max_total_mb * 1024 * 1024)

    titulos_existentes: Set[str] = set()
    originais_existentes: Set[str] = set()
    if not args.permitir_duplicados:
        titulos_existentes, originais_existentes = conjuntos_existentes(
            obter_todos_recursos(args.base_url, token)
        )

    total = ok = ignorados = 0
    falhas: List[Tuple[str, str]] = []

    for item in items:
        total += 1
        ficheiros = recolher_ficheiros(item, modo)

        if not ficheiros:
            print(f"\n==> {item.name}\n  ERRO: sem ficheiros")
            falhas.append((item.name, "SEM_FICHEIROS"))
            continue

        override = metadata.get(item.name, {})
        titulo = override.get("titulo") or titulo_a_partir_do_nome(item)
        payload = {**omissoes, **{k: v for k, v in override.items() if v}, "titulo": titulo}

        print(f"\n==> {item.name}  [{len(ficheiros)} ficheiro(s)]  título: {titulo}")

        if not args.permitir_duplicados:
            duplicado = (titulo in titulos_existentes) if modo == "pasta" else \
                        any(normalizar_nome_ficheiro(f.name) & originais_existentes for f in ficheiros)
            if duplicado:
                print("  IGNORADO: já existe na plataforma")
                ignorados += 1
                continue

        erros = validar_tamanhos(ficheiros, max_ficheiro, max_total)
        if erros:
            for e in erros:
                print(f"  ERRO local: {e}")
            falhas.append((item.name, "LIMITE_TAMANHO"))
            continue

        if args.dry_run:
            print("  OK (simulação)")
            ok += 1
            continue

        sucesso, resource_id, erro = (
            enviar_sip(args.base_url, token, item)
            if args.sip_mode
            else enviar_simples(args.base_url, token, payload, ficheiros)
        )

        if sucesso:
            print(f"  OK: resourceId={resource_id}")
            ok += 1
        else:
            print(f"  ERRO: {erro}")
            falhas.append((item.name, erro))

    imprimir_resumo(total, ok, ignorados, falhas)
    return 0 if ok + ignorados == total else 2


# ---------------------------------------------------------------------------
# Verificação
# ---------------------------------------------------------------------------

def verificar(args: argparse.Namespace, token: str, diretorio: Path) -> int:
    modo, items = detetar_items(diretorio, args.metadata_csv)
    metadata = carregar_metadata_csv(diretorio / args.metadata_csv)

    esperados = []
    for item in items:
        override = metadata.get(item.name, {})
        ficheiros = recolher_ficheiros(item, modo)
        esperados.append({
            "chave": item.name,
            "titulo": override.get("titulo") or titulo_a_partir_do_nome(item),
            "ficheiros": [f.name for f in ficheiros],
        })

    recursos = obter_todos_recursos(args.base_url, token)
    titulos_existentes, originais_existentes = conjuntos_existentes(recursos)

    todos_titulos = [r.get("metadata", {}).get("resource", {}).get("titulo") or "" for r in recursos]
    todos_originais = [
        nome
        for r in recursos
        for fi in (r.get("metadata", {}).get("submissao", {}).get("ficheiros") or [])
        for nome in normalizar_nome_ficheiro(str(fi.get("nomeOriginal") or ""))
    ]

    em_falta = [
        e for e in esperados
        if e["titulo"] not in titulos_existentes
        and not any(normalizar_nome_ficheiro(f) & originais_existentes for f in e["ficheiros"])
    ]

    resultado = {
        "esperados": len(esperados),
        "recursos_vistos": len(recursos),
        "encontrados": len(esperados) - len(em_falta),
        "em_falta": [e["chave"] for e in em_falta],
        "titulos_duplicados": {t: c for t, c in Counter(todos_titulos).items() if c > 1},
        "ficheiros_duplicados": {f: c for f, c in Counter(todos_originais).items() if c > 1},
    }

    if args.json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        print(f"Esperados   : {resultado['esperados']}")
        print(f"Vistos      : {resultado['recursos_vistos']}")
        print(f"Encontrados : {resultado['encontrados']}")
        print(f"Em falta    : {len(em_falta)}")
        for e in em_falta:
            print(f"  - {e['chave']}  (título esperado: {e['titulo']})")
        if resultado["titulos_duplicados"]:
            print(f"Títulos duplicados  : {len(resultado['titulos_duplicados'])}")
        if resultado["ficheiros_duplicados"]:
            print(f"Ficheiros duplicados: {len(resultado['ficheiros_duplicados'])}")

    return 0 if not em_falta else 2


# ---------------------------------------------------------------------------
# Limpeza de duplicados
# ---------------------------------------------------------------------------

def chave_recurso(r: Dict[str, Any]) -> str:
    ficheiros = r.get("metadata", {}).get("submissao", {}).get("ficheiros") or []
    nomes = sorted(
        corrigir_encoding(str(fi.get("nomeOriginal") or "").replace("\\", "/").rsplit("/", 1)[-1]).strip()
        for fi in ficheiros
    )
    nomes = [n for n in nomes if n]
    if nomes:
        return "ficheiros:" + "\n".join(nomes)
    titulo = r.get("metadata", {}).get("resource", {}).get("titulo")
    return "titulo:" + str(titulo or r.get("_id"))


def parse_data(valor: Any) -> datetime:
    if not valor:
        return datetime.min
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return datetime.min


def limpar(args: argparse.Namespace, token: str) -> int:
    recursos = obter_todos_recursos(args.base_url, token)

    grupos: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in recursos:
        grupos[chave_recurso(r)].append(r)

    plano = []
    for grupo in grupos.values():
        if len(grupo) < 2:
            continue
        ordenados = sorted(grupo, key=lambda r: parse_data(r.get("createdAt")), reverse=True)
        manter = ordenados[0]
        for r in ordenados[1:]:
            plano.append({
                "apagar": r.get("_id"),
                "manter": manter.get("_id"),
                "titulo": r.get("metadata", {}).get("resource", {}).get("titulo") or "",
            })

    print(f"Recursos vistos    : {len(recursos)}")
    print(f"Duplicados a apagar: {len(plano)}")
    for item in plano:
        print(f"  apagar {item['apagar']}  |  manter {item['manter']}  |  {item['titulo']}")

    if not args.aplicar:
        print("Simulação: usa --aplicar para apagar efetivamente.")
        return 0

    falhas = []
    for item in plano:
        resp = requests.delete(
            f"{args.base_url}/api/resources/{item['apagar']}",
            headers=cabecalho_auth(token),
            timeout=30,
        )
        if resp.ok:
            print(f"  OK: apagado {item['apagar']}")
        else:
            print(f"  ERRO: {item['apagar']} → {resp.status_code}")
            falhas.append(item["apagar"])

    print(f"Falhas: {len(falhas)}")
    return 0 if not falhas else 2


# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------

def imprimir_resumo(total: int, ok: int, ignorados: int, falhas: List[Tuple[str, str]]) -> None:
    print(f"\nTotal: {total}  |  Sucesso: {ok}  |  Ignorados: {ignorados}  |  Falhas: {len(falhas)}")
    for nome, razao in falhas:
        print(f"  - {nome}: {razao}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input_dir", help="Diretório com ficheiros ou subpastas de recursos")
    parser.add_argument("--base-url", default=URL_BASE, help="URL base do gateway")
    parser.add_argument("--token", default="", help="Token JWT (produtor ou admin)")
    parser.add_argument("--admin-username", default="", help="Username admin (alternativa ao token)")
    parser.add_argument("--admin-password", default="", help="Password admin")

    # Metadados por omissão
    parser.add_argument("--tipo", default=TIPO_OMISSAO, help="Tipo por omissão (artigo|tese|slides|…)")
    parser.add_argument("--visibilidade", default=VISIBILIDADE_OMISSAO, help="publico | privado")
    parser.add_argument("--tema", default="")
    parser.add_argument("--ano", default="")
    parser.add_argument("--hashtags", default="")
    parser.add_argument("--metadata-csv", default="metadata.csv")

    # Filtro
    parser.add_argument("--only", default="", help="Processar apenas estes items (separados por vírgula)")
    parser.add_argument("--only-file", default="", help="Ficheiro com lista de items a incluir")

    # Limites de tamanho
    parser.add_argument("--max-ficheiro-mb", type=float, default=LIMITE_FICHEIRO_MB, metavar="MB")
    parser.add_argument("--max-total-mb", type=float, default=LIMITE_TOTAL_MB, metavar="MB")

    # Comportamento
    parser.add_argument("--permitir-duplicados", action="store_true", help="Não ignora recursos já existentes")
    parser.add_argument("--sip-mode", action="store_true", help="Envia como SIP ZIP (requer manifest.json + data/)")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem enviar dados")

    # Modos alternativos
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument("--verificar", action="store_true", help="Verifica quais recursos locais já estão na plataforma")
    modo.add_argument("--limpar", action="store_true", help="Remove recursos duplicados")
    parser.add_argument("--aplicar", action="store_true", help="Com --limpar: apaga efetivamente")
    parser.add_argument("--json", action="store_true", help="Com --verificar: emite resultado em JSON")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    diretorio = Path(args.input_dir).resolve()

    if not diretorio.is_dir():
        print(f"Diretório inválido: {diretorio}")
        return 1

    try:
        token = resolver_token(args)
    except RuntimeError as exc:
        print(f"ERRO: {exc}")
        return 1

    if args.verificar:
        return verificar(args, token, diretorio)
    if args.limpar:
        return limpar(args, token)
    return ingerir(args, token, diretorio)


if __name__ == "__main__":
    raise SystemExit(main())