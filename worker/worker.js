// Cloudflare Worker: a tiny proxy between the Brain Graph page and the Claude API.
// Two ways to power it:
//   FREE:  add a "Workers AI" binding named AI (Worker -> Settings -> Bindings). No key, no card.
//   CLAUDE: add a secret named ANTHROPIC_API_KEY (paid API). If both exist, Claude is used.
// The key, if any, lives ONLY here, never in the page.
//
// Optional settings (Worker -> Settings -> Variables):
//   ALLOWED_ORIGIN     comma-separated sites allowed to call this (default: your GitHub Pages site)
//   MODEL              Claude model name (default: claude-sonnet-5-5)
//   WORKERS_AI_MODEL   free model name (default: @cf/meta/llama-3.1-8b-instruct-fp8)
//   STT_MODEL          free speech-to-text model (default: @cf/openai/whisper-large-v3-turbo)

const DEFAULT_ORIGIN = "https://glretief-ux.github.io";

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

const SYSTEM = `You are J.A.R.V.I.S., the assistant for the user's personal knowledge base (their "second brain").
Answer using ONLY the notes provided below. If the notes do not contain the answer, say so briefly and suggest which note could be added.
Be concise: one to four short sentences, or a short list. Plain language, no preamble.
Whenever you mention a note, write its exact title in double square brackets, like [[Seizure Watch]].
Never invent details that are not in the notes.`;

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
    if (!env.ANTHROPIC_API_KEY && !env.AI) return json({ error: "Worker has no AI binding (free) or ANTHROPIC_API_KEY secret yet" }, 500, cors);

    // Voice: the page posts a short audio clip, we answer with the transcript (free Whisper on Workers AI)
    const ctype = req.headers.get("Content-Type") || "";
    if (ctype.startsWith("audio/") || ctype.startsWith("video/")) {
      if (!env.AI) return json({ error: "Voice needs the Workers AI binding named AI" }, 500, cors);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 6 * 1024 * 1024) return json({ error: "Audio empty or too long" }, 400, cors);
      try {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const out = await env.AI.run(env.STT_MODEL || "@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin) });
        return json({ text: String((out && out.text) || "").trim() }, 200, cors);
      } catch (e) {
        return json({ error: "Transcription error: " + (e && e.message ? e.message : "unknown") }, 502, cors);
      }
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }

    const question = String(body.question || "").trim().slice(0, 1000);
    if (!question) return json({ error: "Empty question" }, 400, cors);

    const useClaude = Boolean(env.ANTHROPIC_API_KEY);
    const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, useClaude ? 25 : 10);
    const textCap = useClaude ? 2500 : 1200; // free model gets a smaller context
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
        const out = await env.AI.run(env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8", {
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 500,
        });
        const answer = String((out && (out.response || out.result)) || "").trim();
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
