# Jarvis Services

Quick answers inside [[Brain Graph]] that need no AI key and no account. They run in the browser and call free public services.

- **Weather:** "what is the weather today", "weather tomorrow", "will it rain in Ghent tomorrow". Uses Open-Meteo.
- **Date and time:** "what time is it", "what time is it in Tokyo".
- **Home location:** say "my city is Brussels" once; it is stored in the browser only and used for weather and time.
- **Timers and reminders:** "set a timer for 10 minutes", "remind me at 3 pm to call Anna". They ring only while the page is open.
- **Currency and units:** "100 euros in rand", "5 miles in km". ECB rates through frankfurter.dev.
- **News:** "what is the news", "drug seizure news". A scheduled GitHub job refreshes site/news.json every three hours; sources are listed in scripts/news_feeds.json. Related: [[Seizure Watch]].

New services are one entry each in the SERVICES list in site/app.js.
