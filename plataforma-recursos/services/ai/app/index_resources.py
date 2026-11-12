"""Operator CLI. Run on trusted snapshots; never accepts public user uploads."""

import argparse
import json
from pathlib import Path

from app.config import Settings
from app.indexer import FaissIndexer
from app.ollama_client import OllamaUnavailable


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Index public educational metadata with Ollama/FAISS"
    )
    parser.add_argument("--index-path", type=Path)
    commands = parser.add_subparsers(dest="operation", required=True)
    for operation in ("sync", "upsert"):
        command = commands.add_parser(operation)
        command.add_argument("snapshot", type=Path)
    commands.add_parser("remove").add_argument("resource_ids", nargs="+")
    args = parser.parse_args()
    indexer = None
    try:
        settings = Settings.from_env()
        indexer = FaissIndexer(args.index_path or settings.faiss_index_path, settings=settings)
        if args.operation == "remove":
            manifest = indexer.remove(args.resource_ids)
        else:
            resources = json.loads(args.snapshot.read_text(encoding="utf-8"))
            if not isinstance(resources, list):
                raise ValueError("snapshot must be a JSON array")
            action = indexer.build if args.operation == "sync" else indexer.reindex
            manifest = action(resources)
        print(
            json.dumps(
                {
                    "version": manifest["version"],
                    "count": len(manifest["items"]),
                    "dimension": manifest["dimension"],
                    "model": manifest["embeddingModel"],
                }
            )
        )
        return 0
    except (OSError, ValueError, RuntimeError, OllamaUnavailable):
        # No tracebacks containing document text, credentials, paths or upstream response bodies.
        parser.exit(1, "Indexing failed. Check configuration, snapshot, model and integrity.\n")
    finally:
        if indexer is not None:
            indexer.close()


if __name__ == "__main__":
    raise SystemExit(main())
