// Two-pass ffmpeg renderer.
//   Pass 1: render each scene to a normalized intermediate (WxH, fps, yuv420p, silent).
//   Pass 2: combine (concat for hard cuts, xfade when transitions are set) + audio.
import fs from "fs";
import os from "os";
import path from "path";
import { findFFmpeg, resolveFont, runFFmpeg } from "./ffmpeg.js";
import { toFFColor } from "./palette.js";
import { totalDuration } from "./spec.js";

const even = (n) => Math.max(2, Math.round(n) - (Math.round(n) % 2));

function posExpr(t, W, H) {
  // Returns {x, y} drawtext expressions for a named position.
  const cx = "(w-text_w)/2";
  switch (t.pos) {
    case "top":          return { x: cx, y: `h*0.12` };
    case "upper-third":  return { x: cx, y: `h*0.28` };
    case "bottom":       return { x: cx, y: `h*0.80` };
    case "lower-third":  return { x: cx, y: `h*0.66` };
    case "left":         return { x: `w*0.08`, y: "(h-text_h)/2" };
    case "right":        return { x: `w*0.92-text_w`, y: "(h-text_h)/2" };
    case "center":
    default:             return { x: cx, y: "(h-text_h)/2" };
  }
}

function drawtextFilter(text, i, j, W, H, fontPath, workdir) {
  const file = path.join(workdir, `t_${i}_${j}.txt`);
  fs.writeFileSync(file, text.content, "utf-8");
  const size = text.size || Math.round(H / 14);
  let x, y;
  if (text.x != null || text.y != null) {
    x = text.x != null ? String(text.x) : "(w-text_w)/2";
    y = text.y != null ? String(text.y) : "(h-text_h)/2";
  } else {
    ({ x, y } = posExpr(text, W, H));
  }
  const parts = [
    `fontfile=${fontPath}`,
    `textfile=${file}`,
    `expansion=none`,
    `fontcolor=${toFFColor(text.color)}`,
    `fontsize=${size}`,
    `x=${x}`,
    `y=${y}`,
  ];
  if (text.shadow) parts.push(`shadowcolor=black@0.55`, `shadowx=2`, `shadowy=2`);
  if (text.box) {
    parts.push(`box=1`, `boxcolor=${toFFColor(text.boxcolor)}@${text.boxopacity}`, `boxborderw=${Math.round(size * 0.35)}`);
  }
  return `drawtext=${parts.join(":")}`;
}

// Build input args + video-filter chain for one scene. Returns {inputArgs, vf}.
function sceneInput(scene, spec, W, H, fontPath, workdir) {
  const { fps } = spec;
  const D = scene.duration;
  const bg = scene.background;
  let inputArgs = [];
  const chain = [];

  if (bg.kind === "color") {
    inputArgs = ["-f", "lavfi", "-i", `color=c=${toFFColor(bg.color)}:s=${W}x${H}:r=${fps}:d=${D}`];
  } else if (bg.kind === "gradient") {
    const [c0, c1] = bg.gradient.map(toFFColor);
    inputArgs = ["-f", "lavfi", "-i",
      `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${W}:y1=${H}:r=${fps}:d=${D}:speed=0.00001`];
  } else if (bg.kind === "image") {
    inputArgs = ["-loop", "1", "-i", bg.path];
    if (scene.kenburns) {
      const { from, to } = scene.kenburns;
      const frames = Math.max(1, Math.round(D * fps));
      const step = (to - from) / frames;
      const bw = Math.ceil(W * to), bh = Math.ceil(H * to);
      chain.push(
        `scale=${bw}:${bh}:force_original_aspect_ratio=increase`,
        `crop=${bw}:${bh}`,
        `zoompan=z='if(eq(on,0),${from},min(zoom+${step.toFixed(6)},${to}))':d=${frames}` +
          `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`
      );
    } else {
      chain.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`);
    }
  } else if (bg.kind === "video") {
    inputArgs = ["-stream_loop", "-1", "-i", bg.path];
    chain.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${fps}`);
  }

  for (let j = 0; j < scene.texts.length; j++) {
    chain.push(drawtextFilter(scene.texts[j], scene.index, j, W, H, fontPath, workdir));
  }

  if (scene.fade) {
    if (scene.fade.in > 0) chain.push(`fade=t=in:st=0:d=${scene.fade.in}`);
    if (scene.fade.out > 0) chain.push(`fade=t=out:st=${(D - scene.fade.out).toFixed(3)}:d=${scene.fade.out}`);
  }

  chain.push(`fps=${fps}`, `format=yuv420p`, `setsar=1`);
  return { inputArgs, vf: chain.join(",") };
}

function sceneArgs(scene, spec, W, H, fontPath, workdir, outFile) {
  const { inputArgs, vf } = sceneInput(scene, spec, W, H, fontPath, workdir);
  return [
    "-y", ...inputArgs,
    "-t", String(scene.duration),
    "-vf", vf,
    "-r", String(spec.fps),
    "-an",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    outFile,
  ];
}

