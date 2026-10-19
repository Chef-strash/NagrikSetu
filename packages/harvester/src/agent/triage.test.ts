import { describe, expect, it } from "vitest";
import { TriageResultSchema, extractJson, triagePage } from "./triage.js";

describe("triage", () => {
  it("validates the zod verdict shape", () => {
    const parsed = TriageResultSchema.parse({
      isScheme: true,
      slug: "widow-pension",
      confidence: 0.9,
    });
    expect(parsed.slug).toBe("widow-pension");
    expect(() => TriageResultSchema.parse({ isScheme: true })).toThrow();
  });

  it("runs the stateless agent and parses JSON output", async () => {
    let seen: Record<string, unknown> = {};
    class FakeAgent {
      constructor(options: Record<string, unknown>) {
        seen = options;
      }
      async run(_input: string) {
        return {
          outputText: JSON.stringify({ isScheme: false, slug: "unknown", confidence: 0.2 }),
        };
      }
    }
    const result = await triagePage("PMC press note excerpt", {
      agentCtor: FakeAgent,
      apiKey: "test-key",
      env: {},
    });
    expect(result).toEqual({ isScheme: false, slug: "unknown", confidence: 0.2 });
    expect(seen["providerId"]).toBe("cline-pass");
    expect(seen["tools"]).toEqual([]);
  });

  it("strips markdown code fences and prose before JSON.parse", async () => {
    class FencedAgent {
      async run(_input: string) {
        return {
          outputText:
            "Sure, here is the verdict:\n```json\n" +
            '{"isScheme": true, "slug": "pmc-svanidhi-hawker", "confidence": 0.87}' +
            "\n```\n",
        };
      }
    }
    const result = await triagePage("Hawker scheme page", {
      agentCtor: FencedAgent,
      apiKey: "test-key",
      env: {},
    });
    expect(result).toEqual({ isScheme: true, slug: "pmc-svanidhi-hawker", confidence: 0.87 });
  });

  it("extractJson handles bare fences and prose-wrapped objects", () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here: {"a":1} done')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});
