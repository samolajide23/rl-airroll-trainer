"""Fetch soccar fixtures from a hash-pinned RLGym release, without installing it.

The archive's license is retained beside the fixtures; this does not grant
additional asset rights. The browser mesh is not modified.
"""
from __future__ import annotations

import hashlib
import io
import json
import tarfile
import urllib.request
from pathlib import Path

URL = "https://files.pythonhosted.org/packages/99/21/b87ef7ebb0d76e654753349a4f343068d08e1a9eaffd9c77c0593b43668f/rlgym-rocket-league-2.0.1.tar.gz"
SHA256 = "3be8e9d2f1cfb6514e0e3d455fb33ff95e26eb7c399f819fff0258025cf4d501"
PREFIX = "rlgym-rocket-league-2.0.1/rlgym/rocket_league/sim/collision_meshes/soccar/"
OUT = Path(__file__).resolve().parent / "collision_meshes"


def main() -> None:
    with urllib.request.urlopen(URL, timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise RuntimeError("Reference archive SHA-256 mismatch; refusing extraction")
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        members = [m for m in tar.getmembers() if m.isfile() and m.name.startswith(PREFIX) and m.name.endswith(".cmf")]
        if len(members) != 16:
            raise RuntimeError(f"Expected 16 soccar meshes, found {len(members)}")
        payloads = {}
        for member in members:
            stream = tar.extractfile(member)
            assert stream is not None
            payloads[Path(member.name).name] = stream.read()
        destination = OUT / "soccar"
        if destination.exists():
            existing = {p.name: p.read_bytes() for p in destination.glob("*.cmf")}
            if existing and existing != payloads:
                raise RuntimeError("Existing soccar meshes differ; move them aside explicitly before setup")
        destination.mkdir(parents=True, exist_ok=True)
        for name, content in payloads.items():
            (destination / name).write_bytes(content)
        for member in tar.getmembers():
            if member.isfile() and Path(member.name).name.lower().startswith("license"):
                stream = tar.extractfile(member)
                assert stream is not None
                (OUT / "RLGYM-LICENSE.txt").write_bytes(stream.read())
                break
    manifest = {"source": URL, "archive_sha256": SHA256, "meshes": {n: hashlib.sha256(b).hexdigest() for n, b in sorted(payloads.items())}}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(payloads)} soccar meshes in {destination}")


if __name__ == "__main__":
    main()