#!/usr/bin/env python3

"""Validate an ADR corpus against the adr-writer conventions (MADR 4.0.0).

Stdlib-only text validator — no YAML/markdown deps — so it runs anywhere:
locally, in any CI, on any OS. Copy it into the repo you are validating
(e.g. scripts/) and wire it into CI.

Usage:
    python3 validate_adr_consistency.py [repo_root] [--adr-dir DIR]

Without --adr-dir the ADR directory is auto-discovered from common homes
(docs/adr, doc/adr, docs/decisions, docs/architecture/decisions, ...).

Enforced:
- Filenames adr-NNNN-<kebab-title>.md or NNNN-<kebab-title>.md — one style
  per corpus, numbers unique, 0000/"template" files skipped.
- Every record carries status + date in exactly one format generation:
  MADR 4.0.0 (YAML frontmatter) or MADR 2.x (`* Status:` / `* Date:`
  bullets). Mixing both shapes in one file is an error. Legacy Nygard
  records (`## Status` heading) are tolerated: status is still checked,
  section checks are skipped, and the skip is reported.
- Status is legal: proposed | accepted | rejected | deprecated |
  superseded by ADR-NNNN (the referenced record must exist).
- One bare-title H1; required MADR sections incl. the history section
  (More Information in 4.0, Links in 2.x) and a `Chosen option:` line.
- Registry parity: if the ADR directory has an index.md/README.md with
  Records-table rows (| [NNNN](file) | ... | status | YYYY-MM-DD |), every
  record must have exactly one row whose status (primary word) and date
  match the file. Static-site generators hide frontmatter, so the registry
  row is the reader-visible status — that drift is the failure mode this
  script exists to catch. A corpus without a registry is reported, not
  failed.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

CANDIDATE_DIRS = (
    "docs/techdocs/docs/adr",
    "docs/adr",
    "doc/adr",
    "docs/decisions",
    "doc/decisions",
    "docs/architecture/decisions",
    "docs/architecture-decisions",
    "docs/adrs",
    "adr",
    "decisions",
)

RE_FILENAME = re.compile(r"^(adr-)?(\d{4})-[a-z0-9][a-z0-9._-]*\.md$")
RE_FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
RE_FM_STATUS = re.compile(r'^status:\s*"?([^"\n]+?)"?\s*$', re.MULTILINE)
RE_FM_DATE = re.compile(r'^date:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$', re.MULTILINE)
RE_BULLET_STATUS = re.compile(r"^\* Status:\s*(.+?)\s*$", re.MULTILINE)
RE_BULLET_DATE = re.compile(r"^\* Date:\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)
RE_NYGARD_STATUS = re.compile(r"^## Status\s*\n+([^\n#].*)$", re.MULTILINE)
RE_NYGARD_DATE = re.compile(r"^Date:\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)
RE_H1 = re.compile(r"^# (.+)$", re.MULTILINE)
RE_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
RE_CELL_LINK = re.compile(r"\[(?:ADR-)?(\d{4})\]\(([^)]+)\)")
RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

LEGAL_PRIMARY = {"proposed", "accepted", "rejected", "deprecated", "superseded"}

REQUIRED_SECTIONS = (
    "## Context and Problem Statement",
    "## Considered Options",
    "## Decision Outcome",
)


def strip_links(text: str) -> str:
    return RE_MD_LINK.sub(r"\1", text)


def primary(status: str) -> str:
    return strip_links(status).strip().lower().split()[0] if status.strip() else ""


def discover_adr_dir(root: Path) -> Path | None:
    for candidate in CANDIDATE_DIRS:
        d = root / candidate
        if d.is_dir() and any(RE_FILENAME.match(p.name) for p in d.glob("*.md")):
            return d
    return None


def registry_rows(adr_dir: Path, err) -> dict[str, tuple[str, str, str]] | None:
    """number -> (file, status, date) from the first index file with table rows."""
    for name in ("index.md", "README.md"):
        index = adr_dir / name
        if not index.is_file():
            continue
        rows: dict[str, tuple[str, str, str]] = {}
        for line in index.read_text(encoding="utf-8").splitlines():
            if not line.lstrip().startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 3 or not RE_DATE.match(cells[-1]):
                continue
            link = RE_CELL_LINK.search(cells[0])
            if not link:
                continue
            number, fname = link.group(1), link.group(2)
            if number in rows:
                err(name, f"ADR {number} listed twice in the Records table")
            rows[number] = (fname, cells[-2], cells[-1])
        if rows:
            return rows
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", help="repo root")
    parser.add_argument("--adr-dir", help="ADR directory (skips auto-discovery)")
    args = parser.parse_args()

    root = Path(args.root)
    adr_dir = Path(args.adr_dir) if args.adr_dir else discover_adr_dir(root)
    if adr_dir and not adr_dir.is_absolute() and args.adr_dir:
        adr_dir = root / adr_dir
    if not adr_dir or not adr_dir.is_dir():
        print(
            "no ADR directory found — pass --adr-dir or create one "
            f"(searched: {', '.join(CANDIDATE_DIRS)})",
            file=sys.stderr,
        )
        return 2

    errors: list[str] = []
    notes: list[str] = []

    def err(name: str, msg: str) -> None:
        errors.append(f"{name}: {msg}")

    records: dict[str, dict] = {}  # number -> {name, status, date}
    prefixes: set[str] = set()
    legacy = 0

    for path in sorted(adr_dir.glob("*.md")):
        m = RE_FILENAME.match(path.name)
        if not m:
            continue  # index.md, README.md, prose pages — not records
        if m.group(2) == "0000" or "template" in path.name:
            continue
        prefixes.add(m.group(1) or "")
        number = m.group(2)
        if number in records:
            err(path.name, f"duplicate ADR number {number} (also {records[number]['name']})")
            continue
        text = path.read_text(encoding="utf-8")

        fm = RE_FRONTMATTER.match(text)
        fm_status = RE_FM_STATUS.search(fm.group(1)) if fm else None
        fm_date = RE_FM_DATE.search(fm.group(1)) if fm else None
        b_status = RE_BULLET_STATUS.search(text)
        b_date = RE_BULLET_DATE.search(text)
        n_status = RE_NYGARD_STATUS.search(text)

        if fm_status and b_status:
            err(path.name, "mixes frontmatter status and `* Status:` bullet — pick one format")
        if fm_status:  # MADR 4.0.0
            status = fm_status.group(1)
            date = fm_date.group(1) if fm_date else None
            sections = REQUIRED_SECTIONS + ("## More Information",)
        elif b_status:  # MADR 2.x
            status = b_status.group(1)
            date = b_date.group(1) if b_date else None
            sections = REQUIRED_SECTIONS + ("## Links",)
        elif n_status:  # legacy Nygard — tolerated, reduced checks
            status = n_status.group(1)
            n_date = RE_NYGARD_DATE.search(text)
            date = n_date.group(1) if n_date else None
            sections = ()
            legacy += 1
        else:
            err(path.name, "no status found (frontmatter `status:` or `* Status:` bullet)")
            continue
        if date is None and sections:
            err(path.name, "no date found (YYYY-MM-DD)")
            continue

        if primary(status) not in LEGAL_PRIMARY:
            err(path.name, f"illegal status {status!r}")
        if primary(status) == "superseded":
            for ref in set(re.findall(r"\d{4}", strip_links(status))):
                if not (
                    list(adr_dir.glob(f"adr-{ref}-*.md")) or list(adr_dir.glob(f"{ref}-*.md"))
                ):
                    err(path.name, f"superseded by ADR-{ref}, which does not exist")

        if sections:
            h1s = RE_H1.findall(text)
            if len(h1s) != 1:
                err(path.name, f"expected exactly one H1, found {len(h1s)}")
            elif re.match(r"(?i)adr[- ]?\d", h1s[0]):
                err(path.name, f"H1 must be a bare title, no ADR-number prefix: {h1s[0]!r}")
            for section in sections:
                if f"\n{section}\n" not in text:
                    err(path.name, f"missing required section {section!r}")
            if "\nChosen option:" not in text:
                err(path.name, 'Decision Outcome must open with `Chosen option: "…", because …`')

        records[number] = {"name": path.name, "status": status, "date": date}

    if len(prefixes) > 1:
        err(adr_dir.name, "mixed filename styles (both adr-NNNN-*.md and NNNN-*.md) — pick one")
    if legacy:
        notes.append(f"{legacy} legacy Nygard record(s) — section checks skipped")

    rows = registry_rows(adr_dir, err)
    if rows is None:
        notes.append("no registry table found (index.md/README.md) — parity checks skipped")
    else:
        for number, rec in sorted(records.items()):
            if number not in rows:
                err("index", f"no Records row for {rec['name']}")
                continue
            fname, idx_status, idx_date = rows[number]
            if fname != rec["name"]:
                err("index", f"row {number} links {fname}, file is {rec['name']}")
            if primary(idx_status) != primary(rec["status"]):
                err(
                    "index",
                    f"row {number} status {idx_status!r} != file status {rec['status']!r}",
                )
            if rec["date"] and idx_date != rec["date"]:
                err(
                    "index",
                    f"row {number} Last updated {idx_date} != file date {rec['date']}"
                    f" ({rec['name']})",
                )
        for number, (fname, _, _) in sorted(rows.items()):
            if number not in records:
                err("index", f"Records row {number} ({fname}) has no matching file")

    for note in notes:
        print(f"  note: {note}")
    if errors:
        for e in errors:
            print(f"  {e}")
        print(f"validate-adr-consistency: FAILED ({len(errors)} problem(s))", file=sys.stderr)
        return 1
    print(
        f"validate-adr-consistency: OK ({len(records)} record(s) in {adr_dir}"
        f"{', registry-checked' if rows else ''})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
