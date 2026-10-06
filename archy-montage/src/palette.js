// Named gradients and a small color helper.
// Colors are "#rrggbb"; ffmpeg wants "0xrrggbb".

export const GRADIENTS = {
  nebula:    ["#00d4ff", "#ff6b35"],
  signal:    ["#00d4ff", "#a855f7"],
  mars:      ["#1a1a2e", "#ff6b35"],
  deepspace: ["#0f0f23", "#16213e"],
  ember:     ["#ff6b35", "#a855f7"],
  ice:       ["#0f0f23", "#00d4ff"],
  dusk:      ["#2d1b4e", "#ff6b35"],
  mono:      ["#111111", "#333333"],
};

const HEX = /^#?[0-9a-fA-F]{6}$/;

export function normalizeHex(c) {
  if (typeof c !== "string" || !HEX.test(c.trim())) {
    throw new Error(`Invalid color "${c}" (expected #rrggbb)`);
  }
  return "#" + c.trim().replace(/^#/, "").toLowerCase();
}

// "#rrggbb" -> "0xrrggbb" for ffmpeg.
export function toFFColor(c) {
  return "0x" + normalizeHex(c).slice(1);
}

// Resolve a gradient spec to a [from, to] pair of #rrggbb.
export function resolveGradient(g) {
  if (typeof g === "string") {
    const key = g.toLowerCase();
    if (!GRADIENTS[key]) {
      throw new Error(
        `Unknown gradient "${g}". Known: ${Object.keys(GRADIENTS).join(", ")}, or give ["#rrggbb","#rrggbb"].`
      );
    }
    return GRADIENTS[key].map(normalizeHex);
  }
  if (Array.isArray(g) && g.length === 2) {
    return g.map(normalizeHex);
  }
  throw new Error(`Invalid gradient ${JSON.stringify(g)} (name or ["#rrggbb","#rrggbb"])`);
}
