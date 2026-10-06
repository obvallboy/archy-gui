// Archy GUI — dashboard client
// Talks to this dashboard's own /api proxy, which forwards to the Archy Brain.

const $ = (sel) => document.querySelector(sel);

const el = {
  log: $("#log"),
  input: $("#input"),
  composer: $("#composer"),
  sendBtn: $("#sendBtn"),
  clearBtn: $("#clearBtn"),
  brainPill: $("#brainPill"),
  brainPillText: $("#brainPillText"),
  statBrain: $("#statBrain"),
  statLatency: $("#statLatency"),
  statMessages: $("#statMessages"),
  statUptime: $("#statUptime"),
  statEndpoint: $("#statEndpoint"),
  memoryList: $("#memoryList"),
  triggerList: $("#triggerList"),
  // settings
  settingsBtn: $("#settingsBtn"),
  settingsOverlay: $("#settingsOverlay"),
  settingsClose: $("#settingsClose"),
  settingsSave: $("#settingsSave"),
  setName: $("#setName"),
  setSpeak: $("#setSpeak"),
  setEndpoint: $("#setEndpoint"),
};

const STORAGE_KEY = "archy.gui.v1";

const state = {
  messages: [], // {role, content, ts, actions?}
  settings: { name: "Archy", speak: false },
  startedAt: Date.now(),
  online: null,
};

// ---- persistence --------------------------------------------------------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.messages = Array.isArray(saved.messages) ? saved.messages : [];
      state.settings = { ...state.settings, ...(saved.settings || {}) };
    }
  } catch (_) { /* ignore corrupt storage */ }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages: state.messages,
      settings: state.settings,
    }));
  } catch (_) { /* storage may be unavailable (private mode) */ }
}

// ---- rendering ----------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderLog() {
  el.log.innerHTML = "";
  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="big">🪐</div>
      <p>Archy is standing by. Send a command to begin.</p>
    `;
    el.log.appendChild(empty);
    return;
  }
  for (const m of state.messages) el.log.appendChild(bubbleFor(m));
  scrollToBottom();
}

function bubbleFor(m) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg--${m.role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = m.content;
  wrap.appendChild(bubble);

  if (m.role === "assistant" && Array.isArray(m.actions) && m.actions.length) {
    const actions = document.createElement("div");
    actions.className = "actions";
    for (const a of m.actions) {
      const chip = document.createElement("span");
      chip.className = "action-chip";
      chip.textContent = typeof a === "string" ? a : JSON.stringify(a);
      actions.appendChild(chip);
    }
    wrap.appendChild(actions);
  }

  const label =
    m.role === "user" ? "You" :
    m.role === "assistant" ? (state.settings.name || "Archy") :
    m.role;
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = label;
  wrap.appendChild(meta);

  return wrap;
}

function scrollToBottom() {
  el.log.scrollTop = el.log.scrollHeight;
}

function renderMemory() {
  el.memoryList.innerHTML = "";
  const chat = state.messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (chat.length === 0) {
    el.memoryList.innerHTML = `<li class="muted">No memories yet this session.</li>`;
    return;
  }
  for (const m of chat.slice(-30)) {
    const li = document.createElement("li");
    li.className = "memory-item" + (m.role === "user" ? " is-user" : "");
    const role = m.role === "user" ? "You" : (state.settings.name || "Archy");
    li.innerHTML = `<span class="role">${escapeHtml(role)}</span><span class="text">${escapeHtml(m.content)}</span>`;
    el.memoryList.appendChild(li);
  }
}

function renderStats() {
  el.statMessages.textContent = String(
    state.messages.filter((m) => m.role === "user" || m.role === "assistant").length
  );
}

// ---- status monitoring --------------------------------------------------

function setBrainStatus(online, detail = {}) {
  state.online = online;
  const cls = online === null ? "pill--unknown" : online ? "pill--online" : "pill--offline";
  el.brainPill.className = `pill ${cls}`;
  el.brainPillText.textContent = online === null ? "Connecting…" : online ? "Brain online" : "Brain offline";
  el.statBrain.textContent = online === null ? "—" : online ? "Online" : "Offline";
  // Only update latency when a fresh reading is supplied; otherwise keep the
  // last known value (e.g. after a chat send, which doesn't re-measure).
  if (detail.latencyMs != null) el.statLatency.textContent = `${detail.latencyMs} ms`;
  else if (online === false) el.statLatency.textContent = "—";
}

async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const d = await r.json();
    setBrainStatus(!!d.online, d);
    if (d.brainUrl) {
      el.statEndpoint.textContent = d.brainUrl;
      el.setEndpoint.textContent = d.brainUrl;
    }
  } catch (_) {
    setBrainStatus(false);
  }
}

function tickUptime() {
  const s = Math.floor((Date.now() - state.startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  el.statUptime.textContent = h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

// ---- triggers -----------------------------------------------------------

async function loadTriggers() {
  try {
    const r = await fetch("/api/triggers");
    const triggers = await r.json();
    el.triggerList.innerHTML = "";
    if (!Array.isArray(triggers) || triggers.length === 0) {
      el.triggerList.innerHTML = `<li class="muted">No triggers loaded.</li>`;
      return;
    }
    for (const t of triggers) {
      const li = document.createElement("li");
      li.className = "trigger-item";
      li.innerHTML = `
        <span class="ttype">${escapeHtml(t.type || "trigger")}</span>
        <div class="tmatch">${escapeHtml(JSON.stringify(t.match || {}))}</div>
        <div class="taction">${escapeHtml(t.action || "")}</div>
      `;
      el.triggerList.appendChild(li);
    }
  } catch (_) {
    el.triggerList.innerHTML = `<li class="muted">Could not load triggers.</li>`;
  }
}

// ---- sending ------------------------------------------------------------

let busy = false;

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg msg--assistant";
  wrap.id = "typing-indicator";
  wrap.innerHTML = `<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  el.log.appendChild(wrap);
  scrollToBottom();
}
function hideTyping() {
  document.getElementById("typing-indicator")?.remove();
}

