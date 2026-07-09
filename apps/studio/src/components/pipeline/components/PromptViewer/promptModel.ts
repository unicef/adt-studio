export function promptModelForSelectedModel(modelId: string | undefined): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  const canonical = normalized.includes(":") ? normalized : `openai:${normalized}`

  if (canonical === "openai:gpt-5.4") return null

  return canonical
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
