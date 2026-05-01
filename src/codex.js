import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { rootDir, config } from "./config.js";

export function buildGuideProjectInput(context) {
  const commentsByArtifact = groupCommentsByArtifact(context.artifactComments || []);
  return {
    project: {
      title: context.project.title,
      type: context.project.project_type,
      description: context.project.description
    },
    followUp: context.followUp || "",
    notes: context.notes.map((note) => note.body),
    artifacts: context.artifacts.map((artifact) => ({
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      comments: commentsByArtifact.get(artifact.id) || []
    })),
    guidanceHistory: (context.codexRuns || [])
      .filter((run) => run.action === "Guide Project")
      .slice(0, 5)
      .map((run) => {
        const output = parseRunOutput(run.output_json);
        return {
          status: run.status,
          createdAt: run.created_at,
          understanding: output.understanding || "",
          questions: textList(output.questions),
          path: textList(output.path),
          nextAction: output.nextAction || ""
        };
      })
  };
}

export async function guideProject(context) {
  const input = buildGuideProjectInput(context);

  if (config.codexProvider === "mock") {
    return {
      action: "Guide Project",
      model: "mock-codex-sdk",
      inputSummary: summarizeInput(input),
      status: "mocked",
      output: mockGuidance(input)
    };
  }

  try {
    const response = await callCodex(input, buildGuideProjectPrompt);
    const output = normalizeGuideProjectOutput(parseCodexJsonResponse(response));

    return {
      action: "Guide Project",
      model: config.codexModel,
      inputSummary: summarizeInput(input),
      status: "completed",
      output
    };
  } catch (error) {
    const fallback = mockGuidance(input);
    return {
      action: "Guide Project",
      model: config.codexModel,
      inputSummary: summarizeInput(input),
      status: "fallback",
      output: {
        ...fallback,
        questions: [
          ...fallback.questions,
          "The live Codex call fell back locally. Check the API key, model access, network, or SDK install after the demo path is stable."
        ],
        nextAction: "Local fallback saved. Continue with the first specimen review, then retry the live Codex call after API access is confirmed."
      }
    };
  }
}

export async function refineArtifact(context, artifact, comments = []) {
  const input = buildRefineArtifactInput(context, artifact, comments);

  if (config.codexProvider === "mock") {
    return {
      action: "Refine Artifact",
      model: "mock-codex-sdk",
      inputSummary: summarizeRefinementInput(input),
      status: "mocked",
      output: mockRefinement(input)
    };
  }

  try {
    const response = await callCodex(input, buildRefineArtifactPrompt, refineArtifactSchema);
    const output = normalizeGuideProjectOutput(parseCodexJsonResponse(response));

    return {
      action: "Refine Artifact",
      model: config.codexModel,
      inputSummary: summarizeRefinementInput(input),
      status: "completed",
      output
    };
  } catch (error) {
    const { generatedAsset, ...fallback } = mockRefinement(input);
    return {
      action: "Refine Artifact",
      model: config.codexModel,
      inputSummary: summarizeRefinementInput(input),
      status: "fallback",
      output: {
        ...fallback,
        questions: [
          ...fallback.questions,
          "The live Codex refinement fell back locally. Check Codex MCP, model access, network, or SDK install after the asset review path is stable."
        ],
        nextAction: "Local refinement fallback saved. Apply the top comment manually, then retry the Codex refinement."
      }
    };
  }
}

function buildRefineArtifactInput(context, artifact, comments) {
  return {
    project: {
      title: context.project.title,
      type: context.project.project_type,
      description: context.project.description
    },
    asset: {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      path: artifact.path || "",
      content: readTextAsset(artifact.path)
    },
    comments: comments.map((comment) => ({
      body: comment.body,
      attachment: comment.attachment_title
        ? {
            title: comment.attachment_title,
            contentType: comment.attachment_content_type,
            available: Boolean(comment.attachment_path),
            path: comment.attachment_path || ""
          }
        : null
    })),
    projectNotes: context.notes.map((note) => note.body),
    siblingArtifacts: context.artifacts
      .filter((item) => item.id !== artifact.id)
      .slice(0, 12)
      .map((item) => ({
        kind: item.kind,
        title: item.title,
        summary: item.summary
      }))
  };
}

