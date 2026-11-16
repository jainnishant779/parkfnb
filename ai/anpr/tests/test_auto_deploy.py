"""
The automatic deploy: what its pieces must keep promising.  The workflow lives at the root of the company repo, two folders above ai/anpr.
"""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT.parent.parent / ".github" / "workflows" / "deploy-anpr.yml"
SERVER = ROOT / "deploy" / "server"


def test_the_scripts_that_run_on_the_server_have_unix_line_endings_and_refuse_by_default():
    for name in ("parkfnb-deploy.sh", "install-deploy-access.sh"):
        data = (SERVER / name).read_bytes()
        assert b"\r" not in data and data.startswith(b"#!/usr/bin/env bash"), name
    deploy = (SERVER / "parkfnb-deploy.sh").read_text(encoding="utf-8")
    assert "SSH_ORIGINAL_COMMAND" in deploy and "refused: that command is not allowed" in deploy
    assert '^[0-9a-f]{64}$' in deploy and "sha256sum" in deploy and "parkfnb-update.sh" in deploy   # a checksum, and the PINNED installer
    assert "update-ec2.sh" not in deploy.replace("deploy/update-ec2.sh", "")                         # it never runs the installer from the bundle


def test_the_installer_ties_the_key_to_the_forced_command_and_restricts_it():
    inst = (SERVER / "install-deploy-access.sh").read_text(encoding="utf-8")
    assert 'command="/usr/local/bin/parkfnb-deploy",restrict' in inst
    assert "ssh-ed25519" in inst and "authorized_keys" in inst
    assert "DEPLOY_HOST_KEY" in inst and "DEPLOY_KNOWN_HOSTS" not in inst             # the secret's name matches the workflow's


def test_the_installer_compares_requirements_without_line_endings():
    # 15 Nov: a file saved on Windows and the same file from Linux made the installer say "libraries changed" and stop for good
    text = (ROOT / "deploy" / "update-ec2.sh").read_text(encoding="utf-8")
    assert text.count("tr -d '\\r'") >= 4 and b"\r" not in (ROOT / "deploy" / "update-ec2.sh").read_bytes()


@pytest.mark.skipif(not WORKFLOW.exists(), reason="the workflow file is at the company repo's root")
def test_the_workflow_deploys_only_after_the_tests_only_from_main_and_can_be_switched_off():
    yaml = pytest.importorskip("yaml")
    wf = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    deploy = wf["jobs"]["deploy"]
    assert deploy["needs"] == "test"
    assert "refs/heads/main" in deploy["if"] and "AUTO_DEPLOY" in deploy["if"]            # main only, with a switch
    assert deploy["concurrency"]["cancel-in-progress"] is False                           # a deploy is never cut off by the next push
    assert deploy["environment"] == "production"                                          # a reviewer can be added without editing this
    on = wf.get("on") or wf.get(True)
    assert "pull_request" in on and "workflow_dispatch" in on
    assert "!ai/anpr/tests/**" in on["push"]["paths"] and "!ai/anpr/**/*.md" in on["push"]["paths"]
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "StrictHostKeyChecking=yes" in text and "BatchMode=yes" in text                # the server's own key is pinned
    for secret in ("DEPLOY_SSH_KEY", "DEPLOY_HOST", "DEPLOY_HOST_KEY"):
        assert f"secrets.{secret}" in text
    assert "echo \"$DEPLOY_SSH_KEY\"" not in text and "cat ~/.ssh/deploy_key" not in text # the key never goes to the log
    assert "contents: read" in text                                                      # no write access for the job's token


def test_the_servers_deploy_list_is_still_complete():
    lines = [x.strip() for x in (ROOT / "deploy" / "bundle-files.txt").read_text(encoding="utf-8").splitlines()]
    assert "deploy/update-ec2.sh" in lines and "app.py" in lines and "record.py" in lines
    assert not [x for x in lines if x.startswith(("tests/", "test_fixtures/", "deploy/server/"))]   # the server needs none of these
