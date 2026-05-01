import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, rootDir } from "./config.js";
import {
  addArtifactComment,
  addArtifactSummary,
  addNote,
  createProject,
  createSession,
  destroySession,
  findUserByEmail,
  findUserBySessionToken,
  getArtifactCommentAttachment,
  getShowcaseArtifact,
  getShowcaseProject,
  getArtifactForUser,
  listArtifactCommentsForArtifact,
  listArtifactCommentsForProject,
  listArtifactRefinementsForArtifact,
  listArtifactsForProject,
  getProjectContext,
  getProjectForUser,
  listProjectsForUser,
  listShowcaseProjects,
  openDatabase,
  updateProjectStatus,
  verifyPassword,
  saveArtifactRefinement,
  saveCodexRun
} from "./db.js";
import { guideProject, refineArtifact } from "./codex.js";
import { buildArtifactExport, canExportArtifact } from "./export-artifact.js";
import { buildProjectFontExport } from "./font-build.js";
import { hasProjectFontExport, projectFontExportFilename, projectFontExportPath } from "./font-export.js";
import { importProjectOne, importProjectZero } from "./project-zero.js";
import { generateProjectZeroSpecimens } from "./typeface.js";
import { renderArtifactDetail, renderLab, renderLogin, renderNewProject, renderProject, renderShowcase, renderNotFound } from "./views.js";

