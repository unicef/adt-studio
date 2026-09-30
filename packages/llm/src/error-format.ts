import { AiProviderError } from "./ports/errors.js"
import { describeAiSdkError } from "./providers/shared/ai-sdk/errors.js"

export function formatProviderError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Timeout: ${error.message}`
  }
  if (AiProviderError.is(error)) return error.message
  return describeAiSdkError(error) ?? (error instanceof Error ? error.message : String(error))
}
