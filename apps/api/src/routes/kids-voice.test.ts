import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { KIDS_BUDDIES, getKidsBuddyMeta } from "@adt/types"
import { createKidsVoiceRoutes } from "./kids-voice.js"

let tmpDir: string
let booksDir: string
let webAssetsDir: string
let promptsDir: string
let configPath: string

/**
 * Minimal valid app config with no `speech` section — the narration voice
 * resolver falls back to the hardcoded default ("alloy") deterministically,
 * with no dependency on the real repo `config.yaml` / `config/voices.yaml`.
 */
function writeBaseConfig(): void {
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
`,
  )
}

function writeKidsCatalog(entries: Record<string, string>): void {
  const dir = path.join(webAssetsDir, "interface_translations", "en")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, "interface_translations.json"),
    JSON.stringify(entries),
  )
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-kids-voice-route-"))
  booksDir = path.join(tmpDir, "books")
  webAssetsDir = path.join(tmpDir, "web-assets")
  promptsDir = path.join(tmpDir, "prompts")
  configPath = path.join(tmpDir, "config.yaml")
  fs.mkdirSync(booksDir, { recursive: true })
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.mkdirSync(promptsDir, { recursive: true })
  writeBaseConfig()
  writeKidsCatalog({
    "kids-buddy-greet": "Hello!",
    "kids-comfort-title": "Make it comfy",
  })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  fs.mkdirSync(path.join(booksDir, label), { recursive: true })
}

function makeApp() {
  return createKidsVoiceRoutes(booksDir, webAssetsDir, promptsDir, configPath)
}

describe("GET /books/:label/kids-voices", () => {
  it("returns every buddy resolved to its default when no overrides exist", async () => {
    createTestBook("book-a")
    const app = makeApp()
    const res = await app.request("/books/book-a/kids-voices")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.buddies).toHaveLength(KIDS_BUDDIES.length)
    for (const buddy of KIDS_BUDDIES) {
      const entry = body.buddies.find((b: { id: string }) => b.id === buddy.id)
      expect(entry).toMatchObject({
        id: buddy.id,
        voice: buddy.voice.voice,
        instructions: buddy.voice.instructions,
        isDefault: true,
      })
    }
    // The book's narration voice (default "alloy", with no speech config and
    // no voices.yaml override) is excluded from the buddy dropdown options.
    expect(body.voices).toEqual(
      expect.arrayContaining(["onyx", "nova", "fable"]),
    )
    expect(body.voices).not.toContain("alloy")
  })

  it("returns 404 for a missing book", async () => {
    const app = makeApp()
    const res = await app.request("/books/ghost/kids-voices")
    expect(res.status).toBe(404)
  })

  it("excludes the book's configured narration voice from voices", async () => {
    createTestBook("book-narration")
    fs.writeFileSync(
      path.join(booksDir, "book-narration", "config.yaml"),
      `speech:
  voice: shimmer
`,
    )
    const app = makeApp()
    const res = await app.request("/books/book-narration/kids-voices")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.voices).not.toContain("shimmer")
    expect(body.voices).toEqual(
      expect.arrayContaining(["alloy", "onyx", "nova", "fable"]),
    )
  })

  it("falls back to the full voice list when every voice would be excluded", async () => {
    // Cover every offered voice across the book's languages via
    // config/voices.yaml, so a naive exclusion would empty the list — the
    // route must fall back to the full set rather than leaving nothing to
    // pick.
    const configDir = path.join(tmpDir, "config")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, "voices.yaml"),
      `openai:
  en: alloy
  es: ash
  fr: ballad
  de: coral
  it: echo
  pt: fable
  nl: onyx
  sv: nova
  da: sage
  fi: shimmer
  pl: verse
`,
    )
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
editing_language: en
output_languages:
  - es
  - fr
  - de
  - it
  - pt
  - nl
  - sv
  - da
  - fi
  - pl
`,
    )
    createTestBook("book-all-voices")
    const app = makeApp()
    const res = await app.request("/books/book-all-voices/kids-voices")
    expect(res.status).toBe(200)
    const body = await res.json()

    // Every configured voice covers a distinct offered voice id — exclusion
    // would empty the list, so the full list is returned instead.
    expect(body.voices).toHaveLength(11)
  })
})

