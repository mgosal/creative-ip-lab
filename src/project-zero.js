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

const materialDir = join(rootDir, "data", "project zero");

export async function importProjectZero(db, userId) {
  return importSeedProject(db, userId, {
    title: "Project Zero",
    description: "Typeface exploration from a desk-mounted MagSafe stand, using photographed configurations as source material.",
    direction: [
      "Project Zero is the raw first pass.",
      "Use the source object, transcript, and identified glyph candidates to establish the first object-type system."
    ].join("\n")
  });
}

export async function importProjectOne(db, userId) {
  return importSeedProject(db, userId, {
    title: "Project 1",
    description: "Metallic depth typeface from Project Zero source inputs, focused on hinge joints, constrained movement, and dimensional letter construction.",
    direction: [
      "Project 1 treats the Project Zero inputs as source material, not as a literal photo-tracing exercise.",
      "The target creative asset is a metallic object typeface with visible depth, graphite/black metal surfaces, hinge pins, rings, subtle highlights, and shadowed joins.",
      "The N is the key test glyph. It should not read as three generic strokes. Its middle line should feel constrained by the object's movement: subtly bent, jointed, slightly awkward, and mechanically plausible.",
      "Extract construction rules from the object's physical limits: rotation, hinge axes, ring counters, clamp pressure, and places where movement stops.",
      "Use Codex guidance to turn the source pile into a small sequence: source read, visual rules, glyph decisions, specimen critique, and next asset output."
    ].join("\n")
  });
}

async function importSeedProject(db, userId, seed) {
  let project = findProjectByTitleForUser(db, userId, seed.title);
  if (!project) {
    const projectId = createProject(db, userId, {
      title: seed.title,
      projectType: "typeface",
      description: seed.description
    });
    project = getProjectForUser(db, projectId, userId);
  }

  const imported = importMaterial(db, project.id, userId, seed);
  const glyphs = await generateProjectZeroSpecimens(db, project.id);

  return {
    projectId: project.id,
    imported,
    glyphs
  };
}

function importMaterial(db, projectId, userId, seed) {
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
    const summary = materialSummary(title, extension, seed.title);

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

  const contextNote = buildContextNote(seed);
  if (contextNote && !noteExists(db, projectId, contextNote)) {
    addNote(db, projectId, userId, contextNote);
    importedNotes += 1;
  }

  return { files: importedFiles, notes: importedNotes };
}

function buildContextNote(seed) {
  return [
    `${seed.title} source context:`,
    seed.direction,
    "",
    readTranscript(),
    "",
    `Identified starting glyphs from the source material: ${identifiedGlyphs.join(", ")}.`
  ].filter(Boolean).join("\n");
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

function materialSummary(title, extension, projectLabel) {
  if (imageExtension(extension)) {
    return `${projectLabel} source photo from the local Project Zero material folder: ${title}. Context is captured once in the project source note.`;
  }
  return `${projectLabel} dictation or note from the local Project Zero material folder: ${title}. Context is captured once in the project source note.`;
}

function imageExtension(extension) {
  return [".jpeg", ".jpg", ".png", ".webp"].includes(extension);
}
