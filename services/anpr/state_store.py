"""
What must survive a restart: each camera's bays, IN/OUT line, IN/OUT totals and plate setting.

One small JSON file per camera in ANPR_DATA_DIR/cameras/ (default ./data).  Writes go to a temporary
file first and are then swapped in, so a crash or power cut cannot leave a half-written file.
Saving never raises: a full disk must not stop the camera feed, so failures are only printed.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(os.getenv("ANPR_DATA_DIR") or Path(__file__).parent / "data")
_lock = threading.Lock()


def _safe_id(camera_id: str) -> str:
    """Camera ids become file names, so keep them plain."""
    return "".join(c for c in (camera_id or "") if c.isalnum() or c in "-_")[:32] or "cam"


def _path(camera_id: str) -> Path:
    return DATA_DIR / "cameras" / f"{_safe_id(camera_id)}.json"


def load_camera(camera_id: str) -> dict:
    """The saved state of one camera, or {} if there is none or the file is unreadable."""
    try:
        data = json.loads(_path(camera_id).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_camera(camera_id: str, patch: dict) -> None:
    """Merge `patch` into the camera's saved state (a key set to None is stored as null)."""
    try:
        with _lock:
            path = _path(camera_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            state = load_camera(camera_id)
            state.update(patch)
            fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.stem + ".", suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(state, f)
                os.replace(tmp, path)                      # atomic on Windows and Linux
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise
    except Exception as e:
        print(f"[anpr] could not save state for '{camera_id}': {e}")


BACKUPS_KEPT = 10


def _backup_dir() -> Path:
    # a sub-folder, so load_cameras() (which reads *.json next to it) never mistakes a backup for a camera
    return DATA_DIR / "cameras" / "backups"


def backup_bays(camera_id: str, bays: dict, view: str, saved_at: str = "") -> str | None:
    """Keep a copy of a layout that is about to be replaced; only the newest BACKUPS_KEPT are kept.
    Returns the backup's name, or None when there was nothing to keep."""
    if not bays:
        return None
    try:
        with _lock:
            folder = _backup_dir()
            folder.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            name = f"{_safe_id(camera_id)}.{stamp}.json"
            (folder / name).write_text(json.dumps({"view": view, "bays": bays, "saved_at": saved_at}),
                                       encoding="utf-8")
            mine = sorted(folder.glob(f"{_safe_id(camera_id)}.*.json"))
            for old in mine[:-BACKUPS_KEPT]:
                try:
                    old.unlink()
                except OSError:
                    pass
            return name
    except Exception as e:
        print(f"[anpr] could not back up bays for '{camera_id}': {e}")
        return None


def list_backups(camera_id: str) -> list[dict]:
    """Newest first: [{"name", "bays", "saved_at"}]."""
    folder = _backup_dir()
    out = []
    if not folder.is_dir():
        return out
    for p in sorted(folder.glob(f"{_safe_id(camera_id)}.*.json"), reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            out.append({"name": p.name, "bays": len(data.get("bays") or {}), "saved_at": data.get("saved_at", "")})
        except (OSError, ValueError):
            continue
    return out


def load_backup(camera_id: str, name: str) -> dict | None:
    """One backup by name; the name must belong to this camera (no path tricks)."""
    if Path(name).name != name or not name.startswith(_safe_id(camera_id) + ".") or not name.endswith(".json"):
        return None
    try:
        data = json.loads((_backup_dir() / name).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def _ref_path(camera_id: str) -> Path:
    return DATA_DIR / "cameras" / "refs" / f"{_safe_id(camera_id)}.png"


def save_ref(camera_id: str, png: bytes) -> None:
    """The small reference picture the camera's bays were saved against (to notice a moved camera)."""
    try:
        with _lock:
            path = _ref_path(camera_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(png)
    except Exception as e:
        print(f"[anpr] could not save reference for '{camera_id}': {e}")


def delete_ref(camera_id: str) -> None:
    try:
        _ref_path(camera_id).unlink()
    except OSError:
        pass


def load_ref(camera_id: str) -> bytes | None:
    try:
        return _ref_path(camera_id).read_bytes()
    except OSError:
        return None


def load_cameras() -> dict[str, dict]:
    """Every saved camera, keyed by id (the file name)."""
    out: dict[str, dict] = {}
    folder = DATA_DIR / "cameras"
    if not folder.is_dir():
        return out
    for p in sorted(folder.glob("*.json")):
        state = load_camera(p.stem)
        if state:
            out[p.stem] = state
    return out
