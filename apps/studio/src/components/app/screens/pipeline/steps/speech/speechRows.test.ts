import { describe, expect, it } from "vitest"
import type { TTSEntry } from "@/api/client"
import { buildSpeechRows, countRows, filterRows, pageNumberIds, type SpeechRowSources } from "./speechRows"

const clip = (textId: string, voiceSlot: "primary" | "secondary" = "primary"): TTSEntry => ({
  textId,
  fileName: `${textId}.mp3`,
  voice: "alloy",
  model: "tts",
  cached: false,
  voiceSlot,
})

const none = { excluded: false, byCategory: false, byId: false }

const base: SpeechRowSources = {
  sourceEntries: [
    { id: "pg001_n0001", text: "Hello" },
    { id: "pg001_n0002", text: "World" },
    { id: "pg002_n0001", text: "12" },
    { id: "pg002_im001", text: "A picture" },
  ],
  translatedEntries: null,
  speechEntries: [],
  audio: [clip("pg001_n0001"), clip("pg001_n0002", "secondary")],
  baseAudio: [],
  failed: [{ textId: "pg001_n0002", error: "429 Too Many Requests" }],
  timingFailed: [],
  slot: "primary",
  live: false,
  exclusionFor: (id) => (id === "pg002_im001" ? { excluded: true, byCategory: false, byId: true } : none),
}

describe("buildSpeechRows", () => {
  it("lists every text, not only the ones with audio", () => {
    const rows = buildSpeechRows(base)
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ["pg001_n0001", "ready"],
      ["pg001_n0002", "failed"],
      ["pg002_n0001", "missing"],
      ["pg002_im001", "muted"],
    ])
    expect(rows[1].failure).toContain("429")
    expect(rows[0].pageId).toBe("pg001")
    expect(rows[3].category).toBe("captions")
  })

  it("reads the selected narrator voice only", () => {
    const rows = buildSpeechRows({ ...base, slot: "secondary", failed: [] })
    expect(rows.find((row) => row.id === "pg001_n0002")?.state).toBe("ready")
    expect(rows.find((row) => row.id === "pg001_n0001")?.state).toBe("missing")
  })

  it("marks clips without audio as waiting while a run is live", () => {
    const rows = buildSpeechRows({ ...base, live: true, failed: [] })
    expect(rows.find((row) => row.id === "pg002_n0001")?.state).toBe("waiting")
  })

  it("uses the translation, then the prepared display text", () => {
    const rows = buildSpeechRows({
      ...base,
      translatedEntries: [{ id: "pg001_n0001", text: "Olá" }],
      speechEntries: [
        {
          id: "pg001_n0002",
          displayText: "Mundo",
          speechText: "Mundo",
          changed: false,
          transformations: [],
          status: "ready",
          generation: { mode: "generated", generatedAt: "", enabledTransformations: [] },
        },
      ],
    })
    expect(rows[0].text).toBe("Olá")
    expect(rows[0].baseText).toBe("Hello")
    expect(rows[1].text).toBe("Mundo")
  })

  it("keeps clips whose text is no longer in the catalog", () => {
    const rows = buildSpeechRows({ ...base, audio: [...base.audio, clip("gl001")] })
    expect(rows.at(-1)?.id).toBe("gl001")
  })
})

describe("filters and counts", () => {
  const rows = buildSpeechRows(base)

  it("counts each state", () => {
    expect(countRows(rows)).toMatchObject({ total: 4, ready: 1, failed: 1, missing: 1, muted: 1 })
  })

  it("filters by clip state, category, page and search", () => {
    expect(filterRows(rows, { clip: "failed", category: "all", pageId: null, search: "" }).map((row) => row.id)).toEqual(["pg001_n0002"])
    expect(filterRows(rows, { clip: "all", category: "captions", pageId: null, search: "" })).toHaveLength(1)
    expect(filterRows(rows, { clip: "all", category: "all", pageId: "pg002", search: "" })).toHaveLength(2)
    expect(filterRows(rows, { clip: "all", category: "all", pageId: null, search: "world" })).toHaveLength(1)
  })

  it("finds page numbers that would be read aloud", () => {
    expect(pageNumberIds(rows)).toEqual({ ids: ["pg002_n0001"], preview: "12" })
  })
})
