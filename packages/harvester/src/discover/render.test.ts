import { describe, expect, it } from "vitest";
import { isRenderAvailable, renderPage } from "./render.js";

describe("render stub (stretch, plan §4)", () => {
  it("is unavailable and throws a stretch error", async () => {
    expect(isRenderAvailable()).toBe(false);
    await expect(renderPage("https://www.pmc.gov.in/schemes/x")).rejects.toThrow(
      /stretch/i,
    );
  });
});
