"use strict";
/* ---------- platform: "sample" = Claude via the Anthropic Messages API ----------
   Same shape as the claude.ai capability the app was written for:
     await s(promptOrTurns, { onText, signal, cache, images })  -> { text }
     await s.json(prompt, opts)                                 -> parsed JSON
     await s.limits()                                           -> { images: true }
   Errors are thrown as { code, text } with the codes errCopy() understands. */
const PW_MODEL = "claude-sonnet-5-5";
const PW_CACHE_COL = "_cache";

PW.makeSample = function (apiKey, kv) {
  const { Anthropic } = window.PWDeps;
  // The key never leaves the device except in the request header to api.anthropic.com.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function sha(parts) {
    const buf = new TextEncoder().encode(parts.join("\u0000"));
    const h = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // turns: a string, or [{role, content}] where consecutive same-role turns are merged
  async function toMessages(input, images) {
    const turns = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const msgs = [];
    for (const t of turns) {
      const last = msgs[msgs.length - 1];
      if (last && last.role === t.role) last.content.push({ type: "text", text: String(t.content) });
      else msgs.push({ role: t.role, content: [{ type: "text", text: String(t.content) }] });
    }
    // chat sends the whole paper as the first turn: cache it so follow-up questions are cheap
    if (typeof input !== "string" && msgs[0] && msgs.length > 1) msgs[0].content[msgs[0].content.length - 1].cache_control = { type: "ephemeral" };
    if (images && images.length) {
      const blocks = [];
      for (const im of images) blocks.push({ type: "image", source: { type: "base64", media_type: im.type || "image/jpeg", data: await toB64(im) } });
      msgs[msgs.length - 1].content.unshift(...blocks);
    }
    return msgs;
  }

  function mapError(e, text) {
    if (e && e.code) return e;
    const out = { code: "unknown", text };
    const A = Anthropic;
    if (e instanceof A.APIUserAbortError || (e && e.name === "AbortError")) out.code = "cancelled";
    else if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) out.code = "bad_key";
    else if (e instanceof A.RateLimitError) out.code = "rate_limited";
    else if (e instanceof A.BadRequestError) out.code = /too long|too many tokens|context/i.test(e.message) ? "prompt_too_large" : /image/i.test(e.message) ? "image_rejected" : "bad_request";
    else if (e instanceof A.APIConnectionError) out.code = PW.online() ? "network" : "offline";
    else if (e instanceof A.APIError) out.code = e.status === 529 || e.status >= 500 ? "overloaded" : "unknown";
    if (out.code === "unknown") PW.log.error("claude", e && e.message); // message only; never the key
    return out;
  }

  async function run(input, opts = {}) {
    if (!PW.online()) throw { code: "offline" };
    const images = opts.images || [];
    const cacheOn = opts.cache && opts.cache !== false;
    let ck = null;
    if (cacheOn) {
      const imgKeys = await Promise.all(images.map(async b => sha([await toB64(b)])));
      ck = await sha([PW_MODEL, JSON.stringify(input), ...imgKeys]);
      if (!opts.cache.refresh) {
        const hit = await kv.get(PW_CACHE_COL, ck);
        if (hit && Date.now() - hit.at < (opts.cache.gcTime || 864e5)) { opts.onText && opts.onText({ text: hit.text }); return { text: hit.text }; }
      }
    }
    const params = {
      model: PW_MODEL,
      max_tokens: opts.maxTokens || 16000,
      messages: await toMessages(input, images),
      output_config: { effort: opts.effort || "low" },
      // if Sonnet declines on a safety category, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    };
    let text = "";
    try {
      const stream = client.beta.messages.stream(params, { signal: opts.signal });
      stream.on("text", d => { text += d; opts.onText && opts.onText({ text }); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw { code: "refused", text };
      text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    } catch (e) { throw mapError(e, text); }
    if (ck) kv.put(PW_CACHE_COL, ck, { text, at: Date.now() }).catch(() => {});
    return { text };
  }

  function parseJSON(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    throw { code: "invalid_json", text };
  }

  const s = (input, opts) => run(input, opts);
  s.json = async (prompt, opts = {}) => parseJSON((await run(prompt, { ...opts, effort: opts.effort || "medium" })).text);
  s.limits = async () => ({ images: true });
  return s;
};
