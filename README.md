# Creative IP Studio

Creative IP Studio is a small local web app for working on early creative product ideas.

This repository contains a runnable Node app plus planning and design artifacts.

The app lets a demo user sign in, create studio projects, add notes and context drops, import Project Zero or Project 1 source material, run project guidance through Codex, generate object-type SVG specimens, collect asset-level comments, run Codex refinement to create a new SVG revision, and export a test OpenType font for review. The first example project is a typeface created from observations of an everyday object.

## Repository Contents

- [PLAN.md](PLAN.md): current implementation state and next work
- [docs/adr](docs/adr): architectural decisions
- [docs/concept](docs/concept): product and concept material
- [docs/roadmap](docs/roadmap): future work and planned capabilities
- `context/`: local working context, ignored by Git
- `data/`: local SQLite data and source material, ignored by Git
- `uploads/`: local generated and uploaded files, ignored by Git
- `exports/`: local generated font files, ignored by Git
- `src/`: local app server, persistence, auth, Codex MCP/CLI bridge, and SVG generation workflow
- `test/`: tests for persistence, authorization, Codex guidance, refinement output, showcase rules, and HTTP routes

## Current State

At this commit, the repo includes:

- a runnable local web app
- SQLite persistence using Node's built-in SQLite module
- a seeded demo login
- project creation and project-level authorization
- protected notes and material drops
- saved `Guide Project` runs with a continuation form and mock fallback
- Project Zero and Project 1 import paths for local photos and transcript material
- generated metallic SVG specimens for the first identified glyphs
- asset-level comments with optional reference attachments
- Codex refinement that saves a generated SVG revision as a new artifact
- SVG mark, SVG font proof, and OpenType test-font downloads for generated glyph assets
- a showcase surface that accepts comments and font downloads but blocks Codex refinement until the owner moves the project back to studio
- focused tests
- project planning and architecture decision records
- an object typeface concept brief
- Git ignore rules for local context, data, uploads, and secrets

## Run Locally

This app avoids framework dependencies so it can run in the local Codex desktop environment without `npm install`.

```sh
node src/server.js
```

Then open:

```text
http://localhost:3000
```

Demo login:

```text
mandip@example.com / creative-lab
```

Optional local API configuration:

```text
OPENAI_API_KEY=your_api_key_here
CODEX_PROVIDER=auto
CODEX_MODEL=gpt-5.5
CODEX_REASONING_EFFORT=xhigh
CODEX_PATH=/Applications/Codex.app/Contents/Resources/codex
```

Put those values in `.env` or export them in the shell before starting the app. `.env` is ignored by Git. `OPENAI_API_KEY` is used by the Responses API fallback. The Codex MCP, CLI, and SDK paths can use the local Codex login. Only set `CODEX_API_KEY` if you explicitly want Codex to use API-key auth.

Run tests:

```sh
node --test
```

Generate a local OpenType test font from a specimen folder after installing FontForge:

```sh
brew install fontforge
fontforge -script scripts/import_svgs_to_fontforge.py \
  uploads/PROJECT_ID/specimens \
  exports/PROJECT_ID/object-type-demo-thin.otf \
  --family "Object Type Demo" \
  --style Thin \
  --variant thin
```

The app serves `exports/PROJECT_ID/object-type-demo-thin.otf` from `/projects/PROJECT_ID/export/font` when the current user owns the project or when the project is in showcase.

## Codex Usage

The app calls Codex from the server.

The project-level Codex action is `Guide Project`. It reads the current project state and returns structured guidance:

- what the project appears to be
- useful questions to answer next
- source material to collect
- a high-level path toward a working artifact
- one small next action

The asset-level Codex action is `Refine Artifact`. It reads one asset, project notes, sibling artifact summaries, and asset comments. It asks Codex to return structured critique plus a `generatedAsset` payload containing SVG content. The server validates the SVG, writes it to the ignored `uploads/` directory, creates a new artifact record, and links the generated revision from the source asset timeline.

When `CODEX_PROVIDER=auto`, the app tries Codex MCP first by starting `codex mcp-server` and calling its `codex` tool. If that is unavailable, it falls back to the local Codex CLI bridge, then the Codex SDK, then the OpenAI Responses API. If no live path is available, it uses a local mock response and still saves the run.

The app saves each Codex run so users can review how the project developed.

## Ideas Being Explored

The project explores just-in-time learning during creative work.

A user can start with a loose idea and a small amount of source material. Codex responds with how it understands the project, what it thinks matters, what questions remain, and what the next useful action could be.

The user learns from that response. They can see where the idea was clear, where it was open to interpretation, and where more context is needed.

This is useful because creative and technical work often depends on translation. A person may understand a problem one way, while another person or system understands it differently. The saved Codex guidance gives the user something concrete to react to, correct, and build on.

The app should help the project improve while the user is working on it, not after a separate planning phase.

## Demo Flow

1. Log in.
2. Create a project.
3. Describe what you want to create, or paste a large initial context dump.
4. Add notes, context drops, or source material.
5. Import Project Zero or Project 1 material, or drop files directly into the project.
6. Review the first Codex guidance pass.
7. Confirm that guidance and SVG specimens are saved in the project history.
8. Add comments to generated assets.
9. Run Codex refinement on a studio asset and review the generated SVG revision.
10. Download a test font from a studio project or showcased project.
11. Move selected material into the showcase for feedback.

## Development Status

This repository has a local runnable prototype. It is not production-ready.
