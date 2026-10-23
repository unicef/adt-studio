import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"

export function sameCaption(a: CaptionEntry, b: CaptionEntry): boolean {
  return a.caption === b.caption && (a.decorative === true) === (b.decorative === true)
}

export function stampSources(next: readonly CaptionEntry[], server: readonly CaptionEntry[]): CaptionEntry[] {
  const before = new Map(server.map((entry) => [entry.imageId, entry]))
  return next.map((entry) => {
    const original = before.get(entry.imageId)
    if (original && sameCaption(original, entry)) return original
    return entry.source === "manual" ? entry : { ...entry, source: "manual" }
  })
}
