# Improvements in this branch

Security-focused review pass. Verified with `node --test` (16/16, one new
regression test).

## 1. Stored XSS via uploaded SVG files (src/server.js — `serveLocalFile`)

**What:** Files served from `/artifacts/:id/file` and `/comments/:id/file`
now carry `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.

**Why it mattered:** Showcase visitors — no login required — can attach
arbitrary files to artifact comments, and material drops accept any upload.
Both are served back with their real content type, so an SVG containing
`<script>` executed in the app's origin when someone opened the attachment
link (comment attachments render as both `<img>` and `<a href>`). The
existing `sanitizeSvgContent` only covers Codex-generated assets, not
uploads. That's a stored XSS reachable by anonymous users.

**How it was fixed:** Response headers rather than content rewriting: the
`sandbox` CSP keeps a navigated SVG inert (no script execution), while
`<img>` embedding is unaffected because SVG-in-img never runs scripts.
`nosniff` prevents content-type games. A regression test uploads an SVG with
an embedded script and asserts both headers.

## 2. Stack traces leaked to clients (src/server.js — error handler)

**What:** The catch-all handler returned `error.stack` in the 500 response
body.

**Why it mattered:** Stack traces expose filesystem paths and internal
structure to any visitor who can trigger an error (e.g. an oversized upload).

**How it was fixed:** The error is logged server-side via `console.error`;
the client gets a generic message.

## 3. Minor cleanup

The multipart boundary regex was evaluated twice; it now matches once and
reads both capture groups.
