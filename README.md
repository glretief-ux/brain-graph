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

## Optional: VoiceStudio voice (your own PC)
[VoiceStudio](https://github.com/debpalash/VoiceStudio) is a free, local voice engine. Jarvis can speak, and optionally listen, through it. It runs on your PC, so it works in a desktop browser (Chrome or Edge) on that PC, not on the iPad.

1. Install and open VoiceStudio on the PC (releases page, or `curl -fsSL https://voicestudio.sh/install | sh`; on Windows `irm https://voicestudio.sh/install | iex`). Install a speech model when it asks. Leave it running.
2. Let this site talk to it. VoiceStudio only allows its own pages by default, so set this environment variable before starting it, then restart it:
   `OMNIVOICE_ALLOWED_ORIGINS=https://glretief-ux.github.io,http://localhost:3901,http://127.0.0.1:3901,tauri://localhost,http://tauri.localhost`
   (the variable replaces the default list, which is why the defaults are repeated; use your own UI port if it differs from 3901).
3. Open Brain Graph, panel -> Ask the brain -> **VoiceStudio (your own PC)**. Enter `http://localhost:3900`, an optional voice name (default `alloy`), and tick "Also use VoiceStudio to hear me" if you want it to do speech-to-text. Tap **Save and test**. If the browser asks to allow local network access, allow it.
4. Pick **VoiceStudio (your PC)** in the Voice list (it is selected for you after a successful test).

If the PC is off or VoiceStudio is closed, Jarvis switches to the free Jarvis voice or the device voice for that answer. Settings are stored in the browser only.

Notes: a plain `http://` address other than localhost is blocked by browsers on an https page; for other devices use an https address (for example Tailscale Serve) and set an API key (`OMNIVOICE_API_KEY`) which you enter in the same box. Never expose VoiceStudio to the open internet. VoiceStudio is AGPL-3.0: this repo only calls its API and contains none of its code. Clone voices only with permission.

## Services (weather, time, timers, news, conversions)
Jarvis answers these directly, with no AI key and no account:
- **Weather:** "What is the weather today?", "weather tomorrow", "will it rain in Ghent tomorrow?" (Open-Meteo). Say **"my city is Brussels"** once so it knows where you are (stored in your browser only).
- **Date and time:** "What time is it?", "what time is it in Tokyo?", "what is the date today?"
- **Timers and reminders:** "set a timer for 10 minutes", "remind me in 20 minutes to call Anna", "remind me at 3 pm to ...", "what timers do I have?", "cancel the timer". They ring (beep and voice) **only while this page is open**; they survive a reload. For anything important, add it to your calendar instead.
- **Currency and units:** "100 euros in rand", "convert 50 usd to eur", "5 miles in km", "20 degrees celsius in fahrenheit" (ECB rates through frankfurter.dev, about 30 currencies).
- **News:** "what is the news", "tech news", "business news", "Belgian news", "drug seizure news". Headlines come from `site/news.json`, which the GitHub Action rebuilds **every three hours** from the feeds listed in `scripts/news_feeds.json` (edit that file to change sources). To refresh now: repository -> Actions -> "Build graph and deploy to Pages" -> Run workflow.

To add another service, add an entry to the `SERVICES` list in `site/app.js` (`match(question)` decides if it applies, `run(question)` returns the text Jarvis says).

## J.A.R.V.I.S. orb
The glowing ring top-right shows what Jarvis is doing (standby, listening, thinking, speaking). **Tap it to talk**; answers are read aloud.

**Hands-free mode** (needs the free Worker above, redeployed with the latest `worker/worker.js`): tap the orb once. It listens, notices when you pause, transcribes with free Whisper on Workers AI, answers out loud, then listens again. Tap the orb to stop; it also stops itself after 12 seconds of silence. Browsers always need that first tap to open the microphone.

## Controls
| Action | Touch | Mouse |
|---|---|---|
| Focus a note | tap | click |
| Trace a path | Path button, then tap two notes | shift-click second note |
| Pan / zoom | drag / pinch | drag / wheel |
| Move a node | drag it | drag it |

Deep link to a note: `.../index.html#skills/Keyword%20Research`

## Jarvis voice
Pick a voice under "Read answers aloud". **Jarvis voice (free, unlimited)** uses MeloTTS through the Worker and costs almost nothing against the free Cloudflare allowance. **Jarvis premium voice (limited)** uses Deepgram Aura-2 (speaker set by `aiVoice` in `site/config.js`, default `draco`) and uses up the daily free allowance quickly (about 10 short answers); when it runs out the page switches to the free voice automatically.

## 3D view
The graph is 3D by default: drag empty space to rotate, pinch or scroll to zoom, drag a note to move it, and it slowly spins when idle. The **3D** button flattens it back to the classic 2D layout. Shift+drag pans in 3D.

## Calendar & Gmail
The "Calendar & Gmail" panel signs you in with Google inside your browser. Nothing is stored in the repo or on the Worker. When you ask Jarvis about your calendar or mail, the relevant text is sent along with that one question to your Worker's AI to answer it, then forgotten.

One-time setup (free):
1. console.cloud.google.com -> New project (name it `brain-graph`).
2. APIs & Services -> Library -> enable **Google Calendar API** and **Gmail API**.
3. APIs & Services -> OAuth consent screen (Google Auth Platform) -> External -> fill the app name and your email -> add yourself as a **Test user**. Leave it in Testing.
4. Credentials -> Create credentials -> **OAuth client ID** -> Web application -> Authorized JavaScript origin: `https://glretief-ux.github.io` -> Create.
5. Copy the Client ID (it ends in `.apps.googleusercontent.com`) into `site/config.js` as `googleClientId`.
Google shows an "unverified app" warning because it is your own test app: Advanced -> continue.

### Writing email
Say or type "Email Anna that the meeting moved to Thursday". Jarvis finds the address among people you recently emailed, writes the draft and shows it in the panel. **Nothing is sent until you tap Send**; you can edit the text first, **Save draft** (goes to your Gmail Drafts) or **Discard**. This needs the latest `worker/worker.js` (it adds a draft mode) and the Gmail "compose" permission, which Google asks for the next time you tap Connect Google.

## Second free AI: Groq
Cloudflare's free allowance is 10,000 units a day. For a separate allowance, create a free key at https://console.groq.com/keys and add it to the Worker as a secret named `GROQ_API_KEY`. The Worker then uses Groq first for answers, email drafts and speech-to-text, and falls back to Cloudflare if Groq is busy.

## More things Jarvis can do
- **Web research:** ask for anything current ("search the web for...", "latest news on...", "weather..."). The Worker searches DuckDuckGo (Wikipedia as backup) and Jarvis answers from the results.
- **Tour:** say "give me a tour". The camera flies through your most connected notes and Jarvis reads each one.
- **Briefing:** say "good morning" or "briefing" for today's calendar, unread email and open items.
- **Calendar events:** say "schedule a meeting with Anna on Thursday at 10". Jarvis fills in an event card and you tap Add. This needs the "calendar events" permission, so tap Sign out and Connect Google again once.

## Free AI key in the browser (no Worker needed)
Open the side panel, paste a free Groq key (https://console.groq.com/keys) under "Free AI key" and tap Save key. Answers, email drafts, calendar events and listening then run straight from your browser to Groq. The key is kept only in that browser and is never sent to this repo. The Worker is only used for the spoken AI voice.

A Google Gemini key (starts with `AIza`, free at https://aistudio.google.com/apikey) works in the same box as a Groq key.

## Wake phrase

Tick "Wake Jarvis by voice" in the panel and say "Hey Jarvis" (the phrase can be changed). Works while the page is open, best in Chrome or Edge.
