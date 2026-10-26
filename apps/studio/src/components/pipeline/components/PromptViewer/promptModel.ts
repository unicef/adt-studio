import { DEFAULT_BASE_PROMPT_MODEL_ID } from "@adt/types"

export function promptModelForSelectedModel(
  modelId: string | undefined,
  basePromptModelId: string = DEFAULT_BASE_PROMPT_MODEL_ID,
): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  const canonical = normalized.includes(":") ? normalized : `openai:${normalized}`
  if (canonical === basePromptModelId.trim().toLowerCase()) return null

  return canonical
}

export function promptNameForSelectedModel(
  promptName: string,
  modelId: string,
  basePromptModelId: string = DEFAULT_BASE_PROMPT_MODEL_ID,
): string {
  return promptModelForSelectedModel(modelId, basePromptModelId)
    ? `${promptName}__${sanitizePromptModelId(modelId)}`
    : promptName
}

function sanitizePromptModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
