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
          <div class="button-row">
            <a class="button" href="/projects/new">Start project</a>
            <a class="button secondary" href="/showcase">View showcase</a>
          </div>
        </div>
        ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
        <div class="grid two">
          <div class="stack">
            <div class="rail-heading">
              <span class="item-kicker">Start</span>
              <h2>Start new work</h2>
              <p class="muted">Create a blank project when you are beginning a new idea.</p>
            </div>
            <div class="panel">
              <h2>Blank project</h2>
              <p class="muted">Start with a title, a rough intent, a context dump, and optional files. Studio will keep the raw context in one place before guidance runs.</p>
              <a class="button full" href="/projects/new">Start blank project</a>
            </div>
            <div class="rail-heading">
              <span class="item-kicker">Source sets</span>
              <h2>Load prepared material</h2>
              <p class="muted">Use these when you want to seed the studio from local source material instead of creating something empty.</p>
            </div>
            <form class="panel" method="post" action="/project-one/import">
              <h2>Project 1 source set</h2>
              <p class="muted">Creates or opens Project 1 from the local Project Zero source folder, focused on metallic depth, hinge joints, and constrained type construction.</p>
              <button class="button full" type="submit">Load Project 1 source set</button>
            </form>
            <form class="panel" method="post" action="/project-zero/import">
              <h2>Project Zero archive</h2>
              <p class="muted">Creates or opens the original raw import with the transcript, photos, and first object-type specimens.</p>
              <button class="button full" type="submit">Load Project Zero archive</button>
            </form>
          </div>
          <section class="project-list" aria-labelledby="existing-projects">
            <div class="section-title-row">
              <span class="item-kicker">Continue</span>
              <h2 id="existing-projects">Existing projects</h2>
            </div>
            ${projects.length ? projects.map(projectCard).join("") : `<div class="empty">No studio projects yet.</div>`}
          </section>
        </div>
      </section>
    `
  });
}

export function renderNewProject({ user, error }) {
  return layout({
    title: "Start project",
    user,
    body: `
      <section class="workspace narrow-workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">New project</p>
            <h1>Start with the context you already have.</h1>
            <p class="lede">Paste rough notes, dictation, constraints, or a loose asset brief. Add files if they help. The first guidance pass will turn the pile into a working direction.</p>
          </div>
        </div>
        ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
        <form class="panel project-form" method="post" action="/projects" enctype="multipart/form-data">
          <div class="grid two equal">
            <label>
              Title
              <input name="title" value="Project 1" required>
            </label>
            <label>
              Project type
              <input name="projectType" value="typeface">
            </label>
          </div>
          <label>
            Creative asset direction
            <textarea name="description" rows="4">Metallic object typeface with depth, hinge joints, constrained movement, and letterforms inferred from source photos rather than traced literally.</textarea>
          </label>
          <label>
            Initial context dump
            <textarea name="initialContext" rows="10" placeholder="Dump dictation, photo notes, constraints, letter ideas, material observations, unresolved questions, and anything the guidance pass should consider."></textarea>
          </label>
          <div class="grid two equal">
            <label>
              Drop title
              <input name="dropTitle" value="Initial source drop">
            </label>
            <label>
              Files
              <input name="files" type="file" multiple>
            </label>
          </div>
          <input type="hidden" name="kind" value="source">
          <div class="button-row">
            <button class="button" type="submit">Create and open project</button>
            <a class="button secondary" href="/studio">Back to studio</a>
          </div>
        </form>
      </section>
    `
  });
}

export function renderProject({ user, project, notes, artifacts, artifactComments = [], codexRuns, fontExportAvailable = false, notice }) {
  const latestRun = codexRuns[0] ? JSON.parse(codexRuns[0].output_json) : null;
  const glyphArtifacts = artifacts.filter((artifact) => artifact.kind === "glyph-svg");
  const materialArtifacts = artifacts.filter((artifact) => artifact.kind !== "glyph-svg");
  const commentsByArtifact = groupCommentsByArtifact(artifactComments);
  const isTypefaceProject = project.project_type.toLowerCase().includes("type");
  const canRefineProjectAssets = project.status !== "showcase";
  const refineLockedReason = canRefineProjectAssets ? "" : "Move this project back to studio before refining with Codex.";
  const noticeText = {
    note: "Note saved.",
    context: "Context saved.",
    comment: "Asset comment saved.",
    refinement: "Asset refinement saved.",
    guidance: "Guidance updated."
  }[notice];

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
          <div class="button-row">
            ${fontExportAvailable ? `<a class="button secondary" href="/projects/${project.id}/export/font">Download test font</a>` : ""}
            <form method="post" action="/projects/${project.id}/status">
              <input type="hidden" name="status" value="${project.status === "showcase" ? "studio" : "showcase"}">
              <button class="button secondary" type="submit">${project.status === "showcase" ? "Move to studio" : "Move to showcase"}</button>
            </form>
          </div>
        </div>
        ${noticeText ? `<p class="notice">${escapeHtml(noticeText)}</p>` : ""}

        <div class="panel specimen-panel">
          <div class="section-head">
            <div>
              <h2>Generated assets</h2>
              <p class="muted">Saved outputs for this project. Open an asset to review comments, references, and revisions.</p>
            </div>
            ${isTypefaceProject ? `<form method="post" action="/projects/${project.id}/specimens">
              <button class="button secondary" type="submit">Generate type specimens</button>
            </form>` : ""}
          </div>
          ${glyphArtifacts.length ? `<div class="specimen-grid">${glyphArtifacts.map((artifact) => glyphItem(artifact, commentsByArtifact.get(artifact.id) || [], user, { canRefine: canRefineProjectAssets, refineLockedReason })).join("")}</div>` : `<p class="muted">No generated assets yet.</p>`}
        </div>

        <div class="grid two bottom-grid">
          <section class="panel">
            <h2 id="notes">Project notes</h2>
            <div class="stack">
              ${notes.length ? notes.map(noteItem).join("") : `<p class="muted">No notes yet.</p>`}
            </div>
          </section>
          <section class="panel" id="guidance">
            <h2>Latest guidance</h2>
            ${latestRun ? guidanceView(latestRun, codexRuns[0], project) : `<p class="muted">Run guidance after adding the first note or material drop.</p>`}
          </section>
        </div>

        <section class="panel material-section">
          <h2>Source material</h2>
          <div class="material-grid">
            ${materialArtifacts.length ? materialArtifacts.map((artifact) => artifactItem(artifact, commentsByArtifact.get(artifact.id) || [], user, { canRefine: canRefineProjectAssets, refineLockedReason })).join("") : `<p class="muted">No material drops yet.</p>`}
          </div>
        </section>

        <section class="workbench-section">
          <div class="section-head">
            <div>
              <h2>Workbench</h2>
              <p class="muted">Add context and ask for guidance after reviewing what already exists.</p>
            </div>
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
              <h2>Context drop</h2>
              <label>
                Kind
                <select name="kind">
                  <option value="source">Source set</option>
                  <option value="photo">Photo</option>
                  <option value="dictation">Dictation</option>
                  <option value="sketch">Sketch</option>
                  <option value="material">Material</option>
                </select>
              </label>
              <label>
                Title
                <input name="title" placeholder="Reference material">
              </label>
              <label>
                Files
                <input name="files" type="file" multiple>
              </label>
              <label>
                Context
                <textarea name="summary" rows="5" placeholder="Dump the useful context once: what the files are, what you noticed, constraints, material feel, asset ideas, and what feels unresolved."></textarea>
              </label>
              <button class="button full" type="submit">Add to context</button>
            </form>

            <form class="panel action-panel" method="post" action="/projects/${project.id}/guide">
              <h2>Guide Project</h2>
              <p>Runs Codex against the saved project state and stores guidance in the project history.</p>
              <button class="button full" type="submit">Run guidance</button>
            </form>
          </div>
        </section>
      </section>
    `
  });
}

