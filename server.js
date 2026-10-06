// Archy GUI — Web Dashboard server
//
// Serves the dashboard (public/) and acts as a thin proxy between the browser
// and the Archy Brain (https://github.com/obvallboy/archy-brain). Keeping the
// Brain behind this server means the browser never needs the Brain URL (or any
// API key the Brain holds) and we avoid cross-origin surprises.
//
// Env:
//   PORT       - port this dashboard listens on          (default 3000)
//   BRAIN_URL  - base URL of the Archy Brain /chat server (default http://localhost:8787)

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const BRAIN_URL = (process.env.BRAIN_URL || "http://localhost:8787").replace(/\/+$/, "");
const HEALTH_TIMEOUT_MS = 4000;
const CHAT_TIMEOUT_MS = 60000;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "*" }));

// fetch with a timeout so a dead Brain never hangs the dashboard.
async function fetchWithTimeout(url, options = {}, timeoutMs = CHAT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- API ----------------------------------------------------------------

// Non-secret config the dashboard is allowed to display.
app.get("/api/config", (_req, res) => {
  res.json({ brainUrl: BRAIN_URL, version: "1.0.0" });
});

// Live status: is the Brain reachable? Report latency so the UI can show it.
app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  try {
    const r = await fetchWithTimeout(`${BRAIN_URL}/`, { method: "GET" }, HEALTH_TIMEOUT_MS);
    const text = await r.text();
    res.json({
      online: r.ok,
      brainUrl: BRAIN_URL,
      status: r.status,
      latencyMs: Date.now() - startedAt,
      message: text.slice(0, 200),
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.json({
      online: false,
      brainUrl: BRAIN_URL,
      latencyMs: Date.now() - startedAt,
      error: String(e?.message || e),
      checkedAt: new Date().toISOString(),
    });
  }
});

// Triggers (the agent's reactive-memory rules, mirrors archy core's triggers.json).
app.get("/api/triggers", (_req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", "triggers.json"), "utf-8");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Command console: forward the conversation to the Brain's /chat endpoint.
app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0) {
    return res.status(400).json({ error: "messages[] is required" });
  }
  try {
    const r = await fetchWithTimeout(
      `${BRAIN_URL}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      },
      CHAT_TIMEOUT_MS
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error || `Brain returned ${r.status}` });
    }
    res.json({ text: data.text || "", actions: data.actions || [] });
  } catch (e) {
    const offline = e?.name === "AbortError" || /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(e?.message));
    res.status(502).json({
      error: offline
        ? `Could not reach the Archy Brain at ${BRAIN_URL}. Is it running?`
        : String(e?.message || e),
      offline,
    });
  }
});

// ---- Static dashboard ---------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

// SPA-ish fallback: send the dashboard for any non-API GET.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🪐 Archy GUI dashboard on http://localhost:${PORT}`);
  console.log(`   Proxying Brain at ${BRAIN_URL}`);
});
