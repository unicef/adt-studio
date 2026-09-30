import { APICallError, NoObjectGeneratedError } from "ai"

export function describeAiSdkError(error: unknown): string | undefined {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? `HTTP ${error.statusCode}` : "no status"
    return `${status}: ${error.message}`
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    const parts = [error.message]
    if (error.finishReason) parts.push(`finishReason=${error.finishReason}`)
    if (error.cause) {
      parts.push(
        `cause=${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
      )
    }
    if (error.text) parts.push(`response=${error.text}`)
    return parts.join(" | ")
  }
  return undefined
}
