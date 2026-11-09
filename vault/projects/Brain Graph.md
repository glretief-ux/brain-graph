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
- Jarvis picks the smartest free model the key can use (large model first, the next one when it is busy) instead of the small fast one.
- Jarvis ranks every note for each question, reads as much of the best ones as the model can take, follows short follow-up questions, and may answer general knowledge when the notes are silent (it says so).
- Jarvis memory: say "remember that ...", "what do you remember?" or "forget ...". Kept in the browser of that device only, never in this public repo.
- The repo is public, so notes here must not contain sensitive operational detail ([[Lessons Learned]]).

## Open items
- Create the Cloudflare Worker, add the API key and connect the chat.
- Keep adding notes as projects change ([[Open Items]]).