function pushMessage(m) {
  state.messages.push({ ...m, ts: Date.now() });
  save();
  renderLog();
  renderMemory();
  renderStats();
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  el.sendBtn.disabled = true;

  pushMessage({ role: "user", content: text.trim() });
  showTyping();

  // Only send real chat turns (user/assistant) to the Brain.
  const payload = state.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
    });
    const d = await r.json().catch(() => ({}));
    hideTyping();

    if (!r.ok) {
      pushMessage({ role: "error", content: d.error || `Request failed (${r.status})` });
      if (d.offline) setBrainStatus(false);
    } else {
      pushMessage({ role: "assistant", content: d.text || "(no reply)", actions: d.actions || [] });
      setBrainStatus(true);
      if (state.settings.speak && d.text) speak(d.text);
    }
  } catch (e) {
    hideTyping();
    pushMessage({ role: "error", content: `Network error: ${e?.message || e}` });
  } finally {
    busy = false;
    el.sendBtn.disabled = false;
    el.input.focus();
  }
}

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) { /* no-op */ }
}

// ---- input UX -----------------------------------------------------------

function autoGrow() {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
}

el.input.addEventListener("input", autoGrow);
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    el.composer.requestSubmit();
  }
});

el.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.input.value;
  el.input.value = "";
  autoGrow();
  send(text);
});

el.clearBtn.addEventListener("click", () => {
  if (state.messages.length && !confirm("Clear this conversation?")) return;
  state.messages = [];
  save();
  renderLog();
  renderMemory();
  renderStats();
});

// ---- tabs ---------------------------------------------------------------

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    $(`#tab-${tab.dataset.tab}`).classList.add("is-active");
  });
});

// ---- settings -----------------------------------------------------------

function openSettings() {
  el.setName.value = state.settings.name || "";
  el.setSpeak.checked = !!state.settings.speak;
  el.settingsOverlay.hidden = false;
}
function closeSettings() {
  state.settings.name = el.setName.value.trim() || "Archy";
  state.settings.speak = el.setSpeak.checked;
  save();
  renderLog();
  renderMemory();
  el.settingsOverlay.hidden = true;
}

el.settingsBtn.addEventListener("click", openSettings);
el.settingsClose.addEventListener("click", closeSettings);
el.settingsSave.addEventListener("click", closeSettings);
el.settingsOverlay.addEventListener("click", (e) => {
  if (e.target === el.settingsOverlay) closeSettings();
});

// ---- boot ---------------------------------------------------------------

load();
renderLog();
renderMemory();
renderStats();
loadTriggers();
checkHealth();
tickUptime();

setInterval(checkHealth, 10000);
setInterval(tickUptime, 1000);
el.input.focus();
