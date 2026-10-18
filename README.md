# Brain Graph

An interactive graph of your markdown notes that runs in Safari on iPad, iPhone or desktop.
Tap a note to focus it, switch on **Path** and tap a second note to trace the route between them.

```
vault/             your markdown notes ([[wiki links]] become edges)
scripts/           build_graph.py (notes -> site/graph.json)
site/              the viewer (index.html, app.js, style.css)
.github/workflows  pages.yml: rebuilds and deploys on every push
CLAUDE.md          rules Claude follows when editing the vault
```

## Put it online (all doable from an iPad)
1. Create a GitHub repo and upload this folder's contents (or push from Claude Code on the web).
2. Repo **Settings -> Pages -> Source: GitHub Actions**.
3. Push to `main`. The Action builds `graph.json` and publishes `site/`.
4. Open the Pages URL in Safari, then Share -> **Add to Home Screen**.

## Use your own notes
Replace the contents of `vault/` with your notes (an Obsidian vault works as-is).
Type comes from the top-level folder (`skills/` -> skill) or from `type:` in frontmatter.
Folders starting with `.` (like `.obsidian`) are ignored.

## Run locally
```
python scripts/build_graph.py vault site/graph.json
cd site && python -m http.server 8000     # open http://localhost:8000
```

## Controls
| Action | Touch | Mouse |
|---|---|---|
| Focus a note | tap | click |
| Trace a path | Path button, then tap two notes | shift-click second note |
| Pan / zoom | drag / pinch | drag / wheel |
| Move a node | drag it | drag it |

Deep link to a note: `.../index.html#skills/Keyword%20Research`
