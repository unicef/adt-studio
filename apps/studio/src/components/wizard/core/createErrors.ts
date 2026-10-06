export type CreateFailureKind = "taken" | "failed"

/** Why creating the book failed: its name was taken meanwhile (the API's 409), or anything else. */
export function classifyCreateError(error: unknown): { kind: CreateFailureKind; detail: string } {
  const detail = error instanceof Error ? error.message : String(error)
  return { kind: /already exists/i.test(detail) ? "taken" : "failed", detail }
}
