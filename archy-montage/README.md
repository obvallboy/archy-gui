# archy-montage

**A lean, local-first montage engine.** Declarative YAML → MP4 via ffmpeg.
No API keys, no cloud, no ML downloads — fully offline and deterministic.

It's a deliberately small counterpart to
[OpenMontage](https://github.com/calesthio/OpenMontage): where OpenMontage is a
big *agentic* video-production system (AI agents, provider APIs, budgets,
multi-stage orchestration), `archy-montage` does one thing — assemble a montage
of cards, text, images, video and audio into a finished MP4 — **right now, with
one command, and nothing to sign up for.**

```bash
npm install
node cli.js render examples/signal.montage.yaml -o signal.mp4
```

That renders a 12s 1080p title/gradient montage with transitions and a tone
bed — using zero external assets. See [`examples/signal.mp4`](examples/signal.mp4).

> Requires **ffmpeg** on your PATH (set `FFMPEG_PATH` to override) and a system
> TTF font (DejaVu/Liberation are auto-detected; override with `font:` in a spec).
> Check both with `node cli.js probe`.

## Why it's a "better" montage tool (for the common case)

| | OpenMontage | archy-montage |
| --- | --- | --- |
| Goal | Agentic, AI-generated video production | Deterministic montage assembly |
| Setup | Python + provider API keys + models | `npm install` + ffmpeg |
| Runs offline | Needs provider APIs | **Yes, fully** |
| Output now | After agent orchestration | **One ffmpeg pass** |
| Reproducible | Varies per run | **Byte-stable from the same spec** |

Different tools for different jobs — this one wins when you just want a montage
*assembled* quickly and repeatably.

## Commands

```
montage init [file.yaml]                 Write a starter spec
montage render <spec.yaml> [-o out.mp4] [--dry-run] [--keep]
montage import <pipeline.yaml> [-o out.mp4] [--render]
montage probe                            Check ffmpeg + font
```

- `--dry-run` prints the exact ffmpeg commands without rendering.
- `--keep` keeps the per-scene intermediates (debugging).

## Spec format

```yaml
title: My Montage
width: 1920            # even numbers; defaults 1920x1080 @ 30fps
height: 1080
fps: 30
font: DejaVu Sans      # optional: family name or a .ttf path

audio:                 # optional
  tone: 220            #   generated sine (Hz) — or  file: ./music.mp3
  volume: 0.15
  fade: true           #   auto fade in/out (default true)

scenes:
  - duration: 3                          # seconds (required)
    background: { gradient: nebula }     # see backgrounds below
    text: { content: "ARCHY", size: 140 }
    fade: { in: 0.5, out: 0 }            # per-scene edge fades (optional)
    transition: { type: fade, duration: 0.6 }   # to the NEXT scene (optional)

  - duration: 3
    background: { image: ./photo.jpg }
    kenburns: { from: 1.0, to: 1.18 }    # slow zoom (image backgrounds only)
    texts:                               # multiple overlays
      - { content: "Title",    pos: center,      size: 90 }
      - { content: "subtitle", pos: lower-third, size: 40, color: "#00d4ff" }
```

**Backgrounds** (exactly one per scene):
- `color: "#0f0f23"`
- `gradient: nebula` — named (`nebula, signal, mars, deepspace, ember, ice, dusk, mono`) or `["#00d4ff","#ff6b35"]`
- `image: ./path.jpg` — scaled to cover; optional `kenburns`
- `video: ./clip.mp4` — scaled to cover, looped/trimmed to `duration`

**Text** — `text:` (one) or `texts:` (many). Fields: `content`, `size`,
`color`, `pos` (`center, top, bottom, upper-third, lower-third, left, right`)
or explicit `x`/`y` (px or ffmpeg expressions), `box`, `boxcolor`,
`boxopacity`, `shadow`.

**Transitions** (to the next scene): `fade, fadeblack, fadewhite, dissolve,
slideleft/right/up/down, wipeleft/right/up/down, circleopen, circleclose,
radial, smoothleft, smoothright, pixelize`. If any scene sets a transition the
whole timeline is composited with `xfade`; otherwise scenes are hard-cut via
`concat`.

## Referencing OpenMontage

`montage import` reads an OpenMontage pipeline definition
(`pipeline_defs/*.yaml`) and turns its **shape** into a storyboard — a title
card, one card per stage (with what each stage produces), and a closing card:

```bash
node cli.js import ../archy-gui/vendor/openmontage/pipeline_defs/cinematic.yaml --render -o cinematic.mp4
```

It reads only the pipeline's data format (not OpenMontage's code) and writes an
ordinary editable spec you can tweak and re-render. This is the bridge between
OpenMontage's agentic manifests and a concrete, instantly-rendered video.

## How it works

Two ffmpeg passes:

1. **Normalize** — each scene is rendered to a `WxH / fps / yuv420p` intermediate
   (gradient/color via `lavfi`, images via scale+crop with optional `zoompan`
   Ken Burns, text via `drawtext`, edge `fade`).
2. **Combine** — `concat` for hard cuts or an `xfade` chain for transitions,
   then the audio bed (`sine` or file, with `afade`), encoded to H.264 + AAC
   with `+faststart`.

`--dry-run` shows you every command.

## Relationship to the Archy stack

This is a **separate, standalone component** — it is intentionally **not** wired
into the `archy-gui` dashboard. It runs as its own CLI / process. Original code,
**MIT**-licensed; OpenMontage is referenced via its public pipeline format, not
by copying its (AGPL) code.

## License

MIT
