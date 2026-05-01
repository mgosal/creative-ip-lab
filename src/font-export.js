import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const TEST_FONT_FILENAME = "object-type-demo-thin.otf";

export function projectFontExportPath(project) {
  if (!project?.id) return "";
  return join(config.exportDir, project.id, TEST_FONT_FILENAME);
}

export function projectFontExportFilename(project) {
  return `${slugify(project?.title || "creative-ip-studio")}-test-font.otf`;
}

export function hasProjectFontExport(project) {
  const fontPath = projectFontExportPath(project);
  return Boolean(fontPath && existsSync(fontPath));
}

function slugify(value) {
  return String(value || "font")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "font";
}
