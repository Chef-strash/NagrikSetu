# @nagriksetu/agents

The shared Cline-SDK agent platform. Provider auth, text-versus-vision
model choice, the session runner, tool helpers and `agent_runs` logging live
here, so the scheme harvester and the citizen document audit do not each carry
their own copy. There is no PDF or scheme code in this package.

```ts
import { createTool, emptyInputSchema, runAgentSession } from "@nagriksetu/agents";

const tools = [
  createTool({
    name: "submit_extraction",
    description: "Submit the extraction and end the run.",
    inputSchema: emptyInputSchema,
    lifecycle: { completesRun: true },
    async execute(input) {
      return { submitted: true };
    },
  }),
];

const { sessionId, submitted } = await runAgentSession({
  systemPrompt: "You read citizen documents. Official text only.",
  prompt: "Read the attached page.",
  userImages: ["data:image/png;base64,..."],
  tools,
  prefix: "AUDIT",
});
```

## Exports

| Module | What it gives you |
| :--- | :--- |
| `provider.ts` | `resolveProviderKey`, `readClineStoredToken`, `resolveClineDataDir` |
| `models.ts` | `DEFAULT_*` ids, `resolveModelConfig`, `chooseModelId`, `resolveModelChoice` |
| `session.ts` | `runAgentSession`, `createHarnessDataDir`, `redirectHarnessDataDir`, `purgeHarnessDataDir`, `AgentSessionError` |
| `tools.ts` | `createTool` (re-exported), `emptyInputSchema`, `findCompletionTool`, `isCompletionTool` |
| `runs.ts` | `createInMemoryRuns`, `createSupabaseRuns`, `statusFor`, `coverageDetails` |

## Provider auth

`resolveProviderKey(env, providerId, prefix)` — first hit wins:

1. `<PREFIX>_API_KEY` — `HARVESTER_API_KEY` for the harvester, `AUDIT_API_KEY`
   for the audit. `prefix` defaults to `HARVESTER`, which preserves the
   harvester's existing precedence for call sites that have not been updated.
2. For `cline*` providers: `CLINE_API_KEY`, then the Cline OAuth token in
   `<CLINE_DATA_DIR>/settings/providers.json` (`~/.cline/data` by default).
3. `ANTHROPIC_API_KEY` for `anthropic`.
4. `<PROVIDER>_API_KEY` (non-alphanumerics folded to `_`) for anything else.

ClinePass models need only a Cline token — no Anthropic key.

## Model choice

| Variable | Default | When used |
| :--- | :--- | :--- |
| `<PREFIX>_PROVIDER_ID` | `cline-pass` | always |
| `<PREFIX>_MODEL_ID` | `cline-pass/glm-5.3` | text-only runs |
| `<PREFIX>_VISION_MODEL_ID` | `cline-pass/qwen3.7-plus` | whenever `userImages` is non-empty |

`cline-pass/qwen3.7-plus` is the only vision-capable ClinePass model as of
2026-10-04. The switch is by input (`chooseModelId`), not a separate code path.

## `runAgentSession`

Wraps `ClineCore.create` -> `start` -> `subscribe` with `enableTools: false`,
`enableSpawnAgent: false`, `enableAgentTeams: false`, custom tools via
`extraTools`, and completion through the tool carrying
`lifecycle.completesRun`. The submission returned is that tool's input;
the tool is found structurally, so callers keep using `createTool`. A run that
settles without calling it throws `AgentSessionError` naming the tool.

`createCore` is an injectable seam (`(options) => Promise<ClineCoreLike>`) so
tests run without the real harness.

### The harness session store does not retain a request

**The problem.** `@cline/core`'s local backend persists every session to disk
inside the harness data dir:

```
<dataDir>/sessions/<sessionId>/<sessionId>.json            # manifest, holds the prompt
<dataDir>/sessions/<sessionId>/<sessionId>.messages.json   # full message list
<dataDir>/db/sessions.db (+ -wal, -shm)                    # session index + prompt column
<dataDir>/logs/hooks.jsonl
```

