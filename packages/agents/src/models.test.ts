import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  DEFAULT_VISION_MODEL_ID,
  chooseModelId,
  meetsNodeRequirement,
  resolveModelChoice,
  resolveModelConfig,
} from "./models.js";

describe("model defaults", () => {
  it("defaults to ClinePass with the text model and one vision model", () => {
    expect(DEFAULT_PROVIDER_ID).toBe("cline-pass");
    expect(DEFAULT_MODEL_ID).toBe("cline-pass/glm-5.3");
    expect(DEFAULT_VISION_MODEL_ID).toBe("cline-pass/qwen3.7-plus");
  });
});

describe("resolveModelConfig", () => {
  it("fills every field from the defaults when the env is empty", () => {
    expect(resolveModelConfig({}, "HARVESTER")).toEqual({
      providerId: "cline-pass",
      modelId: "cline-pass/glm-5.3",
      visionModelId: "cline-pass/qwen3.7-plus",
    });
  });

  it("reads HARVESTER_* overrides", () => {
    expect(
      resolveModelConfig(
        {
          HARVESTER_PROVIDER_ID: "openai-compatible",
          HARVESTER_MODEL_ID: "gpt-5",
          HARVESTER_VISION_MODEL_ID: "gpt-5-vision",
        },
        "HARVESTER",
      ),
    ).toEqual({
      providerId: "openai-compatible",
      modelId: "gpt-5",
      visionModelId: "gpt-5-vision",
    });
  });

  it("reads AUDIT_* overrides independently of HARVESTER_*", () => {
    const config = resolveModelConfig(
      {
        HARVESTER_MODEL_ID: "harvester-model",
        AUDIT_MODEL_ID: "audit-model",
        AUDIT_VISION_MODEL_ID: "audit-vision-model",
      },
      "AUDIT",
    );
    expect(config.modelId).toBe("audit-model");
    expect(config.visionModelId).toBe("audit-vision-model");
    expect(config.providerId).toBe("cline-pass");
  });

  it("ignores whitespace-only overrides", () => {
    expect(resolveModelConfig({ HARVESTER_MODEL_ID: "  " }, "HARVESTER").modelId).toBe(
      DEFAULT_MODEL_ID,
    );
  });
});

describe("model choice by input (KTD3)", () => {
  const config = {
    modelId: DEFAULT_MODEL_ID,
    visionModelId: DEFAULT_VISION_MODEL_ID,
  };

  it("uses the text model with no images and the vision model with images", () => {
    expect(chooseModelId(config, false)).toBe(DEFAULT_MODEL_ID);
    expect(chooseModelId(config, true)).toBe(DEFAULT_VISION_MODEL_ID);
  });

  it("resolveModelChoice reads the images off the turn", () => {
    expect(resolveModelChoice({ env: {}, userImages: [] }).selectedModelId).toBe(
      DEFAULT_MODEL_ID,
    );
    expect(
      resolveModelChoice({
        env: {},
        userImages: ["data:image/png;base64,AAAA"],
      }).selectedModelId,
    ).toBe(DEFAULT_VISION_MODEL_ID);
  });

  it("resolveModelChoice respects the caller prefix", () => {
    expect(
      resolveModelChoice({
        env: { AUDIT_VISION_MODEL_ID: "audit-vision" },
        prefix: "AUDIT",
        userImages: ["data:image/png;base64,AAAA"],
      }).selectedModelId,
    ).toBe("audit-vision");
  });
});

describe("meetsNodeRequirement", () => {
  it("accepts Node 22+ and rejects older", () => {
    expect(meetsNodeRequirement("v22.11.0")).toBe(true);
    expect(meetsNodeRequirement("v26.8.1")).toBe(true);
    expect(meetsNodeRequirement("v20.19.0")).toBe(false);
  });
});
