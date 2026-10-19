import { describe, expect, it } from "vitest";
import { createProfileStore, makeProfilerTools } from "./tools.js";

describe("profiler tools", () => {
  it("registers six tools with submit_profile completing the run", () => {
    const tools = makeProfilerTools(createProfileStore());
    expect(tools.map((t) => t.name)).toEqual([
      "list_sources",
      "read_source",
      "set_field",
      "set_eligibility",
      "add_document",
      "submit_profile",
    ]);
    const submit = tools.find((t) => t.name === "submit_profile");
    expect(submit?.lifecycle).toMatchObject({ completesRun: true });
    for (const tool of tools.filter((t) => t.name !== "submit_profile")) {
      expect(tool.lifecycle?.completesRun ?? false).toBe(false);
    }
  });

  it("closes over the store for list/read/set/submit (no metadata needed)", async () => {
    const store = createProfileStore();
    store.sources.push({ id: "s1", kind: "circular", text: "Widow pension Rs 1000." });
    const tools = makeProfilerTools(store);
    const byName = (name: string) => tools.find((t) => t.name === name)!;
    // No context at all — closure must supply the store.
    expect(await byName("list_sources").execute({})).toEqual({
      sources: [{ id: "s1", kind: "circular" }],
    });
    const read = (await byName("read_source").execute({ source_id: "s1" })) as {
      text: string;
    };
    expect(read.text).toContain("Widow pension");
    await byName("set_field").execute({ field: "benefit", value: "Rs 1000" });
    await byName("set_eligibility").execute({ line: "Widow of PMC area." });
    await byName("add_document").execute({ name: "Aadhaar" });
    await byName("submit_profile").execute({ profile_json: '{"slug":"x"}' });
    expect(store.fields["benefit"]).toBe("Rs 1000");
    expect(store.eligibilityLines).toEqual(["Widow of PMC area."]);
    expect(store.documents).toEqual(["Aadhaar"]);
    expect(store.submitted).toBe('{"slug":"x"}');
  });

  it("read_source returns text only (no image payloads)", async () => {
    const store = createProfileStore();
    store.sources.push({ id: "s1", kind: "scan", text: "text layer" });
    const readSource = makeProfilerTools(store).find((t) => t.name === "read_source")!;
    const out = (await readSource.execute({ source_id: "s1" })) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("data:image");
    expect(Object.keys(out).sort()).toEqual(["id", "kind", "text"]);
  });
});

