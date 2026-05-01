import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { selectLatestGlyphArtifacts } from "../src/font-build.js";
import { generateProjectZeroSpecimens, identifiedGlyphs } from "../src/typeface.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "creative-ip-lab-"));
const dbPath = join(tmpRoot, "test.sqlite");
config.uploadDir = join(tmpRoot, "uploads");
config.exportDir = join(tmpRoot, "exports");
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

describe("font export selection", () => {
  it("selects the latest SVG artifact for each glyph in the requested style", () => {
    const selected = selectLatestGlyphArtifacts([
      {
        id: "old-n",
        kind: "glyph-svg",
        title: "N / Thin Metal",
        path: join(tmpRoot, "old-n-thin.svg"),
        created_at: "2026-05-01 01:00:00"
      },
      {
        id: "regular-n",
        kind: "glyph-svg",
        title: "N / Regular Metal",
        path: join(tmpRoot, "regular-n-regular.svg"),
        created_at: "2026-05-01 03:00:00"
      },
      {
        id: "corrected-n",
        kind: "glyph-svg",
        title: "N / Thin Metal / Corrected Direction",
        path: join(tmpRoot, "object-type-metal-n-thin-corrected-direction.svg"),
        created_at: "2026-05-01 04:00:00"
      },
      {
        id: "s-thin",
        kind: "glyph-svg",
        title: "S / Thin Metal",
        path: join(tmpRoot, "object-type-metal-s-thin.svg"),
        created_at: "2026-05-01 02:00:00"
      },
      {
        id: "a-thin",
        kind: "glyph-svg",
        title: "a / Thin Metal",
        path: join(tmpRoot, "object-type-metal-lower-a-thin.svg"),
        created_at: "2026-05-01 02:30:00"
      },
      {
        id: "source",
        kind: "source",
        title: "IMG_1.jpeg",
        path: join(tmpRoot, "IMG_1.jpeg"),
        created_at: "2026-05-01 05:00:00"
      }
    ].map((artifact) => {
      if (artifact.path.endsWith(".svg")) writeFileSync(artifact.path, "<svg></svg>");
      return artifact;
    }), "thin");

    assert.deepEqual(selected.map((item) => [item.glyph, item.artifact.id]), [
      ["N", "corrected-n"],
      ["S", "s-thin"],
      ["a", "a-thin"]
    ]);
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

  it("shows uploaded source images in the studio material section", async () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const projectId = createProject(db, user.id, {
      title: "Image Source Project",
      projectType: "typeface",
      description: "Uploaded source images should be visible"
    });
    const sourcePath = join(tmpRoot, "source-photo.jpeg");
    writeFileSync(sourcePath, "not a real jpeg, only route metadata for render test");
    const artifactId = addArtifactSummary(db, projectId, {
      kind: "source",
      title: "IMG_4578.jpeg",
      summary: "Part of context drop. image/jpeg, 100 bytes.",
      path: sourcePath
    });

    const response = await fetch(`${baseUrl}/projects/${projectId}`, {
      headers: { cookie: `${config.sessionCookie}=${token}` }
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, new RegExp(`<img class="material-preview"[^>]+/artifacts/${artifactId}/file`));
  });

  it("shows the font build action when a project has glyph artifacts", async () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const token = createSession(db, user.id);
    const projectId = createProject(db, user.id, {
      title: "Font Build Project",
      projectType: "typeface",
      description: "Has glyphs to export"
    });
    addArtifactSummary(db, projectId, {
      kind: "glyph-svg",
      title: "N / Thin Metal",
      summary: "A glyph that can enter a font",
      path: join(tmpRoot, "font-build-n-thin.svg")
    });
    writeFileSync(join(tmpRoot, "font-build-n-thin.svg"), "<svg></svg>");

    const response = await fetch(`${baseUrl}/projects/${projectId}`, {
      headers: { cookie: `${config.sessionCookie}=${token}` }
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, new RegExp(`/projects/${projectId}/export/font/build`));
    assert.match(html, /Build test font/);
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

  it("exports a showcase glyph as a usable SVG mark and single-glyph font proof", async () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Export Project",
      projectType: "typeface",
      description: "Export a distinctive N"
    });
    const glyphPath = join(tmpRoot, "export-n.svg");
    writeFileSync(glyphPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 320"><path d="M74 248 C68 194 70 122 74 72"/><path d="M74 72 C92 104 104 136 124 160 C146 186 164 218 188 248"/><path d="M188 72 C194 126 192 202 188 248"/></svg>`);
    const artifactId = addArtifactSummary(db, projectId, {
      kind: "glyph-svg",
      title: "N / Regular",
      summary: "A usable N mark",
      path: glyphPath
    });
    updateProjectStatus(db, projectId, "showcase");

    const svgResponse = await fetch(`${baseUrl}/artifacts/${artifactId}/export/svg`);
    const svg = await svgResponse.text();
    const fontResponse = await fetch(`${baseUrl}/artifacts/${artifactId}/export/font-svg`);
    const fontProof = await fontResponse.text();

    assert.equal(svgResponse.status, 200);
    assert.match(svgResponse.headers.get("content-disposition"), /n-regular-mark\.svg/);
    assert.match(svg, /<svg/);
    assert.equal(fontResponse.status, 200);
    assert.match(fontResponse.headers.get("content-disposition"), /n-regular-single-glyph-font\.svg/);
    assert.match(fontProof, /<font/);
    assert.match(fontProof, /unicode="N"/);
  });

  it("lets showcase visitors and authenticated owners download a project font file", async () => {
    const user = findUserByEmail(db, "mandip@example.com");
    const projectId = createProject(db, user.id, {
      title: "Downloadable Font Project",
      projectType: "typeface",
      description: "A public test font"
    });
    const fontDir = join(config.exportDir, projectId);
    mkdirSync(fontDir, { recursive: true });
    writeFileSync(join(fontDir, "object-type-demo-thin.otf"), "fake otf for route test");
    updateProjectStatus(db, projectId, "showcase");

    const publicResponse = await fetch(`${baseUrl}/projects/${projectId}/export/font`);
    const publicBody = await publicResponse.text();

    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get("content-type"), "font/otf");
    assert.match(publicResponse.headers.get("content-disposition"), /downloadable-font-project-test-font\.otf/);
    assert.equal(publicBody, "fake otf for route test");

    const privateProjectId = createProject(db, user.id, {
      title: "Private Font Project",
      projectType: "typeface",
      description: "An authenticated test font"
    });
    const privateFontDir = join(config.exportDir, privateProjectId);
    mkdirSync(privateFontDir, { recursive: true });
    writeFileSync(join(privateFontDir, "object-type-demo-thin.otf"), "private fake otf");
    const token = createSession(db, user.id);

    const ownerResponse = await fetch(`${baseUrl}/projects/${privateProjectId}/export/font`, {
      headers: { cookie: `${config.sessionCookie}=${token}` }
    });

    assert.equal(ownerResponse.status, 200);
    assert.match(ownerResponse.headers.get("content-disposition"), /private-font-project-test-font\.otf/);
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
