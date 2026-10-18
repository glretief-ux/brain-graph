# Brain vault rules

The notes live in `vault/`. A GitHub Action turns them into a graph on every push.

## Conventions
- One idea per note, plain markdown, filename = title (e.g. `vault/skills/Keyword Research.md`).
- Link generously with `[[Note Name]]`. Every link becomes an edge in the graph.
- Folder decides the type shown in the graph (`skills/` -> skill, `tools/` -> tool, ...).
  To override, add frontmatter: `type: world`.
- New notes go in the best-fitting folder: router, wiki, concepts, suites, skills, tools, notes.
- Dated notes: `notes/2026-10-18 Topic.md`.
- Each new note links to at least one existing hub note (a suite, concept or wiki page).
- Start from `vault/router/Start Here.md` when looking for where something lives.

## Do not
- Do not edit `site/graph.json` by hand; it is generated.
- Do not rename notes without fixing the `[[links]]` that point to them.
