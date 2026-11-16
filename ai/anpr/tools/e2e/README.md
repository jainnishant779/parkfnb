# Browser checks

Real-Chrome checks of the two pages people use, driven over the DevTools protocol (no npm packages).

```
python tools/e2e/run_e2e.py              # everything, about two minutes
python tools/e2e/run_e2e.py viewer       # or: editor, integration
```

| Suite | What it drives |
|---|---|
| `viewer` | `static/live.html` against a mock server that answers with the true `/live/state` shape (built by `make_fixtures.py` with the real `status.py`): live, night, no signal, camera moved, not started, no bays, gate, server down and back, phone and tablet widths |
| `editor` | `static/occupancy.html` against a real throw-away server: saved layout loads, drag / nudge / rename / duplicate / delete, validation, save + backup + restore, the perspective row tool |
| `integration` | the whole path: a camera feeding pictures, the page reading them, an operator answering for a bay, the camera stopping |

Needs Chrome (`CHROME_PATH` if it is not in a usual place) and node 22 or newer. The servers use their own temporary
data folder and port 8123/8130, never real camera data. Pictures of each state are written to `tools/e2e/out/`
(git-ignored). The test pictures are drawn, not real footage.
