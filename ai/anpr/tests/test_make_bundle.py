"""The deploy bundle can be built from the repo alone (it used to need a file list that lived outside it)."""
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "deploy"))

import make_bundle as mb  # noqa: E402


def test_every_file_in_the_deploy_list_is_in_the_repo():
    required, optional = mb.split(mb.listed(ROOT / "deploy" / "bundle-files.txt"))
    missing = [f for f in required if not (ROOT / f).is_file()]
    assert missing == []


def test_the_bundle_is_built_and_carries_the_code_the_installer_and_the_ui(tmp_path):
    p = subprocess.run([sys.executable, str(ROOT / "deploy" / "make_bundle.py"), "--name", "b", "--out", str(tmp_path)],
                       capture_output=True, text=True, timeout=300)
    assert p.returncode == 0, p.stderr[-500:]
    assert "sha256 " in p.stdout and "update-ec2.sh" in p.stdout
    with tarfile.open(tmp_path / "b.tgz") as t:
        names = set(t.getnames())
    assert {"app.py", "live.py", "static/js/console.js", "static/label.html", "record.py", "deploy/update-ec2.sh"} <= names
    assert {"grant_auth.py", "owner_api.py"} <= names          # app.py imports them: without them the service does not start
    assert not any(n.endswith((".pem", ".env")) or "best.pt" in n for n in names)


def test_a_missing_file_stops_the_build(tmp_path):
    lst = tmp_path / "l.txt"
    lst.write_text("# c\napp.py\nnot_here.py\n")
    p = subprocess.run([sys.executable, str(ROOT / "deploy" / "make_bundle.py"), "--list", str(lst), "--out", str(tmp_path)],
                       capture_output=True, text=True, timeout=60)
    assert p.returncode != 0 and "not_here.py" in p.stderr and not (tmp_path / "bundle.tgz").exists()

def test_an_optional_file_is_taken_when_it_exists_and_skipped_quietly_when_not(tmp_path):
    lst = tmp_path / "l.txt"
    lst.write_text("app.py\n?weights/not_in_git.onnx\n?README.md\n")
    p = subprocess.run([sys.executable, str(ROOT / "deploy" / "make_bundle.py"), "--list", str(lst), "--name", "o", "--out", str(tmp_path)],
                       capture_output=True, text=True, timeout=60)
    assert p.returncode == 0 and "not_in_git.onnx" in p.stderr
    with tarfile.open(tmp_path / "o.tgz") as t:
        assert set(t.getnames()) == {"app.py", "README.md"}

def test_scripts_go_to_the_server_with_unix_line_endings_even_from_a_windows_checkout(tmp_path):
    (tmp_path / "x.sh").write_bytes(b"#!/bin/bash\r\necho hi\r\n")
    (tmp_path / "keep.py").write_bytes(b"a = 1\r\n")
    lst = tmp_path / "l.txt"
    lst.write_text("deploy/update-ec2.sh\napp.py\n")
    p = subprocess.run([sys.executable, str(ROOT / "deploy" / "make_bundle.py"), "--list", str(lst), "--name", "e", "--out", str(tmp_path)],
                       capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    with tarfile.open(tmp_path / "e.tgz") as t:
        script = t.extractfile("deploy/update-ec2.sh").read()
        py = t.extractfile("app.py").read()
        assert t.getmember("deploy/update-ec2.sh").mode & 0o111
    assert b"\r" not in script and script.startswith(b"#!")
    assert py == (ROOT / "app.py").read_bytes()                            # code files are sent as they are