// Reference bridge: turn an OpenMontage pipeline definition
// (vendor/openmontage/pipeline_defs/*.yaml) into an archy-montage storyboard.
//
// OpenMontage pipelines are agentic orchestration manifests (stages run by AI
// agents). We don't execute them here — we visualize their shape as a montage:
// a title card, one card per stage, and a closing card. This reads only the
// pipeline's data format, not OpenMontage's code.
import fs from "fs";
import YAML from "yaml";

const GRADIENT_CYCLE = ["deepspace", "nebula", "signal", "mars", "ember", "ice", "dusk"];

function firstSentence(s) {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : t).slice(0, 120);
}

function titleCase(s) {
  return String(s).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pipelineToSpecDoc(pipelinePath) {
  const raw = fs.readFileSync(pipelinePath, "utf-8");
  const p = YAML.parse(raw);
  if (!p || typeof p !== "object") throw new Error("Not a valid pipeline YAML");

  const name = p.name ? titleCase(p.name) : "Pipeline";
  const tagline = firstSentence(p.description) || `${p.category || "custom"} pipeline`;
  const stages = Array.isArray(p.stages) ? p.stages : [];

  const scenes = [];

  // Title card
  scenes.push({
    duration: 3.2,
    background: { gradient: "deepspace" },
    texts: [
      { content: name, pos: "center", size: 128 },
      { content: tagline, pos: "lower-third", size: 40, color: "#a1a1aa" },
    ],
    fade: { in: 0.5 },
    transition: { type: "fade", duration: 0.6 },
  });

  // One card per stage
  stages.forEach((st, i) => {
    const label = titleCase(st.name || st.id || `Stage ${i + 1}`);
    const produces = Array.isArray(st.produces) && st.produces.length
      ? `produces: ${st.produces.join(", ")}`
      : (st.skill ? String(st.skill) : "");
    const texts = [{ content: `${String(i + 1).padStart(2, "0")}  ·  ${label}`, pos: "center", size: 92 }];
    if (produces) texts.push({ content: produces, pos: "lower-third", size: 36, color: "#00d4ff" });
    scenes.push({
      duration: 2.4,
      background: { gradient: GRADIENT_CYCLE[(i + 1) % GRADIENT_CYCLE.length] },
      texts,
      transition: { type: i % 2 ? "slideleft" : "fade", duration: 0.5 },
    });
  });

  // Closing card
  scenes.push({
    duration: 3.0,
    background: { gradient: "ember" },
    texts: [
      { content: "OpenMontage", pos: "center", size: 110 },
      { content: `${p.category || "pipeline"} · ${p.stability || "preview"} · ${stages.length} stages`, pos: "lower-third", size: 38, color: "#0f0f23" },
    ],
    fade: { out: 0.6 },
  });

  return {
    title: `${name} — storyboard`,
    width: 1920,
    height: 1080,
    fps: 30,
    audio: { tone: 196, volume: 0.12 },
    scenes,
  };
}
