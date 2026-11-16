# Pending changes from the old workspace (NOT applied)

These are the uncommitted edits that were sitting in the old workspace folder (`Documents\parkbnb`, repo `jainnishant779/parkfnb`) on 15 Nov 2026.
They were **not applied** to anything here.  They are kept as patches so they are not lost, and so a person can decide.

| Patch | What | Whose area |
|---|---|---|
| `backend-anprAccessController.js.patch` | the ANPR event handler of the Node backend (+71 -5) | **backend: Chandresh / Yatharth** (review with them before anything is applied) |
| `backend-accessRoutes.js.patch` | a route for it (+3) | **backend: Chandresh / Yatharth** |
| `space-optimizer-optimizer.py.patch` | the space optimizer (+729 -70) | `ai/space-optimizer` |
| `space-optimizer-index.html.patch` | its page (+29 -3) | `ai/space-optimizer` |
| `root-gitignore.patch` | ignores private firmware settings (+3) | root `.gitignore` (the company copy differs and is theirs; `hardware/firmware/parkfnb_cam/.gitignore` already covers `secrets.h`) |

Not captured: `services/space-optimizer/projects.db` was also modified (a SQLite file, 12 KB, sha256 `3f9e35283768c068...`).  It stays only in the old folder.

The patches were made against the old workspace's last commit, which for the backend and the optimizer is the same as the company repo at the time (checked).
To try one: `git apply --check <patch>` from the matching folder first (`software/services/backend` is the backend's place in this repo, `ai/space-optimizer` the optimizer's; the paths inside the patches say `services/...`).
Changes to the backend are Chandresh's and Yatharth's to accept or not.