The manifest and `messages.json` hold the **full prompt** and every
`userImages` entry as base64. Reproduced on this machine before the fix: eight
artifacts under `~/.cline/data/sessions/` containing `data:image/png;base64`.
For the audit that is a citizen's Aadhaar or passbook photograph on disk.

**The mechanism used, and why.** `@cline/shared/storage` (0.0.90) resolves the
location at call time:

```js
resolveClineDataDir()   // process.env.CLINE_DATA_DIR?.trim() || join(clineDir(), "data")
resolveSessionDataDir() // process.env.CLINE_SESSION_DATA_DIR?.trim() || join(resolveClineDataDir(), "sessions")
resolveDbDataDir()      // process.env.CLINE_DB_DATA_DIR?.trim()      || join(resolveClineDataDir(), "db")
```

`ClineCore.create` reads them while building the local session backend
(`new SqliteSessionStore()` for `db`, `CoreSessionService`'s
`resolveSessionDataDir()` for `sessions/`), so a redirect applied before
`create` takes effect. There is no `ClineCoreOptions` field for the store
location — the env variables are the only control — and `CLINE_SESSION_DATA_DIR`
/ `CLINE_DB_DATA_DIR` beat `CLINE_DATA_DIR`, so **all three** are set:

```ts
const dir = await createHarnessDataDir();     // os.tmpdir()/nagriksetu-agent-run-XXXXXX
const restore = redirectHarnessDataDir(dir);  // sets all three, remembers the old values
try {
  /* ClineCore.create + start */
} finally {
  restore();
  purged = await purgeHarnessDataDir(dir);    // rm -rf, drain, re-check
}
```

Two details that matter:

- **The api key is resolved before the redirect**, because the Cline OAuth
  token lives in the *real* data dir, not the volatile one.
- **The delete is verified, not assumed.** The SDK persists messages
  fire-and-forget (`local-runtime-host.ts`: `void this.invoke(
  "persistSessionMessages", ...)`) and `SessionManifestStore
  .persistSessionMessages` runs `mkdirSync` before `writeFileSync`, so a write
  still in flight when the run settles would recreate the directory with the
  prompt and the images inside it. `purgeHarnessDataDir` deletes, lets the
  event loop drain, and re-checks (4 attempts, 100 ms apart); if the directory
  refuses to stay gone, `runAgentSession` throws instead of returning a result
  it cannot stand behind.

**What the test proves.** `src/session.test.ts` drives the **real** `@cline/sdk`
core, not a mock: it snapshots the volatile directory from inside `start`
(after waiting for the SDK's asynchronous message write to land), asserts the
prompt marker and the base64 image were in fact written there, then asserts the
directory is gone and that nothing matching the marker exists under
`os.tmpdir()` or under the real `~/.cline/data/sessions` and
`~/.cline/data/db/sessions.db`. That guarantee is enforced by a runtime assertion, not
by a comment.

**Honest limits.** The purge is delete-and-verify, not an SDK feature: a write
scheduled more than ~400 ms after the run settles could in principle recreate
the directory. Six stress runs and the suite show no recreation, and the
residue check turns that case into a loud failure rather than silent retention.
`ClineCoreOptions.sessionService` would allow a stronger fix (an in-memory
`SessionBackend`), but it means implementing the SDK's whole session-service
surface against a version-fragile interface.

## `runs.ts`

`createInMemoryRuns()` is the offline path; `createSupabaseRuns(client)` writes
`agent_runs` (status, `items_seen/new/changed/failed`, `summary`, `details`,
`finished_at`). The client arrives through the minimal `RunsTableClient`
interface, so this package does not depend on `@supabase/supabase-js`.

## Commands

```bash
npm run build      # tsc -p tsconfig.json
npm test           # vitest run
npx tsc --noEmit   # type check
```

Requires Node 22+ (`meetsNodeRequirement`).
