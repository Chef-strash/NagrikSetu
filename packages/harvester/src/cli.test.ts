import { describe, expect, it } from "vitest";
import {
  createInMemorySourceDocWriter,
  escapeRawControlCharsInStrings,
  fetchListing,
  isCandidateCircular,
  normaliseUrl,
  parseArgs,
  runHarvest,
} from "./cli.js";
import { createInMemoryDb } from "./apply/apply.js";
import { createInMemoryRuns } from "./report/runs.js";
import { createInMemoryWardWriter } from "./reference/wards.js";
import { createInMemoryHospitalWriter } from "./reference/hospitals.js";
import type { SupabaseClient } from "./supabase/client.js";

/** A "live" client that fails loudly if a write unexpectedly reaches it. */
function fakeLiveClient(): SupabaseClient {
  return {
    from: () => {
      throw new Error("fake live client must not be written to in unit tests");
    },
  } as unknown as SupabaseClient;
}

const SAVITRIBAI = [{ slug: "pmc-savitribai-girls", urls: [] }];

describe("cli parseArgs", () => {
  it("parses stage/scheme/offline/demo/dry-run/allow-fixture-writes", () => {
    expect(parseArgs(["harvest", "--stage", "profile"]).stage).toBe("profile");
    expect(parseArgs(["harvest", "--scheme", "savitribai"]).scheme).toBe("savitribai");
    expect(parseArgs(["harvest", "--demo"])).toMatchObject({ demo: true, offline: true });
    expect(parseArgs(["harvest", "--offline", "--dry-run"])).toMatchObject({ offline: true, dryRun: true });
    expect(parseArgs(["harvest", "--allow-fixture-writes"]).allowFixtureWrites).toBe(true);
    expect(() => parseArgs(["harvest", "--stage", "nope"])).toThrow();
  });

  it("detects English + Marathi candidate circulars", () => {
    expect(isCandidateCircular({ title: "Scholarship for girl students", department: "Education" })).toBe(true);
    expect(isCandidateCircular({ title: "शिष्यवृत्ती योजना", department: "समाज विकास" })).toBe(true);
    expect(isCandidateCircular({ title: "Regarding road repair works", department: "Roads" })).toBe(false);
  });
});

describe("cli database banner", () => {
  it("prints in-memory when no keys are present", async () => {
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "reference", offline: true, demo: false, dryRun: true, allowFixtureWrites: false },
      { db: createInMemoryDb(), runs: createInMemoryRuns(), client: null, log: (m) => logs.push(m) },
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/database: in-memory \(no keys\)/);
  });

  it("prints live supabase <host> when a client exists", async () => {
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "reference", offline: true, demo: false, dryRun: true, allowFixtureWrites: true },
      {
        db: createInMemoryDb(),
        runs: createInMemoryRuns(),
        client: fakeLiveClient(),
        supabaseHost: "test.supabase.co",
        log: (m) => logs.push(m),
      },
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/database: live supabase test\.supabase\.co/);
  });
});

describe("cli safety guards", () => {
  it("refuses an offline run against a live database", async () => {
    const db = createInMemoryDb();
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "reference", offline: true, demo: false, dryRun: false, allowFixtureWrites: false },
      { db, runs: createInMemoryRuns(), client: fakeLiveClient(), supabaseHost: "live.example", log: (m) => logs.push(m) },
    );
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/refused: fixture\/demo run/);
    expect(db.schemes.size).toBe(0);
  });

  it("--allow-fixture-writes overrides the refusal (writes to the injected writers)", async () => {
    const wardWriter = createInMemoryWardWriter();
    const hospitalWriter = createInMemoryHospitalWriter();
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "reference", offline: true, demo: false, dryRun: false, allowFixtureWrites: true },
      {
        db: createInMemoryDb(), runs: createInMemoryRuns(), client: fakeLiveClient(), supabaseHost: "live.example",
        wardWriter, hospitalWriter, log: (m) => logs.push(m),
      },
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/reference: wards=15 hospitals=74 \(upserted\)/);
    expect(wardWriter.rows.size).toBe(15);
    expect(hospitalWriter.rows.size).toBe(74);
  });

  it("never writes a synthetic demo event to a live database", async () => {
    const db = createInMemoryDb();
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "profile", offline: true, demo: true, dryRun: false, allowFixtureWrites: true },
      { db, runs: createInMemoryRuns(), client: fakeLiveClient(), supabaseHost: "live.example", watchlist: SAVITRIBAI, log: (m) => logs.push(m) },
    );
    expect(code).toBe(0);
    expect(db.events.filter((e) => e.event.synthetic === true)).toHaveLength(0);
    expect(logs.join("\n")).toMatch(/synthetic change event skipped/);
  });
});

