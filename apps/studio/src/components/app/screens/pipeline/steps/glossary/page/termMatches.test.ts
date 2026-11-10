import { describe, expect, it } from "vitest"
import type { GlossaryRow } from "../glossaryRows"
import { splitByTerms } from "./termMatches"

const row = (key: string, word: string, variations: string[] = []): GlossaryRow => ({
  _key: key,
  word,
  definition: "",
  variations,
  emojis: [],
})

describe("splitByTerms", () => {
  it("marks every word and variation, case-insensitively, on word boundaries", () => {
    const segments = splitByTerms("O Sertão e os sertões. Sertanejo não.", [row("a", "sertão", ["sertões"])])
    expect(segments.filter((segment) => segment.key).map((segment) => segment.text)).toEqual(["Sertão", "sertões"])
    expect(segments.map((segment) => segment.text).join("")).toBe("O Sertão e os sertões. Sertanejo não.")
  })

  it("prefers the longest match and keeps plain text when nothing matches", () => {
    expect(splitByTerms("cordel de cordelista", [row("a", "cordel"), row("b", "cordel de")]).map((segment) => segment.key)).toEqual(["b", null])
    expect(splitByTerms("nada aqui", [row("a", "cordel")])).toEqual([{ text: "nada aqui", key: null }])
  })
})
