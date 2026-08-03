export function isEmbeddedLocalModelId(modelId: string | undefined): boolean {
  return Boolean(modelId?.startsWith("local:"))
}

export function isLocalModelId(modelId: string | undefined): boolean {
  return Boolean(modelId?.startsWith("local:") || modelId?.startsWith("ollama:"))
}

export function localLlmOpenAIBaseUrl(
  baseUrl = process.env.LOCAL_LLM_OPENAI_BASE_URL,
): string {
  if (!baseUrl) {
    throw new Error("Embedded local AI is only available through the ADT Studio desktop API")
  }
  return baseUrl.replace(/\/+$/, "")
}
