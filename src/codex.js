import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootDir, config } from "./config.js";

export function buildGuideProjectInput(context) {
  return {
    project: {
      title: context.project.title,
      type: context.project.project_type,
      description: context.project.description
    },
    notes: context.notes.map((note) => note.body),
    artifacts: context.artifacts.map((artifact) => ({
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary
    }))
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
    const response = await callCodex(input);

    return {
      action: "Guide Project",
      model: config.codexModel,
      inputSummary: summarizeInput(input),
      status: "completed",
      output: JSON.parse(response)
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

async function callCodex(input) {
  if (["auto", "codex-sdk"].includes(config.codexProvider)) {
    try {
      return await callCodexSdk(input);
    } catch (error) {
      if (config.codexProvider === "codex-sdk" || !isMissingCodexSdk(error)) throw error;
    }
  }

  if (["auto", "codex-cli"].includes(config.codexProvider)) {
    try {
      return await callCodexCli(input);
    } catch (error) {
      if (config.codexProvider === "codex-cli" || !isMissingCodexCli(error)) throw error;
    }
  }

  if (!config.openaiApiKey) {
    throw new Error("No OpenAI API key configured and Codex SDK is unavailable.");
  }

  try {
    const OpenAI = await import("openai");
    const client = new OpenAI.default({ apiKey: config.openaiApiKey });
    const response = await client.responses.create(responseRequest(input));
    return response.output_text;
  } catch (error) {
    if (!isMissingSdk(error)) throw error;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${config.openaiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(responseRequest(input))
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed with HTTP ${response.status}`);
    }

    return extractResponseText(payload);
  }
}

async function callCodexSdk(input) {
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
  const turn = await thread.run(buildGuideProjectPrompt(input), {
    outputSchema: guideProjectSchema()
  });
  return turn.finalResponse;
}

async function callCodexCli(input) {
  const codexPath = config.codexPath || "codex";
  if (config.codexPath && !existsSync(config.codexPath)) {
    const error = new Error(`Configured Codex CLI path does not exist: ${config.codexPath}`);
    error.code = "ENOENT";
    throw error;
  }

  const schemaDir = mkdtempSync(join(tmpdir(), "creative-ip-codex-"));
  const schemaPath = join(schemaDir, "guide-project.schema.json");
  writeFileSync(schemaPath, JSON.stringify(guideProjectSchema()));

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
    return await runCodexProcess(codexPath, args, buildGuideProjectPrompt(input));
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

function responseRequest(input) {
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
            text: JSON.stringify({
              task: "Guide Project",
              instructions: [
                "Describe what the project appears to be.",
                "Infer visual/product rules from the current material.",
                "Identify useful starting glyphs or artifact candidates.",
                "Ask useful next questions.",
                "Recommend source material to collect next.",
                "Suggest a high-level path toward a working artifact.",
                "End with one small next action."
              ],
              input
            })
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "guide_project_response",
        schema: guideProjectSchema(),
        strict: true
      }
    }
  };
}

function buildGuideProjectPrompt(input) {
  return JSON.stringify({
    role: "You guide early creative product projects. Return concise structured JSON only.",
    task: "Guide Project",
    instructions: [
      "Describe what the project appears to be.",
      "Infer visual/product rules from the current material.",
      "Identify useful starting glyphs or artifact candidates.",
      "Ask useful next questions.",
      "Recommend source material to collect next.",
      "Suggest a high-level path toward a working artifact.",
      "End with one small next action."
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

function summarizeInput(input) {
  return [
    `Project: ${input.project.title}`,
    `Type: ${input.project.type}`,
    `Notes: ${input.notes.length}`,
    `Artifacts: ${input.artifacts.length}`
  ].join(" | ");
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
