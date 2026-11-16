# ParkFNB

Smart parking for India: owners list their space, drivers book it, and a camera + barrier
at the gate lets the right car in automatically.

## Repo layout

| Folder | What lives here |
|---|---|
| [`research/`](research/) | Market and tech studies, product requirements, pitch deck, proposals, status reports |
| [`hardware/`](hardware/) | ESP32 barrier firmware and the deployment / hardware plan |
| [`ai/`](ai/) | ANPR (number-plate + bay detection) service and its experiments, parking space optimizer |
| [`software/`](software/) | Consumer and owner apps, admin panel, landing page, marketing website, Node backend |

Start with [`software/README.md`](software/README.md) for how to run the apps and backend,
and [`software/docs/system-design.md`](software/docs/system-design.md) for the architecture.

Secrets (`.env`, keys, model weights) are never committed â€” see [`.gitignore`](.gitignore).