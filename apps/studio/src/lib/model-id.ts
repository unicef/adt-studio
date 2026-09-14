import { safeParseModelId } from "@adt/types"

export function normalizeQualifiedModelInput(value: string): string {
  const parsed = safeParseModelId(value)
  return parsed.ok ? parsed.value.qualified : value.trim()
}