// Build the combine (pass 2) ffmpeg args. Returns {args, finalLen}.
function combineArgs(spec, sceneFiles, W, H, outFile) {
  const { fps } = spec;
  const K = sceneFiles.length;
  const inputs = [];
  for (const f of sceneFiles) inputs.push("-i", f);

  const anyTransition = spec.scenes.some((s) => s.transition);
  const parts = [];
  let finalLen;
  let vlabel;

  if (K === 1) {
    vlabel = "0:v";
    finalLen = spec.scenes[0].duration;
  } else if (!anyTransition) {
    const refs = sceneFiles.map((_, i) => `[${i}:v]`).join("");
    parts.push(`${refs}concat=n=${K}:v=1:a=0[vout]`);
    vlabel = "vout";
    finalLen = spec.scenes.reduce((a, s) => a + s.duration, 0);
  } else {
    // full xfade chain; undefined transitions become 1-frame cuts
    const frameT = 1 / fps;
    let acc = spec.scenes[0].duration;
    let prev = `[0:v]`;
    for (let i = 0; i < K - 1; i++) {
      const tr = spec.scenes[i].transition;
      const type = tr ? tr.type : "fade";
      const dur = tr ? tr.duration : frameT;
      const offset = Math.max(0, acc - dur);
      const out = i === K - 2 ? "vout" : `vx${i}`;
      parts.push(
        `${prev}[${i + 1}:v]xfade=transition=${type}:duration=${dur.toFixed(4)}:offset=${offset.toFixed(4)}[${out}]`
      );
      prev = `[${out}]`;
      acc = acc + spec.scenes[i + 1].duration - dur;
    }
    vlabel = "vout";
    finalLen = acc;
  }

  // audio
  const aArgs = [];
  let amap = null;
  if (spec.audio) {
    if (spec.audio.kind === "tone") {
      aArgs.push("-f", "lavfi", "-i", `sine=frequency=${spec.audio.freq}:sample_rate=48000`);
    } else {
      aArgs.push("-stream_loop", "-1", "-i", spec.audio.path);
    }
    const ain = `${K}:a`;
    const af = [`volume=${spec.audio.volume}`];
    if (spec.audio.fade) {
      af.push(`afade=t=in:st=0:d=0.4`);
      af.push(`afade=t=out:st=${Math.max(0, finalLen - 1.2).toFixed(3)}:d=1.2`);
    }
    parts.push(`[${ain}]${af.join(",")}[aout]`);
    amap = "aout";
  }

  const filter = parts.length ? ["-filter_complex", parts.join(";")] : [];
  const map = [];
  if (K === 1 && !spec.audio) {
    // nothing to filter; just re-mux/encode input 0
  }
  map.push("-map", vlabel === "0:v" ? "0:v" : `[${vlabel}]`);
  if (amap) map.push("-map", `[${amap}]`);

  const args = [
    "-y", ...inputs, ...aArgs,
    ...filter,
    ...map,
    "-r", String(fps),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "19",
    ...(spec.audio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
    "-movflags", "+faststart",
    "-t", finalLen.toFixed(3),
    outFile,
  ];
  return { args, finalLen };
}

export async function render(spec, { output, dryRun = false, keep = false, onLog = () => {} } = {}) {
  const bin = findFFmpeg();
  if (!bin) throw new Error("ffmpeg not found. Install ffmpeg or set FFMPEG_PATH.");
  const fontPath = resolveFont(spec.font);
  if (!fontPath) throw new Error("No usable font found. Set a TTF via spec `font` or install DejaVu/Liberation.");

  const W = even(spec.width), H = even(spec.height);
  const out = path.resolve(output || "montage.mp4");
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "archy-montage-"));

  const sceneFiles = spec.scenes.map((_, i) => path.join(workdir, `scene_${String(i).padStart(3, "0")}.mp4`));
  const sceneCmds = spec.scenes.map((s, i) => sceneArgs(s, spec, W, H, fontPath, workdir, sceneFiles[i]));
  const combine = combineArgs(spec, sceneFiles, W, H, out);

  if (dryRun) {
    const show = (a) => a.map((x) => (/[\s'"]/.test(x) ? JSON.stringify(x) : x)).join(" ");
    onLog(`# font: ${fontPath}`);
    onLog(`# output: ${out}  (${W}x${H} @ ${spec.fps}fps, ~${combine.finalLen.toFixed(1)}s)`);
    spec.scenes.forEach((_, i) => onLog(`\n# scene ${i}\n${bin} ${show(sceneCmds[i])}`));
    onLog(`\n# combine\n${bin} ${show(combine.args)}`);
    return { output: out, workdir, dryRun: true, duration: combine.finalLen };
  }

  try {
    for (let i = 0; i < sceneCmds.length; i++) {
      onLog(`scene ${i + 1}/${sceneCmds.length} …`);
      await runFFmpeg(bin, sceneCmds[i], { label: `scene ${i}` });
    }
    onLog(`combining ${sceneFiles.length} scene(s) …`);
    await runFFmpeg(bin, combine.args, {
      label: "combine",
      onProgress: (t) => onLog(`  ${t.toFixed(1)}s / ${combine.finalLen.toFixed(1)}s`),
    });
  } finally {
    if (!keep) fs.rmSync(workdir, { recursive: true, force: true });
  }

  return { output: out, duration: combine.finalLen, width: W, height: H, fps: spec.fps };
}
