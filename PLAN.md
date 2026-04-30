# Creative IP Lab Plan

## Working Idea

Build a private product lab where users can take an early creative idea, add source material, and use Codex to help turn it into a structured product direction.

The first example project is a typeface. A user starts with a loose idea, photos of an object, and notes about what they see in it. The app helps them move from that raw material toward a type system, glyph plan, artifacts, previews, and eventually a font release.

See [Example Project: Object Typeface](docs/concept/object-typeface.md).

## Product Shape

The app has two surfaces:

1. Public lab surface
   - Shows published products, preview artifacts, and items ready for feedback.
   - Does not expose raw project material or private design work.

2. Private lab surface
   - Requires login.
   - Lets authorized users create and work on projects.
   - Stores project source material, notes, generated outputs, Codex runs, and review history.
   - Supports multiple users working on the same project.
   - Lets users shelve an idea, return to it later, or start a new experiment.

## Core Flow

1. User logs in.
2. User creates a project by answering: "What are we creating today?"
3. User describes the idea in plain language.
4. The app asks for useful source material based on the idea, such as photos, notes, audio, meeting records, or other artifacts.
5. User adds initial material.
6. Codex starts a first guidance pass from the project description and initial material.
7. Codex returns a high-level project plan, useful questions, and next useful actions.
8. The app saves the Codex response as part of the project history.
9. User reviews the guidance, clarifies the idea, and keeps adding material.
10. Codex continues to educate the user as the project develops.
11. The user can shelve the project at any point if the idea is not coming to life.
12. When the project reaches a useful review point, the app helps produce something an SME can try quickly.

## First Codex Use

The first programmatic Codex action should be broad enough to work for a typeface project, but not locked only to typefaces. It should run automatically after the user adds enough initial material for the app to form a useful first response.

Action name:

`Guide Project`

Input:

- Project title
- Project type, if known
- User's plain-language description
- Current notes
- Available artifact summaries

Output:

- A short understanding of the idea
- The likely product direction
- Useful questions to ask next
- Recommended source material to collect
- A high-level path from idea to working artifact
- A small next action that can be done now

For a typeface project, Codex may guide the user to collect object photos, identify repeated visual rules, define construction constraints, choose an initial glyph set, and create early specimen tests.

## Typeface Flow

The typeface example should start from observation rather than from font engineering.

1. User creates a typeface project.
2. User uploads or references photos of the source object.
3. User records notes about what they see in different positions and angles.
4. Codex helps infer the design rules:
   - object parts
   - movement limits
   - natural angles
   - possible letterforms
   - gaps where the object does not naturally map to a glyph
5. Codex proposes a first glyph plan.
6. The app stores generated glyph drafts and design notes.
7. The app should move quickly toward a usable test artifact, such as a web font preview or an installable font file.
8. Later iterations can add broader glyph coverage, specimen pages, variants, release packaging, and public feedback flows.

## Persistence

Use SQLite for the first version.

Initial data model:

- Users
- Projects
- Project collaborators
- Artifacts
- Notes
- Codex runs
- Product previews
- Published products

Artifacts can start as simple records with metadata and file paths. The implementation can later support photos, audio, transcripts, video, generated SVGs, font files, and specimen pages.

## Authorization

Authorization is part of the product concept.

The lab contains early creative IP:

- raw source material
- unfinished ideas
- design reasoning
- generated drafts
- private review history

Only authorized users can access private projects. Public users can only see items that the lab has chosen to publish, preview, or share for feedback.

## Experimentation and Feedback

The lab is an experimentation ground.

The app should not assume every idea will become a product. A user can explore an idea, learn from the material, shelve it, and start another project.

When an idea has enough shape, the app should help the user get it into reviewers' hands quickly. For the typeface example, this means a high-priority path to a usable font test, such as an installable font file, a web font, or a specimen page that can be shared for feedback.

Fast feedback matters because subject matter experts are most useful when the question is current. The app should reduce the time between a rough idea and something a reviewer can react to.

## Programmatic Codex Usage

Use the Codex SDK in the app service layer.

The app should call Codex from a controlled workflow:

1. Build a prompt from saved project state.
2. Call Codex through the SDK.
3. Require structured output.
4. Validate the output.
5. Save the run, input summary, and result.
6. Show the result to the user.

The app should not execute generated code directly as part of the user session. If Codex later generates code, SVG, font data, or build scripts, those outputs should be stored, validated, previewed, and approved through the app workflow.

## Tests

Meaningful first tests:

- Users cannot access private projects unless authorized.
- Project records persist in SQLite.
- Codex run records are saved with input and output.
- `Guide Project` returns and stores the required structured fields.
- Public product previews do not expose private artifacts.

Typeface-specific tests can come later:

- Required glyph records exist for a chosen glyph set.
- Generated SVGs parse successfully.
- Font build output is created.
- Specimen preview renders without missing core glyphs.

## Implementation Priorities

1. Create app skeleton.
2. Add SQLite persistence.
3. Add login and session handling.
4. Add project creation.
5. Add public and private lab surfaces.
6. Add artifact and note storage.
7. Add Codex SDK integration for `Guide Project`.
8. Add tests for auth, persistence, and Codex run storage.
9. Add first typeface project workflow.
10. Add fast review outputs for the typeface path.
11. Add preview and publishing states.

## Demo Goal

The demo should show a user moving from a raw idea to a structured product direction.

For the typeface example:

1. Log in to the private lab.
2. Create a typeface project.
3. Add notes and object references.
4. Let the app run the first Codex guidance pass.
5. Review the generated plan and next actions.
6. Show that the result is saved.
7. Show the public lab surface where only selected previews or published artifacts are visible.
