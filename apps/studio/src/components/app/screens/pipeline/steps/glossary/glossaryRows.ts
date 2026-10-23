import type { GlossaryItem, GlossaryOutput } from "@/api/client"

export type GlossaryRow = GlossaryItem & { _key: string }

export type GlossaryTextPatch = Partial<Pick<GlossaryItem, "word" | "definition" | "emojis">>

export function toRows(doc: GlossaryOutput): GlossaryRow[] {
  return doc.items.map((item, index) => ({ ...item, _key: item.id ?? `k${index}` }))
}

function sameText(a: GlossaryItem, b: GlossaryItem): boolean {
  return a.word === b.word && a.definition === b.definition && a.emojis.join("|") === b.emojis.join("|")
}

export function fromRows(doc: GlossaryOutput, rows: GlossaryRow[]): GlossaryOutput {
  const before = new Map(toRows(doc).map((row) => [row._key, row]))
  return {
    ...doc,
    items: rows.map(({ _key, ...item }) => {
      const original = before.get(_key)
      return original && (original.source ?? "ai") === "ai" && !sameText(original, item) ? { ...item, source: "manual" as const } : item
    }),
  }
}

export function rowKey(row: GlossaryRow): string {
  return row._key
}

export function sameTerm(a: GlossaryRow, b: GlossaryRow): boolean {
  return (
    a.word === b.word &&
    a.definition === b.definition &&
    a.emojis.join("|") === b.emojis.join("|") &&
    a.variations.join("|") === b.variations.join("|") &&
    (a.imageId ?? "") === (b.imageId ?? "") &&
    !!a.pruned === !!b.pruned &&
    (a.source ?? "ai") === (b.source ?? "ai")
  )
}

export function classifyTerm(before: GlossaryRow, after: GlossaryRow): "pruned" | "restored" | "edited" {
  if (!before.pruned && after.pruned) return "pruned"
  if (before.pruned && !after.pruned) return "restored"
  return "edited"
}

export function withTextEdit(row: GlossaryRow, patch: GlossaryTextPatch): GlossaryRow {
  return { ...row, ...patch }
}
