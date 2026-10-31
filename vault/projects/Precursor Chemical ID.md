# Precursor Chemical ID

**What it is:** a public repo and site (glretief-ux/Precursor-Chemical-ID) for officers covering drug precursors and other chemicals used in illicit manufacture, including all INCB chemicals. Created 17 Oct 2026.

## How it works
- Identify a chemical by CAS number or UN number and see what it can be used for.
- Search whether a chemical is produced by the company named on the sticker.
- Explains how chemicals are controlled from manufacture to importer, which permits are needed and how to check them.
- Published with the [[GitHub Pages Workflow]].

## What is in the repo (glretief-ux/Precursor-Chemical-ID, public)
- Live site: https://glretief-ux.github.io/Precursor-Chemical-ID/ and a single offline file (dist/precursor-chemical-id.html) that works without internet on a phone or tablet.
- Tabs and features: Identify (name, CAS, UN or HS code), sticker and label check (company, spelling tolerance, CAS check digit, name-CAS-UN consistency), browse and CSV export, My companies (saved on the device only), and a World map of nationally controlled chemicals.
- Data: 51 INCB Table I and II substances and 53 non-scheduled chemicals, a short list of known producers and suppliers (indicative only), and national lists for 60+ countries and the EU. See [[Precursor Chemicals]].
- Also contains an EN/FR training course on precursor chemicals with a quiz and result collection ([[Precursor Chemicals Course]]).
- Every CAS must pass the check-digit test and be unique, or the build fails.

## Decisions
- Professional look: PCCP logo at the top, Verdana, white background with blue ([[PCCP House Style]]).
- Layout follows [[Seizure Watch]] so the dashboards feel like one family.

## Open items
- (suggested) Re-check the data whenever the INCB Red List is updated, and keep verifying the national lists marked partial.

Related: hazardous chemical news category in [[Seizure Watch]]. Chemical reference notes: [[Precursor Chemicals]]. Hub: [[Law Enforcement Tools]].
