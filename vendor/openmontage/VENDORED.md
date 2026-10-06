# Vendored: OpenMontage

This directory is a **vendored copy** of OpenMontage, bundled into `archy-gui`.
It is third-party code with its own license — see [`LICENSE`](./LICENSE).

## Provenance

| | |
| --- | --- |
| **Upstream**   | https://github.com/calesthio/OpenMontage |
| **Website**    | https://openmontage.video |
| **Commit**     | `9327439db69021ab4b0e2776729bf3b58fdb5a87` |
| **Commit date**| 2026-10-03 |
| **Vendored on**| 2026-10-06 |
| **License**    | GNU AGPL v3.0 (see `LICENSE`, `THIRD_PARTY_NOTICES.md`) |

## What was trimmed

This is a **source-complete** copy with large, re-fetchable binaries removed to
keep `archy-gui` lean. Everything else (Python sources, skills, schemas,
pipelines, docs, and the `ink-theater` renderer) is included verbatim.

Removed from the upstream tree:

- **Heavy demo media — 41 files, ~58 MB**: `*.mp4` (3) and `*.mp3` (38).
  These are showcase/example assets, not required to read or run the code.
- **`.git/`** — this is a flat vendored copy, not a submodule or clone.
- **`.github/`** — upstream CI, funding, and promo assets (not relevant here).
- **`.claude/` and `CLAUDE.md`** — OpenMontage's Claude Code integration
  (its own skills + a "read AGENT_GUIDE.md first" router). These are removed so
  that vendoring OpenMontage here does **not** reprogram the agent environment
  of the host `archy-gui` repo (nested `CLAUDE.md` files and `.claude/skills/`
  are auto-loaded by Claude Code). OpenMontage's own agent guidance is still
  present in `AGENT_GUIDE.md`, `AGENTS.md`, and `skills/`. Other editors'
  configs (`.cursor/`, `.codex/`, `.windsurfrules`, `CURSOR.md`, `CODEX.md`,
  `COPILOT.md`) are kept — they don't affect Claude Code.

Apart from those omissions, file contents and line-endings are unchanged.

## Restoring the full upstream (incl. omitted media)

```bash
git clone https://github.com/calesthio/OpenMontage
cd OpenMontage
git checkout 9327439db69021ab4b0e2776729bf3b58fdb5a87
```

## Relationship to archy-gui

OpenMontage (a Python agentic video-production system) and `archy-gui` (a
Node.js dashboard) are **independent programs**. This repository ships them as
an aggregation; `archy-gui`'s own code does not import or link OpenMontage's
code. OpenMontage remains under its AGPL-3.0 license regardless of its location
here. See the repository-root `NOTICE.md`.

To update this vendored copy, re-run the trim against a newer upstream commit
and update the table above.
