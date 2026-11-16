"""
Build the deploy bundle for the EC2 box and print what to run next.

    python deploy/make_bundle.py [--name bundle57] [--list deploy/bundle-files.txt] [--out .]

Reads deploy/bundle-files.txt (one path per line, '#' for comments, '?path' for a file to include only if it exists), refuses to build if a required file is missing, writes <name>.tgz and
prints its sha256 and the exact upload and install commands.  It does not upload anything.
"""
import argparse
import hashlib
import io
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LF_ONLY = (".sh", ".service")


def listed(path: Path) -> list[str]:
    """Every listed path; an optional one keeps its leading ?."""
    return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.lstrip().startswith("#")]


def split(entries: list[str]) -> tuple[list[str], list[str]]:
    return [e for e in entries if not e.startswith("?")], [e[1:] for e in entries if e.startswith("?")]


def build(entries: list[str], out: Path) -> str:
    required, optional = split(entries)
    missing = [f for f in required if not (ROOT / f).is_file()]
    if missing:
        raise SystemExit("missing, not building: " + ", ".join(missing))
    skipped = [f for f in optional if not (ROOT / f).is_file()]
    if skipped:
        print("not included (not in this folder, the server keeps its own): " + ", ".join(skipped), file=sys.stderr)
    files = required + [f for f in optional if f not in skipped]
    with tarfile.open(out, "w:gz") as tar:
        for f in files:
            if f.endswith(LF_ONLY):
                # a shell script or unit file with CRLF endings does not run on Linux, and a Windows checkout may have made them so
                data = (ROOT / f).read_bytes().replace(b"\r\n", b"\n")
                info = tarfile.TarInfo(f)
                info.size, info.mode, info.mtime = len(data), 0o755 if f.endswith(".sh") else 0o644, int((ROOT / f).stat().st_mtime)
                tar.addfile(info, io.BytesIO(data))
            else:
                tar.add(ROOT / f, arcname=f)
    return hashlib.sha256(out.read_bytes()).hexdigest()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="bundle")
    ap.add_argument("--list", default=str(ROOT / "deploy" / "bundle-files.txt"))
    ap.add_argument("--out", default=".")
    a = ap.parse_args(argv)
    out = Path(a.out) / f"{a.name}.tgz"
    digest = build(listed(Path(a.list)), out)
    print(f"{out}  {out.stat().st_size / 1e6:.1f} MB\nsha256 {digest}\n")
    print(f"scp -i <key.pem> {out} deploy/update-ec2.sh ubuntu@<server>:/tmp/")
    print(f"ssh -i <key.pem> ubuntu@<server> \"sudo bash /tmp/update-ec2.sh file:///tmp/{out.name} {digest}\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())