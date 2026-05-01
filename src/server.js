import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, rootDir } from "./config.js";
import {
  addArtifactSummary,
  addNote,
  createProject,
  createSession,
  destroySession,
  findUserByEmail,
  findUserBySessionToken,
  getShowcaseArtifact,
  getArtifactForUser,
  listArtifactsForProject,
  getProjectContext,
  getProjectForUser,
  listProjectsForUser,
  listShowcaseProjects,
  openDatabase,
  updateProjectStatus,
  verifyPassword,
  saveCodexRun
} from "./db.js";
import { guideProject } from "./codex.js";
import { importProjectZero } from "./project-zero.js";
import { generateProjectZeroSpecimens } from "./typeface.js";
import { renderLab, renderLogin, renderProject, renderShowcase, renderNotFound } from "./views.js";

export function createApp(database = openDatabase()) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const user = findUserBySessionToken(database, getCookie(request, config.sessionCookie));

      if (url.pathname.startsWith("/assets/")) {
        return serveAsset(url.pathname, response);
      }

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
          previews: listArtifactsForProject(database, project.id)
            .filter((artifact) => artifact.kind === "glyph-svg")
            .slice(0, 9)
        }));
        return sendHtml(response, renderShowcase({ user, projects }));
      }

      const artifactFileMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/file$/);
      if (request.method === "GET" && artifactFileMatch) {
        const artifact = user
          ? getArtifactForUser(database, artifactFileMatch[1], user.id) || getShowcaseArtifact(database, artifactFileMatch[1])
          : getShowcaseArtifact(database, artifactFileMatch[1]);
        if (!artifact || !artifact.path) return sendHtml(response, renderNotFound({ user }), 404);
        return serveLocalFile(artifact.path, response);
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

      if (request.method === "POST" && url.pathname === "/projects") {
        const body = await readForm(request);
        if (!body.title?.trim()) {
          return redirect(response, "/studio?error=Project%20title%20is%20required");
        }

        const projectId = createProject(database, user.id, {
          title: body.title,
          projectType: body.projectType || "typeface",
          description: body.description || ""
        });

        return redirect(response, `/projects/${projectId}`);
      }

      const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
      if (request.method === "GET" && projectMatch) {
        const project = getProjectForUser(database, projectMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        return sendHtml(response, renderProject({ user, ...getProjectContext(database, project.id) }));
      }

      const noteMatch = url.pathname.match(/^\/projects\/([^/]+)\/notes$/);
      if (request.method === "POST" && noteMatch) {
        const project = getProjectForUser(database, noteMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readForm(request);
        if (body.body?.trim()) addNote(database, project.id, user.id, body.body);
        return redirect(response, `/projects/${project.id}`);
      }

      const artifactMatch = url.pathname.match(/^\/projects\/([^/]+)\/artifacts$/);
      if (request.method === "POST" && artifactMatch) {
        const project = getProjectForUser(database, artifactMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const body = await readBody(request);
        const contentType = request.headers["content-type"] || "";

        if (contentType.startsWith("multipart/form-data")) {
          const drop = parseMultipartForm(body, contentType);
          await saveMaterialDrop(database, project.id, drop);
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
        return redirect(response, `/projects/${project.id}`);
      }

      const guideMatch = url.pathname.match(/^\/projects\/([^/]+)\/guide$/);
      if (request.method === "POST" && guideMatch) {
        const project = getProjectForUser(database, guideMatch[1], user.id);
        if (!project) return sendHtml(response, renderNotFound({ user }), 404);
        const run = await guideProject(getProjectContext(database, project.id));
        saveCodexRun(database, project.id, run);
        return redirect(response, `/projects/${project.id}`);
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
  const contentType = {
    ".svg": "image/svg+xml; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8"
  }[extname(path).toLowerCase()] || "application/octet-stream";

  try {
    const file = await readFile(path);
    response.writeHead(200, { "content-type": contentType });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

async function readForm(request) {
  const body = await readBody(request);
  return Object.fromEntries(new URLSearchParams(body.toString("utf8")));
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

async function saveMaterialDrop(database, projectId, drop) {
  const summary = drop.fields.summary?.trim() || "";
  const kind = drop.fields.kind?.trim() || "material";
  const title = drop.fields.title?.trim() || "Material drop";

  if (!drop.files.length && (title || summary)) {
    addArtifactSummary(database, projectId, {
      kind,
      title,
      summary
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
      summary: summary || `${file.contentType}, ${file.buffer.length} bytes`,
      path: storedPath
    });
  }
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
