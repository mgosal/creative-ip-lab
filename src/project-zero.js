import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { config, rootDir } from "./config.js";
import {
  addArtifactSummary,
  addNote,
  artifactExists,
  createProject,
  findProjectByTitleForUser,
  getProjectForUser,
  noteExists
} from "./db.js";
import { generateProjectZeroSpecimens, identifiedGlyphs } from "./typeface.js";

const projectTitle = "Project Zero";
const materialDir = join(rootDir, "data", "project zero");

export async function importProjectZero(db, userId) {
  let project = findProjectByTitleForUser(db, userId, projectTitle);
  if (!project) {
    const projectId = createProject(db, userId, {
      title: projectTitle,
      projectType: "typeface",
      description: "Typeface exploration from a desk-mounted MagSafe stand, using photographed configurations as source material."
    });
    project = getProjectForUser(db, projectId, userId);
  }

  const imported = importMaterial(db, project.id, userId);
  const glyphs = await generateProjectZeroSpecimens(db, project.id);

  return {
    projectId: project.id,
    imported,
    glyphs
  };
}

function importMaterial(db, projectId, userId) {
  if (!existsSync(materialDir)) {
    return { files: 0, notes: 0 };
  }

  const files = readdirSync(materialDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(materialDir, entry.name));
  let importedFiles = 0;
  let importedNotes = 0;

  for (const path of files) {
    const extension = extname(path).toLowerCase();
    if (![".jpeg", ".jpg", ".png", ".webp", ".docx", ".txt", ".md"].includes(extension)) continue;

    const title = path.split("/").pop();
    const kind = imageExtension(extension) ? "photo" : "dictation";
    const summary = materialSummary(title, extension);

    if (!artifactExists(db, projectId, { kind, title })) {
      addArtifactSummary(db, projectId, {
        kind,
        title,
        summary,
        path
      });
      importedFiles += 1;
    }
  }

  const transcript = readTranscript();
  if (transcript && !noteExists(db, projectId, transcript)) {
    addNote(db, projectId, userId, transcript);
    importedNotes += 1;
  }

  const glyphNote = `Identified starting glyphs from Project Zero material: ${identifiedGlyphs.join(", ")}.`;
  if (!noteExists(db, projectId, glyphNote)) {
    addNote(db, projectId, userId, glyphNote);
    importedNotes += 1;
  }

  return { files: importedFiles, notes: importedNotes };
}

function readTranscript() {
  const transcriptPath = join(materialDir, "transcript.txt");
  if (existsSync(transcriptPath)) {
    return readFileSync(transcriptPath, "utf8").trim();
  }

  return [
    "Project Zero transcript summary:",
    "The source object is a desk-mounted MagSafe phone stand with metal rings, hinges, and repeated axes.",
    "The observed glyph candidates are uppercase N, near-S, 5, 2, Z, lowercase i, W, lowercase a, and Q.",
    "The typeface direction should preserve the stand's rings, hinge axes, graphite/black material quality, and constraint-based configurations."
  ].join("\n");
}

function materialSummary(title, extension) {
  if (imageExtension(extension)) {
    return `Project Zero reference photo imported from local material drop: ${title}.`;
  }
  return `Project Zero dictation or note imported from local material drop: ${title}.`;
}

function imageExtension(extension) {
  return [".jpeg", ".jpg", ".png", ".webp"].includes(extension);
}
