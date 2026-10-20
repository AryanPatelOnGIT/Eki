"""Create a private evidence ZIP, checking every file before publishing it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def archive_evidence(source, destination, *, exclude=()):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    partial = Path(str(destination) + ".partial")
    checksum = Path(str(destination) + ".sha256")
    if not source.is_dir():
        raise ValueError("Evidence source must be a directory.")
    if destination.is_relative_to(source):
        raise ValueError("Archive must be outside the evidence directory.")
    for output in (destination, partial, checksum):
        if output.exists() or output.is_symlink():
            raise FileExistsError(str(output))
    excluded = set(exclude)
    files = []
    for file in sorted(source.rglob("*")):
        if file.is_symlink():
            raise ValueError("Evidence must not contain symbolic links.")
        relative = file.relative_to(source).as_posix()
        if file.is_file() and relative not in excluded:
            if relative == "SHA256SUMS.json":
                raise ValueError("SHA256SUMS.json is reserved for the archive manifest.")
            files.append(file)
    if not files:
        raise ValueError("Evidence directory is empty.")
    manifest = [dict(path=file.relative_to(source).as_posix(),
        bytes=file.stat().st_size, sha256=sha256(file)) for file in files]
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Stop recorders first. Explicitly exclude a live supervisor's output log;
    # exclusions are retained in the manifest instead of silently losing files.
    with zipfile.ZipFile(partial, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for file, entry in zip(files, manifest):
            bundle.write(file, entry["path"])
        bundle.writestr("SHA256SUMS.json", json.dumps(dict(files=manifest, excluded=sorted(excluded)), indent=2))
    with zipfile.ZipFile(partial) as bundle:
        if bundle.testzip() is not None:
            raise ValueError("ZIP CRC verification failed; partial archive retained.")
        for entry in manifest:
            digest = hashlib.sha256()
            with bundle.open(entry["path"]) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != entry["sha256"]:
                raise ValueError("Evidence changed during archival; partial archive retained.")
    # Atomic publication without overwriting another invocation's archive.
    os.link(partial, destination)
    partial.unlink()
    result = dict(archive=str(destination), sha256=sha256(destination),
        verifiedFiles=len(manifest), crcVerified=True,
        everyEvidenceSha256Verified=True, excluded=sorted(excluded),
        independentOffDeviceBackup=False)
    # Exclusive creation also protects a checksum created after preflight.
    # If publication races, keep the verified ZIP and propagate the error.
    with checksum.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(result["sha256"] + "  " + destination.name + "\n")
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--exclude", action="append", default=[])
    args = parser.parse_args()
    print(json.dumps(archive_evidence(args.source, args.out, exclude=args.exclude), indent=2))

if __name__ == "__main__":
    main()
