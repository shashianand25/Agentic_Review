"""Clone GitHub repositories into a workspace safely."""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

CLONE_TIMEOUT_SEC = 60
MAX_REPO_SIZE_MB = 200


def clone_repo_to_workspace(
    repo_url: str,
    workspace_dir: Path,
    github_token: str | None = None,
) -> tuple[Path | None, str | None]:
    """
    Shallow-clone repository into `<workspace_dir>/repo`.
    Returns `(repo_path, error)`.
    """
    workspace_dir = workspace_dir.resolve()
    workspace_dir.mkdir(parents=True, exist_ok=True)

    if not repo_url or not repo_url.strip():
        return None, "github_url is empty"

    git_bin = shutil.which("git")
    if not git_bin:
        return None, "git executable not found"

    safe_url = repo_url.strip()
    clone_url = _with_token_if_https(safe_url, github_token)
    repo_path = workspace_dir / "repo"

    cmd = [
        git_bin, "clone",
        "--depth", "1",
        "--single-branch",
        clone_url,
        str(repo_path),
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=CLONE_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        return None, f"git clone timed out ({CLONE_TIMEOUT_SEC}s limit)"

    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "git clone failed")[:2000]
        return None, _sanitize_error(msg, github_token)

    size_mb = _dir_size_mb(repo_path)
    if size_mb > MAX_REPO_SIZE_MB:
        shutil.rmtree(repo_path, ignore_errors=True)
        return None, f"cloned repo is {size_mb:.0f} MB (limit {MAX_REPO_SIZE_MB} MB)"

    logger.info("Cloned %s (%.1f MB) into %s", safe_url, size_mb, repo_path)
    return repo_path, None


def _dir_size_mb(path: Path) -> float:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return total / (1024 * 1024)


def _with_token_if_https(repo_url: str, github_token: str | None) -> str:
    if not github_token:
        return repo_url

    parsed = urlparse(repo_url)
    if parsed.scheme not in ("http", "https"):
        # SSH or other protocols should rely on environment auth agent.
        return repo_url

    if parsed.netloc.endswith("github.com"):
        netloc = f"x-access-token:{github_token}@{parsed.netloc}"
        return urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
    return repo_url


def _sanitize_error(message: str, github_token: str | None) -> str:
    out = message
    if github_token:
        out = out.replace(github_token, "***")
    out = re.sub(r"x-access-token:[^@]+@", "x-access-token:***@", out)
    return out
