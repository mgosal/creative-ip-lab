# Creative IP Lab

Creative IP Lab is a planned web app for working on early creative product ideas.

This repository currently contains planning and design artifacts. It does not contain a runnable application yet.

The planned app will let users create private projects, add notes and source material, and receive Codex guidance as the project develops. The first example project is a typeface created from observations of an everyday object.

## Repository Contents

- [PLAN.md](PLAN.md): active implementation plan
- [docs/adr](docs/adr): architectural decisions
- [docs/concept](docs/concept): stable product and concept material
- [docs/roadmap](docs/roadmap): future work and planned capabilities
- `context/`: local working context, ignored by Git

## Current State

At this commit, the repo includes:

- a project plan
- an architecture decision record
- an object typeface concept brief
- a README describing the current repo state
- a Git ignore rule for local context files

## Codex Usage

The planned app will call Codex from the server.

The first Codex action is `Guide Project`. It runs after the user adds enough initial material for the app to form a useful first response. It reads the current project state and returns structured guidance:

- what the project appears to be
- useful questions to answer next
- source material to collect
- a high-level path toward a working artifact
- one small next action

The planned app will save each Codex run so users can review how the project developed.

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
5. Review the first Codex guidance pass.
6. Confirm that the guidance is saved in the project history.
7. Publish or preview selected material in the public lab.

## Development Status

This repository is in planning.
