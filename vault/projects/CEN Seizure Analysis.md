# CEN Seizure Analysis

**What it is:** analysis of WCO CEN/nCEN seizure exports to find risk patterns and anomalies, delivered as Excel dashboards and PowerPoint briefs. Source: [[WCO CEN nCEN Data]].

## How it works
- Case-level data becomes weighted yes/no risk flags, then a score, then a High / Medium / Low band ([[Risk Scoring]]). Weights are editable cells.
- A typical workbook has a dashboard (filters, KPIs, charts), free-text search, a risk register, anomaly notes, master data, raw detail lines and a separate tab for personal data.
- Country and corridor studies come as dashboards or slide briefs with the reasoning in the speaker notes.
- Quarterly refresh in [[Power BI]] (free tier) using a single Power Query paste.
- Exports are kept in a private [[GitHub]] repo for version history.
- A live dashboard ([[CEN Seizure Risk Board]]) and a monthly bulletin ([[CEN Monthly Bulletin]]) grew out of it.

## Decisions
- Fewest steps by default: the many-query Power BI build was too complicated, so it became one query. Offer depth only as an upgrade.
- Personal data stays on its own tab.
- Excel traps to remember: test in real Excel, not only LibreOffice (dropdown years are numbers in Excel and text elsewhere; literal dropdown lists are capped at 255 characters).
- M and DAX code cannot be run in Claude's environment, so say that plainly when handing it over.

## Open items (check status)
- Native pivot tables and an interactive route map were interrupted mid-build.
- A multi-country slide brief was in progress.

Hub: [[Law Enforcement Tools]]. Also covers [[UNODC-WCO Open Source Narcotics Data]].
