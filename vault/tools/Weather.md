# Weather

How Jarvis answers weather questions, and where to look when it is not enough. Part of [[Everyday Life]]; the quick-answer feature itself is listed in [[Jarvis Services]].

- **Ask Jarvis:** "what is the weather today", "will it rain tomorrow", "do I need an umbrella". It uses Open-Meteo (free, no account) for the home city, Brussels by default.
- **Other city:** "weather in Ghent tomorrow". Say "my city is Antwerp" once to change the home city on the web page. On the PC, change `home_name`, `home_lat` and `home_lon` in config.json.
- **What it gives:** the temperature range and the chance of rain for today or tomorrow. It does not give hour-by-hour detail.
- **Official Belgian forecast and warnings:** KMI-IRM (meteo.be). Use it for storm, ice and heat warnings.
- **Rain in the next two hours:** a rain radar such as buienradar.be or the Buienradar app. Better than any daily forecast for "should I leave now".
- **Rule of thumb:** under 20 percent chance of rain, no umbrella; over 60 percent, take one. In between, check the radar.
- **Limits:** the forecast is a model, not a promise, and is least reliable beyond three days.

Related: [[Public Transport]] (delays rise with snow and storms), [[Google Search]].
