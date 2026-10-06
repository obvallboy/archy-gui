// ffmpeg/ffprobe discovery, font resolution, and a small runner.
import { spawn, spawnSync } from "child_process";
import fs from "fs";

export function findFFmpeg() {
  const envBin = process.env.FFMPEG_PATH;
  const candidates = [envBin, "ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { encoding: "utf-8" });
    if (r.status === 0) return c;
  }
  return null;
}

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  "/Library/Fonts/Arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

// Resolve a font to an absolute .ttf/.otf path.
// `want` may be a file path or a family name (resolved via fc-match if available).
export function resolveFont(want) {
  if (want) {
    if (fs.existsSync(want)) return want;
    const m = spawnSync("fc-match", ["-f", "%{file}", want], { encoding: "utf-8" });
    if (m.status === 0 && m.stdout && fs.existsSync(m.stdout.trim())) return m.stdout.trim();
  }
  for (const f of FONT_CANDIDATES) if (fs.existsSync(f)) return f;
  // last resort: ask fontconfig for anything sans
  const m = spawnSync("fc-match", ["-f", "%{file}", "sans"], { encoding: "utf-8" });
  if (m.status === 0 && m.stdout && fs.existsSync(m.stdout.trim())) return m.stdout.trim();
  return null;
}

// Run ffmpeg. Returns a promise; rejects with trimmed stderr on failure.
export function runFFmpeg(bin, args, { onProgress, label } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      err += s;
      if (err.length > 20000) err = err.slice(-20000);
      if (onProgress) {
        const m = s.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m) onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
      }
    });
    proc.on("error", (e) => reject(new Error(`Failed to launch ffmpeg: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = err.trim().split("\n").slice(-12).join("\n");
      reject(new Error(`ffmpeg failed${label ? ` (${label})` : ""} [exit ${code}]:\n${tail}`));
    });
  });
}
