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

## Chat ("Ask the brain")
**Free search mode works out of the box:** type a question and it shows the best-matching notes with a one-line
summary each. No account, no key, no cost.

**Optional: real answers (free).** Cloudflare Workers AI answers in full sentences from your notes, on Cloudflare's free tier.
1. dash.cloudflare.com (free account) -> Workers & Pages -> Create -> Create Worker -> name it `brain-chat` -> Deploy -> Edit code.
2. Replace everything with `worker/worker.js` from this repo -> Deploy.
3. Worker -> Settings -> Bindings -> Add -> **Workers AI**, variable name `AI` -> Deploy.
4. Put the Worker address (`https://brain-chat.<you>.workers.dev`) into `site/config.js` as `chatUrl`, commit.

**Optional: Claude answers (paid API).** Instead of step 3, add a secret named `ANTHROPIC_API_KEY`
(console.anthropic.com -> API keys; set a small spend limit). If both are present, Claude is used.

The Worker only answers requests from `https://glretief-ux.github.io` (add `ALLOWED_ORIGIN` to allow others).
Answers cite notes as buttons; tap one to jump to it. The mic and "Read answers aloud" use the browser's own speech features.

## J.A.R.V.I.S. orb
The glowing ring top-right shows what Jarvis is doing (standby, listening, thinking, speaking). **Tap it to talk**; answers are read aloud.

## Controls
| Action | Touch | Mouse |
|---|---|---|
| Focus a note | tap | click |
| Trace a path | Path button, then tap two notes | shift-click second note |
| Pan / zoom | drag / pinch | drag / wheel |
| Move a node | drag it | drag it |

Deep link to a note: `.../index.html#skills/Keyword%20Research`
