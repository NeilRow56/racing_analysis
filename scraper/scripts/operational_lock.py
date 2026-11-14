"""Shared CLI exclusion, compatible with the Bun/web/launchd workflow.lock."""
from __future__ import annotations

import atexit
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path.home() / "Library/Logs/RacingAnalysis"
OWNER_ENV = "RACING_OPERATIONAL_OWNER"


def process_info(pid: int) -> tuple[int, str] | None:
    try:
        result = subprocess.run(
            ["/bin/ps", "-p", str(pid), "-o", "ppid=", "-o", "lstart="],
            capture_output=True, text=True, timeout=2, check=True,
            env={**os.environ, "LC_ALL": "C", "TZ": "UTC"},
        )
        parent, started = result.stdout.strip().split(maxsplit=1)
        return int(parent), started
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def inherited_owner(owner: dict[str, Any]) -> bool:
    if not owner.get("token") or os.getenv(OWNER_ENV) != owner["token"]:
        return False
    identity = process_info(owner.get("pid", 0))
    if identity is None or identity[1] != owner.get("started"):
        return False
    pid = os.getpid()
    seen: set[int] = set()
    while pid > 1 and pid not in seen:
        if pid == owner["pid"]:
            return True
        seen.add(pid)
        info = process_info(pid)
        pid = info[0] if info else 0
    return False


def read_owner(path: Path) -> dict[str, Any]:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        if os.fstat(handle.fileno()).st_nlink != 1:
            raise ValueError("workflow_lock_hardlink_rejected")
        owner = json.load(handle)
        if not isinstance(owner, dict):
            raise ValueError("workflow_lock_invalid_metadata")
        return owner


def guard_cli(caller: str, root: Path = ROOT) -> None:
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink():
        raise RuntimeError("workflow_lock_directory_symlink_rejected")
    path = root / "workflow.lock"
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        try:
            if inherited_owner(read_owner(path)):
                return
        except (OSError, ValueError, TypeError):
            pass
        print("WORKFLOW_BUSY: operational owner or unrecovered lock exists; no workflow started.", file=sys.stderr)
        raise SystemExit(75)
    identity = process_info(os.getpid())
    owner: dict[str, Any] = dict(pid=os.getpid(), started=identity[1] if identity else "unverifiable",
                 token=str(uuid.uuid4()), at=datetime.now(timezone.utc).isoformat(), caller=caller)
    with os.fdopen(fd, "w") as handle:
        json.dump(owner, handle)
    if identity is None:
        raise RuntimeError("workflow_owner_unverifiable_lock_retained")
    os.environ[OWNER_ENV] = owner["token"]

    def release() -> None:
        try:
            if read_owner(path) != owner:
                raise RuntimeError("workflow_lock_ownership_changed_manual_review_required")
            path.unlink()
        except (OSError, ValueError, RuntimeError) as error:
            print(str(error), file=sys.stderr, flush=True)
            os._exit(74)

    atexit.register(release)
