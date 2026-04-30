# Creative IP Lab

Creative IP Lab is a web app for working on early creative product ideas.

Users can create private projects, add notes and source material, and receive Codex guidance as the project develops. The app saves the project history so the idea can develop over time.

The first example project is a typeface. A user can start with photos, observations, and notes, then use Codex to help turn that material into a plan for a type system, glyph work, previews, and later font files.

The lab is an experimentation space. A user can continue an idea, shelve it, or start a new project.

The app has a public lab and a private lab.

The public lab shows products, previews, or artifacts that are ready to share.

The private lab requires login. It contains raw source material, unfinished ideas, private notes, generated drafts, and Codex run history.

## Main Features

- User login
- Private projects
- Project collaborators
- Saved notes and artifacts
- Public previews and published products
- Shelved projects
- Codex-guided project planning
- SQLite persistence
- Tests for authorization, persistence, and Codex run storage

## Codex Usage

The app calls Codex from the server.

The first Codex action is `Guide Project`. It runs after the user adds enough initial material for the app to form a useful first response. It reads the current project state and returns structured guidance:

- what the project appears to be
- useful questions to answer next
- source material to collect
- a high-level path toward a working artifact
- one small next action

The app saves each Codex run so users can review how the project developed.

## Ideas Being Explored

The app explores just-in-time learning during creative work.

A user can start with a loose idea and a small amount of source material. Codex responds with how it understands the project, what it thinks matters, what questions remain, and what the next useful action could be.

The user learns from that response. They can see where the idea was clear, where it was open to interpretation, and where more context is needed.

This is useful because creative and technical work often depends on translation. A person may understand a problem one way, while another person or system understands it differently. The saved Codex guidance gives the user something concrete to react to, correct, and build on.

The app should help the project improve while the user is working on it, not after a separate planning phase.

## First Demo Flow

1. Log in.
2. Create a project.
3. Describe what you want to create.
4. Add notes or source material.
5. Review the first Codex guidance pass.
6. Confirm that the guidance is saved in the project history.
7. Publish or preview selected material in the public lab.

## Development Status

This repository is being planned.
