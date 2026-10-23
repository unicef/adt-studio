export type RerunBlock = "unsaved" | "prereq" | "provider" | null

export function rerunBlock({
  hasUnsaved,
  prereqMet,
  hasProvider,
}: {
  hasUnsaved: boolean
  prereqMet: boolean
  hasProvider: boolean
}): RerunBlock {
  if (hasUnsaved) return "unsaved"
  if (!prereqMet) return "prereq"
  if (!hasProvider) return "provider"
  return null
}
