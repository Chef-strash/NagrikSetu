import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // The zero-PII suite scans whole payloads; keep honest failure output.
    testTimeout: 30_000,
  },
});
