import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { addArtifactSummary, artifactExists } from "./db.js";

export const identifiedGlyphs = ["N", "S", "5", "2", "Z", "i", "W", "a", "Q"];
const weights = [
  { name: "Thin", width: 12 },
  { name: "Regular", width: 22 },
  { name: "Bold", width: 34 }
];

export async function generateProjectZeroSpecimens(db, projectId) {
  const specimenDir = join(config.uploadDir, projectId, "specimens");
  await mkdir(specimenDir, { recursive: true });

  const created = [];
  for (const glyph of identifiedGlyphs) {
    for (const weight of weights) {
      const title = `${glyph} / ${weight.name}`;
      if (artifactExists(db, projectId, { kind: "glyph-svg", title })) continue;

      const svg = glyphSvg(glyph, weight);
      const filename = `project-zero-${slug(glyph)}-${weight.name.toLowerCase()}.svg`;
      const path = join(specimenDir, filename);
      await writeFile(path, svg, "utf8");

      addArtifactSummary(db, projectId, {
        kind: "glyph-svg",
        title,
        summary: `Object-stand glyph specimen for ${glyph}, ${weight.name.toLowerCase()} weight.`,
        path
      });
      created.push(title);
    }
  }

  return created;
}

function glyphSvg(glyph, weight) {
  const stroke = weight.width;
  const dark = "#232323";
  const metal = "#6f716b";
  const highlight = "#b7b8b2";
  const rubber = "#141414";
  const segments = glyphSegments(glyph);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 320" role="img" aria-label="Project Zero ${escapeXml(glyph)} ${escapeXml(weight.name)} glyph">
  <rect width="260" height="320" fill="#f7f6f1"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${segments.rings.map((ring) => `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" stroke="${rubber}" stroke-width="${Math.max(8, stroke * 0.62)}"/>`).join("\n    ")}
    ${segments.axes.map((axis) => `<line x1="${axis[0]}" y1="${axis[1]}" x2="${axis[2]}" y2="${axis[3]}" stroke="${highlight}" stroke-width="${Math.max(4, stroke * 0.38)}"/>`).join("\n    ")}
    ${segments.paths.map((d) => `<path d="${d}" stroke="${metal}" stroke-width="${stroke}"/>`).join("\n    ")}
    ${segments.lines.map((line) => `<line x1="${line[0]}" y1="${line[1]}" x2="${line[2]}" y2="${line[3]}" stroke="${dark}" stroke-width="${stroke}"/>`).join("\n    ")}
  </g>
  <text x="18" y="296" fill="#77736a" font-family="system-ui, sans-serif" font-size="13">Project Zero / ${escapeXml(weight.name)}</text>
</svg>`;
}

function glyphSegments(glyph) {
  const base = {
    lines: [],
    paths: [],
    rings: [],
    axes: []
  };

  const map = {
    N: {
      ...base,
      rings: [{ cx: 74, cy: 70, r: 34 }, { cx: 188, cy: 248, r: 34 }],
      axes: [[74, 70, 74, 248], [74, 248, 188, 70], [188, 70, 188, 248]],
      lines: [[74, 70, 74, 248], [74, 248, 188, 70], [188, 70, 188, 248]]
    },
    S: {
      ...base,
      rings: [{ cx: 142, cy: 82, r: 38 }, { cx: 118, cy: 236, r: 42 }],
      paths: ["M180 74 C108 34 48 78 74 130 C94 170 180 142 188 194 C196 254 94 282 58 230"]
    },
    "5": {
      ...base,
      rings: [{ cx: 150, cy: 232, r: 42 }],
      lines: [[184, 64, 76, 64], [76, 64, 70, 148], [70, 148, 160, 148]],
      paths: ["M160 148 C224 154 218 250 150 268"]
    },
    "2": {
      ...base,
      rings: [{ cx: 118, cy: 86, r: 38 }],
      paths: ["M72 94 C92 44 194 54 198 118 C202 168 92 194 70 258"],
      lines: [[70, 258, 198, 258]]
    },
    Z: {
      ...base,
      rings: [{ cx: 72, cy: 72, r: 28 }, { cx: 188, cy: 248, r: 28 }],
      lines: [[64, 66, 196, 66], [196, 66, 62, 256], [62, 256, 198, 256]]
    },
    i: {
      ...base,
      rings: [{ cx: 130, cy: 56, r: 24 }, { cx: 130, cy: 250, r: 38 }],
      lines: [[130, 112, 130, 216]]
    },
    W: {
      ...base,
      rings: [{ cx: 54, cy: 70, r: 24 }, { cx: 206, cy: 70, r: 24 }],
      axes: [[54, 70, 88, 254], [88, 254, 130, 126], [130, 126, 172, 254], [172, 254, 206, 70]],
      lines: [[54, 70, 88, 254], [88, 254, 130, 126], [130, 126, 172, 254], [172, 254, 206, 70]]
    },
    a: {
      ...base,
      rings: [{ cx: 120, cy: 176, r: 58 }],
      paths: ["M174 176 C174 118 92 110 70 162 C48 214 102 262 156 226"],
      lines: [[174, 122, 174, 238]]
    },
    Q: {
      ...base,
      rings: [{ cx: 128, cy: 148, r: 78 }],
      paths: ["M184 210 L220 258"]
    }
  };

  return map[glyph] || base;
}

function slug(glyph) {
  return glyph === "i" ? "lower-i" : glyph === "a" ? "lower-a" : glyph.toLowerCase();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
