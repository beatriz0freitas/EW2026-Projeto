#!/usr/bin/env python3
"""Povoamento simples de recursos na plataforma.

Estrutura do diretório de entrada:
  a) Apenas ficheiros  -> cada ficheiro é um recurso.
  b) Subpastas         -> cada subpasta é um recurso com vários ficheiros.

Exemplos:
  python3 povoamento-recursos.py data/recursos --token <TOKEN>
  python3 povoamento-recursos.py data/recursos --dry-run
  python3 povoamento-recursos.py data/recursos --only ficha1.pdf,ficha2.pdf
"""
from __future__ import annotations

import argparse
import csv
import json
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import requests

URL_BASE = "http://localhost:16020"
METADATA_CSV = "metadata.csv"
TIPO_OMISSAO = "artigo"
VISIBILIDADE_OMISSAO = "publico"
LIMITE_FICHEIRO_MB = 50
LIMITE_TOTAL_MB = 100
MAX_FICHEIROS_POR_RECURSO = 20
EXTENSOES_PERMITIDAS = {
    '',
    '.pdf',
    '.txt',
    '.docx',
    '.xlsx',
    '.xls',
    '.csv',
    '.json',
    '.xml',
    '.md',
    '.ipynb',
    '.py',
    '.js',
    '.ts',
    '.java',
    '.hs',
    '.cpp',
    '.c',
    '.hpp',
    '.h',
    '.css',
    '.html',
    '.yml',
    '.yaml',
    '.ini',
    '.toml',
    '.sql',
    '.vpp',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.svg',
    '.webp',
    '.mp4',
    '.mov',
    '.mp3',
    '.wav',
    '.zip',
    '.rar',
    '.7z',
}


