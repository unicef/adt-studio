const BASE_PROMPT_MODEL_ID = "openai:gpt-5.4"

export function promptModelForSelectedModel(modelId: string | undefined): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  const canonical = normalized.includes(":") ? normalized : `openai:${normalized}`
  if (canonical === BASE_PROMPT_MODEL_ID) return null

  return canonical
}

export function promptNameForSelectedModel(
  promptName: string,
  modelId: string,
): string {
  return promptModelForSelectedModel(modelId)
    ? `${promptName}__${sanitizePromptModelId(modelId)}`
    : promptName
}

function sanitizePromptModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
