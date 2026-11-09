// Cloudflare Worker: a tiny proxy between the Brain Graph page and the Claude API.
// Two ways to power it:
//   FREE:  add a "Workers AI" binding named AI (Worker -> Settings -> Bindings). No key, no card.
//   GROQ:   add a secret named GROQ_API_KEY (free key from console.groq.com). Used first for answers, drafts and voice
//           input; Workers AI is the automatic backup when Groq is busy, and the other way round.
//   CLAUDE: add a secret named ANTHROPIC_API_KEY (paid API). If both exist, Claude is used.
// The key, if any, lives ONLY here, never in the page.
//
// Optional settings (Worker -> Settings -> Variables):
//   ALLOWED_ORIGIN     comma-separated sites allowed to call this (default: your GitHub Pages site)
//   MODEL              Claude model name (default: claude-sonnet-5-5)
//   WORKERS_AI_MODEL   free model name (default: @cf/meta/llama-3.1-8b-instruct-fp8)
//   TTS_MODEL          free text-to-speech model (default: @cf/deepgram/aura-2-en)
//   GROQ_MODEL         Groq chat model (default: the smartest one your key can use, picked automatically)
//   STT_MODEL          free speech-to-text model (default: @cf/openai/whisper-large-v3-turbo)

const DEFAULT_ORIGIN = "https://glretief-ux.github.io";

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

const systemPrompt = (now) => `You are J.A.R.V.I.S., the user's personal assistant, working from their "second brain" of notes. It is now ${now}.
The NOTES below are the user's own knowledge base. They may also hold live calendar, Gmail and web results, and things the user asked you to remember.
- For anything about the user, their projects, plans, files, people or schedule, rely on the notes. Never invent personal details.
- Think before you answer: combine facts from several notes, compare, count, and work out dates, deadlines or next steps from today's date when that answers the question.
- If the notes do not cover it and it is general knowledge, answer from what you know and say in a few words that it is not from the notes. If it is personal and missing, say so briefly and name the note where it belongs.
- Use the earlier turns of the conversation to understand short follow-up questions.
- Match the length to the question. Normally one to four short sentences, because answers are read aloud. Give a longer answer or a short list only when asked to explain, list, compare, plan or advise.
- Lead with the answer. Plain language, no preamble, no headings or tables.
- When you use a note from the knowledge base, write its exact title in double square brackets, like [[Seizure Watch]].
- If the question could mean two things, answer the likelier one and ask one short question to check.`;

// ---- Groq (free tier, separate daily allowance from Cloudflare) ----
let groqList = null;
// Ask Groq which chat models this key can use, smartest first (models get renamed over time)
const GROQ_PREF = [/llama-3\.3-70b/, /gpt-oss-120b/, /kimi-k2/, /llama-4.*maverick/, /qwen/, /llama-4/, /70b/, /gpt-oss-20b/, /llama-3\.1-8b/];
async function groqRank(env) {
  if (groqList) return groqList;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: "Bearer " + env.GROQ_API_KEY }, signal: AbortSignal.timeout(6000) });
    const d = await r.json().catch(() => ({}));
    const ok = ((d && d.data) || []).map((m) => m.id).filter((id) => !/whisper|guard|tts|orpheus|playai|embed|safeguard|compound|allam/i.test(id));
    const out = [];
    for (const re of GROQ_PREF) for (const id of ok) if (re.test(id) && !out.includes(id)) out.push(id);
    for (const id of ok) if (!out.includes(id)) out.push(id);
    if (out.length) { groqList = out; return out; }
  } catch (e) { /* use the usual names */ }
  return ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];
}
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + " took too long")), ms))]);
// Best model first; if it is busy, over its free limit or retired, the next one answers
async function groqChat(env, messages, max_tokens) {
  const models = env.GROQ_MODEL ? [env.GROQ_MODEL, ...(await groqRank(env))] : await groqRank(env);
  const t0 = Date.now(); let lastErr = "no model available";
  for (const model of [...new Set(models)].slice(0, 3)) {
    if (Date.now() - t0 > 18000) break;
    const payload = { model, messages, max_tokens, temperature: 0.3 };
    if (/gpt-oss/.test(model)) { payload.reasoning_effort = "low"; payload.max_tokens = max_tokens + 700; }
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + env.GROQ_API_KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const t = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (t) return t;
        lastErr = model + " gave an empty answer"; continue;
      }
      lastErr = (d.error && d.error.message) || "Groq error " + r.status;
      if (r.status === 401) break;
    } catch (e) { lastErr = (e && e.message) || "Groq did not answer"; }
  }
  throw new Error(lastErr);
}
async function cfChat(env, messages, max_tokens) {
  const out = await withTimeout(env.AI.run(env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8", { messages, max_tokens }), 20000, "Workers AI");
  return String((out && (out.response || out.result)) || "").trim();
}
// Free chat: Groq first, Workers AI as backup (or the reverse if only one is set up)
async function freeChat(env, messages, max_tokens) {
  let err;
  if (env.GROQ_API_KEY) { try { const t = await groqChat(env, messages, max_tokens); if (t) return t; } catch (e) { err = e; } }
  if (env.AI) {
    try { return await cfChat(env, messages, max_tokens); }
    catch (e2) { throw new Error((err ? "Groq: " + err.message + " | " : "") + "Cloudflare: " + (e2 && e2.message ? e2.message : "error")); }
  }
  throw err || new Error("No free AI configured");
}
async function groqSTT(env, buf, ctype) {
  const ext = ctype.includes("webm") ? "webm" : ctype.includes("ogg") ? "ogg" : ctype.includes("wav") ? "wav" : ctype.includes("mpeg") ? "mp3" : "m4a";
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: ctype.split(";")[0] }), "clip." + ext);
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + env.GROQ_API_KEY }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || "Groq STT error " + r.status);
  return String(d.text || "").trim();
}

