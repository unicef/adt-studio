import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  KIDS_NARRATOR_ID,
  KIDS_VOICE_MANIFEST_VERSION,
  getKidsNarratorLines,
  getKidsSpeakableLines,
} from "@adt/types"
import {
  assertKidsVoiceExportReady,
  readKidsVoiceStatus,
} from "./kids-mode-service.js"

let bookDir: string

beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-kids-ready-"))
})

afterEach(() => {
  fs.rmSync(bookDir, { recursive: true, force: true })
})

function writeCompleteTrack(
  languageDir: string,
  characterId: string,
  keys: readonly string[],
): Record<string, string> {
  const clips: Record<string, string> = {}
  for (const key of keys) {
    const relative = `${characterId}/${key}.mp3`
    const file = path.join(languageDir, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, "audio")
    clips[key] = relative
  }
  return clips
}

function writeCompleteManifest(language: string, buddyId: string): void {
  const languageDir = path.join(bookDir, "kids-voice", language)
  const manifest = {
    version: KIDS_VOICE_MANIFEST_VERSION,
    characters: {
      [buddyId]: writeCompleteTrack(
        languageDir,
        buddyId,
        getKidsSpeakableLines(buddyId).map((line) => line.key),
      ),
      [KIDS_NARRATOR_ID]: writeCompleteTrack(
        languageDir,
        KIDS_NARRATOR_ID,
        getKidsNarratorLines().map((line) => line.key),
      ),
    },
  }
  fs.writeFileSync(
    path.join(languageDir, "manifest.json"),
    JSON.stringify(manifest),
  )
}

describe("Kids export voice readiness", () => {
  it("reports complete buddy and narrator tracks", () => {
    writeCompleteManifest("en", "cat")

    const status = readKidsVoiceStatus(bookDir, ["en"])

    expect(status.languages[0]).toMatchObject({
      language: "en",
      hasPack: true,
      completeCharacters: ["cat"],
      narratorReady: true,
    })
    expect(() =>
      assertKidsVoiceExportReady({
        bookDir,
        languages: ["en"],
        buddies: ["cat"],
      }),
    ).not.toThrow()
  })

  it("rejects a language whose selected buddy voices are missing", () => {
    expect(() =>
      assertKidsVoiceExportReady({
        bookDir,
        languages: ["en"],
        buddies: ["cat"],
      }),
    ).toThrow("complete buddy voices")
  })
})
