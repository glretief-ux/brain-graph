#!/usr/bin/env python3
"""Turn a folder of markdown notes into graph.json for the viewer.

Usage:  python scripts/build_graph.py [vault_dir] [output_json]
Defaults: vault  ->  site/graph.json

- Every .md file is a node (folders starting with "." are skipped).
- [[Wiki Links]] become edges ([[Note|alias]] and [[Note#heading]] work too).
- Node type = frontmatter `type:` if present, otherwise the top-level folder
  name (singularised: "skills" -> "skill"), otherwise "note".
- Standard library only, so it runs anywhere (including GitHub Actions).
"""
import json
import pathlib
import re
import sys
import datetime

LINK_RE = re.compile(r"\[\[([^\]\|#]+)(?:#[^\]\|]*)?(?:\|[^\]]*)?\]\]")
FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.S)
CODE_RE = re.compile(r"```.*?```", re.S)


def parse_frontmatter(text):
    m = FM_RE.match(text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t", "-")):
            key, val = line.split(":", 1)
            meta[key.strip().lower()] = val.strip().strip("\"'")
    return meta, text[m.end():]


def singular(word):
    word = word.lower()
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def excerpt(body, limit=320):
    text = CODE_RE.sub("", body)
    text = re.sub(r"^#+\s.*$", "", text, flags=re.M)
    text = LINK_RE.sub(lambda m: m.group(1), text)
    text = re.sub(r"[*_`>]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def main():
    vault = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "vault")
    out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "site/graph.json")
    if not vault.is_dir():
        sys.exit(f"Vault folder not found: {vault}")

    files = sorted(
        p for p in vault.rglob("*.md")
        if not any(part.startswith(".") for part in p.relative_to(vault).parts)
    )

    nodes, bodies, lookup = [], [], {}
    for p in files:
        rel = p.relative_to(vault)
        meta, body = parse_frontmatter(p.read_text(encoding="utf-8", errors="replace"))
        title = meta.get("title") or p.stem
        ntype = meta.get("type")
        if not ntype:
            ntype = singular(rel.parts[0]) if len(rel.parts) > 1 else "note"
        idx = len(nodes)
        nodes.append({
            "id": rel.with_suffix("").as_posix(),
            "title": title,
            "type": ntype.lower(),
            "excerpt": excerpt(body),
        })
        bodies.append(body)
        for key in (p.stem, title, rel.with_suffix("").as_posix()):
            lookup.setdefault(key.strip().lower(), idx)

    edges = set()
    unresolved = 0
    for i, body in enumerate(bodies):
        for target in LINK_RE.findall(CODE_RE.sub("", body)):
            j = lookup.get(target.strip().lower())
            if j is None:
                unresolved += 1
                continue
            if j != i:
                edges.add((min(i, j), max(i, j)))

    degree = [0] * len(nodes)
    for a, b in edges:
        degree[a] += 1
        degree[b] += 1
    for n, d in zip(nodes, degree):
        n["degree"] = d

    out.parent.mkdir(parents=True, exist_ok=True)
    # Full note text for the chat assistant (kept separate so the graph loads fast)
    out.with_name("notes.json").write_text(json.dumps([
        {"title": n["title"], "type": n["type"], "text": body.strip()[:3000]}
        for n, body in zip(nodes, bodies)
    ], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    out.write_text(json.dumps({
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "nodes": nodes,
        "links": sorted(edges),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(nodes)} notes, {len(edges)} connections, {unresolved} unresolved links -> {out}")


if __name__ == "__main__":
    main()
