import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export const rootDir = process.cwd();

loadDotEnv(join(rootDir, ".env"));

export const config = {
  appName: "Creative IP Studio",
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DATABASE_PATH || join(rootDir, "data", "creative-ip-lab.sqlite"),
  uploadDir: process.env.UPLOAD_DIR || join(rootDir, "uploads"),
  exportDir: process.env.EXPORT_DIR || join(rootDir, "exports"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024),
  demoEmail: process.env.DEMO_EMAIL || "mandip@example.com",
  demoPassword: process.env.DEMO_PASSWORD || "creative-lab",
  sessionCookie: "creative_ip_lab_session",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  codexApiKey: process.env.CODEX_API_KEY || "",
  codexProvider: process.env.CODEX_PROVIDER || "auto",
  codexModel: process.env.CODEX_MODEL || "gpt-5.5",
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT || "xhigh",
  codexPath: process.env.CODEX_PATH || ""
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
