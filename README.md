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

## Chat setup ("Ask the brain")
The chat sends your question plus the most relevant notes to Claude. The API key never goes in the page;
it lives in a small Cloudflare Worker (`worker/worker.js`). Free Cloudflare plan is enough.

1. **API key:** console.anthropic.com -> API keys -> create one. Set a small monthly spend limit (for example $5).
2. **Worker:** dash.cloudflare.com (free account) -> Workers & Pages -> Create -> Create Worker -> name it `brain-chat` -> Deploy -> Edit code.
   Replace everything with the contents of `worker/worker.js` -> Deploy.
3. **Secret:** Worker -> Settings -> Variables and Secrets -> Add -> type **Secret**, name `ANTHROPIC_API_KEY`, paste the key -> Deploy.
4. **Connect:** copy the Worker address (`https://brain-chat.<you>.workers.dev`) into `site/config.js` as `chatUrl`, commit.

The Worker only answers requests coming from `https://glretief-ux.github.io`. To allow another site, add a Worker
variable `ALLOWED_ORIGIN`. Answers cite notes as buttons; tap one to jump to it. The mic and "Read answers aloud"
use the browser's own speech features (microphone works best in Safari/Chrome).

## Controls
| Action | Touch | Mouse |
|---|---|---|
| Focus a note | tap | click |
| Trace a path | Path button, then tap two notes | shift-click second note |
| Pan / zoom | drag / pinch | drag / wheel |
| Move a node | drag it | drag it |

Deep link to a note: `.../index.html#skills/Keyword%20Research`
