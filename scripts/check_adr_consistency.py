#!/usr/bin/env python3
"""Gate the consistency of the ADR corpus and its Records index.

Conventions live in docs/adrs/README.md. Two of them are local extensions to
MADR 4.0 and both are enforced here rather than only asked for in prose:

* **Append-only supersession.** An accepted record's front-matter `status:` is
  never flipped. A superseding ADR carries `supersedes: NNNN`, and the Records
  index Status column surfaces "superseded by NNNN" for readers. The adr-writer
  skill's bundled validator assumes vanilla status-flip supersession and would
  reject this corpus; use this checker instead.
* **Dated re-evaluation triggers.** A verdict that could change carries
  `review-by: YYYY-MM-DD` plus a `## Re-evaluation triggers` section naming
  what would reopen it. This is the discipline design.md §8 carried before the
  migration and the reason a plain MADR set was not enough.

Checks, over docs/adrs/:

1. filename/number discipline — files are `NNNN-kebab-title.md`, zero-padded,
   no `adr-` prefix (files are never renamed), numbers never reused;
2. status legality — every file's front-matter `status:` is a base status
   (never a flipped "superseded by …");
3. supersedes integrity — `supersedes:` is `none` or an existing number;
4. file <-> Records parity — every file has exactly one Records row and every
   row an existing file, with the linked filename correct;
5. status mirror — a row's Status is "superseded by NNNN" iff some file
   supersedes it, otherwise the file's own status;
6. date mirror — a row's Last updated equals the file's front-matter `date`;
7. every record carries a `### Confirmation` subsection naming how compliance
   is checked;
8. `review-by:` is `none` or an ISO date, and a dated one requires a
   `## Re-evaluation triggers` section.

Usage:
    python3 scripts/check_adr_consistency.py [--repo-root PATH]

Exit codes: 0 = consistent, 1 = violations found.
"""

import argparse
import re
import sys
from pathlib import Path

BASE_STATUSES = {"proposed", "accepted", "rejected", "deprecated"}
FILE_RE = re.compile(r"^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
ROW_RE = re.compile(r"^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|(.*)\|\s*$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SKIP = {"README.md", "adr-template.md"}


def _front_field(text: str, field: str):
    m = re.search(rf"^{field}:\s*(.*?)\s*(?:#.*)?$", text, re.M)
    return m.group(1).strip().strip("\"'") if m else None


def load_files(adr_dir: Path):
    """number -> record metadata; plus a list of format errors."""
    files, errors = {}, []
    for path in sorted(adr_dir.glob("*.md")):
        name = path.name
        if name in SKIP:
            continue
        if name.startswith("adr-"):
            errors.append(f"{name}: `adr-` prefix is forbidden — files are never renamed")
            continue
        m = FILE_RE.match(name)
        if not m:
            errors.append(f"{name}: not a NNNN-kebab-title.md record")
            continue
        num = m.group(1)
        body = path.read_text()
        if num in files:
            errors.append(f"{name}: number {num} reused ({files[num]['name']} exists)")
            continue
        files[num] = {
            "name": name,
            "status": _front_field(body, "status"),
            "date": _front_field(body, "date"),
            "supersedes": _front_field(body, "supersedes"),
            "review_by": _front_field(body, "review-by"),
            "has_confirmation": "### Confirmation" in body,
            "has_triggers": "## Re-evaluation triggers" in body,
        }
    return files, errors


def load_records(readme: Path):
    """number -> {name, status, date} parsed from the ## Records table."""
    rows = {}
    lines = readme.read_text().splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == "## Records")
    except StopIteration:
        sys.exit(f"{readme}: no '## Records' section found")
    for line in lines[start:]:
        m = ROW_RE.match(line)
        if not m:
            continue
        num, link = m.group(1), m.group(2)
        cells = [c.strip() for c in m.group(3).split("|")]
        if len(cells) != 3:  # Decision | Status | Last updated
            continue
        rows[num] = {"name": link, "status": cells[1], "date": cells[2]}
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo-root", default=".", help="Repository root (default: .)")
    args = ap.parse_args()
    root = Path(args.repo_root).resolve()
    adr_dir = root / "docs/adrs"
    readme = adr_dir / "README.md"

    files, failures = load_files(adr_dir)
    records = load_records(readme)

    # supersession derived from the append-only `supersedes:` field
    superseded_by = {}
    for num, meta in files.items():
        sup = meta["supersedes"]
        if sup and sup != "none":
            if sup not in files:
                failures.append(f"{meta['name']}: supersedes {sup!r} which does not exist")
            else:
                superseded_by[sup] = num

    dated_reviews = 0
    for num, meta in sorted(files.items()):
        name = meta["name"]
        if meta["status"] not in BASE_STATUSES:
            failures.append(f"{name}: illegal front-matter status {meta['status']!r} "
                            f"(allowed: {', '.join(sorted(BASE_STATUSES))}; supersession is "
                            f"index-only, never a flipped file status)")
        if not meta["has_confirmation"]:
            failures.append(f"{name}: no '### Confirmation' subsection — every decision names "
                            f"how compliance is checked (CI gate, review step, or script)")
        review = meta["review_by"]
        if review is None:
            failures.append(f"{name}: no 'review-by' front-matter field (use a date or 'none')")
        elif review != "none":
            if not ISO_DATE_RE.match(review):
                failures.append(f"{name}: review-by {review!r} is neither 'none' nor YYYY-MM-DD")
            else:
                dated_reviews += 1
                if not meta["has_triggers"]:
                    failures.append(f"{name}: review-by {review} but no "
                                    f"'## Re-evaluation triggers' section — a dated review with "
                                    f"no named trigger is a reminder, not a decision record")

    # parity
    for num in sorted(set(files) - set(records)):
        failures.append(f"{files[num]['name']}: no Records row for {num}")
    for num in sorted(set(records) - set(files)):
        failures.append(f"Records row {num}: no matching docs/adrs/{num}-*.md file")

    for num in sorted(set(files) & set(records)):
        f, r = files[num], records[num]
        if r["name"] != f["name"]:
            failures.append(f"{num}: Records link {r['name']!r} != file {f['name']!r}")
        expected = f"superseded by {superseded_by[num]}" if num in superseded_by else f["status"]
        if r["status"] != expected:
            failures.append(f"{num}: Records status {r['status']!r} != expected {expected!r}")
        if r["date"] != f["date"]:
            failures.append(f"{num}: Records Last updated {r['date']!r} != file date {f['date']!r}")

    print(f"adr consistency: {len(files)} record(s), {len(records)} Records row(s), "
          f"{len(superseded_by)} supersession(s), {dated_reviews} dated review(s)")

    if failures:
        print()
        for failure in failures:
            print(f"FAIL: {failure}")
        print(f"\n{len(failures)} ADR consistency violation(s) — see docs/adrs/README.md.")
        return 1
    print("consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