describe("cli offline stages (fixtures, in-memory)", () => {
  it("reference reads the fixtures and reports real counts", async () => {
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "reference", offline: true, demo: false, dryRun: false, allowFixtureWrites: false },
      { db: createInMemoryDb(), runs: createInMemoryRuns(), client: null, log: (m) => logs.push(m) },
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/reference: wards=15 hospitals=74/);
  });

  it("discover reads the fixture and finds the candidate circular", async () => {
    const logs: string[] = [];
    const code = await runHarvest(
      { stage: "discover", offline: true, demo: false, dryRun: false, allowFixtureWrites: false },
      { db: createInMemoryDb(), runs: createInMemoryRuns(), client: null, log: (m) => logs.push(m) },
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/discover: fetched=\d+ candidates=[1-9]\d*/);
    expect(logs.join("\n")).toMatch(/candidate:/);
  });

  it("offline profile applies the recorded fixture with the watchlist slug", async () => {
    const db = createInMemoryDb();
    const runs = createInMemoryRuns();
    const code = await runHarvest(
      { stage: "profile", offline: true, demo: false, dryRun: false, allowFixtureWrites: false },
      { db, runs, client: null, watchlist: SAVITRIBAI, log: () => {} },
    );
    expect(code).toBe(0);
    expect(db.schemes.size).toBe(1);
    expect(db.schemes.has("pmc-savitribai-girls")).toBe(true);
    expect(runs.list()[0]?.totals.isNew).toBe(1);
  });

  it("unknown --scheme exits non-zero", async () => {
    const code = await runHarvest(
      { stage: "profile", scheme: "no-such-scheme", offline: true, demo: false, dryRun: false, allowFixtureWrites: false },
      { db: createInMemoryDb(), runs: createInMemoryRuns(), client: null, watchlist: SAVITRIBAI, log: () => {} },
    );
    expect(code).toBe(1);
  });
});

describe("cli live profile path (network + agent injected)", () => {
  it("reads the PDF, runs the agent, validates against the text, and applies", async () => {
    const db = createInMemoryDb();
    const logs: string[] = [];
    const profile = {
      name: "Test Scheme",
      vernacular_name: "चाचणी योजना",
      department: "Education",
      category: "education",
      description: "A test scheme for residents.",
      eligibility_text: "Must be a resident",
      benefit_amount: 15000,
      source_url: "https://webadmin.pmc.gov.in/node/1",
      documents: [{ doc_key: "aadhaar", label_en: "Aadhaar card", is_required: true }],
    };
    const code = await runHarvest(
      { stage: "profile", offline: false, demo: false, dryRun: false, allowFixtureWrites: false },
      {
        db, runs: createInMemoryRuns(), client: null,
        watchlist: [{ slug: "pmc-test", urls: ["https://webadmin.pmc.gov.in/docs/test.pdf"] }],
        download: async () => new Uint8Array([1, 2, 3]),
        readPdf: async () => [{ page: 1, text: "The scheme grants Rs. 15000 to residents." }],
        profiler: async () => ({ sessionId: "s-1", submitted: JSON.stringify(profile), events: [] }),
        log: (m) => logs.push(m),
      },
    );
    expect(code).toBe(0);
    expect(db.schemes.get("pmc-test")).toBeTruthy();
    expect(logs.join("\n")).toMatch(/apply pmc-test: inserted/);
  });

  it("source_documents payload absolutizes urls and keeps the content hash", async () => {
    const writer = createInMemorySourceDocWriter();
    await writer.upsert([
      { source_system: "pmc_webadmin_circular", external_id: "1", title: "t", published_at: "2026-10-01", source_url: "https://webadmin.pmc.gov.in/node/1", file_url: undefined, content_hash: "abc" },
    ]);
    expect(writer.rows.size).toBe(1);
  });
});