export function renderShowcase({ user, projects, notice }) {
  const noticeText = {
    comment: "Feedback saved."
  }[notice];

  return layout({
    title: "Showcase",
    user,
    body: `
      <section class="workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">Showcase</p>
            <h1>Reviewable previews</h1>
            <p class="lede">Visitors can leave feedback on individual showcase assets without signing in.</p>
          </div>
        </div>
        ${noticeText ? `<p class="notice">${escapeHtml(noticeText)}</p>` : ""}
        <section class="project-list showcase-list">
          ${projects.length ? projects.map((project) => showcaseProjectCard(project, user)).join("") : `<div class="empty">No previews have been moved to showcase.</div>`}
        </section>
      </section>
    `
  });
}

export function renderArtifactDetail({ user, project, artifact, comments, refinements, canRefine, refineLockedReason = "", fontExportAvailable = false, notice }) {
  const noticeText = {
    comment: "Feedback saved.",
    refinement: "Asset refinement saved.",
    "studio-required": "Move the project back to studio before refining with Codex."
  }[notice];
  const backHref = canRefine ? `/projects/${project.id}#asset-${artifact.id}` : "/showcase";

  return layout({
    title: artifact.title,
    user,
    body: `
      <section class="workspace">
        <div class="page-head">
          <div>
            <p class="eyebrow">${escapeHtml(artifact.kind)} / ${escapeHtml(project.title)}</p>
            <h1>${escapeHtml(artifact.title)}</h1>
            <p class="lede">${escapeHtml(artifact.summary || "No asset summary yet.")}</p>
          </div>
          <a class="button secondary" href="${backHref}">Back</a>
        </div>
        ${noticeText ? `<p class="notice">${escapeHtml(noticeText)}</p>` : ""}

        <div class="asset-detail-grid">
          <section class="panel asset-stage">
            ${artifact.path ? `<img src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">` : `<p class="muted">No preview file for this asset.</p>`}
          </section>
          <aside class="panel">
            <h2>Asset actions</h2>
            ${assetReviewControls(artifact, comments, {
              canRefine,
              returnTo: "asset",
              allowGuest: !user,
              user,
              refineLockedReason,
              showExport: true,
              fontDownloadHref: fontExportAvailable ? `/projects/${project.id}/export/font` : ""
            })}
          </aside>
        </div>

        <div class="grid two bottom-grid">
          <section class="panel" id="comments">
            <h2>Comments</h2>
            <div class="stack">
              ${comments.length ? comments.map(commentCard).join("") : `<p class="muted">No comments yet.</p>`}
            </div>
          </section>
          <section class="panel" id="timeline">
            <h2>Evolution</h2>
            <div class="timeline">
              ${baseAssetEvent(artifact)}
              ${refinements.length ? refinements.map((refinement, index) => refinementItem(refinement, refinements.length - index)).join("") : `<p class="muted">No Codex refinements yet.</p>`}
            </div>
          </section>
        </div>
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
      <span class="card-action">Open project</span>
    </a>
  `;
}

function showcaseProjectCard(project, user) {
  const commentsByArtifact = groupCommentsByArtifact(project.artifactComments || []);

  return `
    <article class="project-card showcase-card">
      <span class="status showcase">showcase</span>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.description || "No description provided.")}</p>
      ${project.fontExportAvailable ? `<a class="button secondary compact" href="/projects/${project.id}/export/font">Download test font</a>` : ""}
      ${project.previews?.length ? `<div class="showcase-preview-grid">${project.previews.map((artifact) => showcasePreview(artifact, commentsByArtifact.get(artifact.id) || [], user)).join("")}</div>` : ""}
    </article>
  `;
}

function showcasePreview(artifact, comments, user) {
  return `
    <article class="showcase-asset" id="asset-${artifact.id}">
      <a href="/artifacts/${artifact.id}">
        <img src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">
      </a>
      <a class="asset-title-link" href="/artifacts/${artifact.id}">${escapeHtml(artifact.title)}</a>
      ${assetReviewControls(artifact, comments, { canRefine: false, returnTo: "showcase", allowGuest: true, user })}
    </article>
  `;
}

function artifactItem(artifact, comments = [], user, options = {}) {
  return `
    <article class="item" id="asset-${artifact.id}">
      <span class="item-kicker">${escapeHtml(artifact.kind)}</span>
      <h3>${escapeHtml(artifact.title)}</h3>
      ${isImageArtifact(artifact) ? `<img class="material-preview" loading="lazy" src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">` : ""}
      <p>${escapeHtml(artifact.summary || "No summary.")}</p>
      ${artifact.path ? `<p class="muted">Stored in local material drop.</p>` : ""}
      <a class="asset-title-link" href="/artifacts/${artifact.id}">View history</a>
      ${assetReviewControls(artifact, comments, { user, ...options })}
    </article>
  `;
}

function glyphItem(artifact, comments = [], user, options = {}) {
  return `
    <article class="glyph-card" id="asset-${artifact.id}">
      <a href="/artifacts/${artifact.id}">
        <img src="/artifacts/${artifact.id}/file" alt="${escapeHtml(artifact.title)}">
      </a>
      <a class="asset-title-link" href="/artifacts/${artifact.id}">${escapeHtml(artifact.title)}</a>
      ${assetReviewControls(artifact, comments, { user, ...options })}
    </article>
  `;
}

function isImageArtifact(artifact) {
  if (!artifact?.path) return false;
  const path = String(artifact.path).toLowerCase();
  const summary = String(artifact.summary || "").toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp)$/.test(path) || summary.includes("image/");
}

function assetReviewControls(artifact, comments, options = {}) {
  const canRefine = options.canRefine !== false;
  const returnTo = options.returnTo || "project";
  const allowGuest = Boolean(options.allowGuest);
  const showGuestName = allowGuest && !options.user;
  const showExport = Boolean(options.showExport && artifact.kind === "glyph-svg" && artifact.path);

  return `
    <div class="asset-review">
      ${comments.length ? `<div class="comment-list">${comments.slice(0, 3).map(commentItem).join("")}</div>` : ""}
      <a class="asset-history-link" href="/artifacts/${artifact.id}">View asset history</a>
      ${showExport ? exportActions(artifact, options.fontDownloadHref) : ""}
      <form class="comment-form" method="post" action="/artifacts/${artifact.id}/comments" enctype="multipart/form-data">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
        ${showGuestName ? `<input name="name" placeholder="Name, optional">` : ""}
        <textarea name="body" rows="2" placeholder="Add asset comment or refinement note."></textarea>
        <input name="files" type="file" accept="image/*,.pdf,.txt,.md">
        <button class="button secondary compact" type="submit">Add comment</button>
      </form>
      ${canRefine ? `<form method="post" action="/artifacts/${artifact.id}/refine">
        <button class="button compact" type="submit">Refine with Codex</button>
      </form>` : ""}
      ${!canRefine && options.refineLockedReason ? `<p class="compact-note">${escapeHtml(options.refineLockedReason)}</p>` : ""}
    </div>
  `;
}

function exportActions(artifact, fontDownloadHref = "") {
  return `
    <div class="export-actions" aria-label="Export digital asset">
      <a class="button secondary compact" href="/artifacts/${artifact.id}/export/svg">Export SVG mark</a>
      <a class="button secondary compact" href="/artifacts/${artifact.id}/export/font-svg">Export N font proof</a>
      ${fontDownloadHref ? `<a class="button compact" href="${escapeHtml(fontDownloadHref)}">Download test font</a>` : ""}
    </div>
  `;
}

function commentItem(comment) {
  return `
    <div class="asset-comment">
      <strong>${escapeHtml(comment.author_name || "Visitor")}:</strong> ${escapeHtml(comment.body)}
      ${commentAttachment(comment)}
    </div>
  `;
}

function commentCard(comment) {
  return `
    <article class="timeline-item">
      <span class="item-kicker">${escapeHtml(comment.author_name || "Visitor")}</span>
      <p>${escapeHtml(comment.body)}</p>
      ${commentAttachment(comment)}
      <p class="muted">${escapeHtml(comment.created_at)}</p>
    </article>
  `;
}

function commentAttachment(comment) {
  if (!comment.attachment_path) return "";
  const title = escapeHtml(comment.attachment_title || "Attached reference");
  const isImage = String(comment.attachment_content_type || "").startsWith("image/");
  return `
    <a class="comment-attachment" href="/comments/${comment.id}/file">
      ${isImage ? `<img src="/comments/${comment.id}/file" alt="${title}">` : ""}
      <span>${title}</span>
    </a>
  `;
}

function baseAssetEvent(artifact) {
  return `
    <article class="timeline-item">
      <span class="item-kicker">Original</span>
      <h3>Initial asset</h3>
      <p>${escapeHtml(artifact.summary || "Asset created.")}</p>
      <p class="muted">${escapeHtml(artifact.created_at)}</p>
    </article>
  `;
}

function refinementItem(refinement, versionNumber) {
  const output = parseJson(refinement.output_json);
  return `
    <article class="timeline-item">
      <span class="item-kicker">Revision ${versionNumber} / ${escapeHtml(refinement.status)}</span>
      <h3>${escapeHtml(output.nextAction || refinement.summary || "Codex refinement")}</h3>
      <p>${escapeHtml(output.productDirection || output.understanding || "")}</p>
      ${listBlock("Changes", output.visualRules || [])}
      ${listBlock("Path", output.path || [])}
      ${refinement.generated_artifact_id && refinement.generated_artifact_path ? `<a href="/artifacts/${refinement.generated_artifact_id}"><img class="refinement-preview" src="/artifacts/${refinement.generated_artifact_id}/file" alt="${escapeHtml(refinement.generated_artifact_title || "Codex revision")}"></a>` : ""}
      ${refinement.generated_artifact_id ? `<a class="asset-history-link" href="/artifacts/${refinement.generated_artifact_id}">Open generated revision: ${escapeHtml(refinement.generated_artifact_title || "Codex revision")}</a>` : ""}
      <p class="muted">${escapeHtml(refinement.model)} / ${escapeHtml(refinement.created_at)}</p>
    </article>
  `;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function noteItem(note) {
  return `
    <article class="item note">
      <span class="item-kicker">note</span>
      <p>${escapeHtml(note.body)}</p>
    </article>
  `;
}

function guidanceView(output, run, project) {
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
      <form class="guidance-loop" method="post" action="/projects/${escapeHtml(project.id)}/guide">
        <h4>Continue Codex loop</h4>
        <label>
          Answer questions or steer the next pass
          <textarea name="guidanceReply" rows="5" placeholder="Example: choose path 2, answer the open questions, ask Codex to turn the path into the next concrete asset step."></textarea>
        </label>
        <button class="button full" type="submit">Continue with Codex</button>
      </form>
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

function groupCommentsByArtifact(comments) {
  const grouped = new Map();
  for (const comment of comments) {
    const existing = grouped.get(comment.artifact_id) || [];
    existing.push(comment);
    grouped.set(comment.artifact_id, existing);
  }
  return grouped;
}
