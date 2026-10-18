# Seizure Watch

**What it is:** a daily open-source news monitor for illegal drug seizures, with risk analysis to support officers. Live at https://glretief-ux.github.io/Seizure-watch-/ (repo glretief-ux/Seizure-watch-, public).

## How it works
- A daily [[GitHub]] Actions run searches the web, extracts the details and publishes the dashboard through the [[GitHub Pages Workflow]] (main branch, /docs folder).
- Searches run in several languages (Arabic, Turkish, Russian, Chinese, Hindi; Vietnamese for ivory) and reports are translated into English automatically.
- Extraction picks up ports, airports, vessels, shipping lines and cover cargo.
- Categories: drugs, CITES timber, elephant ivory, protected fauna, hazardous chemicals (the last two feed [[CITES Timber ID]] and [[Precursor Chemical ID]]).
- Dashboard features: month / all-time dropdown on the Seizure Events card, a "How risk is scored" box, and a view counter ([[GoatCounter]]).

## Reports
- Daily 10am one-page bulletin of the top 10 articles, with seizure photos only where available.
- Monday 10am one-page A4 weekly report on smuggling routes (map of origin and destination plus a bar chart). Both use the PCCP banner ([[PCCP House Style]]).

## Decisions
- Risk score uses five capped dimensions and seizure weight is limited to 10 points, so size alone never decides ([[Risk Scoring]]).
- Repo made public because Pages needs it.
- Its look is the model for the other dashboards.

## Requested improvements (check status before relying on them)
- Watchlists and alerts as the first risk-profiling upgrade.
- Coverage map showing language blind spots.
- Weekly one-page bulletin emailed with new corridors and unusual events.
- Test the risk score against seizure case data ([[CEN Seizure Analysis]]).

Hub: [[Law Enforcement Tools]].
