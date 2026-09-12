#!/usr/bin/env python3
"""Generate domain documentation from a domain model YAML file.

Usage:
    python generate_docs.py docs/domain/model.yaml -o docs/domain/

Produces in the output directory:
    overview.md   - project intro, bounded contexts, ER diagram (Mermaid)
    glossary.md   - alphabetized terms with definitions and cross-references
    entities.md   - attribute tables, relationships, state diagrams (Mermaid)
    rules.md      - business rules grouped by what they apply to
    events.md     - domain events (only if the model defines any)

Validation warnings (dangling references, duplicate names) go to stderr and
never block generation.
"""

import argparse
import re
import sys
import unicodedata
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml --break-system-packages")


def warn(msg):
    print(f"WARNING: {msg}", file=sys.stderr)


def slug(name):
    """Anchor slug matching python-markdown's toc slugify, so intra-page
    links resolve when the docs are rendered by MkDocs."""
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    return re.sub(r"[-\s]+", "-", s)


def mermaid_id(name):
    """Mermaid node ids can't contain spaces/punctuation."""
    return re.sub(r"[^A-Za-z0-9_]", "_", str(name))




def validate(model):
    contexts = {c.get("name") for c in model.get("contexts", [])}
    terms = [t.get("name") for t in model.get("terms", [])]
    entities = [e.get("name") for e in model.get("entities", [])]
    rule_ids = [r.get("id") for r in model.get("rules", [])]

    for label, names in (("term", terms), ("entity", entities), ("rule id", rule_ids)):
        seen = set()
        for n in names:
            if n in seen:
                warn(f"duplicate {label}: {n!r}")
            seen.add(n)

    known = set(terms) | set(entities)

    def check_ctx(obj, kind):
        ctx = obj.get("context")
        if ctx and ctx not in contexts:
            warn(f"{kind} {obj.get('name') or obj.get('id')!r} references unknown context {ctx!r}")

    for t in model.get("terms", []):
        check_ctx(t, "term")
        for ref in t.get("see_also", []) or []:
            if ref not in terms:
                warn(f"term {t.get('name')!r} see_also references unknown term {ref!r}")

    for e in model.get("entities", []):
        check_ctx(e, "entity")
        for rel in e.get("relationships", []) or []:
            if rel.get("to") not in entities:
                warn(f"entity {e.get('name')!r} relationship targets unknown entity {rel.get('to')!r}")
        froms = {s.get("from") for s in e.get("states", []) or []}
        tos = {s.get("to") for s in e.get("states", []) or []}
        for state in (froms | tos) - {"[start]", None}:
            if state not in froms and state not in tos:
                warn(f"entity {e.get('name')!r} has isolated state {state!r}")

    for r in model.get("rules", []):
        check_ctx(r, "rule")
        for target in r.get("applies_to", []) or []:
            if target not in known:
                warn(f"rule {r.get('id')!r} applies_to unknown term/entity {target!r}")

    for ev in model.get("events", []):
        ent = ev.get("entity")
        if ent and ent not in entities:
            warn(f"event {ev.get('name')!r} references unknown entity {ent!r}")

    for a in model.get("ambiguities", []) or []:
        if a.get("status") == "resolved" and not a.get("resolution"):
            warn(f"ambiguity {a.get('phrase')!r} is resolved but has no resolution text")
        if a.get("status", "open") == "open" and a.get("phrase") in known:
            warn(f"ambiguity {a.get('phrase')!r} is still open but matches a defined term — resolve it or rename one")

    for d in model.get("dialogues", []) or []:
        ctx = d.get("context")
        if ctx and ctx not in contexts:
            warn(f"dialogue {d.get('title')!r} references unknown context {ctx!r}")




