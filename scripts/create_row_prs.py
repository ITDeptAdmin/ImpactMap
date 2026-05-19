#!/usr/bin/env python3
"""
create_row_prs.py

Run after a successful build.  Reads output/geocode_review.csv, finds every
row that has suggested coordinates, then for each one:
  1. Skips if an open PR (or remote branch) already exists for that row.
  2. Creates a fresh branch from origin/<BASE_BRANCH>.
  3. Applies that single row via apply_geocode_suggestions.py.
  4. Commits the changed files and pushes the branch.
  5. Opens a PR targeting <BASE_BRANCH>.

Environment variables (set by the workflow):
  BASE_BRANCH              Branch to target (e.g. main or staging)
  GEOCODE_REVIEW_FILE      Path to geocode_review.csv  (default: output/geocode_review.csv)
  MAPBOX_GEOCODING_TOKEN   Forwarded to the apply/build scripts
  GITHUB_REPOSITORY        owner/repo  (injected by GitHub Actions)
  GH_TOKEN                 GitHub token (injected from secrets.GITHUB_TOKEN)
  GITHUB_STEP_SUMMARY      Path to step-summary file  (injected by Actions)
"""

import csv
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

REVIEW_FILE   = os.environ.get("GEOCODE_REVIEW_FILE", "output/geocode_review.csv")
BASE_BRANCH   = os.environ.get("BASE_BRANCH", "main")
REPO          = os.environ.get("GITHUB_REPOSITORY", "")
STEP_SUMMARY  = os.environ.get("GITHUB_STEP_SUMMARY", "")

FILES_TO_STAGE = [
    "data/Master_Clinic_ImpactMap.csv",
    "output/ImpactMap_Dataset.geojson",
    "output/geocode_review.csv",
    "output/build_stats.json",
    "logs/",
]


# ── Subprocess helpers ────────────────────────────────────────────────────────

def run(cmd: List[str], check: bool = True, env=None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, capture_output=True, text=True, env=env)


def git(*args, check: bool = True) -> subprocess.CompletedProcess:
    return run(["git"] + list(args), check=check)


def gh(*args, check: bool = True) -> subprocess.CompletedProcess:
    return run(["gh"] + list(args), check=check)


# ── Helpers ───────────────────────────────────────────────────────────────────

def to_float(val) -> Optional[float]:
    try:
        return float(str(val).strip())
    except Exception:
        return None


def read_review_rows() -> List[Dict[str, str]]:
    p = Path(REVIEW_FILE)
    if not p.exists():
        return []
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def branch_name(row_num: int) -> str:
    return f"geocode-suggestion/row-{row_num}"


def remote_branch_exists(bname: str) -> bool:
    r = git("ls-remote", "--heads", "origin", bname, check=False)
    return bool(r.stdout.strip())


def open_pr_exists(bname: str) -> bool:
    r = gh("pr", "list", "--head", bname, "--state", "open",
           "--json", "number", check=False)
    if r.returncode != 0:
        return False
    try:
        return len(json.loads(r.stdout)) > 0
    except Exception:
        return False


def apply_row(row_num: int) -> bool:
    env = {**os.environ, "REVIEW_ROW": str(row_num), "BRANCH_NAME": BASE_BRANCH}
    r = run([sys.executable, "scripts/apply_geocode_suggestions.py"], env=env, check=False)
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    return r.returncode == 0


def read_applied_json() -> List[dict]:
    path = "output/geocode_suggestions_applied.json"
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f).get("applied", [])
    except Exception:
        return []


def build_pr_body(a: dict) -> str:
    row      = a.get("csv_row", "")
    event    = a.get("event", "")
    exp      = a.get("expedition", "")
    loc      = ", ".join(p for p in [a.get("city",""), a.get("state",""), a.get("country","")] if p)
    addr     = " ".join((a.get("address") or "").split())
    sug_addr = (a.get("suggested_address") or "").strip()
    conf     = a.get("suggested_confidence", "")
    lat      = a.get("suggested_latitude", "")
    lon      = a.get("suggested_longitude", "")
    maps     = f"https://www.google.com/maps?q={lat},{lon}" if lat and lon else ""

    lines = [
        "## Approve One Geocode Suggestion",
        "",
        "This PR applies **one suggested coordinate** to the Master CSV.",
        "The geocoding confidence was not high enough to auto-approve without human review.",
        "",
        "> **To approve this location:** Merge this PR.",
        "> **To reject this location:** Close this PR without merging, then fix the CSV manually.",
        "",
        "---",
        "",
        "| Field | Value |",
        "|-------|-------|",
        f"| **CSV Row** | {row} |",
        f"| **Event** | {event} |",
        f"| **Expedition** | {exp} |",
        f"| **Location** | {loc} |",
        f"| **Original Address** | {addr} |",
        f"| **Suggested Address** | {sug_addr} |",
        f"| **Confidence** | {conf} |",
        f"| **Latitude** | {lat} |",
        f"| **Longitude** | {lon} |",
    ]
    if maps:
        lines.append(f"| **Map** | [Open in Google Maps]({maps}) |")

    lines += [
        "",
        "---",
        f"**Target branch:** `{BASE_BRANCH}`",
        "",
        "If the suggested location looks correct, merge this PR.",
        "If it looks wrong, close this PR and manually add the correct address or coordinates to the CSV.",
        "",
        "_Auto-generated by the RAM Impact Map geocode review workflow. Do not auto-merge._",
    ]
    return "\n".join(lines)


