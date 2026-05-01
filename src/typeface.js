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
      const title = specimenTitle(glyph, weight);
      if (artifactExists(db, projectId, { kind: "glyph-svg", title })) continue;

      const svg = glyphSvg(glyph, weight);
      const filename = `object-type-metal-${slug(glyph)}-${weight.name.toLowerCase()}${glyph === "N" ? "-implied-rings" : ""}.svg`;
      const path = join(specimenDir, filename);
      await writeFile(path, svg, "utf8");

      addArtifactSummary(db, projectId, {
        kind: "glyph-svg",
        title,
        summary: `Metallic object-type glyph specimen for ${glyph}, ${weight.name.toLowerCase()} weight, with hinge depth and constrained joins.`,
        path
      });
      created.push(title);
    }
  }

  return created;
}

function glyphSvg(glyph, weight) {
  const stroke = weight.width;
  const edge = Math.max(10, stroke + 8);
  const shine = Math.max(3, stroke * 0.18);
  const segments = glyphSegments(glyph);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 320" role="img" aria-label="Object type ${escapeXml(glyph)} ${escapeXml(weight.name)} glyph">
  <defs>
    <linearGradient id="metal-${slug(glyph)}-${weight.name}" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f1eee4"/>
      <stop offset="0.16" stop-color="#9ea09a"/>
      <stop offset="0.42" stop-color="#2d302f"/>
      <stop offset="0.68" stop-color="#b9bab3"/>
      <stop offset="1" stop-color="#151716"/>
    </linearGradient>
    <radialGradient id="joint-${slug(glyph)}-${weight.name}" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#f5f1e7"/>
      <stop offset="0.36" stop-color="#a4a59d"/>
      <stop offset="0.7" stop-color="#303331"/>
      <stop offset="1" stop-color="#111312"/>
    </radialGradient>
    <filter id="depth-${slug(glyph)}-${weight.name}" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#141414" flood-opacity="0.28"/>
      <feDropShadow dx="2" dy="2" stdDeviation="1.5" flood-color="#ffffff" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="260" height="320" fill="#f2f0e8"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#depth-${slug(glyph)}-${weight.name})">
    ${segments.axes.map((axis) => `<line x1="${axis[0]}" y1="${axis[1]}" x2="${axis[2]}" y2="${axis[3]}" stroke="#cbc9bf" stroke-width="${Math.max(4, stroke * 0.26)}" stroke-dasharray="7 10" opacity="0.72"/>`).join("\n    ")}
    ${segments.rings.map((ring) => ringMarkup(ring, stroke, glyph, weight)).join("\n    ")}
    ${segments.paths.map((d) => tubePathMarkup(d, stroke, edge, shine, glyph, weight)).join("\n    ")}
    ${segments.lines.map((line) => tubePathMarkup(linePath(line), stroke, edge, shine, glyph, weight)).join("\n    ")}
    ${segments.joints.map((joint) => jointMarkup(joint, stroke, glyph, weight)).join("\n    ")}
  </g>
  <text x="18" y="296" fill="#726f66" font-family="system-ui, sans-serif" font-size="13">Object type / ${escapeXml(weight.name)} / metal depth</text>
</svg>`;
}

function glyphSegments(glyph) {
  const base = {
    lines: [],
    paths: [],
    rings: [],
    axes: [],
    joints: []
  };

  const map = {
    N: {
      ...base,
      axes: [[74, 72, 74, 248], [74, 248, 126, 158], [126, 158, 188, 72], [188, 72, 188, 248]],
      paths: [
        "M74 248 C68 194 70 122 74 72",
        "M74 248 C88 220 102 182 124 162 C146 142 158 104 188 72",
        "M188 72 C194 126 192 202 188 248"
      ],
      joints: [{ cx: 124, cy: 162 }]
    },
    S: {
      ...base,
      rings: [{ cx: 142, cy: 82, r: 38 }, { cx: 118, cy: 236, r: 42 }],
      paths: ["M180 74 C108 34 48 78 74 130 C94 170 180 142 188 194 C196 254 94 282 58 230"],
      joints: [{ cx: 142, cy: 82 }, { cx: 118, cy: 236 }]
    },
    "5": {
      ...base,
      rings: [{ cx: 150, cy: 232, r: 42 }],
      lines: [[184, 64, 76, 64], [76, 64, 70, 148], [70, 148, 160, 148]],
      paths: ["M160 148 C224 154 218 250 150 268"],
      joints: [{ cx: 76, cy: 64 }, { cx: 70, cy: 148 }, { cx: 150, cy: 232 }]
    },
    "2": {
      ...base,
      rings: [{ cx: 118, cy: 86, r: 38 }],
      paths: ["M72 94 C92 44 194 54 198 118 C202 168 92 194 70 258"],
      lines: [[70, 258, 198, 258]],
      joints: [{ cx: 118, cy: 86 }, { cx: 70, cy: 258 }]
    },
    Z: {
      ...base,
      rings: [{ cx: 72, cy: 72, r: 28 }, { cx: 188, cy: 248, r: 28 }],
      lines: [[64, 66, 196, 66], [196, 66, 62, 256], [62, 256, 198, 256]],
      joints: [{ cx: 64, cy: 66 }, { cx: 196, cy: 66 }, { cx: 62, cy: 256 }, { cx: 198, cy: 256 }]
    },
    i: {
      ...base,
      rings: [{ cx: 130, cy: 56, r: 24 }, { cx: 130, cy: 250, r: 38 }],
      lines: [[130, 112, 130, 216]],
      joints: [{ cx: 130, cy: 112 }, { cx: 130, cy: 216 }]
    },
    W: {
      ...base,
      rings: [{ cx: 54, cy: 70, r: 24 }, { cx: 206, cy: 70, r: 24 }],
      axes: [[54, 70, 88, 254], [88, 254, 130, 126], [130, 126, 172, 254], [172, 254, 206, 70]],
      lines: [[54, 70, 88, 254], [88, 254, 130, 126], [130, 126, 172, 254], [172, 254, 206, 70]],
      joints: [{ cx: 54, cy: 70 }, { cx: 88, cy: 254 }, { cx: 130, cy: 126 }, { cx: 172, cy: 254 }, { cx: 206, cy: 70 }]
    },
    a: {
      ...base,
      rings: [{ cx: 120, cy: 176, r: 58 }],
      paths: ["M174 176 C174 118 92 110 70 162 C48 214 102 262 156 226"],
      lines: [[174, 122, 174, 238]],
      joints: [{ cx: 120, cy: 176 }, { cx: 174, cy: 122 }, { cx: 174, cy: 238 }]
    },
    Q: {
      ...base,
      rings: [{ cx: 128, cy: 148, r: 78 }],
      paths: ["M184 210 L220 258"],
      joints: [{ cx: 184, cy: 210 }]
    }
  };

  return map[glyph] || base;
}

function tubePathMarkup(d, stroke, edge, shine, glyph, weight) {
  const metalId = `metal-${slug(glyph)}-${weight.name}`;
  return [
    `<path d="${d}" stroke="#111312" stroke-width="${edge}" opacity="0.92"/>`,
    `<path d="${d}" stroke="url(#${metalId})" stroke-width="${stroke}"/>`,
    `<path d="${d}" stroke="#f6f1e5" stroke-width="${shine}" opacity="0.72"/>`
  ].join("\n    ");
}

function ringMarkup(ring, stroke, glyph, weight) {
  const metalId = `metal-${slug(glyph)}-${weight.name}`;
  const ringStroke = Math.max(8, stroke * 0.62);
  return [
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" stroke="#101211" stroke-width="${ringStroke + 6}" opacity="0.94"/>`,
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" stroke="url(#${metalId})" stroke-width="${ringStroke}"/>`,
    `<circle cx="${ring.cx - ring.r * 0.22}" cy="${ring.cy - ring.r * 0.24}" r="${Math.max(4, ring.r * 0.18)}" stroke="#f6f1e5" stroke-width="${Math.max(2, ringStroke * 0.18)}" opacity="0.85"/>`
  ].join("\n    ");
}

function jointMarkup(joint, stroke, glyph, weight) {
  const jointId = `joint-${slug(glyph)}-${weight.name}`;
  const radius = Math.max(7, stroke * 0.48);
  return [
    `<circle cx="${joint.cx}" cy="${joint.cy}" r="${radius + 4}" fill="#101211" opacity="0.88"/>`,
    `<circle cx="${joint.cx}" cy="${joint.cy}" r="${radius}" fill="url(#${jointId})"/>`,
    `<circle cx="${joint.cx - radius * 0.25}" cy="${joint.cy - radius * 0.25}" r="${Math.max(2.2, radius * 0.24)}" fill="#f8f3e6" opacity="0.8"/>`
  ].join("\n    ");
}

function linePath(line) {
  return `M${line[0]} ${line[1]} L${line[2]} ${line[3]}`;
}

function slug(glyph) {
  return glyph === "i" ? "lower-i" : glyph === "a" ? "lower-a" : glyph.toLowerCase();
}

function specimenTitle(glyph, weight) {
  return glyph === "N" ? `${glyph} / ${weight.name} Metal / Implied Rings` : `${glyph} / ${weight.name} Metal`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
