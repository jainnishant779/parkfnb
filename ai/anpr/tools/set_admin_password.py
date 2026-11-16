"""
Set the operator's sign-in ID and password.

    sudo /opt/parkfnb-anpr/.venv/bin/python /opt/parkfnb-anpr/tools/set_admin_password.py --env /etc/parkfnb-anpr.env
    sudo systemctl restart parkfnb-anpr

It asks for the password (nothing is shown as you type) and writes only a hash of it,
ANPR_ADMIN_USER=<id> and ANPR_ADMIN_PASSWORD_HASH=<hash>, into the env file, leaving every other line as it is.
Changing the password signs everyone who was signed in out.

    --user NAME          the sign-in ID (default: admin)
    --env FILE           the env file to update (default: print the two lines instead)
    --password-stdin     read the password from standard input (for scripts), not from the keyboard
    --generate           make a strong password, set it, and print it once
"""
from __future__ import annotations

import argparse
import getpass
import os
import secrets
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import admin_auth  # noqa: E402

ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"          # nothing that looks like another character


def generate_password() -> str:
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(5)) for _ in range(4))


def update_env_text(text: str, user: str, pw_hash: str) -> str:
    """The env file's text with the two sign-in lines replaced (or added), nothing else changed."""
    out, seen_user, seen_hash = [], False, False
    for line in text.splitlines():
        if line.startswith("ANPR_ADMIN_USER="):
            out.append(f"ANPR_ADMIN_USER={user}")
            seen_user = True
        elif line.startswith("ANPR_ADMIN_PASSWORD_HASH="):
            out.append(f"ANPR_ADMIN_PASSWORD_HASH={pw_hash}")
            seen_hash = True
        else:
            out.append(line)
    if not seen_user:
        out.append(f"ANPR_ADMIN_USER={user}")
    if not seen_hash:
        out.append(f"ANPR_ADMIN_PASSWORD_HASH={pw_hash}")
    return "\n".join(out) + "\n"


def write_env(path: Path, user: str, pw_hash: str) -> None:
    """Atomic: write a temp file next to it with the same owner and mode, then swap it in."""
    path = Path(path)
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    new = update_env_text(text, user, pw_hash)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new)
        if path.exists():
            st = path.stat()
            os.chmod(tmp, st.st_mode & 0o777)
            if hasattr(os, "chown"):
                os.chown(tmp, st.st_uid, st.st_gid)
        else:
            os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--env")
    ap.add_argument("--password-stdin", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--allow-weak", action="store_true",
                    help="accept a password shorter than 12 characters (testing only: anyone on the internet can guess it)")
    a = ap.parse_args(argv)

    if not admin_auth.valid_user(a.user):
        print("error: the ID may use letters, digits, - and _ only (1-32 characters)", file=sys.stderr)
        return 2
    if a.generate:
        password = generate_password()
    elif a.password_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("New password: ")
        if password != getpass.getpass("Again: "):
            print("error: the two passwords differ", file=sys.stderr)
            return 2
    try:
        pw_hash = admin_auth.hash_password(password, allow_weak=a.allow_weak)
    except ValueError as e:
        print(f"error: {e} (use --allow-weak for a throw-away test setup)", file=sys.stderr)
        return 2
    if a.allow_weak and len(password) < admin_auth.MIN_PASSWORD_LEN:
        print(f"WARNING: a password under {admin_auth.MIN_PASSWORD_LEN} characters is easy to guess; change it before real use.",
              file=sys.stderr)

    if a.env:
        write_env(Path(a.env), a.user, pw_hash)
        print(f"ID and password hash saved in {a.env}. Restart the service to use them.")
    else:
        print(f"ANPR_ADMIN_USER={a.user}\nANPR_ADMIN_PASSWORD_HASH={pw_hash}")
    if a.generate:
        print(f"ID: {a.user}\nPassword: {password}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
