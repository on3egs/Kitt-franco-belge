"""Refresh existing gzip companions so aiohttp serves the deployed source."""
from pathlib import Path
import argparse
import datetime
import gzip
import os
import shutil


def sync(root: Path, backup: Path) -> int:
    root = root.resolve(strict=True)
    changed = 0
    for archive in root.rglob("*.gz"):
        source = archive.with_suffix("")
        if not source.is_file() or source.suffix not in {".html", ".js", ".css", ".json", ".svg"}:
            continue
        if not source.resolve().is_relative_to(root) or not archive.resolve().is_relative_to(root):
            raise ValueError("Static asset escapes configured directory")
        data = source.read_bytes()
        try:
            if gzip.decompress(archive.read_bytes()) == data:
                continue
        except (OSError, EOFError):
            pass
        saved = backup / archive.relative_to(root)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(archive, saved)
        temporary = archive.with_name(archive.name + ".sync-tmp")
        temporary.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
        os.chmod(temporary, archive.stat().st_mode & 0o777)
        os.replace(temporary, archive)
        assert gzip.decompress(archive.read_bytes()) == data
        print(archive.relative_to(root))
        changed += 1
    return changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("static_directory", type=Path)
    parser.add_argument("backup_directory", type=Path, nargs="?")
    args = parser.parse_args()
    backup = args.backup_directory or args.static_directory.resolve().parent / "backups" / (
        "static-gzip-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    )
    print("Updated:", sync(args.static_directory, backup))