def write_step_summary(created: list, skipped: list) -> None:
    if not STEP_SUMMARY:
        return
    lines = ["## Geocode Row PRs", ""]
    if created:
        lines.append(f"**PRs created: {len(created)}**")
        lines.append("")
        lines.append("| Row | Event | PR |")
        lines.append("|-----|-------|----|")
        for c in created:
            pr_url = c.get("pr_url", "")
            pr_link = f"[Open PR]({pr_url})" if pr_url else "—"
            lines.append(f"| {c['row']} | {c.get('event','')} | {pr_link} |")
        lines.append("")
    else:
        lines.append("No new PRs created.")
        lines.append("")

    if skipped:
        lines.append(f"**Rows skipped: {len(skipped)}**")
        lines.append("")
        lines.append("| Row | Reason |")
        lines.append("|-----|--------|")
        for s in skipped:
            lines.append(f"| {s.get('row','')} | {s.get('reason','')} |")

    with open(STEP_SUMMARY, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    all_review = read_review_rows()
    suggestions = [
        r for r in all_review
        if to_float(r.get("suggested_latitude"))  is not None
        and to_float(r.get("suggested_longitude")) is not None
    ]

    if not suggestions:
        print("No review rows have suggested coordinates. Nothing to do.")
        write_step_summary([], [])
        sys.exit(0)

    print(f"Found {len(suggestions)} row(s) with suggested coordinates.")

    git("config", "user.name",  "github-actions[bot]")
    git("config", "user.email", "github-actions[bot]@users.noreply.github.com")

    created: list = []
    skipped: list = []

    for review in suggestions:
        row_str = review.get("row", "").strip()
        try:
            row_num = int(row_str)
        except ValueError:
            skipped.append({"row": row_str, "reason": "Invalid row number"})
            continue

        bname = branch_name(row_num)
        event = review.get("event", "")

        # Skip if an open PR already targets this branch
        if open_pr_exists(bname):
            reason = f"Open PR already exists for branch {bname}"
            print(f"SKIP row {row_num}: {reason}")
            skipped.append({"row": row_num, "event": event, "reason": reason})
            continue

        # Skip if the remote branch already exists (PR may have been closed/merged)
        if remote_branch_exists(bname):
            reason = f"Remote branch {bname} already exists"
            print(f"SKIP row {row_num}: {reason}")
            skipped.append({"row": row_num, "event": event, "reason": reason})
            continue

        print(f"\nProcessing row {row_num} (Event {event})…")

        # Create a fresh branch from origin/BASE_BRANCH, discarding any local state
        r = git("checkout", "-f", "-B", bname, f"origin/{BASE_BRANCH}", check=False)
        if r.returncode != 0:
            reason = f"Could not create branch: {r.stderr.strip()}"
            print(f"SKIP row {row_num}: {reason}")
            skipped.append({"row": row_num, "event": event, "reason": reason})
            continue

        # Apply the single-row suggestion
        ok = apply_row(row_num)
        applied_list = read_applied_json()

        if not ok or not applied_list:
            reason = "apply_geocode_suggestions.py reported no changes" if ok else "apply script failed"
            print(f"SKIP row {row_num}: {reason}")
            # Reset to base so the next iteration starts clean
            git("checkout", "-f", "-B", BASE_BRANCH, f"origin/{BASE_BRANCH}", check=False)
            skipped.append({"row": row_num, "event": event, "reason": reason})
            continue

        # Stage committed files
        git("add", *FILES_TO_STAGE)

        r = git("diff", "--staged", "--quiet", check=False)
        if r.returncode == 0:
            reason = "No file changes staged after apply"
            print(f"SKIP row {row_num}: {reason}")
            git("checkout", "-f", "-B", BASE_BRANCH, f"origin/{BASE_BRANCH}", check=False)
            skipped.append({"row": row_num, "event": event, "reason": reason})
            continue

        git("commit", "-m", f"Apply geocode suggestion — Row {row_num} — Event {event}")
        git("push", "origin", bname)

        # Build and write PR body to a temp file to avoid shell-escaping issues
        a = applied_list[0]
        pr_title = f"Approve geocode suggestion — Row {row_num} — Event {event}"
        pr_body  = build_pr_body(a)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".md",
                                         delete=False, encoding="utf-8") as tf:
            tf.write(pr_body)
            body_file = tf.name

        try:
            pr_r = gh("pr", "create",
                      "--repo",       REPO,
                      "--base",       BASE_BRANCH,
                      "--head",       bname,
                      "--title",      pr_title,
                      "--body-file",  body_file,
                      check=False)
        finally:
            os.unlink(body_file)

        pr_url = pr_r.stdout.strip() if pr_r.returncode == 0 else ""
        if pr_url:
            print(f"PR created: {pr_url}")
        else:
            print(f"WARNING: PR creation may have failed: {pr_r.stderr.strip()}")

        created.append({"row": row_num, "event": event, "pr_url": pr_url})

        # Reset to base branch for the next row
        git("checkout", "-f", "-B", BASE_BRANCH, f"origin/{BASE_BRANCH}", check=False)

    print(f"\nDone. PRs created: {len(created)}, Rows skipped: {len(skipped)}")
    write_step_summary(created, skipped)


if __name__ == "__main__":
    main()