describe("PUT /books/:label/kids-voices/:buddyId", () => {
  it("persists an override and GET reflects it with isDefault:false", async () => {
    createTestBook("book-b")
    const app = makeApp()

    const putRes = await app.request("/books/book-b/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "Extra bouncy." }),
    })
    expect(putRes.status).toBe(200)
    expect(await putRes.json()).toEqual({
      id: "dino",
      voice: "nova",
      instructions: "Extra bouncy.",
      isDefault: false,
    })

    // Persisted to the book-dir flat file.
    const stored = JSON.parse(
      fs.readFileSync(
        path.join(booksDir, "book-b", "kids-voices.json"),
        "utf8",
      ),
    )
    expect(stored.overrides.dino).toEqual({
      voice: "nova",
      instructions: "Extra bouncy.",
    })

    const getRes = await app.request("/books/book-b/kids-voices")
    const body = await getRes.json()
    const dino = body.buddies.find((b: { id: string }) => b.id === "dino")
    expect(dino).toEqual({
      id: "dino",
      voice: "nova",
      instructions: "Extra bouncy.",
      isDefault: false,
    })

    // Untouched buddies remain at their defaults.
    const robot = body.buddies.find((b: { id: string }) => b.id === "robot")
    expect(robot).toMatchObject({ isDefault: true })
  })

  it("rejects an invalid voice id", async () => {
    createTestBook("book-c")
    const app = makeApp()
    const res = await app.request("/books/book-c/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "not-a-real-voice", instructions: "Hi." }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects empty instructions", async () => {
    createTestBook("book-d")
    const app = makeApp()
    const res = await app.request("/books/book-d/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "   " }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown buddy id", async () => {
    createTestBook("book-e")
    const app = makeApp()
    const res = await app.request("/books/book-e/kids-voices/not-a-buddy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "Hi." }),
    })
    expect(res.status).toBe(404)
  })

  it("invalidates that buddy's baked clips when its voice changes", async () => {
    createTestBook("book-stale")
    const languageDir = path.join(
      booksDir,
      "book-stale",
      "kids-voice",
      "en",
    )
    const buddyDir = path.join(languageDir, "dino")
    fs.mkdirSync(buddyDir, { recursive: true })
    fs.writeFileSync(path.join(buddyDir, "kids-buddy-greet.mp3"), "old")
    fs.writeFileSync(
      path.join(languageDir, "manifest.json"),
      JSON.stringify({
        version: 1,
        characters: {
          dino: { "kids-buddy-greet": "dino/kids-buddy-greet.mp3" },
          cat: { "kids-buddy-greet": "cat/kids-buddy-greet.mp3" },
        },
      }),
    )

    const app = makeApp()
    const res = await app.request("/books/book-stale/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "New voice." }),
    })

    expect(res.status).toBe(200)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(languageDir, "manifest.json"), "utf8"),
    )
    expect(manifest.characters.dino).toBeUndefined()
    expect(manifest.characters.cat).toBeDefined()
    expect(fs.existsSync(buddyDir)).toBe(false)
  })
})

