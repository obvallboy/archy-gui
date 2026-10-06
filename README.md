# Archy GUI

**The Web Dashboard for Archy** — the Architect-1 core AI of the Martian Empire.

This is the UI layer of the Archy system. It gives you a single place to:

- **🧠 Command Console** — talk to Archy and test commands against the Brain.
- **📡 Live Status Monitoring** — see at a glance whether the Brain is online, its latency, message count, and session uptime.
- **💾 Memory Visualization** — browse the session's conversation memory and the Architect-1 core's reactive **triggers**.

It pairs with [`archy-brain`](https://github.com/obvallboy/archy-brain) (the LLM + memory
middle layer) and the [`archy`](https://github.com/obvallboy/archy) Architect-1 core.

```
 Browser (dashboard)  ──►  archy-gui server  ──►  archy-brain /chat  ──►  LLM + FlashVault
      status · memory · console        /api proxy         OpenAI / Ollama
```

The dashboard never calls the Brain directly from the browser — it goes through this
server's `/api` proxy, so the Brain URL (and any API key the Brain holds) stays server-side.

## Run it

```bash
npm install
cp .env.example .env     # then edit BRAIN_URL to point at your Archy Brain
npm start
```

Open **http://localhost:3000**.

> No Brain running yet? The dashboard still loads — the status pill shows **Brain offline**
> and the console reports a clear error when you send a command. Start
> [`archy-brain`](https://github.com/obvallboy/archy-brain) on `:8787` (its default) and the
> pill turns green within ~10s.

### Configuration

| Variable    | Default                  | Description                                 |
| ----------- | ------------------------ | ------------------------------------------- |
| `PORT`      | `3000`                   | Port this dashboard listens on.             |
| `BRAIN_URL` | `http://localhost:8787`  | Base URL of the Archy Brain `/chat` server. |

### On Replit

1. Import this repo into a Node.js Repl.
2. In **Secrets**, set `BRAIN_URL` to your Archy Brain's URL
   (e.g. `https://archy-brain-username.repl.co`).
3. Run. The dashboard serves on the Repl's web port.

## API (served by this dashboard)

| Method | Route           | Purpose                                                    |
| ------ | --------------- | ---------------------------------------------------------- |
| `GET`  | `/api/health`   | Pings the Brain; returns `{ online, latencyMs, brainUrl }`.|
| `GET`  | `/api/config`   | Non-secret config for the UI.                              |
| `GET`  | `/api/triggers` | The Architect-1 reactive triggers (`data/triggers.json`).  |
| `POST` | `/api/chat`     | Proxies `{ messages:[...] }` to the Brain's `/chat`.       |

The Brain's `/chat` contract (unchanged): request `{ messages: [{role, content}, ...] }`,
response `{ text, actions }`.

## Project layout

```
archy-gui/
├── server.js              # Express: static dashboard + /api proxy to the Brain
├── data/triggers.json     # Architect-1 reactive-memory rules (visualized in the UI)
├── public/
│   ├── index.html         # Dashboard shell
│   ├── styles.css         # Martian Empire theme (deep-navy / cyan / orange)
│   ├── app.js             # Status polling, console, memory + triggers rendering
│   └── favicon.svg
├── vendor/openmontage/    # Vendored OpenMontage (AGPL-3.0) — see below
├── archy-montage/         # Standalone montage engine (separate CLI, not the UI)
├── NOTICE.md              # Licensing of bundled components
├── .env.example
└── package.json
```

> **`archy-montage/`** is a separate, self-contained tool in this repo — a
> local-first montage engine (declarative YAML → MP4 via ffmpeg, no API keys).
> It's intentionally **not** wired into this dashboard; it runs as its own CLI.
> See [`archy-montage/README.md`](archy-montage/README.md).

## Features in the UI

- Conversation and settings persist in `localStorage` across reloads.
- Enter to send, Shift+Enter for a newline; the composer auto-grows.
- Optional **read replies aloud** (browser speech synthesis) in Settings.
- Brain actions returned by `/chat` are shown as chips under each reply.
- Health is polled every 10s; session uptime ticks live.

## Roadmap

Following the Archy architecture, natural next steps for this dashboard:

- Swap vanilla JS for **React + WebSocket** for live streaming replies (zero-build today
  keeps it Replit-friendly; the `/api` contract is already the seam).
- Read memory back from **FlashVault** for a persistent, cross-session memory view.
- Trigger editor (create/edit/disable triggers from the UI).
- Agentic run viewer (step-by-step workflow execution from the Agentic Engine).

## Bundled: OpenMontage

`vendor/openmontage/` is a vendored copy of
[OpenMontage](https://github.com/calesthio/OpenMontage) — an open-source,
agentic **video-production** system (Python). It's bundled here as a related
tool in the Archy ecosystem; a natural follow-on is wiring its pipelines into
the dashboard as a video/connector panel.

It's a **source-complete, trimmed** copy (heavy demo media and the host-agent
integration files removed) pinned to a specific upstream commit — see
[`vendor/openmontage/VENDORED.md`](vendor/openmontage/VENDORED.md) for exactly
what's included and how to restore the full upstream.

> ⚠️ **License:** OpenMontage is **AGPL-3.0**, not MIT. See
> [`NOTICE.md`](NOTICE.md) for what that means for this repo. Short version:
> archy-gui's own code stays MIT; `vendor/openmontage/` stays AGPL-3.0; keep the
> two as separate processes to avoid AGPL copyleft reaching archy-gui's code.

## License

archy-gui's own code is **MIT**. Bundled third-party code carries its own
license — see [`NOTICE.md`](NOTICE.md).
