// Load, validate, and normalize a montage spec (YAML or JSON).
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { normalizeHex, resolveGradient } from "./palette.js";

// xfade transition names we allow (a safe subset of ffmpeg's xfade transitions).
export const TRANSITIONS = new Set([
  "fade", "fadeblack", "fadewhite", "dissolve",
  "slideleft", "slideright", "slideup", "slidedown",
  "wipeleft", "wiperight", "wipeup", "wipedown",
  "circleopen", "circleclose", "radial", "smoothleft", "smoothright",
  "pixelize", "distance",
]);

const TEXT_POS = new Set(["center", "top", "bottom", "lower-third", "upper-third", "left", "right"]);

function fail(msg) {
  const e = new Error(msg);
  e.isSpecError = true;
  return e;
}

export function loadSpec(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (e) {
    throw fail(`Cannot read spec file "${file}": ${e.message}`);
  }
  let doc;
  try {
    doc = YAML.parse(raw);
  } catch (e) {
    throw fail(`Spec "${file}" is not valid YAML/JSON: ${e.message}`);
  }
  if (!doc || typeof doc !== "object") throw fail("Spec must be a mapping at the top level.");
  return normalizeSpec(doc, path.dirname(path.resolve(file)));
}

function posInt(v, name, def) {
  if (v == null) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw fail(`${name} must be a positive number (got ${v})`);
  return Math.round(n);
}

function resolvePath(baseDir, p) {
  return path.isAbsolute(p) ? p : path.join(baseDir, p);
}

