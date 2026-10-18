# GitHub Pages Workflow

**What it is:** how tools get published from an iPad using only the GitHub website.

## Steps
1. Create the repo on [[GitHub]] (public if you want free Pages).
2. Upload files by dragging folders from the Files app in Split View.
3. Settings, Pages: set the source to the main branch /docs folder, or to GitHub Actions when a workflow builds the site.
4. A GitHub Action rebuilds data on every push or on a schedule.

## Gotchas learned
- "Add file" creates paths relative to the folder you are currently in, so open the repo root first.
- iOS hides dot-folders such as .github, so create workflow files with Add file, Create new file and type the path.
- Editing an existing file in the web editor can fail in this browser; deleting it and recreating it with Create new file works reliably.
- Private repos cannot use Pages on the free plan; keep sensitive data in private repos and open the file locally instead.
- A workflow pushed before Pages is switched on fails once; re-run it.

## Used by
[[Seizure Watch]], [[CITES Timber ID]], [[Precursor Chemical ID]], [[LE OSINT Framework]], [[Brain Graph]].
