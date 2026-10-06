#!/usr/bin/env node
// archy-montage — a lean, local-first montage engine (YAML -> MP4 via ffmpeg).
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { loadSpec, normalizeSpec } from "./src/spec.js";
import { render } from "./src/render.js";
import { findFFmpeg, resolveFont } from "./src/ffmpeg.js";
import { pipelineToSpecDoc } from "./src/import-openmontage.js";

const TEMPLATE = `# archy-montage spec — edit freely, then: montage render this.yaml -o out.mp4
title: My Montage
width: 1920
height: 1080
fps: 30

# Optional soundtrack. Use a file, or a generated tone so there's always audio.
audio:
  tone: 220        # Hz  (or:  file: ./music.mp3)
  volume: 0.15

scenes:
  - duration: 3
    background: { gradient: nebula }     # named, or ["#00d4ff", "#ff6b35"]
    text: { content: "ARCHY", size: 140 }
    fade: { in: 0.5 }
    transition: { type: fade, duration: 0.6 }

  - duration: 3
    background: { gradient: deepspace }
    texts:
      - { content: "Montage Engine", pos: center, size: 90 }
      - { content: "local-first · no API keys", pos: lower-third, size: 40, color: "#00d4ff" }
    transition: { type: slideleft, duration: 0.5 }

  - duration: 3
    background: { color: "#0f0f23" }
    text: { content: "Built to learn, expand, and build.", size: 64 }
    fade: { out: 0.6 }
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--output") out.flags.output = argv[++i];
    else if (a === "--dry-run") out.flags.dryRun = true;
    else if (a === "--keep") out.flags.keep = true;
    else if (a === "--render") out.flags.render = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  console.log(`archy-montage — declarative montages to MP4 (ffmpeg, offline)

Usage:
  montage init [file.yaml]              Write a starter spec (default montage.yaml)
  montage render <spec.yaml> [-o out.mp4] [--dry-run] [--keep]
  montage import <pipeline.yaml> [-o spec.yaml] [--render] [-o out.mp4]
                                        Convert an OpenMontage pipeline_def into
                                        a storyboard spec (and optionally render)
  montage probe                         Check ffmpeg + font availability
  montage help

Examples:
  montage init
  montage render montage.yaml -o out.mp4
  montage import ../archy-gui/vendor/openmontage/pipeline_defs/cinematic.yaml --render -o cinematic.mp4
`);
}

async function main() {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const cmd = _[0];

  try {
    if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") return usage();

    if (cmd === "probe") {
      const bin = findFFmpeg();
      const font = resolveFont(null);
      console.log(`ffmpeg: ${bin || "NOT FOUND"}`);
      console.log(`font:   ${font || "NOT FOUND"}`);
      if (!bin || !font) process.exitCode = 1;
      return;
    }

    if (cmd === "init") {
      const file = _[1] || "montage.yaml";
      if (fs.existsSync(file)) throw new Error(`${file} already exists (refusing to overwrite)`);
      fs.writeFileSync(file, TEMPLATE, "utf-8");
      console.log(`Wrote starter spec: ${file}\nRender it with:  montage render ${file} -o out.mp4`);
      return;
    }

    if (cmd === "render") {
      const specFile = _[1];
      if (!specFile) throw new Error("render needs a spec file: montage render spec.yaml");
      const spec = loadSpec(specFile);
      const res = await render(spec, {
        output: flags.output,
        dryRun: flags.dryRun,
        keep: flags.keep,
        onLog: (m) => console.log(m),
      });
      if (!flags.dryRun) console.log(`\n✅ ${res.output}  (${res.width}x${res.height} @ ${res.fps}fps, ${res.duration.toFixed(1)}s)`);
      return;
    }

    if (cmd === "import") {
      const pipeFile = _[1];
      if (!pipeFile) throw new Error("import needs a pipeline file: montage import pipeline.yaml");
      const doc = pipelineToSpecDoc(pipeFile);
      const specOut = flags.output && flags.output.endsWith(".yaml")
        ? flags.output
        : path.basename(pipeFile).replace(/\.ya?ml$/i, "") + ".montage.yaml";
      fs.writeFileSync(specOut, YAML.stringify(doc), "utf-8");
      console.log(`Wrote storyboard spec: ${specOut}  (${doc.scenes.length} scenes)`);

      if (flags.render) {
        const spec = normalizeSpec(doc, path.dirname(path.resolve(specOut)));
        const mp4 = flags.output && flags.output.endsWith(".mp4") ? flags.output : specOut.replace(/\.ya?ml$/i, "") + ".mp4";
        const res = await render(spec, { output: mp4, onLog: (m) => console.log(m) });
        console.log(`\n✅ ${res.output}  (${res.duration.toFixed(1)}s)`);
      } else {
        console.log(`Render it with:  montage render ${specOut} -o out.mp4`);
      }
      return;
    }

    throw new Error(`Unknown command "${cmd}". Try: montage help`);
  } catch (e) {
    console.error(`\n✗ ${e.isSpecError ? "Spec error: " : ""}${e.message}`);
    process.exitCode = 1;
  }
}

main();
