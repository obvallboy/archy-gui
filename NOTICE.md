# NOTICES

This repository contains code under more than one license.

## archy-gui (this project's own code)

Licensed under the **MIT License** (see `package.json`). This covers the
dashboard: `server.js`, `public/`, `data/`, and this project's own docs.

## Bundled third-party component: OpenMontage

`vendor/openmontage/` is a vendored copy of **OpenMontage**
(https://github.com/calesthio/OpenMontage), licensed under the
**GNU Affero General Public License v3.0 (AGPL-3.0)**. Its full license text is
at `vendor/openmontage/LICENSE`, and provenance (the exact upstream commit and
what was trimmed) is at `vendor/openmontage/VENDORED.md`.

### What this means

OpenMontage (a Python agentic video-production system) and archy-gui (a Node.js
dashboard) are **independent programs**. archy-gui's own code does not import,
link, or embed OpenMontage's code — they are distributed together here as an
aggregation. Under those terms:

- OpenMontage's portion (`vendor/openmontage/`) remains under **AGPL-3.0**.
  Anyone who distributes or network-serves that portion must comply with the
  AGPL, including making the corresponding source available.
- archy-gui's own code stays under MIT.

If a future change makes archy-gui **combine** with OpenMontage into a single
program (importing its modules, or serving it such that the two form one work
rather than separate processes), AGPL-3.0's copyleft would likely extend to that
combined work. Keep the integration at arm's length (separate process / API) to
preserve the licensing above, or relicense archy-gui under AGPL-3.0 if you
intend tighter integration.

This notice is informational, not legal advice.
