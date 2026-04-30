# ADR 0002: Documentation Matches Commit State

## Status

Accepted

## Context

The project is being developed through small commits. The README is the first file a reader sees when they open the repository at any commit.

Planning material, concept material, roadmap ideas, and raw working context have different levels of certainty.

## Decision

Keep the README accurate for the exact commit being viewed.

The README should describe what exists in the repository and what works at that commit. Planned features can be mentioned only when they are clearly labeled as planned.

Use separate artifacts for different types of information:

- `README.md` for current repo truth
- `PLAN.md` for the active implementation plan
- `docs/concept/` for stable product thinking
- `docs/roadmap/` for future work and planned capabilities
- `docs/adr/` for architectural decisions
- `context/` for raw local working context

`context/` is ignored by Git unless that decision is explicitly changed later.

## Rationale

The repo should be understandable at any commit without requiring private conversation context.

The README should not overstate what the project currently does. It should avoid optimistic language, implied working features, and claims that cannot be verified from the current repo state.

Planning and future ideas are still useful, but they should live in files that make their status clear.

## Consequences

Every meaningful commit should review whether the README needs an update.

New or changed architectural decisions should add or update ADRs.

Concept and roadmap files can change as the idea develops, but the README remains tied to the current commit state.

