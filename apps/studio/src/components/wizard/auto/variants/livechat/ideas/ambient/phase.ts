/** Where the conversation is, for the ambient ideas (glow, avatar mood, background tint). */
export type AmbientPhase = "idle" | "reading" | "found" | "asking" | "ready" | "creating" | "done" | "error"

/** The phase from whether the engine is reading and the id of the newest message shown. */
export function ambientPhase(reading: boolean, lastId: string | undefined): AmbientPhase {
  if (reading) return "reading"
  const id = lastId ?? ""
  if (id.startsWith("failed-") || id.startsWith("bad-") || id.startsWith("rejected-")) return "error"
  if (id.startsWith("done-")) return "done"
  if (id.startsWith("create-") || id.startsWith("creating-")) return "creating"
  if (id.startsWith("ready-") || id.startsWith("skip")) return "ready"
  if (id.startsWith("q-") || id.startsWith("a-")) return "asking"
  if (id.startsWith("found-")) return "found"
  if (id.startsWith("pdf-") || id.startsWith("reading-") || id.startsWith("retry-")) return "reading"
  return "idle"
}
