/**
 * Provider + model defaults and the text-versus-vision choice (KTD3).
 *
 * Both consumers run on Cline's own models (ClinePass), so no Anthropic key is
 * required. Callers name their own env prefix: `HARVESTER` for the harvester,
 * `AUDIT` for the citizen document audit.
 */
import { readEnv, envName } from "./env.js";

/** Default Cline SDK provider. Cline's own models need only a Cline token. */
export const DEFAULT_PROVIDER_ID = "cline-pass";
/** Text model used when no page images ride the turn. */
export const DEFAULT_MODEL_ID = "cline-pass/glm-5.3";
/**
 * Vision model, used whenever images are attached. `cline-pass/qwen3.7-plus`
 * is the only vision-capable ClinePass model as of 2026-10-04.
 */
export const DEFAULT_VISION_MODEL_ID = "cline-pass/qwen3.7-plus";

/**
 * Env prefix assumed when a caller does not pass one. Defaults to the
 * harvester's prefix so the harvester's existing `HARVESTER_*` variables keep
 * resolving; every other caller passes its own prefix explicitly.
 */
export const DEFAULT_ENV_PREFIX = "HARVESTER";

export interface ModelConfig {
  providerId: string;
  modelId: string;
  visionModelId: string;
}

export interface ModelChoice extends ModelConfig {
  imagesAttached: boolean;
  /** The model the run should actually use. */
  selectedModelId: string;
}

export interface ModelChoiceInput {
  env?: NodeJS.ProcessEnv | undefined;
  prefix?: string | undefined;
  userImages?: readonly unknown[] | undefined;
}

/** Provider/model/vision-model for one caller prefix, with defaults filled. */
export function resolveModelConfig(
  env: NodeJS.ProcessEnv = process.env,
  prefix: string = DEFAULT_ENV_PREFIX,
): ModelConfig {
  const providerName = envName(prefix, "PROVIDER_ID");
  const modelName = envName(prefix, "MODEL_ID");
  const visionName = envName(prefix, "VISION_MODEL_ID");
  return {
    providerId:
      (providerName ? readEnv(env, providerName) : undefined) ?? DEFAULT_PROVIDER_ID,
    modelId: (modelName ? readEnv(env, modelName) : undefined) ?? DEFAULT_MODEL_ID,
    visionModelId:
      (visionName ? readEnv(env, visionName) : undefined) ?? DEFAULT_VISION_MODEL_ID,
  };
}

/** True when the run carries images, i.e. it needs the vision-capable model. */
export function imagesAttached(userImages?: readonly unknown[] | undefined): boolean {
  return (userImages?.length ?? 0) > 0;
}

/** Text model by default, vision model when images are attached (KTD3). */
export function chooseModelId(
  config: Pick<ModelConfig, "modelId" | "visionModelId">,
  hasImages: boolean,
): string {
  return hasImages ? config.visionModelId : config.modelId;
}

/** One call that resolves the env, the images and the resulting model id. */
export function resolveModelChoice(input: ModelChoiceInput = {}): ModelChoice {
  const config = resolveModelConfig(
    input.env ?? process.env,
    input.prefix ?? DEFAULT_ENV_PREFIX,
  );
  const attached = imagesAttached(input.userImages);
  return {
    ...config,
    imagesAttached: attached,
    selectedModelId: chooseModelId(config, attached),
  };
}

/** Minimum supported Node major (the Cline SDK needs Node 22+). */
export const REQUIRED_NODE_MAJOR = 22;

/** True when the running Node meets the minimum major version. */
export function meetsNodeRequirement(version = process.version): boolean {
  const major = Number.parseInt(
    version.replace(/^v/, "").split(".")[0] ?? "",
    10,
  );
  return Number.isFinite(major) && major >= REQUIRED_NODE_MAJOR;
}
