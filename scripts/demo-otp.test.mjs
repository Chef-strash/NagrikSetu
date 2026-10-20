import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseEnvFile, issueOtp } from "./demo-otp.mjs";

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["a@b.co", "--profile"]), { email: "a@b.co", profile: true, error: "" });
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(["nope"]).error);
  assert.ok(parseArgs(["a@b.co", "--x"]).error);
});

test("parseEnvFile ignores comments and strips quotes", () => {
  assert.deepEqual(parseEnvFile("# c\nA=1\nB=\"two\"\n"), { A: "1", B: "two" });
});

function fake({ createError = null } = {}) {
  const calls = { upserts: [] };
  return {
    calls,
    auth: { admin: {
      createUser: async () => ({ data: { user: { id: "u1" } }, error: createError }),
      generateLink: async () => ({ data: { user: { id: "u1" }, properties: { email_otp: "123456" } }, error: null })
    } },
    from: (t) => ({ upsert: async (row) => { calls.upserts.push([t, row]); return { error: null }; } })
  };
}

test("issueOtp returns the otp and optionally upserts the profile", async () => {
  const a = fake();
  assert.equal((await issueOtp(a, { email: "a@b.co", profile: false })).otp, "123456");
  assert.equal(a.calls.upserts.length, 0);
  const b = fake({ createError: { message: "User already registered" } });
  await issueOtp(b, { email: "a@b.co", profile: true });
  assert.equal(b.calls.upserts[0][0], "user_profiles");
  assert.equal(b.calls.upserts[0][1].user_id, "u1");
  await assert.rejects(issueOtp(fake({ createError: { message: "boom" } }), { email: "a@b.co" }));
});

import { buildEnvFiles } from "./demo-setup.mjs";

test("demo-setup maps keys, generates a token, flags missing", () => {
  assert.deepEqual(buildEnvFiles({}).missing.length, 5);
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "svc", SARVAM_API_KEY: "sv", CLINE_API_KEY: "ck"
  };
  const r = buildEnvFiles(base, () => "tok");
  assert.equal(r.token, "tok");
  assert.match(r.files["packages/web/.env.local"], /AUDIT_SERVICE_TOKEN=tok/);
  assert.match(r.files["backend/.env"], /LLM_PROVIDER=cline/);
  assert.match(r.files["backend/.env"], /CLINE_MODEL_ID=cline-pass\/glm-5\.3/);
  assert.match(r.files["packages/audit/.env"], /AUDIT_API_KEY=ck/);
  assert.match(r.files["packages/audit/.env"], /AUDIT_PORT=8787/);
});
