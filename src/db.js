import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const SCRYPT_KEY_LENGTH = 64;

function hashPassword(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, SCRYPT_KEY_LENGTH);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function openDatabase(dbPath = config.dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  seedDemoUser(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      project_type TEXT NOT NULL DEFAULT 'typeface',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'studio',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_collaborators (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artifact_comments (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      attachment_path TEXT,
      attachment_title TEXT,
      attachment_content_type TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artifact_refinements (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      codex_run_id TEXT REFERENCES codex_runs(id) ON DELETE SET NULL,
      generated_artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS codex_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      model TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      output_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    UPDATE projects SET status = 'studio' WHERE status = 'private';
    UPDATE projects SET status = 'showcase' WHERE status = 'public';
  `);

  try {
    db.exec("ALTER TABLE artifact_comments ADD COLUMN display_name TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE artifact_comments ADD COLUMN attachment_path TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE artifact_comments ADD COLUMN attachment_title TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE artifact_comments ADD COLUMN attachment_content_type TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE artifact_refinements ADD COLUMN generated_artifact_id TEXT");
  } catch {}
}

function seedDemoUser(db) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(config.demoEmail);
  if (existing) return;

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), config.demoEmail, "Mandip", hashPassword(config.demoPassword));
}

function feedbackUserId(db) {
  const email = "showcase-feedback@creative-ip-studio.local";
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return existing.id;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(id, email, "Showcase visitor", hashPassword(randomUUID()));
  return id;
}

export function createSession(db, userId) {
  const token = randomUUID();
  const tokenHash = hashPassword(token);
  const expiresAt = toSqlDateTime(new Date(Date.now() + 1000 * 60 * 60 * 8));

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), userId, tokenHash, expiresAt);

  return token;
}

export function findUserBySessionToken(db, token) {
  if (!token) return null;

  const rows = db.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.token_hash,
      sessions.expires_at,
      users.id,
      users.email,
      users.name
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.expires_at > CURRENT_TIMESTAMP
  `).all();

  return rows.find((row) => verifyPassword(token, row.token_hash)) || null;
}

export function destroySession(db, token) {
  const session = findUserBySessionToken(db, token);
  if (!session) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(session.session_id);
}

export function findUserByEmail(db, email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function createProject(db, userId, input) {
  const projectId = randomUUID();
  db.prepare(`
    INSERT INTO projects (id, owner_id, title, project_type, description, status)
    VALUES (?, ?, ?, ?, ?, 'studio')
  `).run(
    projectId,
    userId,
    input.title.trim(),
    input.projectType.trim() || "typeface",
    input.description.trim()
  );

  db.prepare(`
    INSERT INTO project_collaborators (project_id, user_id, role)
    VALUES (?, ?, 'owner')
  `).run(projectId, userId);

  return projectId;
}

export function findProjectByTitleForUser(db, userId, title) {
  return db.prepare(`
    SELECT projects.*
    FROM projects
    JOIN project_collaborators ON project_collaborators.project_id = projects.id
    WHERE project_collaborators.user_id = ? AND lower(projects.title) = lower(?)
    ORDER BY projects.created_at ASC
    LIMIT 1
  `).get(userId, title);
}

export function listProjectsForUser(db, userId) {
  return db.prepare(`
    SELECT projects.*
    FROM projects
    JOIN project_collaborators ON project_collaborators.project_id = projects.id
    WHERE project_collaborators.user_id = ?
    ORDER BY projects.updated_at DESC
  `).all(userId);
}

export function listShowcaseProjects(db) {
  return db.prepare(`
    SELECT id, title, project_type, description, updated_at
    FROM projects
    WHERE status = 'showcase'
    ORDER BY updated_at DESC
  `).all();
}

export function listArtifactsForProject(db, projectId) {
  return db.prepare(`
    SELECT *
    FROM artifacts
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(projectId);
}

export function getProjectForUser(db, projectId, userId) {
  return db.prepare(`
    SELECT projects.*
    FROM projects
    JOIN project_collaborators ON project_collaborators.project_id = projects.id
    WHERE projects.id = ? AND project_collaborators.user_id = ?
  `).get(projectId, userId);
}

export function getArtifactForUser(db, artifactId, userId) {
  return db.prepare(`
    SELECT artifacts.*
    FROM artifacts
    JOIN project_collaborators ON project_collaborators.project_id = artifacts.project_id
    WHERE artifacts.id = ? AND project_collaborators.user_id = ?
  `).get(artifactId, userId);
}

export function getShowcaseArtifact(db, artifactId) {
  return db.prepare(`
    SELECT artifacts.*
    FROM artifacts
    JOIN projects ON projects.id = artifacts.project_id
    WHERE artifacts.id = ?
      AND projects.status = 'showcase'
      AND artifacts.kind = 'glyph-svg'
  `).get(artifactId);
}

export function listArtifactCommentsForProject(db, projectId) {
  return db.prepare(`
    SELECT
      artifact_comments.*,
      COALESCE(artifact_comments.display_name, users.name) AS author_name
    FROM artifact_comments
    JOIN artifacts ON artifacts.id = artifact_comments.artifact_id
    JOIN users ON users.id = artifact_comments.author_id
    WHERE artifacts.project_id = ?
    ORDER BY artifact_comments.created_at DESC
  `).all(projectId);
}

export function listArtifactCommentsForArtifact(db, artifactId) {
  return db.prepare(`
    SELECT
      artifact_comments.*,
      COALESCE(artifact_comments.display_name, users.name) AS author_name
    FROM artifact_comments
    JOIN users ON users.id = artifact_comments.author_id
    WHERE artifact_comments.artifact_id = ?
    ORDER BY artifact_comments.created_at DESC
  `).all(artifactId);
}

export function getArtifactCommentAttachment(db, commentId, userId = "") {
  return db.prepare(`
    SELECT
      artifact_comments.*,
      artifacts.project_id,
      projects.status AS project_status
    FROM artifact_comments
    JOIN artifacts ON artifacts.id = artifact_comments.artifact_id
    JOIN projects ON projects.id = artifacts.project_id
    LEFT JOIN project_collaborators
      ON project_collaborators.project_id = projects.id
      AND project_collaborators.user_id = ?
    WHERE artifact_comments.id = ?
      AND artifact_comments.attachment_path IS NOT NULL
      AND (
        projects.status = 'showcase'
        OR project_collaborators.user_id IS NOT NULL
      )
    LIMIT 1
  `).get(userId, commentId);
}

export function addNote(db, projectId, authorId, body) {
  db.prepare(`
    INSERT INTO notes (id, project_id, author_id, body)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), projectId, authorId, body.trim());
  touchProject(db, projectId);
}

export function noteExists(db, projectId, body) {
  return Boolean(db.prepare(`
    SELECT id FROM notes
    WHERE project_id = ? AND body = ?
    LIMIT 1
  `).get(projectId, body.trim()));
}

export function addArtifactSummary(db, projectId, input) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO artifacts (id, project_id, kind, title, summary, path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    input.kind.trim() || "source",
    input.title.trim(),
    input.summary.trim(),
    input.path || null
  );
  touchProject(db, projectId);
  return id;
}

export function addArtifactComment(db, artifactId, authorId, body, displayName = "", attachment = null) {
  const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(artifactId);
  if (!artifact) return;

  const resolvedAuthorId = authorId || feedbackUserId(db);
  const visibleName = displayName.trim() || null;

  db.prepare(`
    INSERT INTO artifact_comments (
      id,
      artifact_id,
      author_id,
      display_name,
      attachment_path,
      attachment_title,
      attachment_content_type,
      body
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    artifactId,
    resolvedAuthorId,
    visibleName,
    attachment?.path || null,
    attachment?.title || null,
    attachment?.contentType || null,
    body.trim()
  );
  touchProject(db, artifact.project_id);
}

export function saveArtifactRefinement(db, artifactId, codexRunId, run, generatedArtifactId = null) {
  const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(artifactId);
  if (!artifact) return null;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO artifact_refinements (id, artifact_id, codex_run_id, generated_artifact_id, model, status, summary, output_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    artifactId,
    codexRunId,
    generatedArtifactId,
    run.model,
    run.status,
    run.output.nextAction || run.output.productDirection || run.inputSummary || "",
    JSON.stringify(run.output)
  );
  touchProject(db, artifact.project_id);
  return id;
}

export function listArtifactRefinementsForArtifact(db, artifactId) {
  return db.prepare(`
    SELECT
      artifact_refinements.*,
      generated.title AS generated_artifact_title,
      generated.path AS generated_artifact_path
    FROM artifact_refinements
    LEFT JOIN artifacts AS generated
      ON generated.id = artifact_refinements.generated_artifact_id
    WHERE artifact_refinements.artifact_id = ?
    ORDER BY artifact_refinements.created_at DESC
  `).all(artifactId);
}

export function artifactExists(db, projectId, input) {
  return Boolean(db.prepare(`
    SELECT id FROM artifacts
    WHERE project_id = ? AND kind = ? AND title = ?
    LIMIT 1
  `).get(projectId, input.kind, input.title));
}

export function getProjectContext(db, projectId) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  const notes = db.prepare("SELECT * FROM notes WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  const artifacts = db.prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  const artifactComments = listArtifactCommentsForProject(db, projectId);
  const codexRuns = db.prepare("SELECT * FROM codex_runs WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  return { project, notes, artifacts, artifactComments, codexRuns };
}

export function saveCodexRun(db, projectId, run) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO codex_runs (id, project_id, action, model, input_summary, output_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    run.action,
    run.model,
    run.inputSummary,
    JSON.stringify(run.output),
    run.status
  );
  touchProject(db, projectId);
  return id;
}

export function updateProjectStatus(db, projectId, status) {
  const nextStatus = status === "showcase" ? "showcase" : "studio";
  db.prepare("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextStatus, projectId);
}

function touchProject(db, projectId) {
  db.prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);
}

function toSqlDateTime(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}
