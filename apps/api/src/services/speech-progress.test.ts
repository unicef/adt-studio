import { describe, expect, it } from "vitest"
import type { SpeechFileEntry, SpeechFailedEntry } from "@adt/types"
import { beginSpeechRun, endSpeechRun, getLiveSpeechRun } from "./speech-progress.js"

function makeEntry(textId: string): SpeechFileEntry {
  return {
    textId,
    language: "en",
    fileName: `${textId}.mp3`,
    voice: "alloy",
    model: "gpt-4o-mini-tts",
    cached: false,
  }
}

describe("speech-progress registry", () => {
  it("returns null when no run is active", () => {
    expect(getLiveSpeechRun("no-such-book")).toBeNull()
  })

  it("reflects entries and failures pushed after the run began", () => {
    const entriesByLang = new Map<string, SpeechFileEntry[]>([["en", []]])
    const failedByLang = new Map<string, SpeechFailedEntry[]>([["en", []]])
    beginSpeechRun("live-book", entriesByLang, failedByLang)
    try {
      expect(getLiveSpeechRun("live-book")?.languages.en.entries).toEqual([])

      // The registry holds live references — pushes show up in later snapshots
      entriesByLang.get("en")!.push(makeEntry("pg001_t001"))
      failedByLang.get("en")!.push({ textId: "pg001_t002", error: "rate limited" })

      const snapshot = getLiveSpeechRun("live-book")
      expect(snapshot?.languages.en.entries.map((e) => e.textId)).toEqual(["pg001_t001"])
      expect(snapshot?.languages.en.failed).toEqual([
        { textId: "pg001_t002", error: "rate limited" },
      ])
    } finally {
      endSpeechRun("live-book")
    }
    expect(getLiveSpeechRun("live-book")).toBeNull()
  })

  it("snapshots are copies — mutating them does not affect the run", () => {
    const entriesByLang = new Map<string, SpeechFileEntry[]>([["en", [makeEntry("pg001_t001")]]])
    const failedByLang = new Map<string, SpeechFailedEntry[]>([["en", []]])
    beginSpeechRun("copy-book", entriesByLang, failedByLang)
    try {
      const snapshot = getLiveSpeechRun("copy-book")!
      snapshot.languages.en.entries.pop()
      expect(getLiveSpeechRun("copy-book")?.languages.en.entries).toHaveLength(1)
    } finally {
      endSpeechRun("copy-book")
    }
  })

  it("tracks runs per book label independently", () => {
    beginSpeechRun("book-a", new Map([["en", [makeEntry("a1")]]]), new Map([["en", []]]))
    beginSpeechRun("book-b", new Map([["fr", [makeEntry("b1")]]]), new Map([["fr", []]]))
    try {
      expect(getLiveSpeechRun("book-a")?.languages.en.entries[0]?.textId).toBe("a1")
      expect(getLiveSpeechRun("book-b")?.languages.fr.entries[0]?.textId).toBe("b1")
    } finally {
      endSpeechRun("book-a")
      endSpeechRun("book-b")
    }
  })
})
