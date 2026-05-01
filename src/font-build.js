import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { config, rootDir } from "./config.js";
import { projectFontExportPath } from "./font-export.js";

const DEFAULT_STYLE = "thin";
const DEFAULT_FAMILY = "Object Type Demo Review";
const GLYPH_ORDER = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function selectLatestGlyphArtifacts(artifacts, style = DEFAULT_STYLE) {
  const requestedStyle = String(style || DEFAULT_STYLE).toLowerCase();
  const selected = new Map();

  for (const artifact of artifacts || []) {
    if (artifact?.kind !== "glyph-svg" || !artifact.path || !artifact.path.toLowerCase().endsWith(".svg")) continue;
    if (!existsSync(artifact.path)) continue;

    const artifactStyle = inferStyle(artifact);
    if (artifactStyle && artifactStyle !== requestedStyle) continue;

    const glyph = inferGlyph(artifact);
    if (!glyph) continue;

    const current = selected.get(glyph);
    if (!current || compareArtifacts(artifact, current.artifact) > 0) {
      selected.set(glyph, { glyph, artifact });
    }
  }

  return Array.from(selected.values()).sort((left, right) => glyphSort(left.glyph) - glyphSort(right.glyph));
}

export async function buildProjectFontExport(project, artifacts, options = {}) {
  const style = String(options.style || DEFAULT_STYLE).toLowerCase();
  const selected = selectLatestGlyphArtifacts(artifacts, style);
  if (!selected.length) {
    throw new Error("No glyph SVG artifacts are available for font export.");
  }

  const output = projectFontExportPath(project);
  await mkdir(dirname(output), { recursive: true });

  const tempDir = await mkdtemp(join(tmpdir(), "creative-ip-font-"));
  const mappingPath = join(tempDir, "mapping.csv");
  const mapping = [
    "glyph,svg",
    ...selected.map(({ glyph, artifact }) => `${csvCell(glyph)},${csvCell(artifact.path)}`)
  ].join("\n");

  await writeFile(mappingPath, mapping);

  try {
    await runFontForge([
      "-script",
      join(rootDir, "scripts", "import_svgs_to_fontforge.py"),
      rootDir,
      output,
      "--family",
      options.family || DEFAULT_FAMILY,
      "--style",
      titleCase(style),
      "--mapping",
      mappingPath
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return {
    output,
    glyphs: selected.map(({ glyph, artifact }) => ({
      glyph,
      artifactId: artifact.id,
      title: artifact.title,
      path: artifact.path
    }))
  };
}

export function inferGlyph(artifact) {
  const firstTitlePart = String(artifact?.title || "").split("/")[0].trim();
  if (/^[A-Za-z0-9]$/.test(firstTitlePart)) return firstTitlePart;

  const tokens = filenameTokens(artifact?.path || artifact?.title || "");
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === "lower" && /^[a-z]$/.test(tokens[index + 1])) {
      return tokens[index + 1];
    }
  }

  for (const token of tokens) {
    if (/^[0-9]$/.test(token)) return token;
    if (/^[a-z]$/.test(token)) return token.toUpperCase();
  }

  return "";
}

function inferStyle(artifact) {
  const text = `${artifact?.title || ""} ${artifact?.path || ""}`.toLowerCase();
  if (/\bthin\b/.test(text)) return "thin";
  if (/\bregular\b/.test(text)) return "regular";
  if (/\bbold\b/.test(text)) return "bold";
  return "";
}


function compareArtifacts(left, right) {
  const leftTime = Date.parse(left.created_at || "") || 0;
  const rightTime = Date.parse(right.created_at || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.id || left.title || "").localeCompare(String(right.id || right.title || ""));
}

function filenameTokens(value) {
  return String(value || "")
    .split("/")
    .pop()
    .replace(/\.svg$/i, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function glyphSort(glyph) {
  const index = GLYPH_ORDER.indexOf(glyph);
  return index === -1 ? GLYPH_ORDER.length + glyph.charCodeAt(0) : index;
}

function csvCell(value) {
  const text = String(value || "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function titleCase(value) {
  return String(value || DEFAULT_STYLE).slice(0, 1).toUpperCase() + String(value || DEFAULT_STYLE).slice(1).toLowerCase();
}

function runFontForge(args) {
  const command = process.env.FONTFORGE_PATH || config.fontforgePath || "fontforge";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`FontForge failed with code ${code}: ${stderr || stdout}`));
    });
  });
}
