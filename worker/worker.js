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
//   GROQ_MODEL         Groq chat model (default: llama-3.3-70b-versatile)
//   STT_MODEL          free speech-to-text model (default: @cf/openai/whisper-large-v3-turbo)

const DEFAULT_ORIGIN = "https://glretief-ux.github.io";

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

const SYSTEM = `You are J.A.R.V.I.S., the assistant for the user's personal knowledge base (their "second brain").
Answer using ONLY the notes provided below. If the notes do not contain the answer, say so briefly and suggest which note could be added.
Be concise: one to four short sentences, or a short list. Plain language, no preamble.
Whenever you mention a note, write its exact title in double square brackets, like [[Seizure Watch]].
Never invent details that are not in the notes.`;

// ---- Groq (free tier, separate daily allowance from Cloudflare) ----
async function groqChat(env, messages, max_tokens) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.GROQ_API_KEY },
    body: JSON.stringify({ model: env.GROQ_MODEL || "llama-3.3-70b-versatile", messages, max_tokens, temperature: 0.3 }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || "Groq error " + r.status);
  return String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "").trim();
}
async function cfChat(env, messages, max_tokens) {
  const out = await env.AI.run(env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8", { messages, max_tokens });
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
    const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, useClaude || env.GROQ_API_KEY ? 25 : 10);
    const textCap = useClaude || env.GROQ_API_KEY ? 2500 : 1200; // free model gets a smaller context
    const context = notes
      .map((n) => `## ${String(n.title).slice(0, 120)} (${String(n.type).slice(0, 30)})\n${String(n.text).slice(0, textCap)}`)
      .join("\n\n");

    // keep only well-formed, alternating history that starts with a user turn
    const messages = [];
    for (const m of (Array.isArray(body.history) ? body.history : []).slice(-6)) {
      const role = m && m.role;
      const content = String((m && m.content) || "").slice(0, 1500);
      if (!content || (role !== "user" && role !== "assistant")) continue;
      const expected = messages.length % 2 === 0 ? "user" : "assistant";
      if (role === expected) messages.push({ role, content });
    }
    if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
    messages.push({ role: "user", content: question });

    const system = `${SYSTEM}\n\nNOTES:\n\n${context}`;

    if (!useClaude) {
      try {
        const answer = await freeChat(env, [{ role: "system", content: system }, ...messages], 500);
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
        max_tokens: 700,
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