def cabecalho_auth(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def resolver_token(args: argparse.Namespace) -> str:
    if args.token:
        return args.token
    raise RuntimeError("É necessário fornecer --token.")


def titulo_a_partir_do_nome(caminho: Path) -> str:
    return caminho.stem.replace("_", " ").replace("-", " ").strip() or caminho.stem


def nome_base(valor: str) -> str:
    return str(valor or "").replace("\\", "/").rsplit("/", 1)[-1].strip()


def carregar_metadata_csv(diretorio: Path) -> Dict[str, Dict[str, str]]:
    caminho_csv = diretorio / METADATA_CSV
    if not caminho_csv.exists():
        return {}

    dados: Dict[str, Dict[str, str]] = {}
    with caminho_csv.open(newline="", encoding="utf-8") as ficheiro:
        for linha in csv.DictReader(ficheiro):
            chave = (linha.get("key") or linha.get("file") or linha.get("folder") or "").strip()
            if not chave:
                continue
            dados[chave] = {k: (v or "").strip() for k, v in linha.items()}
    return dados


def detetar_items(diretorio: Path) -> Tuple[str, List[Path]]:
    subpastas = sorted(p for p in diretorio.iterdir() if p.is_dir())
    if subpastas:
        return "pasta", subpastas

    ficheiros = sorted(p for p in diretorio.iterdir() if p.is_file() and p.name != METADATA_CSV)
    return "ficheiro", ficheiros


def recolher_ficheiros(item: Path, modo: str) -> List[Path]:
    if modo == "pasta":
        return [p for p in sorted(item.rglob("*")) if p.is_file()]
    return [item]


def filtrar_ficheiros_permitidos(ficheiros: List[Path]) -> Tuple[List[Path], List[Path]]:
    permitidos: List[Path] = []
    ignorados: List[Path] = []

    for ficheiro in ficheiros:
        extensao = ficheiro.suffix.lower()
        if extensao in EXTENSOES_PERMITIDAS:
            permitidos.append(ficheiro)
        else:
            ignorados.append(ficheiro)

    return permitidos, ignorados


def aplicar_filtro_only(items: List[Path], only: str) -> List[Path]:
    nomes = {valor.strip() for valor in only.split(",") if valor.strip()}
    if not nomes:
        return items

    existentes = {item.name for item in items}
    for nome in sorted(nomes - existentes):
        print(f"Aviso: item em --only não encontrado: {nome}")

    return [item for item in items if item.name in nomes]


def obter_todos_recursos(token: str) -> List[Dict[str, Any]]:
    recursos: List[Dict[str, Any]] = []
    pagina = 1

    while True:
        resposta = requests.get(
            f"{URL_BASE}/api/resources",
            params={"page": pagina, "limit": 50},
            headers=cabecalho_auth(token),
            timeout=30,
        )
        resposta.raise_for_status()

        dados = resposta.json()
        recursos.extend(dados.get("items") or [])
        if pagina >= int(dados.get("totalPages") or 1):
            return recursos
        pagina += 1


def conjuntos_existentes(recursos: List[Dict[str, Any]]) -> Tuple[Set[str], Set[str]]:
    titulos: Set[str] = set()
    ficheiros: Set[str] = set()

    for recurso in recursos:
        titulo = str(recurso.get("metadata", {}).get("resource", {}).get("titulo") or "").strip()
        if titulo:
            titulos.add(titulo)

        for ficheiro in recurso.get("metadata", {}).get("submissao", {}).get("ficheiros") or []:
            nome = nome_base(str(ficheiro.get("nomeOriginal") or ""))
            if nome:
                ficheiros.add(nome)

    return titulos, ficheiros


def validar_tamanhos(ficheiros: List[Path], max_ficheiro: int, max_total: int) -> List[str]:
    erros: List[str] = []

    if len(ficheiros) > MAX_FICHEIROS_POR_RECURSO:
        erros.append(f"demasiados ficheiros: {len(ficheiros)} > {MAX_FICHEIROS_POR_RECURSO}")

    for ficheiro in ficheiros:
        tamanho = ficheiro.stat().st_size
        if tamanho > max_ficheiro:
            erros.append(f"{ficheiro.name}: {tamanho / 1e6:.1f} MB > {max_ficheiro / 1e6:.0f} MB")

    tamanho_total = sum(ficheiro.stat().st_size for ficheiro in ficheiros)
    if tamanho_total > max_total:
        erros.append(f"total: {tamanho_total / 1e6:.1f} MB > {max_total / 1e6:.0f} MB")

    return erros


def enviar_recurso(token: str, payload: Dict[str, str], ficheiros: List[Path]) -> Tuple[bool, str, str]:
    handles = []
    multipart = []

    try:
        for ficheiro in ficheiros:
            mime = mimetypes.guess_type(ficheiro.name)[0] or "application/octet-stream"
            handle = ficheiro.open("rb")
            handles.append(handle)
            multipart.append(("ficheiros", (ficheiro.name, handle, mime)))

        resposta = requests.post(
            f"{URL_BASE}/api/oais/ingest/simples",
            files=multipart,
            data=payload,
            headers=cabecalho_auth(token),
            timeout=60,
        )
    finally:
        for handle in handles:
            handle.close()

    if resposta.ok:
        dados = resposta.json() if "application/json" in resposta.headers.get("content-type", "") else {}
        return True, str(dados.get("resourceId") or dados.get("recursoId") or "?"), ""

    try:
        erro = json.dumps(resposta.json(), ensure_ascii=False)
    except Exception:
        erro = resposta.text
    return False, "", f"HTTP_{resposta.status_code}: {erro}"


def imprimir_resumo(total: int, sucesso: int, ignorados: int, falhas: List[Tuple[str, str]]) -> None:
    print(f"\nTotal: {total}  |  Sucesso: {sucesso}  |  Ignorados: {ignorados}  |  Falhas: {len(falhas)}")
    for nome, razao in falhas:
        print(f"  - {nome}: {razao}")


def ingerir(args: argparse.Namespace, token: str, diretorio: Path) -> int:
    modo, items = detetar_items(diretorio)
    items = aplicar_filtro_only(items, args.only)
    metadata = carregar_metadata_csv(diretorio)

    metadados_omissao = {
        "tipo": TIPO_OMISSAO,
        "visibilidade": VISIBILIDADE_OMISSAO,
    }

    max_ficheiro = int(LIMITE_FICHEIRO_MB * 1024 * 1024)
    max_total = int(LIMITE_TOTAL_MB * 1024 * 1024)

    titulos_existentes, ficheiros_existentes = conjuntos_existentes(obter_todos_recursos(token))

    total = 0
    sucesso = 0
    ignorados = 0
    falhas: List[Tuple[str, str]] = []

    for item in items:
        total += 1
        ficheiros, ficheiros_ignorados = filtrar_ficheiros_permitidos(recolher_ficheiros(item, modo))
        if not ficheiros:
            print(f"\n==> {item.name}\n  ERRO: sem ficheiros permitidos")
            if ficheiros_ignorados:
                print(f"  Ignorados por extensão não suportada: {', '.join(f.name for f in ficheiros_ignorados)}")
            falhas.append((item.name, "SEM_FICHEIROS_PERMITIDOS"))
            continue

        override = metadata.get(item.name, {})
        titulo = override.get("titulo") or titulo_a_partir_do_nome(item)
        payload = {
            **metadados_omissao,
            **{chave: valor for chave, valor in override.items() if valor},
            "titulo": titulo,
        }

        print(f"\n==> {item.name}  [{len(ficheiros)} ficheiro(s)]  título: {titulo}")
        if ficheiros_ignorados:
            print(f"  Aviso: ignorados por extensão não suportada: {', '.join(f.name for f in ficheiros_ignorados)}")

        nomes_locais = {ficheiro.name for ficheiro in ficheiros}
        duplicado_por_titulo = titulo in titulos_existentes
        duplicado_por_ficheiros = bool(nomes_locais) and nomes_locais.issubset(ficheiros_existentes)
        duplicado = duplicado_por_titulo or duplicado_por_ficheiros
        if duplicado:
            print("  IGNORADO: já existe na plataforma")
            ignorados += 1
            continue

        erros = validar_tamanhos(ficheiros, max_ficheiro, max_total)
        if erros:
            for erro in erros:
                print(f"  ERRO local: {erro}")
            falhas.append((item.name, "LIMITE_TAMANHO"))
            continue

        if args.dry_run:
            print("  OK (simulação)")
            sucesso += 1
            continue

        ok, resource_id, erro = enviar_recurso(token, payload, ficheiros)
        if ok:
            print(f"  OK: resourceId={resource_id}")
            sucesso += 1
            titulos_existentes.add(titulo)
            ficheiros_existentes.update(ficheiro.name for ficheiro in ficheiros)
        else:
            print(f"  ERRO: {erro}")
            falhas.append((item.name, erro))

    imprimir_resumo(total, sucesso, ignorados, falhas)
    return 0 if sucesso + ignorados == total else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input_dir", help="Diretório com ficheiros ou subpastas de recursos")
    parser.add_argument("--token", default="", help="Token JWT (produtor ou admin)")
    parser.add_argument("--only", default="", help="Processar apenas estes items (separados por vírgula)")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem enviar dados")
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

    return ingerir(args, token, diretorio)


if __name__ == "__main__":
    raise SystemExit(main())