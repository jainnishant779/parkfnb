# Automatic deploy to EC2 (from git)

A push to `main` that changes `ai/anpr` runs the tests and, if they pass, installs the new code on the EC2 box.
Workflow: `.github/workflows/deploy-anpr.yml` (at the root of the company repo).

## What happens

1. **Tests** run on a clean GitHub machine (Python 3.12, CPU PyTorch, no model weights, `ANPR_OCR=none`): about 970 pass and 13 that need the weights are skipped.  A failing test stops everything.
2. **Bundle**: `deploy/make_bundle.py` packs the files in `deploy/bundle-files.txt`.  The model weights are not in git, so they are not in the bundle: the server keeps its own.
3. **Send**: the bundle goes over SSH with a key that can do **only** this (below), checked against its sha256.
4. **Install**: the server's installer saves the current code, installs the new one, restarts the service and waits for `/health`.  If it does not come up, it puts the old code back.
5. **Check**: the workflow then asks `https://<server>/live/state` for up to two minutes.

A push that only changes `*.md`, `docs/` or `tests/` does not deploy.  A pull request runs the tests but never deploys.

**Every deploy restarts the service**: the stays that are open at that moment are cut, and the first minute reads "no signal".

## One-time setup (done on 15 Nov 2026: server side; the GitHub side needs a repo admin)

Server (done): `deploy/server/install-deploy-access.sh` put a forced-command script at `/usr/local/bin/parkfnb-deploy`, a **pinned copy of the installer** at
`/usr/local/sbin/parkfnb-update.sh`, and one line in `/home/ubuntu/.ssh/authorized_keys`:
`command="/usr/local/bin/parkfnb-deploy",restrict ssh-ed25519 ... parkfnb-github-deploy`.

GitHub (repo Settings > Secrets and variables > Actions > **Secrets**):

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | the private key of the deploy key pair (the whole file, including the BEGIN and END lines) |
| `DEPLOY_HOST` | the server address (`3.7.139.193`) |
| `DEPLOY_HOST_KEY` | the server's own key, so nothing else can answer on that address: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID8sR+G1Q6WxxyiG3WW8ZLw3PVRzh++e+4v41qbT0By4` |

Optional **Variables**: `DEPLOY_HEALTH_URL` (default `https://3-7-139-193.sslip.io/live/state`), `AUTO_DEPLOY` (see below).

## What the deploy key can and cannot do

Tested on 15 Nov: it can `ping` and `deploy <sha256>` (a bundle on stdin).  Refused, each one: `ls`, any shell command, `cat`, an interactive login, `scp`, port forwarding,
a deploy with a non-sha argument or an injected one, and a bundle that does not match its sha256.  A bundle with an absolute path, a `..` or a link is refused too.
The installer is the **pinned** copy, so a bundle cannot replace it.  What a bundle's *code* does once installed is the real risk: that is why the tests run first and why the repo needs review before merging.

## Controls

- **Stop it at once**: set the variable `AUTO_DEPLOY` to `false`.  Nothing to edit; set it to anything else (or delete it) to resume.
- **Ask a person before every deploy**: Settings > Environments > `production` > Required reviewers.  The workflow already uses that environment.
- **Take the access away**: on the server delete the `authorized_keys` line that ends in `parkfnb-github-deploy`.  Also delete the GitHub secrets.
- **New key**: make a new ed25519 pair, run `sudo bash deploy/server/install-deploy-access.sh <new.pub>` on the server, update `DEPLOY_SSH_KEY`, then remove the old line.
- **Deploy by hand** (without GitHub): the steps in `HANDOVER.md` still work.

## Things to know

- If `deploy/update-ec2.sh` changes, run `install-deploy-access.sh` on the server again: the installer there is pinned and does not follow the repo.
- If `requirements*.txt` change, the installer **stops without changing anything** (the libraries must be installed by hand first, see `HANDOVER.md`).  The workflow then shows red.  The comparison ignores line endings.
- The server's firewall (AWS security group) must allow SSH (port 22) from GitHub's machines, which have changing addresses.  If it only allows your own address, the "Check we can reach the server" step fails with a clear message.
- The actions used are the official ones, by version tag (`actions/checkout@v4`, `actions/setup-python@v5`).
- Only a person with write access to the repo can start a deploy; secrets are not given to pull requests from forks.