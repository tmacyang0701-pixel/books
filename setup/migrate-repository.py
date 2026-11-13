"""Copy a Books installation into an existing, empty Git repository.

The target keeps its .git/config and receives the source branch history locally.
All working files, including ignored credentials and learning data, are copied
and verified. Nothing is deleted from the source and no remote is contacted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def git(root, *args, required=True):
    result = subprocess.run(
        ["git", "-c", f"safe.directory={root.as_posix()}", "-C", str(root), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if required and result.returncode:
        raise RuntimeError(f"Git {' '.join(args[:2])} failed: {result.stderr.strip()}")
    return result


def inventory(root):
    files, directories = [], []
    for directory, names, filenames in os.walk(root, followlinks=False):
        current = Path(directory)
        if current == root:
            names[:] = [name for name in names if name != ".git"]
        for name in names + filenames:
            entry = current / name
            # A junction/symlink could escape the requested installation.
            if entry.is_symlink() or getattr(entry.lstat(), "st_file_attributes", 0) & 0x400:
                raise RuntimeError(f"Linked path requires separate review: {entry}")
        directories.extend((current / name).relative_to(root) for name in names)
        files.extend((current / name).relative_to(root) for name in filenames)
    return sorted(files), sorted(directories)


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def inspect(source, target):
    # Resolve and validate both roots before any filesystem mutation.
    source, target = source.resolve(strict=True), target.resolve(strict=True)
    if source == target or source in target.parents or target in source.parents:
        raise RuntimeError("Source and target must be separate, non-nested directories.")
    for root in (source, target):
        if not (root / ".git").is_dir() or (root / ".git").is_symlink():
            raise RuntimeError(f"Expected a standalone Git repository: {root}")
        top = Path(git(root, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
        if top != root:
            raise RuntimeError(f"Not a repository root: {root}")
    if git(target, "rev-parse", "--verify", "HEAD", required=False).returncode == 0:
        raise RuntimeError("Target already has commits; inspect/merge its history before migrating.")
    if any(entry.name != ".git" for entry in target.iterdir()):
        raise RuntimeError("Target contains working files; nothing will be overwritten.")
    source_remote = git(source, "remote", "get-url", "origin").stdout.strip()
    target_remote = git(target, "remote", "get-url", "origin").stdout.strip()
    if source_remote.rstrip("/") != target_remote.rstrip("/"):
        raise RuntimeError("Source and target origin URLs differ; nothing was changed.")
    branch = git(source, "symbolic-ref", "--short", "HEAD").stdout.strip()
    if git(target, "symbolic-ref", "--short", "HEAD").stdout.strip() != branch:
        raise RuntimeError("Source and target branches differ; nothing was changed.")
    head = git(source, "rev-parse", "HEAD").stdout.strip()
    files, directories = inventory(source)
    return source, target, branch, head, files, directories


def migrate(source, target, check=False):
    source, target, branch, head, files, directories = inspect(source, target)
    report = {
        "source": str(source), "target": str(target), "branch": branch,
        "commit": head, "files": len(files),
        "bytes": sum((source / name).stat().st_size for name in files),
        "sourceRetained": True,
    }
    if check:
        return dict(report, status="ready")
    config_before = (target / ".git/config").read_bytes()
    # Empty target only: merge imports existing history without a new commit,
    # replacing .git, resetting an existing branch, or changing origin.
    git(target, "-c", f"safe.directory={source.as_posix()}", "fetch", "--no-tags",
        str(source), f"refs/heads/{branch}")
    git(target, "merge", "--ff-only", "FETCH_HEAD")
    for name in directories:
        (target / name).mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, name in enumerate(files, 1):
        original, copied = source / name, target / name
        expected = digest(original)
        copied.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, copied)
        if digest(copied) != expected or digest(original) != expected:
            raise RuntimeError(f"File changed while copying or checksum failed: {name}")
        manifest.append({"path": name.as_posix(), "sha256": expected})
        if index % 500 == 0:
            print(f"Verified {index}/{len(files)} files", flush=True)
    if inventory(source) != (files, directories) or inventory(target) != (files, directories):
        raise RuntimeError("File inventory changed while copying. Source remains intact.")
    if git(source, "rev-parse", "HEAD").stdout.strip() != head:
        raise RuntimeError("Source commit changed while copying. Source remains intact.")
    if git(target, "rev-parse", "HEAD").stdout.strip() != head:
        raise RuntimeError("Target commit did not match the source.")
    if (target / ".git/config").read_bytes() != config_before:
        raise RuntimeError("Target Git configuration changed unexpectedly.")
    git(target, "fsck", "--connectivity-only")
    report.update(status="copied-and-verified", checksumsVerified=True)
    # Kept inside the existing Git metadata so credentials/data stay untracked.
    (target / ".git/books-migration-report.json").write_text(
        json.dumps(dict(report, manifest=manifest), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--target", type=Path, default=Path("D:/books-angent"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(migrate(args.source, args.target, args.check), ensure_ascii=False, indent=2))
    except (OSError, RuntimeError) as error:
        print(f"[STOP] {error}\nSource files were retained. Do not delete either folder.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
