# Creative IP Studio Plan

## Working Idea

Build a creative product studio where users can take an early creative idea, drop in source material, and use Codex to help turn it into a structured product direction.

The first example project is a typeface. A user starts with a loose idea, photos of an object, and notes about what they see in it. The app helps them move from that raw material toward a type system, glyph plan, artifacts, previews, and eventually a font release.

See [Example Project: Object Typeface](docs/concept/object-typeface.md).

## Product Shape

The app has two surfaces:

1. Showcase surface
   - Shows selected previews, reviewable artifacts, and items ready for feedback.
   - Allows unauthenticated visitors to comment on showcase assets.
   - Does not expose raw project material or studio work.
   - Does not allow Codex refinement while the project is in showcase.

2. Studio surface
   - Requires login.
   - Lets authorized users create and work on projects.
   - Stores project source material, notes, generated outputs, Codex runs, comments, and review history.
   - Lets the owner move a project between studio and showcase states.
   - Allows Codex refinement only while the project is in studio.

## Implemented Flow

1. User logs in with the seeded demo account.
2. User creates a blank project or imports Project Zero / Project 1 source material.
3. User adds notes, context drops, files, or source summaries.
4. User runs `Guide Project`.
5. Codex returns a high-level project plan, useful questions, source material suggestions, a path, and one next action.
6. The app saves the Codex response as part of the project history.
7. User can answer the guidance questions through the continuation form and run another guidance pass.
8. User generates metallic SVG type specimens for the current typeface path.
9. User adds comments to individual assets, including optional reference attachments.
10. User runs `Refine Artifact` on a studio asset.
11. Codex returns structured critique plus a generated SVG asset.
12. The app validates and stores the SVG revision as a new artifact and links it from the source asset timeline.
13. User can download an OpenType test font from studio or from a showcased project.
14. User can move the project to showcase for feedback. Showcase comments and font downloads remain available, but Codex refinement is locked until the project returns to studio.

## Codex Actions

### Guide Project

Input:

- Project title
- Project type
- User's plain-language description
- Current notes
- Available artifact summaries
- Asset comments
- Recent guidance history
- Optional follow-up response from the user

Output:

- A short understanding of the idea
- The likely product direction
- Visual or product rules
- Useful questions to ask next
- Recommended source material to collect
- A high-level path from idea to working artifact
- A small next action that can be done now

### Refine Artifact

Input:

- Project summary
- Selected asset metadata
- Selected asset SVG content when available
- Asset comments
- Comment attachment metadata and local paths
- Current project notes
- Sibling artifact summaries

Output:

- Asset-level understanding
- Product direction
- Visual rules or changes
- Questions
- Source material suggestions
- Path
- Next action
- `generatedAsset` containing SVG content

The server validates generated SVG before writing it to disk. It rejects scripts, event handlers, `foreignObject`, JavaScript URLs, and remote image/font references.

## Current Persistence

SQLite stores:

- Users
- Sessions
- Projects
- Project collaborators
- Artifacts
- Notes
- Asset comments
- Asset refinements
- Codex runs

Generated font files are written to `exports/`, which is ignored by Git.

Local source material, generated SVG files, uploaded files, SQLite data, and private context live outside Git through ignore rules.

## Authorization

Authorization is part of the product concept.

The studio contains early creative IP:

- raw source material
- unfinished ideas
- design reasoning
- generated drafts
- protected review history

Only authorized users can access studio projects. Showcase viewers can only see items that the studio has chosen to preview, review, or release.

Unauthenticated visitors can comment on showcase assets. They cannot access protected source material or run Codex refinement.

## Tests

Current tests cover:

- Demo user seeding and project creation
- Session lookup
- Studio/showcase separation
- Structured Codex guide input
- Guidance history and follow-up input
- Project Zero specimen generation
- Login route
- Guidance continuation route
- Codex refinement creating a generated artifact
- Blocking Codex refinement while an owned asset is in showcase
- Public showcase and authenticated owner font downloads

## Completed MVP Cut

1. Runnable local app.
2. SQLite persistence.
3. Login and session handling.
4. Project creation.
5. Studio and showcase surfaces.
6. Material drop and note storage.
7. Project Zero and Project 1 import paths for local source material.
8. Generated SVG specimens for the first identified glyphs: N, S, 5, 2, Z, i, W, a, and Q.
9. `Guide Project` action with structured output, continuation, live Codex path, and local fallback.
10. `Refine Artifact` action with Codex-generated SVG revision storage.
11. Asset comments and optional reference attachments.
12. OpenType test-font export through FontForge-generated files in `exports/`.
13. Tests for the main persistence, auth, guidance, refinement, showcase rules, and font download routes.

## Next Implementation Steps

1. Tighten the outbound data policy before sending raw source material to Codex.
2. Add clearer consent and redaction controls around source material and attachment paths.
3. Add richer file inspection and summarization for photos, transcripts, and references.
4. Add stronger SVG validation using a parser rather than string checks.
5. Add explicit version grouping for generated asset revisions.
6. Add a richer typeface workflow for glyph review, iteration, and approvals.
7. Add web font preview pages and richer specimen sheets around the exported font files.
8. Add preview and release states beyond the current studio/showcase toggle.

## Demo Goal

The demo should show a user moving from a raw idea to a structured product direction.

For the typeface example:

1. Log in to the studio.
2. Open or create a typeface project.
3. Add notes and object references.
4. Run a Codex guidance pass.
5. Review the generated plan and next actions.
6. Generate SVG specimens.
7. Add asset comments.
8. Run Codex refinement and show the generated SVG revision.
9. Download the generated test font from the project or showcase.
9. Move the project to showcase and show the comment-only feedback surface.