function readTextAsset(path) {
  if (!path || !existsSync(path)) return "";
  const textExtensions = new Set([".svg", ".txt", ".md", ".json"]);
  if (!textExtensions.has(extname(path).toLowerCase())) return "";

  const content = readFileSync(path, "utf8");
  return content.length > 120000 ? content.slice(0, 120000) : content;
}

async function callCodex(input, promptBuilder, schemaBuilder = guideProjectSchema) {
  if (["auto", "codex-mcp"].includes(config.codexProvider)) {
    try {
      return await callCodexMcp(input, promptBuilder);
    } catch (error) {
      if (config.codexProvider === "codex-mcp" || !isMissingCodexCli(error)) throw error;
    }
  }

  if (["auto", "codex-cli"].includes(config.codexProvider)) {
    try {
      return await callCodexCli(input, promptBuilder, schemaBuilder);
    } catch (error) {
      if (config.codexProvider === "codex-cli" || !isMissingCodexCli(error)) throw error;
    }
  }

  if (["auto", "codex-sdk"].includes(config.codexProvider)) {
    try {
      return await callCodexSdk(input, promptBuilder, schemaBuilder);
    } catch (error) {
      if (config.codexProvider === "codex-sdk" || !isMissingCodexSdk(error)) throw error;
    }
  }

  if (!config.openaiApiKey) {
    throw new Error("No OpenAI API key configured and Codex SDK is unavailable.");
  }

  try {
    const OpenAI = await import("openai");
    const client = new OpenAI.default({ apiKey: config.openaiApiKey });
    const response = await client.responses.create(responseRequest(input, promptBuilder, schemaBuilder));
    return response.output_text;
  } catch (error) {
    if (!isMissingSdk(error)) throw error;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${config.openaiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(responseRequest(input, promptBuilder, schemaBuilder))
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed with HTTP ${response.status}`);
    }

    return extractResponseText(payload);
  }
}

async function callCodexSdk(input, promptBuilder, schemaBuilder) {
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex({
    apiKey: config.codexApiKey || undefined,
    codexPathOverride: config.codexPath || undefined
  });
  const thread = codex.startThread({
    model: config.codexModel,
    modelReasoningEffort: sdkReasoningEffort(),
    workingDirectory: rootDir,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never"
  });
  const turn = await thread.run(promptBuilder(input), {
    outputSchema: schemaBuilder()
  });
  return turn.finalResponse;
}

async function callCodexMcp(input, promptBuilder) {
  const codexPath = config.codexPath || "codex";
  if (config.codexPath && !existsSync(config.codexPath)) {
    const error = new Error(`Configured Codex CLI path does not exist: ${config.codexPath}`);
    error.code = "ENOENT";
    throw error;
  }

  const client = startCodexMcpServer(codexPath);
  try {
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "creative-ip-studio",
        version: "0.1.0"
      }
    });
    client.notify("notifications/initialized", {});

    const result = await client.request("tools/call", {
      name: "codex",
      arguments: {
        prompt: promptBuilder(input),
        model: config.codexModel,
        cwd: rootDir,
        sandbox: "read-only",
        "approval-policy": "never",
        config: {
          model_reasoning_effort: sdkReasoningEffort()
        }
      }
    }, 300000);

    return extractCodexMcpContent(result);
  } finally {
    client.close();
  }
}

async function callCodexCli(input, promptBuilder, schemaBuilder) {
  const codexPath = config.codexPath || "codex";
  if (config.codexPath && !existsSync(config.codexPath)) {
    const error = new Error(`Configured Codex CLI path does not exist: ${config.codexPath}`);
    error.code = "ENOENT";
    throw error;
  }

  const schemaDir = mkdtempSync(join(tmpdir(), "creative-ip-codex-"));
  const schemaPath = join(schemaDir, "guide-project.schema.json");
  writeFileSync(schemaPath, JSON.stringify(schemaBuilder()));

  const args = [
    "exec",
    "--json",
    "--output-schema",
    schemaPath,
    "--model",
    config.codexModel,
    "--sandbox",
    "read-only",
    "--cd",
    rootDir,
    "--skip-git-repo-check",
    "--config",
    `model_reasoning_effort="${sdkReasoningEffort()}"`,
    "--config",
    `approval_policy="never"`,
    "-"
  ];

  try {
    return await runCodexProcess(codexPath, args, promptBuilder(input));
  } finally {
    rmSync(schemaDir, { recursive: true, force: true });
  }
}

function runCodexProcess(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (config.codexApiKey) env.CODEX_API_KEY = config.codexApiKey;

    const child = spawn(command, args, {
      env
    });
    const stdout = [];
    const stderr = [];

    child.on("error", reject);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("close", (code, signal) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (code !== 0 || signal) {
        reject(new Error(`Codex CLI exited with ${signal || code}: ${errorOutput}`));
        return;
      }

      try {
        resolve(extractCodexCliFinalResponse(output));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(stdin);
  });
}

function startCodexMcpServer(command) {
  const env = { ...process.env };
  if (config.codexApiKey) env.CODEX_API_KEY = config.codexApiKey;

  const child = spawn(command, ["mcp-server"], { env });
  let nextId = 1;
  let buffer = "";
  const pending = new Map();

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handleMcpMessage(line, pending);
      newline = buffer.indexOf("\n");
    }
  });

  child.stderr.on("data", () => {});
  child.on("error", (error) => rejectAllMcp(pending, error));
  child.on("close", (code, signal) => {
    if (pending.size) {
      rejectAllMcp(pending, new Error(`Codex MCP server exited with ${signal || code}`));
    }
  });

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  return {
    request(method, params = {}, timeoutMs = 30000) {
      const id = nextId++;
      send({ jsonrpc: "2.0", id, method, params });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Codex MCP request timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
    },
    notify(method, params = {}) {
      send({ jsonrpc: "2.0", method, params });
    },
    close() {
      child.kill();
    }
  };
}

function handleMcpMessage(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id);
  pending.delete(message.id);
  clearTimeout(item.timer);

  if (message.error) {
    item.reject(new Error(message.error.message || "Codex MCP request failed"));
  } else {
    item.resolve(message.result);
  }
}

function rejectAllMcp(pending, error) {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(error);
  }
  pending.clear();
}

function responseRequest(input, promptBuilder, schemaBuilder) {
  return {
    model: config.codexModel,
    reasoning: {
      effort: config.codexReasoningEffort
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You guide early creative product projects. Return concise structured JSON only."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: promptBuilder(input)
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "guide_project_response",
        schema: schemaBuilder(),
        strict: true
      }
    }
  };
}

function buildGuideProjectPrompt(input) {
  return JSON.stringify({
    role: "You guide early creative product projects. Return concise structured JSON only.",
    task: input.followUp ? "Continue Project Guidance" : "Guide Project",
    instructions: [
      "Describe what the project appears to be.",
      "Infer visual/product rules from the current material.",
      "Identify useful starting glyphs or artifact candidates.",
      "Ask useful next questions.",
      "Recommend source material to collect next.",
      "Suggest a high-level path toward a working artifact.",
      "If followUp is present, treat it as the creator's answer to the prior guidance and advance the plan instead of repeating the same questions.",
      "Use guidanceHistory to avoid looping on questions that were already asked.",
      "End with one small next action."
    ],
    input
  });
}

function buildRefineArtifactPrompt(input) {
  return JSON.stringify({
    role: "You guide early creative product projects and asset-level critiques. Return concise structured JSON only.",
    task: "Refine Artifact And Generate Revised Asset",
    requiredJsonShape: {
      understanding: "One sentence describing the selected asset and critique.",
      productDirection: "One sentence describing the refinement direction.",
      visualRules: ["Asset-level visual rule or change."],
      questions: ["Useful question to resolve before the next asset pass."],
      sourceMaterial: ["Source or comparison material to inspect."],
      path: ["One refinement step."],
      nextAction: "One concrete action for the selected asset.",
      generatedAsset: {
        title: "Short title for the revised asset.",
        kind: "glyph-svg",
        summary: "One sentence describing what changed.",
        filename: "safe-svg-filename.svg",
        contentType: "image/svg+xml",
        content: "Complete standalone SVG markup for the revised asset."
      }
    },
    instructions: [
      "Focus on the selected asset, not the whole project.",
      "Use comments as direct critique from the creator.",
      "Explain what should change in the asset.",
      "Preserve the useful parts of the current direction.",
      "Identify any source rule that should become softer, stricter, or optional.",
      "Generate one revised SVG asset in generatedAsset.content. The application will save that content to disk after this response.",
      "Use the current asset SVG content as the base when input.asset.content is present.",
      "Do not include scripts, event handlers, foreignObject, external image links, remote fonts, or javascript URLs in the SVG.",
      "Keep the SVG standalone, inspectable, and suitable for browser preview.",
      "Return exactly the required JSON shape. Do not introduce different top-level keys.",
      "End with one specific refinement action."
    ],
    input
  });
}

function isMissingSdk(error) {
  return ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(error?.code)
    || String(error?.message || "").includes("Cannot find package 'openai'");
}

function isMissingCodexSdk(error) {
  return ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(error?.code)
    || String(error?.message || "").includes("Cannot find package '@openai/codex-sdk'");
}

function isMissingCodexCli(error) {
  return error?.code === "ENOENT" || String(error?.message || "").includes("No such file or directory");
}

function sdkReasoningEffort() {
  const supported = new Set(["minimal", "low", "medium", "high", "xhigh"]);
  return supported.has(config.codexReasoningEffort) ? config.codexReasoningEffort : "xhigh";
}

function extractCodexCliFinalResponse(output) {
  let finalResponse = "";
  let failure = "";
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text;
    } else if (event.type === "turn.failed") {
      failure = event.error?.message || "Codex CLI turn failed";
    }
  }

  if (failure) throw new Error(failure);
  if (!finalResponse) throw new Error("Codex CLI did not return a final response");
  return finalResponse;
}

function extractCodexMcpContent(result) {
  if (typeof result?.structuredContent?.content === "string") {
    return result.structuredContent.content;
  }

  for (const item of result?.content || []) {
    if (typeof item.text !== "string") continue;
    try {
      const parsed = JSON.parse(item.text);
      if (typeof parsed.content === "string") return parsed.content;
    } catch {
      return item.text;
    }
  }

  throw new Error("Codex MCP response did not include content");
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text");
}

function guideProjectSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "understanding",
      "productDirection",
      "visualRules",
      "questions",
      "sourceMaterial",
      "path",
      "nextAction"
    ],
    properties: {
      understanding: { type: "string" },
      productDirection: { type: "string" },
      visualRules: { type: "array", items: { type: "string" } },
      questions: { type: "array", items: { type: "string" } },
      sourceMaterial: { type: "array", items: { type: "string" } },
      path: { type: "array", items: { type: "string" } },
      nextAction: { type: "string" }
    }
  };
}

function refineArtifactSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "understanding",
      "productDirection",
      "visualRules",
      "questions",
      "sourceMaterial",
      "path",
      "nextAction",
      "generatedAsset"
    ],
    properties: {
      understanding: { type: "string" },
      productDirection: { type: "string" },
      visualRules: { type: "array", items: { type: "string" } },
      questions: { type: "array", items: { type: "string" } },
      sourceMaterial: { type: "array", items: { type: "string" } },
      path: { type: "array", items: { type: "string" } },
      nextAction: { type: "string" },
      generatedAsset: {
        type: "object",
        additionalProperties: false,
        required: ["title", "kind", "summary", "filename", "contentType", "content"],
        properties: {
          title: { type: "string" },
          kind: { type: "string" },
          summary: { type: "string" },
          filename: { type: "string" },
          contentType: { type: "string" },
          content: { type: "string" }
        }
      }
    }
  };
}

function normalizeGuideProjectOutput(output) {
  output = output || {};

  if (typeof output?.content === "string") {
    try {
      return normalizeGuideProjectOutput(JSON.parse(output.content));
    } catch {
      return mockGuidanceFromText(output.content);
    }
  }

  const normalized = {
    understanding: stringValue(output.understanding || output.project_appears_to_be),
    productDirection: stringValue(output.productDirection || output.product_direction || output.productDirectionSummary || output.refinement_direction || output.recommended_direction)
      || productDirectionFromCandidates(output),
    visualRules: textList(output.visualRules || output.visual_rules || output.inferred_rules || output.recommended_changes || output.changes),
    questions: textList(output.questions || output.next_questions || output.open_questions),
    sourceMaterial: textList(output.sourceMaterial || output.source_material || output.source_material_to_collect_next || output.reference_material),
    path: textList(output.path || output.high_level_path || output.refinement_path || output.steps),
    nextAction: stringValue(output.nextAction || output.next_action || output.small_next_action || output.specific_refinement_action || output.next_step),
    generatedAsset: normalizeGeneratedAsset(output.generatedAsset || output.generated_asset || output.asset || output.artifact)
  };

  if (!normalized.generatedAsset) delete normalized.generatedAsset;

  if (!normalized.understanding && !normalized.visualRules.length && !normalized.path.length && !normalized.nextAction) {
    return guidanceFromUnknownObject(output);
  }

  return normalized;
}

function normalizeGeneratedAsset(asset) {
  if (!asset) return null;
  const content = stringValue(asset.content || asset.svg || asset.svgContent || asset.fileContent);
  if (!content) return null;

  return {
    title: stringValue(asset.title || asset.name) || "Codex refinement",
    kind: stringValue(asset.kind || asset.type) || "glyph-svg",
    summary: stringValue(asset.summary || asset.description) || "Generated by the Codex refinement pipeline.",
    filename: stringValue(asset.filename || asset.fileName || asset.name) || "codex-refinement.svg",
    contentType: stringValue(asset.contentType || asset.content_type || asset.mimeType) || "image/svg+xml",
    content: stripCodeFence(content)
  };
}

function mockGuidanceFromText(text) {
  return {
    understanding: text.slice(0, 260),
    productDirection: "Codex returned unstructured guidance. Treat the saved text as a source read and run guidance again after narrowing the brief.",
    visualRules: [],
    questions: [],
    sourceMaterial: [],
    path: [],
    nextAction: "Convert the unstructured guidance into one sentence of project direction."
  };
}

function productDirectionFromCandidates(output) {
  const glyphs = textList(output.useful_starting_glyphs);
  const artifacts = textList(output.artifact_candidates);
  const pieces = [...glyphs.slice(0, 2), ...artifacts.slice(0, 2)];
  return pieces.length
    ? `Focus the next pass on ${pieces.join("; ")}.`
    : "Use the source material to refine a coherent creative asset direction.";
}

function guidanceFromUnknownObject(output) {
  const items = Object.entries(output || {})
    .map(([key, value]) => `${key}: ${stringValue(value)}`)
    .filter((item) => item.length > 2);

  return {
    understanding: (items[0] || "Codex returned a refinement response.").slice(0, 280),
    productDirection: "Codex returned a non-standard JSON shape, so the app preserved the content as refinement notes.",
    visualRules: items.slice(0, 6),
    questions: [],
    sourceMaterial: [],
    path: ["Review the preserved refinement notes and rerun after tightening the comment if needed."],
    nextAction: "Apply the most concrete preserved refinement note to the selected asset."
  };
}

function textList(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(stringValue).filter(Boolean);
}

function stringValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${stringValue(item)}`)
      .filter((item) => !item.endsWith(": "))
      .join(" - ");
  }
  return "";
}