def gen_overview(model):
    lines = [f"# {model.get('project', 'Domain')} — Domain Overview", ""]
    if model.get("description"):
        lines += [str(model["description"]).strip(), ""]
    if model.get("version"):
        lines += [f"*Model version {model['version']}. Generated from `model.yaml` — do not edit by hand.*", ""]

    ctxs = model.get("contexts", [])
    if ctxs:
        lines += ["## Bounded contexts", ""]
        for c in ctxs:
            lines.append(f"- **{c.get('name')}** — {str(c.get('description', '')).strip()}")
        lines.append("")



    ents_for_map = model.get("entities", [])
    if ctxs and ents_for_map:
        entity_ctx = {e.get("name"): e.get("context") for e in ents_for_map}
        edges = {}
        for e in ents_for_map:
            for r in e.get("relationships", []) or []:
                a, b = e.get("context"), entity_ctx.get(r.get("to"))
                if a and b and a != b:
                    edges.setdefault((a, b), set()).add(r.get("kind", "related"))
        if edges:
            lines += ["## Context map", "",
                      "Arrows point from the context that holds the reference "
                      "to the context it references.", "",
                      "```mermaid", "flowchart LR"]
            for c in ctxs:
                name = c.get("name")
                lines.append(f'    {mermaid_id(name)}["{name}"]')
            for (a, b), kinds in sorted(edges.items()):
                label = ", ".join(sorted(kinds))
                lines.append(f"    {mermaid_id(a)} -->|{label}| {mermaid_id(b)}")
            lines += ["```", ""]

    open_amb = [a for a in model.get("ambiguities", []) or [] if a.get("status", "open") == "open"]
    if open_amb:
        lines += ["## ⚠ Open ambiguities", "",
                  "These terms are contested or vague. Resolve them before writing specs that depend on them.", ""]
        for a in open_amb:
            lines.append(f"- **{a.get('phrase')}** — {str(a.get('issue', '')).strip()}")
            if a.get("options"):
                lines.append(f"  - Options: {', '.join(a['options'])}")
            if a.get("recommendation"):
                lines.append(f"  - Recommendation: {str(a['recommendation']).strip()}")
        lines.append("")

    ents = model.get("entities", [])
    rels = [(e.get("name"), r) for e in ents for r in e.get("relationships", []) or []]
    if ents:
        lines += ["## Entity relationships", "", "```mermaid", "erDiagram"]
        for e in ents:
            lines.append(f"    {mermaid_id(e.get('name'))} {{}}")
        card = {"has_one": "||--||", "has_many": "||--o{", "belongs_to": "}o--||", "references": "}o..o{"}
        for src, r in rels:
            arrow = card.get(r.get("kind"), "||--||")
            label = r.get("kind", "related")
            lines.append(f"    {mermaid_id(src)} {arrow} {mermaid_id(r.get('to'))} : {label}")
        lines += ["```", ""]

    lines += ["## Contents", "",
              "- [Glossary](glossary.md)",
              "- [Entities](entities.md)",
              "- [Business rules](rules.md)"]
    if model.get("events"):
        lines.append("- [Domain events](events.md)")
    lines.append("")
    return "\n".join(lines)


def gen_glossary(model):
    lines = [f"# Glossary — {model.get('project', 'Domain')}", "",
             "*Generated from `model.yaml` — do not edit by hand.*", ""]
    terms = sorted(model.get("terms", []), key=lambda t: str(t.get("name", "")).lower())
    if not terms:
        lines += ["_No terms defined yet._", ""]
    for t in terms:
        name = t.get("name")
        lines.append(f"## {name}")
        if t.get("context"):
            lines.append(f"*Context: {t['context']}*")
        lines += ["", str(t.get("definition", "")).strip(), ""]
        if t.get("synonyms"):
            lines.append(f"**Also known as:** {', '.join(t['synonyms'])}  ")
        if t.get("avoid"):
            lines.append(f"**Do not use:** {', '.join(t['avoid'])}  ")
        if t.get("examples"):
            lines.append("**Examples:** " + "; ".join(t["examples"]) + "  ")
        if t.get("see_also"):
            links = ", ".join(f"[{s}](#{slug(s)})" for s in t["see_also"])
            lines.append(f"**See also:** {links}  ")
        lines.append("")

    dialogues = model.get("dialogues", []) or []
    if dialogues:
        lines += ["---", "", "## Example dialogues", "",
                  "Short exchanges showing the terms used precisely at concept boundaries.", ""]
        for d in dialogues:
            lines.append(f"### {d.get('title', 'Dialogue')}")
            if d.get("context"):
                lines.append(f"*Context: {d['context']}*")
            lines.append("")
            for ln in d.get("lines", []) or []:
                lines.append(f"> **{ln.get('speaker', '?')}:** {str(ln.get('text', '')).strip()}")
            lines.append("")

    ambs = model.get("ambiguities", []) or []
    open_amb = [a for a in ambs if a.get("status", "open") == "open"]
    resolved = [a for a in ambs if a.get("status") == "resolved"]
    if open_amb:
        lines += ["---", "", "## ⚠ Flagged ambiguities", ""]
        for a in open_amb:
            lines.append(f"### {a.get('phrase')}")
            lines += ["", str(a.get("issue", "")).strip(), ""]
            if a.get("options"):
                lines.append(f"**Options:** {', '.join(a['options'])}  ")
            if a.get("recommendation"):
                lines.append(f"**Recommendation:** {str(a['recommendation']).strip()}  ")
            lines.append("")
    if resolved:
        lines += ["## Resolved ambiguities", ""]
        for a in resolved:
            lines.append(f"- **{a.get('phrase')}** — {str(a.get('resolution', '')).strip()}")
        lines.append("")
    return "\n".join(lines)