describe("GET/PUT /books/:label/kids-mode", () => {
  it("defaults off with the full roster and persists a valid selection", async () => {
    createTestBook("book-mode")
    const app = makeApp()

    const initial = await app.request("/books/book-mode/kids-mode")
    expect(initial.status).toBe(200)
    expect(await initial.json()).toEqual({
      enabled: false,
      buddies: KIDS_BUDDIES.map((buddy) => buddy.id),
    })

    const update = await app.request("/books/book-mode/kids-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, buddies: ["cat", "dino"] }),
    })
    expect(update.status).toBe(200)
    expect(await update.json()).toEqual({
      enabled: true,
      buddies: ["cat", "dino"],
    })
  })

  it("blocks enablement until every configured language has a complete Kids UI", async () => {
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
editing_language: en
output_languages:
  - es
`,
    )
    createTestBook("book-language-gate")
    const app = makeApp()

    const statusBefore = await app.request(
      "/books/book-language-gate/kids-interface/status",
    )
    expect(statusBefore.status).toBe(200)
    expect(await statusBefore.json()).toMatchObject({
      ready: false,
      languages: [
        { language: "en", ready: true, missingKeys: [] },
        { language: "es", ready: false },
      ],
    })

    const blocked = await app.request("/books/book-language-gate/kids-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, buddies: ["cat"] }),
    })
    expect(blocked.status).toBe(409)
    expect(await blocked.text()).toMatch(/es \(2 missing\)/)

    const overrideDir = path.join(
      booksDir,
      "book-language-gate",
      "kids-i18n",
    )
    fs.mkdirSync(overrideDir, { recursive: true })
    fs.writeFileSync(
      path.join(overrideDir, "es.json"),
      JSON.stringify({
        "kids-buddy-greet": "¡Hola!",
        "kids-comfort-title": "Ponte cómodo",
      }),
    )

    const enabled = await app.request("/books/book-language-gate/kids-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, buddies: ["cat"] }),
    })
    expect(enabled.status).toBe(200)
  })

  it("rejects duplicate buddy ids", async () => {
    createTestBook("book-duplicates")
    const app = makeApp()
    const res = await app.request("/books/book-duplicates/kids-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, buddies: ["cat", "cat"] }),
    })
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/kids-voice", () => {
  it("does not report a narrator-only manifest as a ready buddy pack", async () => {
    createTestBook("book-narrator-only")
    const languageDir = path.join(
      booksDir,
      "book-narrator-only",
      "kids-voice",
      "en",
    )
    fs.mkdirSync(languageDir, { recursive: true })
    fs.writeFileSync(
      path.join(languageDir, "manifest.json"),
      JSON.stringify({
        version: 1,
        characters: {
          narrator: {
            "kids-onboarding-welcome-title":
              "narrator/kids-onboarding-welcome-title.mp3",
          },
        },
      }),
    )

    const res = await makeApp().request(
      "/books/book-narrator-only/kids-voice",
    )
    expect(res.status).toBe(200)
    expect((await res.json()).languages[0]).toMatchObject({
      language: "en",
      hasPack: false,
      characters: [],
      completeCharacters: [],
      narratorReady: false,
    })
  })
})

describe("DELETE /books/:label/kids-voices/:buddyId", () => {
  it("resets an overridden buddy back to isDefault:true with default values", async () => {
    createTestBook("book-f")
    const app = makeApp()

    await app.request("/books/book-f/kids-voices/cat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "shimmer", instructions: "New style." }),
    })

    const deleteRes = await app.request("/books/book-f/kids-voices/cat", {
      method: "DELETE",
    })
    expect(deleteRes.status).toBe(200)
    const defaultVoice = getKidsBuddyMeta("cat").voice
    expect(await deleteRes.json()).toEqual({
      id: "cat",
      voice: defaultVoice.voice,
      instructions: defaultVoice.instructions,
      isDefault: true,
    })

    const getRes = await app.request("/books/book-f/kids-voices")
    const body = await getRes.json()
    const cat = body.buddies.find((b: { id: string }) => b.id === "cat")
    expect(cat).toEqual({
      id: "cat",
      voice: defaultVoice.voice,
      instructions: defaultVoice.instructions,
      isDefault: true,
    })
  })

  it("is a no-op for a buddy without an override", async () => {
    createTestBook("book-g")
    const app = makeApp()
    const res = await app.request("/books/book-g/kids-voices/bunny", {
      method: "DELETE",
    })
    expect(res.status).toBe(200)
    expect((await res.json()).isDefault).toBe(true)
  })
})
