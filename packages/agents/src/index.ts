export { mirrorLayout } from "./layout-mirror.js"
export type {
  LayoutMirrorOptions,
  LayoutMirrorTarget,
  LayoutMirrorTargetResult,
  LayoutMirrorResult,
} from "./layout-mirror.js"

export { generateActivity } from "./generate-activity.js"
export type {
  GenerateActivityOptions,
  GenerateActivityResult,
} from "./generate-activity.js"
export { ACTIVITY_GEN_MODES } from "./tools/activity-schema.js"
export type { ActivityGenMode } from "./tools/activity-schema.js"

export { runAgent } from "./runner.js"
export type { RunAgentOptions, RunAgentResult } from "./runner.js"

export { createBookTools } from "./tools/book-tools.js"
export type {
  BookToolsContext,
  BookToolsResult,
  BookToolCallRecord,
} from "./tools/book-tools.js"

export { resolveAgentModel } from "./resolve-model.js"
export type { AgentCredentials } from "./resolve-model.js"

export {
  ACTIVITY_GENERATION_SYSTEM_PROMPT,
  buildActivityGenerationSystemPrompt,
} from "./prompts/activity-generation.js"
export type { ActivityGenerationPromptOptions } from "./prompts/activity-generation.js"
export { FRONTEND_DESIGN_CHILDREN_PROMPT } from "./prompts/frontend-design-children.js"
export {
  LAYOUT_MIRROR_SYSTEM_PROMPT,
  buildLayoutMirrorUserPrompt,
} from "./prompts/layout-mirror.js"
