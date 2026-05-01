import { config } from "./config.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function layout({ title, user, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - ${escapeHtml(config.appName)}</title>
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="${user ? "/studio" : "/"}">
        <span class="brand-mark">C</span>
        <span>${escapeHtml(config.appName)}</span>
      </a>
      <nav class="nav">
        <a href="/showcase">Showcase</a>
        ${user ? `<a href="/studio">Studio</a><form method="post" action="/logout"><button class="link-button">Sign out</button></form>` : `<a href="/login">Sign in</a>`}
      </nav>
    </header>
    <main>${body}</main>
  </body>
</html>`;
}

export function renderLogin({ user, error }) {
  if (user) {
    return layout({
      title: "Signed in",
      user,
      body: `<section class="center-panel"><h1>You are signed in</h1><a class="button" href="/studio">Go to studio</a></section>`
    });
  }

  return layout({
    title: "Sign in",
    user,
    body: `
      <section class="auth-shell">
        <div class="auth-copy">
          <p class="eyebrow">Creative IP studio</p>
          <h1>Shape rough source material into a working product direction.</h1>
          <p>The first studio path is an object-inspired typeface. Keep raw material protected, save guidance, and move selected previews into the showcase.</p>
        </div>
        <form class="panel auth-form" method="post" action="/login">
          <h2>Sign in</h2>
          ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
          <label>
            Email
            <input name="email" type="email" autocomplete="email" value="${escapeHtml(config.demoEmail)}" required>
          </label>
          <label>
            Password
            <input name="password" type="password" autocomplete="current-password" value="${escapeHtml(config.demoPassword)}" required>
          </label>
          <button class="button full" type="submit">Enter studio</button>
        </form>
      </section>
    `
  });
}

export function renderLab({ user, projects, error }) {
  return layout({
    title: "Studio",
    user,
    body: `
      <section class="workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">Studio</p>
            <h1>Projects</h1>
          </div>
          <a class="button secondary" href="/showcase">View showcase</a>
        </div>
        ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
        <div class="grid two">
          <div class="stack">
            <form class="panel" method="post" action="/project-zero/import">
              <h2>Project Zero</h2>
              <p class="muted">Import the local material folder, attach the transcript and photos, and generate the first object-type specimens.</p>
              <button class="button full" type="submit">Import Project Zero</button>
            </form>
            <form class="panel" method="post" action="/projects">
              <h2>Create project</h2>
              <label>
                Title
                <input name="title" value="Project Zero" required>
              </label>
              <label>
                Project type
                <input name="projectType" value="typeface">
              </label>
              <label>
                Description
                <textarea name="description" rows="5">Typeface exploration from observations of an everyday object.</textarea>
              </label>
              <button class="button full" type="submit">Create project</button>
            </form>
          </div>
          <section class="project-list">
            ${projects.length ? projects.map(projectCard).join("") : `<div class="empty">No studio projects yet.</div>`}
          </section>
        </div>
      </section>
    `
  });
}

export function renderProject({ user, project, notes, artifacts, codexRuns }) {
  const latestRun = codexRuns[0] ? JSON.parse(codexRuns[0].output_json) : null;
  const glyphArtifacts = artifacts.filter((artifact) => artifact.kind === "glyph-svg");
  const materialArtifacts = artifacts.filter((artifact) => artifact.kind !== "glyph-svg");

  return layout({
    title: project.title,
    user,
    body: `
      <section class="workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">${escapeHtml(project.project_type)} / ${escapeHtml(project.status)}</p>
            <h1>${escapeHtml(project.title)}</h1>
            <p class="lede">${escapeHtml(project.description || "No description yet.")}</p>
          </div>
          <form method="post" action="/projects/${project.id}/status">
            <input type="hidden" name="status" value="${project.status === "showcase" ? "studio" : "showcase"}">
            <button class="button secondary" type="submit">${project.status === "showcase" ? "Move to studio" : "Move to showcase"}</button>
          </form>
        </div>

        <div class="grid three">
          <form class="panel" method="post" action="/projects/${project.id}/notes">
            <h2>Add note</h2>
            <label>
              Observation or dictation
              <textarea name="body" rows="8" placeholder="Describe what you see, what moves, what repeats, and where the idea feels unclear."></textarea>
            </label>
            <button class="button full" type="submit">Save note</button>
          </form>

          <form class="panel" method="post" action="/projects/${project.id}/artifacts" enctype="multipart/form-data">
            <h2>Material Drop</h2>
            <label>
              Kind
              <select name="kind">
                <option value="photo">Photo</option>
                <option value="dictation">Dictation</option>
                <option value="sketch">Sketch</option>
                <option value="material">Material</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" placeholder="Project Zero material">
            </label>
            <label>
              Files
              <input name="files" type="file" multiple>
            </label>
            <label>
              Context
              <textarea name="summary" rows="5" placeholder="Dump the useful context: what the files are, what you noticed, and what feels unresolved."></textarea>
            </label>
            <button class="button full" type="submit">Save material</button>
          </form>

          <form class="panel action-panel" method="post" action="/projects/${project.id}/guide">
            <h2>Guide Project</h2>
            <p>Runs the first Codex action against saved project state. If the live call is unavailable, the app saves a local fallback so the demo path still works.</p>
            <button class="button full" type="submit">Run guidance</button>
          </form>
        </div>

        <div class="panel specimen-panel">
          <div class="section-head">
            <div>
              <h2>Project Zero Specimens</h2>
              <p class="muted">Starting glyphs from the transcript: N, S, 5, 2, Z, i, W, a, Q.</p>
            </div>
            <form method="post" action="/projects/${project.id}/specimens">
              <button class="button secondary" type="submit">Generate specimens</button>
            </form>
          </div>
          ${glyphArtifacts.length ? `<div class="specimen-grid">${glyphArtifacts.map(glyphItem).join("")}</div>` : `<p class="muted">No glyph specimens yet.</p>`}
        </div>

        <div class="grid two bottom-grid">
          <section class="panel">
            <h2>Current material</h2>
            <div class="stack">
              ${materialArtifacts.length ? materialArtifacts.map(artifactItem).join("") : `<p class="muted">No material drops yet.</p>`}
              ${notes.length ? notes.map(noteItem).join("") : `<p class="muted">No notes yet.</p>`}
            </div>
          </section>
          <section class="panel">
            <h2>Latest guidance</h2>
            ${latestRun ? guidanceView(latestRun, codexRuns[0]) : `<p class="muted">Run guidance after adding the first note or material drop.</p>`}
          </section>
        </div>
      </section>
    `
  });
}

export function renderShowcase({ user, projects }) {
  return layout({
    title: "Showcase",
    user,
    body: `
      <section class="workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">Showcase</p>
            <h1>Reviewable previews</h1>
          </div>
        </div>
        <section class="project-list showcase-list">
          ${projects.length ? projects.map(showcaseProjectCard).join("") : `<div class="empty">No previews have been moved to showcase.</div>`}
        </section>
      </section>
    `
  });
}

export function renderNotFound({ user }) {
  return layout({
    title: "Not found",
    user,
    body: `<section class="center-panel"><h1>Not found</h1><a class="button" href="${user ? "/studio" : "/login"}">Go back</a></section>`
  });
}

function projectCard(project) {
  return `
    <a class="project-card" href="/projects/${project.id}">
      <span class="status ${project.status}">${escapeHtml(project.status)}</span>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.description || "No description yet.")}</p>
    </a>
  `;
}

function showcaseProjectCard(project) {
  return `
    <article class="project-card showcase-card">
      <span class="status showcase">showcase</span>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.description || "No description provided.")}</p>
      ${project.previews?.length ? `<div class="showcase-preview-grid">${project.previews.map(showcasePreview).join("")}</div>` : ""}
    </article>
  `;
}

function showcasePreview(artifact) {
  return `
    <img src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">
  `;
}

function artifactItem(artifact) {
  return `
    <article class="item">
      <span class="item-kicker">${escapeHtml(artifact.kind)}</span>
      <h3>${escapeHtml(artifact.title)}</h3>
      ${artifact.kind === "photo" && artifact.path ? `<img class="material-preview" src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">` : ""}
      <p>${escapeHtml(artifact.summary || "No summary.")}</p>
      ${artifact.path ? `<p class="muted">Stored in local material drop.</p>` : ""}
    </article>
  `;
}

function glyphItem(artifact) {
  return `
    <article class="glyph-card">
      <img src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">
      <span>${escapeHtml(artifact.title)}</span>
    </article>
  `;
}

function noteItem(note) {
  return `
    <article class="item note">
      <span class="item-kicker">note</span>
      <p>${escapeHtml(note.body)}</p>
    </article>
  `;
}

function guidanceView(output, run) {
  return `
    <div class="guidance">
      <span class="status ${run.status === "completed" ? "showcase" : "studio"}">${escapeHtml(run.status)}</span>
      <h3>${escapeHtml(output.understanding)}</h3>
      <p>${escapeHtml(output.productDirection)}</p>
      ${listBlock("Visual rules", output.visualRules)}
      ${listBlock("Questions", output.questions)}
      ${listBlock("Source material", output.sourceMaterial)}
      ${listBlock("Path", output.path)}
      <div class="next-action">${escapeHtml(output.nextAction)}</div>
    </div>
  `;
}

function listBlock(title, items = []) {
  return `
    <div class="list-block">
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}
