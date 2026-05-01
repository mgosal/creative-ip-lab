# ADR 0003: Codex MCP Refinement Workflow

## Status

Accepted

## Context

The assignment requires programmatic use of Codex inside the app or workflow. The app initially stored structured Codex guidance, but asset refinement needed to create a new artifact, not only a prose critique.

The local environment has the Codex CLI available. The CLI exposes `codex mcp-server`, which provides a `codex` MCP tool. This lets the app call Codex at runtime from the local server process.

## Decision

Use a server-side Codex provider chain:

1. Codex MCP by starting `codex mcp-server` and calling the `codex` tool.
2. Codex CLI non-interactive execution.
3. Codex SDK, if available.
4. OpenAI Responses API fallback.
5. Local mock fallback when no live path is available.

For `Refine Artifact`, require Codex to return structured output with a `generatedAsset` object containing SVG content. The app writes that SVG to local ignored storage only after validation, creates a new artifact row, and links it from the source asset refinement timeline.

## Rationale

MCP-first behavior matches the runtime integration being demonstrated. It also keeps the local Codex login path available without requiring an API key for every Codex call.

The provider chain keeps the app runnable in environments where the SDK package, CLI, MCP server, or API key may be unavailable.

Saving generated assets as separate artifacts preserves the original asset and creates a visible revision trail.

## Validation Boundary

The current SVG validator is intentionally narrow. It accepts standalone SVG markup and rejects:

- `script` elements
- `foreignObject`
- inline event handlers
- JavaScript URLs
- remote `href` or `src` references

This is sufficient for the prototype. A production version should use parser-based SVG validation and a stricter content security policy.

## Consequences

Refinement is slower than a normal form submit because the server waits for Codex to generate a structured response and SVG content.

Refinement is blocked while a project is in showcase. Showcase visitors can comment, but only authenticated studio users can move the project back to studio and run Codex refinement.

Generated SVG files, uploads, SQLite data, and private context remain ignored by Git.