describe("cli fetchListing (live query shape)", () => {
  it("requests limit= first and stops when a page adds no new nids", async () => {
    const urls: string[] = [];
    const page = JSON.stringify({
      meta: { total_items: 2, total_pages: 2, current_page: 1, per_page: 100, content_type: "ward_offices" },
      data: { nodes: [{ nid: "1" }, { nid: "2" }] },
    });
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => page };
    };
    const res = await fetchListing("ward_offices", { fetchImpl: fetchImpl as never, perPage: 100, maxPages: 3 });
    expect(urls[0]).toContain("limit=100");
    expect(res.nodes).toHaveLength(2);
  });
});

describe("escapeRawControlCharsInStrings", () => {
  it("repairs a literal newline written inside a JSON string value", () => {
    // Exactly the shape the model produced for pmc-labour-welfare-fund:
    // eligibility_text is one condition per line, so it emits a real newline.
    const raw = '{"eligibility_text": "Resident of PMC\nAge 18 or above"}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(escapeRawControlCharsInStrings(raw)) as { eligibility_text: string };
    expect(parsed.eligibility_text).toBe("Resident of PMC\nAge 18 or above");
  });

  it("leaves the whitespace between tokens intact", () => {
    const raw = '{\n  "name": "Model Schools",\n  "benefit_amount": 5000\n}';
    const parsed = JSON.parse(escapeRawControlCharsInStrings(raw)) as { name: string };
    expect(parsed.name).toBe("Model Schools");
  });

  it("does not double-escape an already-escaped sequence", () => {
    const parsed = JSON.parse(escapeRawControlCharsInStrings('{"a": "line1\\nline2"}')) as { a: string };
    expect(parsed.a).toBe("line1\nline2");
  });

  it("escapes tab and other low control characters inside a string", () => {
    const parsed = JSON.parse(escapeRawControlCharsInStrings('{"a": "x\ty\u000bz"}')) as { a: string };
    expect(parsed.a).toBe("x\ty\u000bz");
  });
});

describe("cli source-integrity guards", () => {
  it("normaliseUrl preserves existing percent-encoding", () => {
    // Exactly the URL that 404'd: encodeURI turns %20 into %2520.
    const url = "https://webadmin.pmc.gov.in/sites/default/files/circular/Ahilyabai%20holkar%20yojana.pdf";
    expect(normaliseUrl(url)).toBe(url);
    expect(encodeURI(url)).not.toBe(url);
  });

  it("normaliseUrl escapes a raw space instead of dropping it", () => {
    expect(normaliseUrl("https://webadmin.pmc.gov.in/a b.pdf")).toBe(
      "https://webadmin.pmc.gov.in/a%20b.pdf",
    );
  });

  it("refuses to profile a scheme whose source could not be downloaded", async () => {
    // Without this guard the agent profiles empty text and invents a row named
    // "unknown", which then passes the Zod gate and lands in the database.
    const db = createInMemoryDb();
    const logs: string[] = [];
    let profilerCalls = 0;
    const code = await runHarvest(
      { stage: "profile", offline: false, demo: false, dryRun: false, allowFixtureWrites: true },
      {
        db,
        runs: createInMemoryRuns(),
        client: null,
        watchlist: [
          { slug: "pmc-example", note: "test", urls: ["https://webadmin.pmc.gov.in/missing.pdf"] },
        ],
        download: async () => null,
        profiler: (async () => {
          profilerCalls += 1;
          return { submitted: "{}" } as never;
        }) as never,
        log: (m: string) => logs.push(m),
      },
    );
    expect(profilerCalls).toBe(0);
    expect(db.schemes.has("pmc-example")).toBe(false);
    expect(logs.join("\n")).toMatch(/NO SOURCE CONTENT retrieved/);
    expect(code).not.toBe(0);
  });
});
