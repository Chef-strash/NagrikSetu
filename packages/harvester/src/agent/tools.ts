/**
 * Harvester profiler tools (task_0004, rewired in task_0002).
 *
 * `makeProfilerTools(store)` closes over one in-memory draft store, so the
 * tools no longer depend on `context.metadata.store` (which the profiler never
 * provided). `read_source` is TEXT-only — scanned PDF pages ride `userImages`
 * on the turn, never through tool results. `submit_profile` ends the run
 * (`lifecycle.completesRun`).
 */
import { z } from "zod";
import { createTool, emptyInputSchema } from "@nagriksetu/agents";

/** In-memory profile draft store the tools write into (wired by profiler). */
export interface ProfileStore {
  sources: Array<{ id: string; kind: string; text: string }>;
  fields: Record<string, string>;
  eligibilityLines: string[];
  documents: string[];
  submitted: string | null;
}

export function createProfileStore(): ProfileStore {
  return { sources: [], fields: {}, eligibilityLines: [], documents: [], submitted: null };
}

const readSourceSchema = z.object({
  source_id: z.string().describe("Source id from list_sources."),
});
const setFieldSchema = z.object({
  field: z.string().describe("Profile field name."),
  value: z.string().describe("Field value from official text, or 'unknown'."),
});
const setEligibilitySchema = z.object({
  line: z.string().describe("Eligibility line from official source text."),
});
const addDocumentSchema = z.object({
  name: z.string().describe("Required document name from official text."),
});
const submitProfileSchema = z.object({
  profile_json: z.string().describe("Final profile JSON string."),
});

/**
 * Build the six profiler tools, each closing over `store`. This is the only
 * supported construction path — there is no ambient/context store lookup.
 */
export function makeProfilerTools(store: ProfileStore) {
  const listSourcesTool = createTool({
    name: "list_sources",
    description:
      "List harvested official sources available for profiling. Returns source ids and kinds. Use before read_source.",
    inputSchema: emptyInputSchema,
    async execute() {
      return { sources: store.sources.map((s) => ({ id: s.id, kind: s.kind })) };
    },
  });

  const readSourceTool = createTool({
    name: "read_source",
    description:
      "Read the TEXT layer of one official source by id. Returns text only — never images. Scanned pages arrive as turn images.",
    inputSchema: readSourceSchema,
    async execute(input: z.infer<typeof readSourceSchema>) {
      const found = store.sources.find((s) => s.id === input.source_id) ?? null;
      if (!found) return { error: `unknown source: ${input.source_id}` };
      return { id: found.id, kind: found.kind, text: found.text };
    },
  });

  const setFieldTool = createTool({
    name: "set_field",
    description:
      "Set one profile field (name, department, benefit, contact). Values must come from official source text; use 'unknown' when absent.",
    inputSchema: setFieldSchema,
    async execute(input: z.infer<typeof setFieldSchema>) {
      store.fields[input.field] = input.value;
      return { field: input.field, value: input.value };
    },
  });

  const setEligibilityTool = createTool({
    name: "set_eligibility",
    description:
      "Append one eligibility condition line copied from official source text. One condition per line; never invent rules.",
    inputSchema: setEligibilitySchema,
    async execute(input: z.infer<typeof setEligibilitySchema>) {
      store.eligibilityLines.push(input.line);
      return { lines: store.eligibilityLines.length };
    },
  });

  const addDocumentTool = createTool({
    name: "add_document",
    description: "Record one required document named in official source text.",
    inputSchema: addDocumentSchema,
    async execute(input: z.infer<typeof addDocumentSchema>) {
      store.documents.push(input.name);
      return { documents: store.documents.length };
    },
  });

  const submitProfileTool = createTool({
    name: "submit_profile",
    description:
      "Submit the finished profile and end the run. Call once after all fields, eligibility lines, and documents are set.",
    inputSchema: submitProfileSchema,
    lifecycle: { completesRun: true },
    async execute(input: z.infer<typeof submitProfileSchema>) {
      store.submitted = input.profile_json;
      return { submitted: true };
    },
  });

  return [
    listSourcesTool,
    readSourceTool,
    setFieldTool,
    setEligibilityTool,
    addDocumentTool,
    submitProfileTool,
  ];
}