function parseCodexJsonResponse(response) {
  const text = stripCodeFence(String(response || ""));
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Codex response did not contain JSON");
  }
}

function stripCodeFence(value) {
  const text = String(value || "").trim();
  const fenced = text.match(/^```(?:json|svg|xml)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function parseRunOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function summarizeInput(input) {
  return [
    `Project: ${input.project.title}`,
    `Type: ${input.project.type}`,
    `Notes: ${input.notes.length}`,
    `Artifacts: ${input.artifacts.length}`,
    `Guidance runs: ${input.guidanceHistory.length}`,
    `Follow-up: ${input.followUp ? "yes" : "no"}`
  ].join(" | ");
}

function summarizeRefinementInput(input) {
  return [
    `Project: ${input.project.title}`,
    `Asset: ${input.asset.title}`,
    `Kind: ${input.asset.kind}`,
    `Comments: ${input.comments.length}`
  ].join(" | ");
}

function groupCommentsByArtifact(comments) {
  const grouped = new Map();
  for (const comment of comments) {
    const existing = grouped.get(comment.artifact_id) || [];
    existing.push(comment.body);
    grouped.set(comment.artifact_id, existing);
  }
  return grouped;
}

function mockGuidance(input) {
  const hasArtifacts = input.artifacts.length > 0;
  const hasNotes = input.notes.length > 0;

  return {
    understanding: `${input.project.title} is an early ${input.project.type || "creative"} project moving from observation into a testable product direction.`,
    productDirection: "Start with a private project record, collect source observations, then produce a small review artifact before expanding scope.",
    visualRules: hasArtifacts
      ? [
          "Use the stand's rings as counters, dots, bowls, and terminals.",
          "Use the hinge bars as axes, stems, diagonals, and weight-bearing joins.",
          "Separate literal source references from interpreted design rules."
        ]
      : ["No source artifacts have been summarized yet, so the visual system is still open."],
    questions: [
      "Which parts of the object feel structural rather than decorative?",
      "Which letters or symbols appear naturally without forcing the form?",
      "What would make a reviewer say the system is coherent?"
    ],
    sourceMaterial: hasNotes
      ? ["Add close-up object references from multiple angles.", "Record movement limits, repeated angles, and places where the object fails to map cleanly."]
      : ["Add the first observation note or dictation transcript before asking for deeper guidance."],
    path: [
      "Capture the observation and source material.",
      "Extract visual rules and a first glyph plan around N, S, 5, 2, Z, i, W, a, and Q.",
      "Create thin, regular, and bold SVG specimens that someone can react to."
    ],
    nextAction: hasArtifacts || hasNotes
      ? "Choose three candidate glyphs and write one sentence about why each belongs in the system."
      : "Add the first source note for Project Zero."
  };
}

function mockRefinement(input) {
  const topComment = input.comments[0] ? stringValue(input.comments[0]) : "No specific creator comment has been added yet.";
  const glyph = escapeSvgText(input.asset.title.split("/")[0].trim().slice(0, 4) || "A");
  const summary = escapeSvgText(topComment.slice(0, 120));
  return {
    understanding: `${input.asset.title} is being reviewed as a ${input.asset.kind} inside ${input.project.title}.`,
    productDirection: "Treat comments as asset-level constraints and update the specimen without overfitting the whole system.",
    visualRules: [
      `Creator comment: ${topComment}`,
      "Only repeat circular forms where they support the letter, counter, or mechanical construction.",
      "Keep metallic depth and hinge logic visible without making every glyph literal."
    ],
    questions: [
      "Which part of this asset should remain unchanged?",
      "Should this critique apply only here or become a wider typeface rule?"
    ],
    sourceMaterial: ["Compare this asset against the closest source photo and the latest project notes."],
    path: [
      "Keep the useful silhouette.",
      "Apply the creator comment to the visible construction.",
      "Regenerate or redraw one specimen before changing the whole set."
    ],
    nextAction: `Revise ${input.asset.title} using the latest asset comment, then compare it beside the current version.`,
    generatedAsset: {
      title: `${input.asset.title} / Codex revision`,
      kind: input.asset.kind || "glyph-svg",
      summary: `Local mock revision from latest comment: ${topComment}`,
      filename: `${input.asset.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "codex-revision"}.svg`,
      contentType: "image/svg+xml",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 760" role="img" aria-label="Codex refined asset"><defs><linearGradient id="metal" x1="0" x2="1"><stop offset="0" stop-color="#f8f6ed"/><stop offset="0.35" stop-color="#9ea4a0"/><stop offset="0.68" stop-color="#fdfcf7"/><stop offset="1" stop-color="#4b5457"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#262a2b" flood-opacity="0.28"/></filter></defs><rect width="640" height="760" fill="#f7f4eb"/><g filter="url(#shadow)"><text x="320" y="430" text-anchor="middle" font-family="Georgia, serif" font-size="340" font-weight="700" fill="url(#metal)" stroke="#2e383b" stroke-width="8">${glyph}</text><path d="M188 500 C265 548 381 548 455 500" fill="none" stroke="#8d3f34" stroke-width="10" stroke-linecap="round" opacity="0.85"/></g><text x="320" y="650" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#245f73">${summary}</text></svg>`
    }
  };
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