// ---- Live web search (free, no key): DuckDuckGo results, Wikipedia as backup ----
const strip = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
async function webSearch(q) {
  const out = [];
  try {
    const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), { headers: { "User-Agent": "Mozilla/5.0 (compatible; BrainGraph/1.0)" } });
    const html = await r.text();
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && out.length < 6) {
      let url = m[1]; const u = url.match(/uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
      out.push({ title: strip(m[2]).slice(0, 120), url, text: strip(m[3]).slice(0, 400) });
    }
  } catch (e) { /* try Wikipedia */ }
  if (out.length < 2) {
    try {
      const r = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=" + encodeURIComponent(q));
      const d = await r.json();
      for (const x of (d.query && d.query.search) || []) out.push({ title: x.title, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")), text: strip(x.snippet).slice(0, 300) });
    } catch (e) { /* nothing */ }
  }
  return out;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);
    if (!okOrigin) return json({ error: "Origin not allowed" }, 403, cors);
    if (!env.ANTHROPIC_API_KEY && !env.AI && !env.GROQ_API_KEY) return json({ error: "Worker has no AI binding (free), GROQ_API_KEY or ANTHROPIC_API_KEY secret yet" }, 500, cors);

    // Voice: the page posts a short audio clip, we answer with the transcript (free Whisper on Workers AI)
    const ctype = req.headers.get("Content-Type") || "";
    if (ctype.startsWith("audio/") || ctype.startsWith("video/")) {
      if (!env.AI && !env.GROQ_API_KEY) return json({ error: "Voice needs GROQ_API_KEY or the Workers AI binding named AI" }, 500, cors);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 6 * 1024 * 1024) return json({ error: "Audio empty or too long" }, 400, cors);
      let gErr = null;
      if (env.GROQ_API_KEY) {
        try { return json({ text: await groqSTT(env, buf, ctype) }, 200, cors); }
        catch (e) { if (!env.AI) return json({ error: "Transcription error: " + (e && e.message ? e.message : "unknown") }, 502, cors); gErr = e; }
      }
      try {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const out = await env.AI.run(env.STT_MODEL || "@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin) });
        return json({ text: String((out && out.text) || "").trim() }, 200, cors);
      } catch (e) {
        return json({ error: "Transcription error: " + (gErr ? "Groq: " + gErr.message + " | " : "") + (e && e.message ? e.message : "unknown") }, 502, cors);
      }
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }

    // Web search: the page sends {search}; we answer with {results:[{title,url,text}]}
    if (body.search) {
      const results = await webSearch(String(body.search).slice(0, 200));
      return json({ results }, 200, cors);
    }

    // Calendar event: the page sends {event, now}; we answer with {event:{title,start,end,location}} (local times, no timezone)
    if (body.event) {
      const sys = `You turn a request into one calendar event. Reply with ONLY JSON: {"title":"","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM","location":""}.
Current date and time: ${String(body.now || "").slice(0, 80)}. Resolve words like tomorrow or Thursday from it. Use 24-hour local times. If no duration is given use 1 hour. If no time is given use 09:00. Keep the title short.`;
      try {
        let text;
        if (env.ANTHROPIC_API_KEY) {
          const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 300, system: sys, messages: [{ role: "user", content: String(body.event).slice(0, 500) }] }) });
          const d = await r.json().catch(() => ({}));
          text = (d.content || []).map((b) => b.text || "").join("");
        } else text = await freeChat(env, [{ role: "system", content: sys }, { role: "user", content: String(body.event).slice(0, 500) }], 300);
        const m = text.match(/\{[\s\S]*\}/);
        const e = m ? JSON.parse(m[0]) : null;
        if (!e || !e.title || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.start || "")) return json({ error: "Could not understand the event, try rephrasing" }, 502, cors);
        return json({ event: { title: String(e.title).slice(0, 150), start: e.start.slice(0, 16), end: String(e.end || "").slice(0, 16), location: String(e.location || "").slice(0, 150) } }, 200, cors);
      } catch (err) {
        return json({ error: "Event error: " + (err && err.message ? err.message : "unknown") }, 502, cors);
      }
    }

    // Email drafting: the page sends {compose, contacts}; we answer with {draft:{to,subject,body}}. Nothing is sent from here.
    if (body.compose) {
      const request = String(body.compose).slice(0, 1000);
      const contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, 60).map((c) => String(c).slice(0, 120)).join("\n");
      const sys = `You write email drafts for the user. Reply with ONLY a JSON object: {"to":"","subject":"","body":""}.
"to" must be ONE email address: copy it from the CONTACTS list when a name in the request matches a contact, or use an address the request spells out. If nothing matches, leave "to" empty. Never invent an address.
Write the email in the same language as the request unless asked otherwise. Short, polite and natural, in the first person as the user, with a greeting and a closing line. No placeholders like [Your name] and no text outside the JSON.

CONTACTS:
${contacts || "(none)"}`;
      try {
        let text = "";
        if (env.ANTHROPIC_API_KEY) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: request }] }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) return json({ error: (d.error && d.error.message) || "Claude API error" }, 502, cors);
          text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        } else {
          text = await freeChat(env, [{ role: "system", content: sys }, { role: "user", content: request }], 600);
        }
        const m = text.match(/\{[\s\S]*\}/);
        const d = m ? JSON.parse(m[0]) : null;
        if (!d || !d.body) return json({ error: "Could not write a draft, try rephrasing" }, 502, cors);
        return json({ draft: { to: String(d.to || "").slice(0, 200), subject: String(d.subject || "").slice(0, 200), body: String(d.body).slice(0, 5000) } }, 200, cors);
      } catch (e) {
        return json({ error: "Draft error: " + (e && e.message ? e.message : "unknown") }, 502, cors);
      }
    }

    // Voice out: the page sends {speak, speaker}; we answer with an MP3 (Deepgram Aura-2 on Workers AI)
    if (body.speak) {
      if (!env.AI) return json({ error: "Voice needs the Workers AI binding named AI" }, 500, cors);
      const text = String(body.speak).slice(0, 600);
      const speaker = String(body.speaker || "draco").toLowerCase().replace(/[^a-z]/g, "").slice(0, 20) || "draco";
      try {
        const out = body.engine === "melo"
          ? await env.AI.run("@cf/myshell-ai/melotts", { prompt: text, lang: "en" })        // very cheap: fits the free plan all day
          : await env.AI.run(env.TTS_MODEL || "@cf/deepgram/aura-2-en", { text, speaker, encoding: "mp3" });
        let payload = out;
        if (out instanceof Response) payload = out.body;
        else if (out && typeof out === "object" && typeof out.audio === "string") {
          const bin = atob(out.audio); const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          payload = u8;
        }
        return new Response(payload, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", ...cors } });
      } catch (e) {
        return json({ error: "Speech error: " + (e && e.message ? e.message : "unknown") }, 502, cors);
      }
    }

    const question = String(body.question || "").trim().slice(0, 1000);
    if (!question) return json({ error: "Empty question" }, 400, cors);

    const useClaude = Boolean(env.ANTHROPIC_API_KEY);
    // The page sends its notes best match first; read as many as the model in use can take
    let room = useClaude ? 60000 : env.GROQ_API_KEY ? 14000 : 9000;
    const parts = [];
    for (const n of (Array.isArray(body.notes) ? body.notes : []).slice(0, 60)) {
      if (room < 200) break;
      const text = String((n && n.text) || "").slice(0, Math.min(room, useClaude ? 6000 : 4000));
      parts.push(`## ${String((n && n.title) || "").slice(0, 120)} (${String((n && n.type) || "").slice(0, 30)})\n${text}`);
      room -= text.length + 40;
    }
    const context = parts.join("\n\n");

    // keep only well-formed, alternating history that starts with a user turn
    const messages = [];
    for (const m of (Array.isArray(body.history) ? body.history : []).slice(-8)) {
      const role = m && m.role;
      const content = String((m && m.content) || "").slice(0, useClaude ? 1500 : 700);
      if (!content || (role !== "user" && role !== "assistant")) continue;
      const expected = messages.length % 2 === 0 ? "user" : "assistant";
      if (role === expected) messages.push({ role, content });
    }
    if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
    messages.push({ role: "user", content: question });

    const now = String(body.now || "").slice(0, 80) || new Date().toUTCString();
    const system = `${systemPrompt(now)}\n\nNOTES:\n\n${context}`;

    if (!useClaude) {
      try {
        const answer = await freeChat(env, [{ role: "system", content: system }, ...messages], 900);
        if (!answer) return json({ error: "The free model returned nothing" }, 502, cors);
        return json({ answer }, 200, cors);
      } catch (e) {
        return json({ error: "Free AI error: " + (e && e.message ? e.message : "unknown") }, 502, cors);
      }
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-sonnet-5-5",
        max_tokens: 1000,
        system,
        messages,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: (data.error && data.error.message) || "Claude API error" }, 502, cors);

    const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return json({ answer }, 200, cors);
  },
};
