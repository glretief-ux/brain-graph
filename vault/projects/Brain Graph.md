# Brain Graph

**What it is:** this project, an interactive graph of markdown notes that runs on iPad. Live at https://glretief-ux.github.io/brain-graph/ (repo glretief-ux/brain-graph on [[GitHub]]). Built with [[Claude Code]]. Entry point: [[Start Here]].

## How it works
- Notes live in the vault/ folder; each double-bracket link becomes a line in the graph and the folder sets the type and colour.
- A GitHub Action rebuilds the graph on every push ([[GitHub Pages Workflow]]).
- "Ask the brain" chat sends your question plus the most relevant notes to Claude through a small Cloudflare Worker that holds the API key.

## Decisions
- Runs entirely in Safari so it works on iPad.
- Optional local voice for Jarvis through [[VoiceStudio]] when working on the PC.
- Quick answers (weather, date and time) through [[Jarvis Services]].
- The repo is public, so notes here must not contain sensitive operational detail ([[Lessons Learned]]).

## Open items
- Create the Cloudflare Worker, add the API key and connect the chat.
- Keep adding notes as projects change ([[Open Items]]).
