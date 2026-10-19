import { describe, expect, it } from "vitest";
import {
  createTool,
  emptyInputSchema,
  findCompletionTool,
  isCompletionTool,
} from "./tools.js";

/** The harvester's closure pattern: tools close over one in-memory store. */
function makeTools(store: { value: string | null }) {
  return [
    createTool({
      name: "record_value",
      description: "Record one value.",
      inputSchema: emptyInputSchema,
      async execute() {
        return { recorded: store.value };
      },
    }),
    createTool({
      name: "submit",
      description: "Submit and end the run.",
      inputSchema: emptyInputSchema,
      lifecycle: { completesRun: true },
      async execute(input: Record<string, never>) {
        store.value = "submitted";
        return { submitted: true, input };
      },
    }),
  ];
}

describe("tool helpers", () => {
  it("finds the single completesRun tool and ignores the others", () => {
    const tools = makeTools({ value: null });
    expect(tools.map((tool) => tool.name)).toEqual(["record_value", "submit"]);
    expect(isCompletionTool(tools[0])).toBe(false);
    expect(isCompletionTool(tools[1])).toBe(true);
    expect(findCompletionTool(tools)?.name).toBe("submit");
  });

  it("returns undefined when nothing carries lifecycle.completesRun", () => {
    const plain = createTool({
      name: "noop",
      description: "Does nothing.",
      inputSchema: emptyInputSchema,
      async execute() {
        return {};
      },
    });
    expect(findCompletionTool([plain])).toBeUndefined();
    expect(findCompletionTool([])).toBeUndefined();
  });

  it("ignores non-tool values", () => {
    expect(isCompletionTool(undefined)).toBe(false);
    expect(isCompletionTool(null)).toBe(false);
    expect(isCompletionTool({ lifecycle: { completesRun: true } })).toBe(false);
  });

  it("createTool keeps the closure over the store (no context needed)", async () => {
    const store: { value: string | null } = { value: null };
    const tools = makeTools(store);
    const submit = findCompletionTool(tools);
    expect(submit).toBeDefined();
    await submit?.execute({ profile_json: "{}" });
    expect(store.value).toBe("submitted");
  });
});
