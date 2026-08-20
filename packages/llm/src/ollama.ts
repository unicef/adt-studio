export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"

/**
 * ADT model ids cannot contain a second colon, while Ollama uses tags such as
 * `gemma4:26b`. Keep stable ADT aliases at the config boundary and translate
 * them only when calling Ollama.
 */
const OLLAMA_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "gemma4-e2b": "gemma4:e2b",
  "gemma4-e4b": "gemma4:e4b",
  "gemma4-12b": "gemma4:12b",
  "gemma4-26b": "gemma4:26b",
  "gemma4-31b": "gemma4:31b",
}

export function resolveOllamaModelName(model: string): string {
  return OLLAMA_MODEL_ALIASES[model] ?? model
}

export function ollamaOpenAIBaseUrl(baseUrl = process.env.OLLAMA_BASE_URL): string {
  const normalized = (baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "")
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`
}

