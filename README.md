# Creative IP Studio

Creative IP Studio is a small web app for working on early creative product ideas.

This repository currently contains a runnable local app skeleton plus planning and design artifacts.

The app lets a demo user sign in, create studio projects, add notes and material drops, import Project Zero source material, run a first `Guide Project` action, generate object-type specimens, and move selected previews into a showcase surface. The first example project is a typeface created from observations of an everyday object.

## Repository Contents

- [PLAN.md](PLAN.md): active implementation plan
- [docs/adr](docs/adr): architectural decisions
- [docs/concept](docs/concept): stable product and concept material
- [docs/roadmap](docs/roadmap): future work and planned capabilities
- `context/`: local working context, ignored by Git
- `src/`: local app server, persistence, auth, and Codex guidance boundary
- `test/`: smoke tests for persistence, authorization, guidance storage, and HTTP login

## Current State

At this commit, the repo includes:

- a runnable local web app skeleton
- SQLite persistence using Node's built-in SQLite module
- a seeded demo login
- project creation and project-level authorization
- protected notes and material drops
- saved `Guide Project` runs with a mock fallback
- a Project Zero import path for local photos and transcript material
- generated SVG specimens for the first identified glyphs
- a showcase surface that only shows explicitly selected previews
- focused smoke tests
- project planning and architecture decision records
- an object typeface concept brief
- a Git ignore rule for local context files

## Run Locally

This app currently avoids framework dependencies so it can run in the local Codex desktop environment without `npm`.

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

Put those values in `.env` or export them in the shell before starting the app. `.env` is ignored by Git. `OPENAI_API_KEY` is used by the Responses API fallback. The Codex SDK and Codex CLI paths can use the local Codex login; only set `CODEX_API_KEY` if you explicitly want Codex to use API-key auth.

Run tests:

```sh
node --test
```

## Codex Usage

The app is structured to call Codex from the server.

The first Codex action is `Guide Project`. It reads the current project state and returns structured guidance:

- what the project appears to be
- useful questions to answer next
- source material to collect
- a high-level path toward a working artifact
- one small next action

The app saves each Codex run so users can review how the project developed.

`Guide Project` tries the Codex SDK first when `CODEX_PROVIDER=auto` or `CODEX_PROVIDER=codex-sdk`. If the SDK package is unavailable, `auto` falls back to the local Codex CLI bridge, which mirrors the SDK's underlying execution path. If that is unavailable, it falls back to the OpenAI Responses API with the configured model and reasoning effort. If no live path is available, it uses a local mock response and still saves the run. This keeps the demo path usable while making the intended SDK boundary explicit.

## Ideas Being Explored

The project explores just-in-time learning during creative work.

A user can start with a loose idea and a small amount of source material. Codex responds with how it understands the project, what it thinks matters, what questions remain, and what the next useful action could be.

The user learns from that response. They can see where the idea was clear, where it was open to interpretation, and where more context is needed.

This is useful because creative and technical work often depends on translation. A person may understand a problem one way, while another person or system understands it differently. The saved Codex guidance gives the user something concrete to react to, correct, and build on.

The planned app should help the project improve while the user is working on it, not after a separate planning phase.

## Planned Demo Flow

1. Log in.
2. Create a project.
3. Describe what you want to create.
4. Add notes or source material.
5. Import Project Zero material or drop files directly into the project.
6. Review the first Codex guidance pass.
7. Confirm that guidance and SVG specimens are saved in the project history.
8. Move selected material into the showcase.

## Development Status

This repository has a local runnable skeleton. It is not production-ready.