function normalizeText(t, idx, sceneIdx) {
  if (typeof t === "string") t = { content: t };
  if (!t || typeof t !== "object") throw fail(`scene ${sceneIdx}: text ${idx} must be a string or object`);
  if (!t.content || typeof t.content !== "string") {
    throw fail(`scene ${sceneIdx}: text ${idx} needs a non-empty "content" string`);
  }
  const out = { content: t.content };
  out.color = t.color ? normalizeHex(t.color) : "#ffffff";
  if (t.size != null) {
    const n = Number(t.size);
    if (!Number.isFinite(n) || n <= 0) throw fail(`scene ${sceneIdx}: text size must be positive`);
    out.size = Math.round(n);
  }
  if (t.pos != null) {
    if (!TEXT_POS.has(String(t.pos))) {
      throw fail(`scene ${sceneIdx}: text pos "${t.pos}" unknown (${[...TEXT_POS].join(", ")})`);
    }
    out.pos = String(t.pos);
  }
  // explicit x/y override pos; may be numbers (px) or ffmpeg expressions (strings)
  if (t.x != null) out.x = t.x;
  if (t.y != null) out.y = t.y;
  if (!out.pos && out.x == null && out.y == null) out.pos = "center";
  out.box = t.box === true;
  out.boxcolor = t.boxcolor ? normalizeHex(t.boxcolor) : "#000000";
  out.boxopacity = t.boxopacity != null ? clamp01(t.boxopacity) : 0.45;
  out.shadow = t.shadow !== false; // on by default
  return out;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeBackground(bg, sceneIdx, baseDir) {
  const keys = ["color", "gradient", "image", "video"].filter((k) => bg[k] != null);
  if (keys.length === 0) throw fail(`scene ${sceneIdx}: background needs one of color|gradient|image|video`);
  if (keys.length > 1) throw fail(`scene ${sceneIdx}: background has multiple sources (${keys.join(", ")}); pick one`);
  const kind = keys[0];
  const out = { kind };
  if (kind === "color") out.color = normalizeHex(bg.color);
  else if (kind === "gradient") out.gradient = resolveGradient(bg.gradient);
  else {
    const p = resolvePath(baseDir, String(bg[kind]));
    if (!fs.existsSync(p)) throw fail(`scene ${sceneIdx}: ${kind} file not found: ${p}`);
    out.path = p;
  }
  if (bg.angle != null) out.angle = Number(bg.angle) || 0;
  return out;
}

function normalizeKenburns(kb, sceneIdx) {
  if (kb === true) kb = {};
  if (!kb || typeof kb !== "object") throw fail(`scene ${sceneIdx}: kenburns must be true or an object`);
  const from = kb.from != null ? Number(kb.from) : 1.0;
  const to = kb.to != null ? Number(kb.to) : 1.15;
  if (!(from > 0) || !(to > 0)) throw fail(`scene ${sceneIdx}: kenburns from/to must be > 0`);
  const origin = kb.origin || "center";
  return { from, to, origin };
}

function normalizeTransition(tr, sceneIdx) {
  if (tr == null) return null;
  if (typeof tr === "string") tr = { type: tr };
  const type = String(tr.type || "fade");
  if (!TRANSITIONS.has(type)) {
    throw fail(`scene ${sceneIdx}: transition "${type}" unknown (${[...TRANSITIONS].join(", ")})`);
  }
  const duration = tr.duration != null ? Number(tr.duration) : 0.5;
  if (!(duration > 0)) throw fail(`scene ${sceneIdx}: transition duration must be > 0`);
  return { type, duration };
}

export function normalizeSpec(doc, baseDir) {
  const spec = {};
  spec.title = doc.title != null ? String(doc.title) : null;
  spec.width = posInt(doc.width, "width", 1920);
  spec.height = posInt(doc.height, "height", 1080);
  spec.fps = posInt(doc.fps, "fps", 30);
  spec.font = doc.font != null ? String(doc.font) : null;
  spec.baseDir = baseDir;

  // optional default background for scenes that omit one
  spec.defaultBackground = doc.background
    ? normalizeBackground(doc.background, "default", baseDir)
    : { kind: "color", color: "#0f0f23" };

  // audio
  spec.audio = null;
  if (doc.audio) {
    const a = doc.audio;
    if (a.file != null) {
      const p = resolvePath(baseDir, String(a.file));
      if (!fs.existsSync(p)) throw fail(`audio file not found: ${p}`);
      spec.audio = { kind: "file", path: p, fade: a.fade !== false, volume: a.volume != null ? Number(a.volume) : 1 };
    } else if (a.tone != null) {
      const freq = Number(a.tone);
      if (!(freq > 0)) throw fail(`audio.tone must be a positive frequency (Hz)`);
      spec.audio = { kind: "tone", freq, fade: a.fade !== false, volume: a.volume != null ? Number(a.volume) : 0.2 };
    } else {
      throw fail(`audio needs "file" or "tone"`);
    }
  }

  if (!Array.isArray(doc.scenes) || doc.scenes.length === 0) {
    throw fail(`spec needs a non-empty "scenes" list`);
  }

  spec.scenes = doc.scenes.map((s, i) => {
    if (!s || typeof s !== "object") throw fail(`scene ${i} must be a mapping`);
    const dur = Number(s.duration);
    if (!(dur > 0)) throw fail(`scene ${i}: duration must be > 0 seconds`);

    const bg = s.background ? normalizeBackground(s.background, i, baseDir) : spec.defaultBackground;

    const texts = [];
    if (s.text != null) texts.push(normalizeText(s.text, 0, i));
    if (Array.isArray(s.texts)) s.texts.forEach((t, j) => texts.push(normalizeText(t, j, i)));

    let kenburns = null;
    if (s.kenburns != null) {
      if (bg.kind !== "image") throw fail(`scene ${i}: kenburns only applies to image backgrounds`);
      kenburns = normalizeKenburns(s.kenburns, i);
    }

    let fade = null;
    if (s.fade) {
      fade = {
        in: s.fade.in != null ? Number(s.fade.in) : 0,
        out: s.fade.out != null ? Number(s.fade.out) : 0,
      };
      if (fade.in < 0 || fade.out < 0 || fade.in + fade.out > dur) {
        throw fail(`scene ${i}: fade in+out cannot exceed duration`);
      }
    }

    const transition = i < doc.scenes.length - 1 ? normalizeTransition(s.transition, i) : null;

    return { index: i, duration: dur, background: bg, texts, kenburns, fade, transition };
  });

  return spec;
}

// Total output duration (transitions overlap, so they subtract).
export function totalDuration(spec) {
  const sum = spec.scenes.reduce((a, s) => a + s.duration, 0);
  const overlap = spec.scenes.reduce((a, s) => a + (s.transition ? s.transition.duration : 0), 0);
  return Math.max(0.1, sum - overlap);
}