export function createApp(database = openDatabase()) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (url.pathname.startsWith("/assets/")) {
        return serveAsset(url.pathname, response);
      }

      const user = findUserBySessionToken(database, getCookie(request, config.sessionCookie));

      if (request.method === "GET" && url.pathname === "/") {
        return redirect(response, user ? "/studio" : "/login");
      }

      if (request.method === "GET" && url.pathname === "/login") {
        return sendHtml(response, renderLogin({ user, error: url.searchParams.get("error") }));
      }

      if (request.method === "POST" && url.pathname === "/login") {
        const body = await readForm(request);
        const loginUser = findUserByEmail(database, body.email || "");

        if (!loginUser || !verifyPassword(body.password || "", loginUser.password_hash)) {
          return redirect(response, "/login?error=Invalid%20login");
        }

        const token = createSession(database, loginUser.id);
        setSessionCookie(response, token);
        return redirect(response, "/studio");
      }

      if (request.method === "POST" && url.pathname === "/logout") {
        destroySession(database, getCookie(request, config.sessionCookie));
        clearSessionCookie(response);
        return redirect(response, "/login");
      }

      if (request.method === "GET" && url.pathname === "/public") {
        return redirect(response, "/showcase");
      }

      if (request.method === "GET" && url.pathname === "/showcase") {
        const projects = listShowcaseProjects(database).map((project) => ({
          ...project,
          fontExportAvailable: hasProjectFontExport(project),
          previews: listArtifactsForProject(database, project.id)
            .filter((artifact) => artifact.kind === "glyph-svg")
            .slice(0, 9),
          artifactComments: listArtifactCommentsForProject(database, project.id)
        }));
        return sendHtml(response, renderShowcase({
          user,
          projects,
          notice: url.searchParams.get("saved")
        }));
      }

      const artifactFileMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/file$/);
      if (request.method === "GET" && artifactFileMatch) {
        const artifact = user
          ? getArtifactForUser(database, artifactFileMatch[1], user.id) || getShowcaseArtifact(database, artifactFileMatch[1])
          : getShowcaseArtifact(database, artifactFileMatch[1]);
        if (!artifact || !artifact.path) return sendHtml(response, renderNotFound({ user }), 404);
        return serveLocalFile(artifact.path, response);
      }

      const artifactExportMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/export\/(svg|font-svg)$/);
      if (request.method === "GET" && artifactExportMatch) {
        const artifact = user
          ? getArtifactForUser(database, artifactExportMatch[1], user.id) || getShowcaseArtifact(database, artifactExportMatch[1])
          : getShowcaseArtifact(database, artifactExportMatch[1]);
        if (!canExportArtifact(artifact)) return sendHtml(response, renderNotFound({ user }), 404);

        const exported = await buildArtifactExport(artifact, artifactExportMatch[2]);
        if (!exported) return sendHtml(response, renderNotFound({ user }), 404);
        return sendDownload(response, exported);
      }

      const projectFontExportMatch = url.pathname.match(/^\/projects\/([^/]+)\/export\/font$/);
      if (request.method === "GET" && projectFontExportMatch) {
        const ownedProject = user ? getProjectForUser(database, projectFontExportMatch[1], user.id) : null;
        const project = ownedProject || getShowcaseProject(database, projectFontExportMatch[1]);
        if (!project || !hasProjectFontExport(project)) return sendHtml(response, renderNotFound({ user }), 404);
        return serveDownloadFile(projectFontExportPath(project), projectFontExportFilename(project), response);
      }

      const commentFileMatch = url.pathname.match(/^\/comments\/([^/]+)\/file$/);
      if (request.method === "GET" && commentFileMatch) {
        const comment = getArtifactCommentAttachment(database, commentFileMatch[1], user?.id || "");
        if (!comment || !comment.attachment_path) return sendHtml(response, renderNotFound({ user }), 404);
        return serveLocalFile(comment.attachment_path, response);
      }

      const publicArtifactCommentMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/comments$/);
      if (request.method === "POST" && publicArtifactCommentMatch) {
        const ownedArtifact = user ? getArtifactForUser(database, publicArtifactCommentMatch[1], user.id) : null;
        const showcaseArtifact = getShowcaseArtifact(database, publicArtifactCommentMatch[1]);
        const artifact = ownedArtifact || showcaseArtifact;
        if (!artifact) return sendHtml(response, renderNotFound({ user }), 404);

        const submission = await readCommentSubmission(request);
        const attachment = submission.files[0] ? await saveCommentAttachment(artifact, submission.files[0]) : null;
        if (submission.fields.body?.trim() || attachment) {
          addArtifactComment(
            database,
            artifact.id,
            user?.id || null,
            submission.fields.body || "Attached reference.",
            user?.name || submission.fields.name || "Showcase visitor",
            attachment
          );
        }

        if (submission.fields.returnTo === "asset") {
          return redirect(response, `/artifacts/${artifact.id}?saved=comment#comments`);
        }

        if (submission.fields.returnTo === "showcase" || (!ownedArtifact && showcaseArtifact)) {
          return redirect(response, `/showcase?saved=comment#asset-${artifact.id}`);
        }
        return redirect(response, `/projects/${artifact.project_id}?saved=comment#asset-${artifact.id}`);
      }

      const artifactDetailMatch = url.pathname.match(/^\/artifacts\/([^/]+)$/);
      if (request.method === "GET" && artifactDetailMatch) {
        const ownedArtifact = user ? getArtifactForUser(database, artifactDetailMatch[1], user.id) : null;
        const showcaseArtifact = getShowcaseArtifact(database, artifactDetailMatch[1]);
        const artifact = ownedArtifact || showcaseArtifact;
        if (!artifact) return user ? sendHtml(response, renderNotFound({ user }), 404) : redirect(response, "/login");

        const context = getProjectContext(database, artifact.project_id);
        const isOwnedShowcaseAsset = Boolean(ownedArtifact) && context.project.status === "showcase";
        return sendHtml(response, renderArtifactDetail({
          user,
          project: context.project,
          artifact,
          comments: listArtifactCommentsForArtifact(database, artifact.id),
          refinements: listArtifactRefinementsForArtifact(database, artifact.id),
          canRefine: Boolean(ownedArtifact) && !isOwnedShowcaseAsset,
          refineLockedReason: isOwnedShowcaseAsset ? "Move this project back to studio before refining with Codex." : "",
          fontExportAvailable: hasProjectFontExport(context.project),
          notice: url.searchParams.get("saved")
        }));
      }

      if (request.method === "GET" && url.pathname === "/lab") {
        return redirect(response, "/studio");
      }

      if (!user) {
        return redirect(response, "/login");
      }

      if (request.method === "GET" && url.pathname === "/studio") {
        return sendHtml(response, renderLab({
          user,
          projects: listProjectsForUser(database, user.id),
          error: url.searchParams.get("error")
        }));
      }

      if (request.method === "POST" && url.pathname === "/project-zero/import") {
        const result = await importProjectZero(database, user.id);
        return redirect(response, `/projects/${result.projectId}`);
      }

      if (request.method === "POST" && url.pathname === "/project-one/import") {
        const result = await importProjectOne(database, user.id);
        return redirect(response, `/projects/${result.projectId}`);
      }

      if (request.method === "GET" && url.pathname === "/projects/new") {
        return sendHtml(response, renderNewProject({ user, error: url.searchParams.get("error") }));
      }

      if (request.method === "POST" && url.pathname === "/projects") {
        const parsed = await readProjectCreate(request);
        if (!parsed.fields.title?.trim()) {
          return redirect(response, "/studio?error=Project%20title%20is%20required");
        }

        const projectId = createProject(database, user.id, {
          title: parsed.fields.title,
          projectType: parsed.fields.projectType || "typeface",
          description: parsed.fields.description || ""
        });

        const initialContext = parsed.fields.initialContext?.trim();
        if (initialContext) {
          addNote(database, projectId, user.id, initialContext);
        }
        if (parsed.files.length) {
          await saveMaterialDrop(database, projectId, user.id, {
            fields: {
              kind: parsed.fields.kind || "source",
              title: parsed.fields.dropTitle || "Initial context drop",
              summary: initialContext || parsed.fields.description || ""
            },
            files: parsed.files
          });
        }

        return redirect(response, `/projects/${projectId}`);
      }

      const projectFontBuildMatch = url.pathname.match(/^\/projects\/([^/]+)\/export\/font\/build$/);
      if (request.method === "POST" && projectFontBuildMatch) {
        const project = getProjectForUser(database, projectFontBuildMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const context = getProjectContext(database, project.id);
        await buildProjectFontExport(context.project, context.artifacts);
        return redirect(response, `/projects/${project.id}?saved=font#generated-assets`);
      }

      const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
      if (request.method === "GET" && projectMatch) {
        const project = getProjectForUser(database, projectMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const context = getProjectContext(database, project.id);
        return sendHtml(response, renderProject({
          user,
          notice: url.searchParams.get("saved"),
          fontExportAvailable: hasProjectFontExport(context.project),
          ...context
        }));
      }

      const noteMatch = url.pathname.match(/^\/projects\/([^/]+)\/notes$/);
      if (request.method === "POST" && noteMatch) {
        const project = getProjectForUser(database, noteMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readForm(request);
        if (body.body?.trim()) addNote(database, project.id, user.id, body.body);
        return redirect(response, `/projects/${project.id}?saved=note#notes`);
      }

      const artifactMatch = url.pathname.match(/^\/projects\/([^/]+)\/artifacts$/);
      if (request.method === "POST" && artifactMatch) {
        const project = getProjectForUser(database, artifactMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readBody(request);
        const contentType = request.headers["content-type"] || "";

        if (contentType.startsWith("multipart/form-data")) {
          const drop = parseMultipartForm(body, contentType);
          await saveMaterialDrop(database, project.id, user.id, drop);
        } else {
          const fields = Object.fromEntries(new URLSearchParams(body.toString("utf8")));
          if (fields.title?.trim() || fields.summary?.trim()) {
            addArtifactSummary(database, project.id, {
              kind: fields.kind || "material",
              title: fields.title || "Untitled material",
              summary: fields.summary || ""
            });
          }
        }
        return redirect(response, `/projects/${project.id}?saved=context#notes`);
      }

      const artifactRefineMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/refine$/);
      if (request.method === "POST" && artifactRefineMatch) {
        const artifact = getArtifactForUser(database, artifactRefineMatch[1], user.id);
        if (!artifact) return sendHtml(response, renderNotFound({ user }), 404);
        const context = getProjectContext(database, artifact.project_id);
        if (context.project.status === "showcase") {
          return redirect(response, `/artifacts/${artifact.id}?saved=studio-required#comments`);
        }
        const comments = context.artifactComments.filter((comment) => comment.artifact_id === artifact.id);
        const run = await refineArtifact(context, artifact, comments);
        const runId = saveCodexRun(database, artifact.project_id, run);
        const generatedArtifact = await saveGeneratedRefinementAsset(database, artifact, run);
        saveArtifactRefinement(database, artifact.id, runId, run, generatedArtifact?.id || null);
        return redirect(response, `/artifacts/${artifact.id}?saved=refinement#timeline`);
      }

      const guideMatch = url.pathname.match(/^\/projects\/([^/]+)\/guide$/);
      if (request.method === "POST" && guideMatch) {
        const project = getProjectForUser(database, guideMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readForm(request);
        const followUp = body.guidanceReply?.trim() || "";
        if (followUp) {
          addNote(database, project.id, user.id, `Codex loop response:\n${followUp}`);
        }
        const run = await guideProject({
          ...getProjectContext(database, project.id),
          followUp
        });
        saveCodexRun(database, project.id, run);
        return redirect(response, `/projects/${project.id}?saved=guidance#guidance`);
      }

      const specimenMatch = url.pathname.match(/^\/projects\/([^/]+)\/specimens$/);
      if (request.method === "POST" && specimenMatch) {
        const project = getProjectForUser(database, specimenMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        await generateProjectZeroSpecimens(database, project.id);
        return redirect(response, `/projects/${project.id}`);
      }

      const statusMatch = url.pathname.match(/^\/projects\/([^/]+)\/status$/);
      if (request.method === "POST" && statusMatch) {
        const project = getProjectForUser(database, statusMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readForm(request);
        updateProjectStatus(database, project.id, body.status);
        return redirect(response, `/projects/${project.id}`);
      }

      return sendHtml(response, renderNotFound({ user }), 404);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack || error.message);
    }
  });
}

function sendHtml(response, html, status = 200) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function redirect(response, location) {
  response.writeHead(303, { location });
  response.end();
}

function sendDownload(response, exported) {
  response.writeHead(200, {
    "content-type": exported.contentType,
    "content-disposition": `attachment; filename="${exported.filename.replaceAll('"', "")}"`,
    "cache-control": "no-store"
  });
  response.end(exported.body);
}

async function serveAsset(pathname, response) {
  const assetPath = join(rootDir, "public", pathname.replace("/assets/", ""));
  const contentType = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[extname(assetPath)] || "application/octet-stream";

  try {
    const file = await readFile(assetPath);
    response.writeHead(200, { "content-type": contentType });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

async function serveLocalFile(path, response) {
  try {
    const file = await readFile(path);
    response.writeHead(200, { "content-type": contentTypeForPath(path) });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

async function serveDownloadFile(path, filename, response) {
  try {
    const file = await readFile(path);
    response.writeHead(200, {
      "content-type": contentTypeForPath(path),
      "content-disposition": `attachment; filename="${filename.replaceAll('"', '')}"`,
      "cache-control": "no-store"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

function contentTypeForPath(path) {
  return {
    ".svg": "image/svg+xml; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

async function readForm(request) {
  const body = await readBody(request);
  return Object.fromEntries(new URLSearchParams(body.toString("utf8")));
}

async function readProjectCreate(request) {
  const contentType = request.headers["content-type"] || "";
  const body = await readBody(request);
  if (contentType.startsWith("multipart/form-data")) {
    return parseMultipartForm(body, contentType);
  }

  return {
    fields: Object.fromEntries(new URLSearchParams(body.toString("utf8"))),
    files: []
  };
}

async function readCommentSubmission(request) {
  const contentType = request.headers["content-type"] || "";
  const body = await readBody(request);
  if (contentType.startsWith("multipart/form-data")) {
    return parseMultipartForm(body, contentType);
  }

  return {
    fields: Object.fromEntries(new URLSearchParams(body.toString("utf8"))),
    files: []
  };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  const maxBytes = config.maxUploadBytes;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipartForm(body, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) return { fields: {}, files: [] };

  const fields = {};
  const files = [];
  const parts = body.toString("latin1").split(`--${boundary}`).slice(1, -1);

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const rawHeaders = part.slice(0, headerEnd);
    const rawContent = part.slice(headerEnd + 4);
    const disposition = rawHeaders.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    const contentTypeHeader = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    const contentBuffer = Buffer.from(rawContent, "latin1");

    if (!name) continue;
    if (filename !== undefined) {
      if (filename) {
        files.push({
          field: name,
          filename,
          contentType: contentTypeHeader,
          buffer: contentBuffer
        });
      }
    } else {
      fields[name] = contentBuffer.toString("utf8");
    }
  }

  return { fields, files };
}

async function saveMaterialDrop(database, projectId, userId, drop) {
  const summary = drop.fields.summary?.trim() || "";
  const kind = drop.fields.kind?.trim() || "material";
  const title = drop.fields.title?.trim() || "Material drop";

  if (summary) {
    const prefix = drop.files.length ? `${title}\n\n` : "";
    addNote(database, projectId, userId, `${prefix}${summary}`);
  }

  if (!drop.files.length && (title || summary)) {
    addArtifactSummary(database, projectId, {
      kind,
      title,
      summary: summary ? "Context saved as a project note." : ""
    });
    return;
  }

  const projectUploadDir = join(config.uploadDir, projectId);
  await mkdir(projectUploadDir, { recursive: true });

  for (const file of drop.files) {
    const safeName = sanitizeFilename(file.filename);
    const storedName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const storedPath = join(projectUploadDir, storedName);
    await writeFile(storedPath, file.buffer);

    addArtifactSummary(database, projectId, {
      kind,
      title: safeName,
      summary: summary
        ? `Part of context drop "${title}". ${file.contentType}, ${file.buffer.length} bytes.`
        : `${file.contentType}, ${file.buffer.length} bytes`,
      path: storedPath
    });
  }
}

async function saveCommentAttachment(artifact, file) {
  const safeName = sanitizeFilename(file.filename);
  const commentDir = join(config.uploadDir, artifact.project_id, "asset-comments", artifact.id);
  const storedName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const storedPath = join(commentDir, storedName);
  await mkdir(commentDir, { recursive: true });
  await writeFile(storedPath, file.buffer);

  return {
    title: safeName,
    path: storedPath,
    contentType: file.contentType
  };
}

async function saveGeneratedRefinementAsset(database, sourceArtifact, run) {
  const generatedAsset = safeGeneratedAsset(run.output.generatedAsset);
  if (!generatedAsset) return null;

  const generatedDir = join(config.uploadDir, sourceArtifact.project_id, "generated");
  await mkdir(generatedDir, { recursive: true });

  const filename = `${Date.now()}-${randomUUID()}-${generatedAsset.filename}`;
  const path = join(generatedDir, filename);
  await writeFile(path, generatedAsset.content, "utf8");

  const id = addArtifactSummary(database, sourceArtifact.project_id, {
    kind: generatedAsset.kind,
    title: generatedAsset.title,
    summary: `${generatedAsset.summary} Source asset: ${sourceArtifact.title}. Codex status: ${run.status}.`,
    path
  });

  return { id, path };
}

function safeGeneratedAsset(asset) {
  if (!asset?.content) return null;
  const content = sanitizeSvgContent(asset.content);
  if (!content) return null;

  return {
    title: String(asset.title || "Codex refinement").trim().slice(0, 120),
    kind: String(asset.kind || "glyph-svg").trim().slice(0, 40) || "glyph-svg",
    summary: String(asset.summary || "Generated by the Codex refinement pipeline.").trim().slice(0, 500),
    filename: ensureSvgFilename(sanitizeFilename(asset.filename || "codex-refinement.svg")),
    content
  };
}

function sanitizeSvgContent(value) {
  const content = String(value || "").trim();
  const start = content.indexOf("<svg");
  const end = content.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end <= start) return "";

  const svg = content.slice(start, end + 6);
  if (/<script\b/i.test(svg)) return "";
  if (/<foreignObject\b/i.test(svg)) return "";
  if (/\son[a-z]+\s*=/i.test(svg)) return "";
  if (/javascript:/i.test(svg)) return "";
  if (/\b(?:href|src)\s*=\s*["']https?:/i.test(svg)) return "";
  return svg;
}

function ensureSvgFilename(filename) {
  return filename.toLowerCase().endsWith(".svg") ? filename : `${filename}.svg`;
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "upload.bin";
}

function getCookie(request, name) {
  const cookie = request.headers.cookie || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") || "";
}

function setSessionCookie(response, token) {
  response.setHeader(
    "set-cookie",
    `${config.sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "set-cookie",
    `${config.sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  createApp().listen(config.port, () => {
    console.log(`${config.appName} running at http://localhost:${config.port}`);
    console.log(`Demo login: ${config.demoEmail} / ${config.demoPassword}`);
  });
}