def gen_entities(model):
    lines = [f"# Entities — {model.get('project', 'Domain')}", "",
             "*Generated from `model.yaml` — do not edit by hand.*", ""]
    ents = model.get("entities", [])
    if not ents:
        return "\n".join(lines + ["_No entities defined yet._", ""])
    for e in ents:
        lines.append(f"## {e.get('name')}")
        if e.get("context"):
            lines.append(f"*Context: {e['context']}*")
        lines.append("")
        if e.get("description"):
            lines += [str(e["description"]).strip(), ""]

        attrs = e.get("attributes", []) or []
        if attrs:
            lines += ["| Attribute | Type | Required | Description |",
                      "|---|---|---|---|"]
            for a in attrs:
                req = "yes" if a.get("required") else ""
                lines.append(f"| `{a.get('name')}` | `{a.get('type', '')}` | {req} | {str(a.get('description', '')).strip()} |")
            lines.append("")

        rels = e.get("relationships", []) or []
        if rels:
            lines.append("**Relationships**")
            for r in rels:
                desc = str(r.get("description", "")).strip()
                lines.append(f"- {r.get('kind', 'related to')} **{r.get('to')}**" + (f" — {desc}" if desc else ""))
            lines.append("")

        states = e.get("states", []) or []
        if states:
            lines += ["**Lifecycle**", "", "```mermaid", "stateDiagram-v2"]
            for s in states:
                frm = "[*]" if s.get("from") == "[start]" else mermaid_id(s.get("from"))
                to = "[*]" if s.get("to") == "[end]" else mermaid_id(s.get("to"))
                trigger = str(s.get("trigger", "")).strip()
                lines.append(f"    {frm} --> {to}" + (f" : {trigger}" if trigger else ""))
            lines += ["```", ""]
    return "\n".join(lines)


def gen_rules(model):
    lines = [f"# Business Rules — {model.get('project', 'Domain')}", "",
             "*Generated from `model.yaml` — do not edit by hand. Cite rules by id in specs.*", ""]
    rules = model.get("rules", [])
    if not rules:
        return "\n".join(lines + ["_No rules defined yet._", ""])
    groups = {}
    for r in rules:
        targets = r.get("applies_to") or ["General"]
        groups.setdefault(targets[0], []).append(r)
    for target in sorted(groups):
        lines += [f"## {target}", ""]
        for r in groups[target]:
            lines.append(f"### {r.get('id')}")
            if r.get("context"):
                lines.append(f"*Context: {r['context']}*")
            lines += ["", str(r.get("statement", "")).strip(), ""]
            if r.get("rationale"):
                lines += [f"**Why:** {str(r['rationale']).strip()}", ""]
            targets = r.get("applies_to") or []
            if len(targets) > 1:
                lines += [f"**Also applies to:** {', '.join(targets[1:])}", ""]
    return "\n".join(lines)


def gen_events(model):
    lines = [f"# Domain Events — {model.get('project', 'Domain')}", "",
             "*Generated from `model.yaml` — do not edit by hand.*", ""]
    for ev in model.get("events", []):
        lines.append(f"## {ev.get('name')}")
        lines.append("")
        if ev.get("description"):
            lines += [str(ev["description"]).strip(), ""]
        if ev.get("entity"):
            lines.append(f"**Concerns:** {ev['entity']}  ")
        if ev.get("triggers"):
            lines.append(f"**Triggers:** {str(ev['triggers']).strip()}  ")
        lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("model", help="Path to domain model YAML (e.g. docs/domain/model.yaml)")
    ap.add_argument("-o", "--out", default="docs/domain", help="Output directory (default: docs/domain)")
    args = ap.parse_args()

    with open(args.model) as f:
        model = yaml.safe_load(f) or {}
    if "project" not in model:
        warn("model has no 'project' field")

    validate(model)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    files = {
        "overview.md": gen_overview(model),
        "glossary.md": gen_glossary(model),
        "entities.md": gen_entities(model),
        "rules.md": gen_rules(model),
    }
    if model.get("events"):
        files["events.md"] = gen_events(model)
    for name, content in files.items():
        (out / name).write_text(content)
        print(f"wrote {out / name}")


if __name__ == "__main__":
    main()
