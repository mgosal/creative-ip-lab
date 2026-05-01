import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addArtifactSummary,
  addNote,
  createProject,
  createSession,
  findUserByEmail,
  findUserBySessionToken,
  getProjectContext,
  getProjectForUser,
  listShowcaseProjects,
  listProjectsForUser,
  openDatabase,
  saveCodexRun,
  updateProjectStatus
} from "../src/db.js";
import { buildGuideProjectInput, guideProject } from "../src/codex.js";
import { config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { generateProjectZeroSpecimens, identifiedGlyphs } from "../src/typeface.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "creative-ip-lab-"));
const dbPath = join(tmpRoot, "test.sqlite");
config.uploadDir = join(tmpRoot, "uploads");
const db = openDatabase(dbPath);

after(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("persistence and authorization", () => {
  it("seeds a demo user and creates a studio project", () => {
    const user = findUserByEmail(db, "mandip@example.com");
    assert.equal(user.email, "mandip@example.com");

    const projectId = createProject(db, user.id, {
      title: "Project Zero",
      projectType: "typeface",
      description: "Object typeface exploration"
    });

    assert.equal(listProjectsForUser(db, user.id).length, 1);
    assert.equal(getProjectForUser(db, projectId, user.id).title, "Project Zero");
    assert.equal(getProjectForUser(db, projectId, "unknown-user"), undefined);
  });

  it("uses session tokens to find the signed-in user", () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const sessionUser = findUserBySessionToken(db, token);

    assert.equal(sessionUser.email, user.email);
    assert.equal(findUserBySessionToken(db, "wrong-token"), null);
  });

  it("keeps showcase separate from studio projects", () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Private Sketch",
      projectType: "typeface",
      description: "Not ready"
    });

    assert.equal(listShowcaseProjects(db).some((project) => project.id === projectId), false);

    updateProjectStatus(db, projectId, "showcase");

    assert.equal(listShowcaseProjects(db).some((project) => project.id === projectId), true);
  });
});

describe("Guide Project", () => {
  it("builds structured input and stores a mocked Codex run without an API key", async () => {
    config.openaiApiKey = "";
    config.codexProvider = "mock";
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Guided Project",
      projectType: "typeface",
      description: "Observation-led display type"
    });
    const context = {
      project: getProjectForUser(db, projectId, user.id),
      notes: [{ body: "The object has hinged movement and repeated angles." }],
      artifacts: [{ kind: "photo", title: "Angle set", summary: "Three positions suggest letters." }],
      codexRuns: []
    };

    const input = buildGuideProjectInput(context);
    assert.equal(input.project.title, "Guided Project");
    assert.equal(input.artifacts.length, 1);

    const run = await guideProject(context);
    saveCodexRun(db, projectId, run);

    assert.equal(run.action, "Guide Project");
    assert.equal(run.status, "mocked");
    assert.ok(run.output.nextAction.length > 0);
  });

  it("carries previous guidance and creator replies into the next Codex pass", () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Pilot Seven",
      projectType: "typeface",
      description: "A second object-led type study"
    });
    addNote(db, projectId, user.id, "Codex loop response:\nUse the path about metallic depth and avoid flat tracing.");
    saveCodexRun(db, projectId, {
      action: "Guide Project",
      model: "mock-codex-sdk",
      inputSummary: "Project: Pilot Seven",
      status: "mocked",
      output: {
        understanding: "Pilot Seven is a source-led typeface project.",
        productDirection: "Explore metallic depth.",
        visualRules: [],
        questions: ["Which letter should prove the system?"],
        sourceMaterial: [],
        path: ["Choose one letter and one source constraint."],
        nextAction: "Answer the open question."
      }
    });

    const input = buildGuideProjectInput({
      ...getProjectContext(db, projectId),
      followUp: "Start with the seven and make the next step concrete."
    });

    assert.equal(input.followUp, "Start with the seven and make the next step concrete.");
    assert.equal(input.guidanceHistory.length, 1);
    assert.deepEqual(input.guidanceHistory[0].questions, ["Which letter should prove the system?"]);
    assert.match(input.notes[0], /Codex loop response/);
  });
});

describe("Project Zero specimens", () => {
  it("generates thin, regular, and bold SVG artifacts for identified glyphs", async () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Specimen Project",
      projectType: "typeface",
      description: "Object typeface specimens"
    });

    const created = await generateProjectZeroSpecimens(db, projectId);

    assert.equal(created.length, identifiedGlyphs.length * 3);
  });
});

describe("http app", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createApp(db);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  it("serves the login page", async () => {
    const response = await fetch(`${baseUrl}/login`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Sign in/);
  });

  it("continues guidance from a project reply", async () => {
    config.codexProvider = "mock";
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const projectId = createProject(db, user.id, {
      title: "Guidance Route",
      projectType: "typeface",
      description: "Route-level Codex loop"
    });

    const response = await fetch(`${baseUrl}/projects/${projectId}/guide`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${config.sessionCookie}=${token}`
      },
      body: new URLSearchParams({
        guidanceReply: "Answer the questions and turn the path into the next concrete step."
      })
    });

    const context = getProjectContext(db, projectId);

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `/projects/${projectId}?saved=guidance#guidance`);
    assert.equal(context.codexRuns.length, 1);
    assert.match(context.notes[0].body, /Codex loop response/);
  });

  it("saves a generated artifact from the Codex refinement pipeline", async () => {
    config.codexProvider = "mock";
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const projectId = createProject(db, user.id, {
      title: "Generated Refinement",
      projectType: "typeface",
      description: "Runtime asset generation"
    });
    const sourceArtifactId = addArtifactSummary(db, projectId, {
      kind: "glyph-svg",
      title: "Seven / Regular",
      summary: "Initial generated asset"
    });

    const response = await fetch(`${baseUrl}/artifacts/${sourceArtifactId}/refine`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `${config.sessionCookie}=${token}`
      }
    });
    const context = getProjectContext(db, projectId);
    const generated = context.artifacts.find((artifact) => artifact.id !== sourceArtifactId);
    const refinements = context.codexRuns.filter((run) => run.action === "Refine Artifact");

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `/artifacts/${sourceArtifactId}?saved=refinement#timeline`);
    assert.equal(refinements.length, 1);
    assert.equal(generated.kind, "glyph-svg");
    assert.match(generated.title, /Codex revision/);
  });

  it("blocks Codex refinement while an owned asset is in the showcase", async () => {
    config.codexProvider = "mock";
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const projectId = createProject(db, user.id, {
      title: "Showcase Refinement Guard",
      projectType: "typeface",
      description: "Feedback is open, refinement is private"
    });
    addArtifactSummary(db, projectId, {
      kind: "glyph-svg",
      title: "Seven / Regular",
      summary: "Initial generated asset"
    });
    updateProjectStatus(db, projectId, "showcase");
    const artifact = getProjectContext(db, projectId).artifacts[0];

    const response = await fetch(`${baseUrl}/artifacts/${artifact.id}/refine`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `${config.sessionCookie}=${token}`
      }
    });
    const context = getProjectContext(db, projectId);

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `/artifacts/${artifact.id}?saved=studio-required#comments`);
    assert.equal(context.codexRuns.length, 0);
  });
});
