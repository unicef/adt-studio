export function promptModelForSelectedModel(modelId: string | undefined): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  const defaultModelPrompts = ["gpt-5.4", "openai:gpt-5.4"]

  if (defaultModelPrompts.includes(normalized)) return null

  return normalized
}

export function promptNameForSelectedModel(promptName: string, modelId: string): string {
  return `${promptName}__${sanitizePromptModelId(modelId)}`
}

function sanitizePromptModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
