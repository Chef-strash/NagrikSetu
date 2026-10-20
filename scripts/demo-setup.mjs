#!/usr/bin/env node
// Writes the three native-run env files from a root .env.demo, then (optionally)
// sets up and verifies the database. Never prints secret values.
//   cp .env.demo.example .env.demo   # fill it in
//   npm run demo:setup

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseEnvFile } from "./demo-otp.mjs";

export const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SARVAM_API_KEY",
  "CLINE_API_KEY"
];

const toText = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";

/** Pure mapping from .env.demo values to the three env files. */
export function buildEnvFiles(input, generateToken = () => randomBytes(24).toString("hex")) {
  const missing = REQUIRED.filter((k) => !input[k]?.trim());
  if (missing.length > 0) return { missing, files: null, token: "" };
  const v = (k, d = "") => (input[k]?.trim() ? input[k].trim() : d);
  const token = v("AUDIT_SERVICE_TOKEN") || generateToken();
  const model = v("CLINE_MODEL_ID", "cline-pass/glm-5.3");
  const vision = v("CLINE_VISION_MODEL_ID", "cline-pass/qwen3.7-plus");
  const url = v("NEXT_PUBLIC_SUPABASE_URL");
  const anon = v("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = v("SUPABASE_SERVICE_ROLE_KEY");

  return {
    missing: [],
    token,
    files: {
      "packages/web/.env.local": toText({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
        SUPABASE_SERVICE_ROLE_KEY: service,
        NAGRIKSETU_API_URL: "http://localhost:8000",
        AUDIT_SERVICE_URL: "http://127.0.0.1:8787",
        AUDIT_SERVICE_TOKEN: token,
        SARVAM_API_KEY: v("SARVAM_API_KEY"),
        SARVAM_STT_MODEL: v("SARVAM_STT_MODEL") || "saaras:v4",
        SARVAM_TTS_MODEL: v("SARVAM_TTS_MODEL") || "bulbul:v3",
        SARVAM_TTS_SPEAKER: v("SARVAM_TTS_SPEAKER") || "shubh",
        REVIEWS_AUTO_PUBLISH: "true",
        DOCUMENT_STORAGE_ENABLED: "false",
        NEXT_PUBLIC_DEMO_AUTH: "false",
        NEXT_PUBLIC_DEMO_AUDIT: "false"
      }),
      "backend/.env": toText({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
        SUPABASE_SERVICE_ROLE_KEY: service,
        NAGRIKSETU_DISABLE_DB: "0",
        NAGRIKSETU_DISABLE_LLM: "0",
        PORT: "8000",
        LLM_PROVIDER: "cline",
        CLINE_PROVIDER_ID: "cline-pass",
        CLINE_MODEL_ID: model,
        CLINE_API_KEY: v("CLINE_API_KEY")
      }),
      "packages/audit/.env": toText({
        AUDIT_API_KEY: v("CLINE_API_KEY"),
        AUDIT_SERVICE_TOKEN: token,
        AUDIT_PROVIDER_ID: "cline-pass",
        AUDIT_MODEL_ID: model,
        AUDIT_VISION_MODEL_ID: vision,
        AUDIT_HOST: "127.0.0.1",
        AUDIT_PORT: "8787",
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: service
      })
    }
  };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const src = resolve(root, ".env.demo");
  if (!existsSync(src)) {
    console.error("Missing .env.demo. Run: cp .env.demo.example .env.demo  (then fill it in)");
    process.exit(1);
  }
  const input = parseEnvFile(readFileSync(src, "utf8"));
  const { missing, files, token } = buildEnvFiles(input);
  if (!files) {
    console.error(`Fill these keys in .env.demo first: ${missing.join(", ")}`);
    process.exit(1);
  }
  for (const [rel, text] of Object.entries(files)) {
    const dest = resolve(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text, { mode: 0o600 });
    console.log(`wrote ${rel}`);
  }
  if (!input.AUDIT_SERVICE_TOKEN?.trim()) {
    console.log("Generated AUDIT_SERVICE_TOKEN (stored in the three env files, not echoed).");
  }
  void token;

  // The two child scripts need different credentials:
  //   db-setup.mjs  - DATABASE_URL (raw Postgres, applies the SQL files)
  //   db-verify.mjs - the Supabase URL + keys, because it checks the database
  //                   through the REST API "as the app sees it"
  // All of them come from .env.demo, which is NOT part of process.env, so they
  // have to be forwarded explicitly. Forwarding only DATABASE_URL made
  // db-verify.mjs exit 1 with "Set NEXT_PUBLIC_SUPABASE_URL ..." on a database
  // that had just been created successfully.
  const dbEnv = {
    ...process.env,
    DATABASE_URL: input.DATABASE_URL?.trim() ?? "",
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: input.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
    SUPABASE_SERVICE_ROLE_KEY: input.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ""
  };
  if (dbEnv.DATABASE_URL) {
    for (const script of ["scripts/db-setup.mjs", "scripts/db-verify.mjs"]) {
      if (!existsSync(resolve(root, script))) {
        console.log(`skip ${script} (not present)`);
        continue;
      }
      console.log(`running node ${script} ...`);
      const r = spawnSync("node", [script], { cwd: root, env: dbEnv, stdio: "inherit" });
      if (r.status !== 0) {
        console.error(`${script} failed (exit ${r.status}). Fix the database, then re-run npm run demo:setup.`);
        process.exit(r.status ?? 1);
      }
    }
  } else {
    console.log("DATABASE_URL not set: skipped database setup. Apply docs/SUPABASE_SETUP.sql + docs/migrations yourself.");
  }

  console.log(`
Next:
  npm install
  npm run demo:start                       # audit :8787, backend :8000, web :3000
  npm run demo:otp -- you@example.com --profile   # prints the 6-digit sign-in code
Open http://localhost:3000/auth/signin`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
