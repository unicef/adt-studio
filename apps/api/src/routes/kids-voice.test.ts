import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { KIDS_BUDDIES, getKidsBuddyMeta } from "@adt/types"
import { createKidsVoiceRoutes } from "./kids-voice.js"

let tmpDir: string
let booksDir: string
let webAssetsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-kids-voice-route-"))
  booksDir = path.join(tmpDir, "books")
  webAssetsDir = path.join(tmpDir, "web-assets")
  fs.mkdirSync(booksDir, { recursive: true })
  fs.mkdirSync(webAssetsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  fs.mkdirSync(path.join(booksDir, label), { recursive: true })
}

describe("GET /books/:label/kids-voices", () => {
  it("returns every buddy resolved to its default when no overrides exist", async () => {
    createTestBook("book-a")
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
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
    expect(body.voices).toEqual(
      expect.arrayContaining(["alloy", "onyx", "nova", "fable"]),
    )
  })

  it("returns 404 for a missing book", async () => {
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
    const res = await app.request("/books/ghost/kids-voices")
    expect(res.status).toBe(404)
  })
})

describe("PUT /books/:label/kids-voices/:buddyId", () => {
  it("persists an override and GET reflects it with isDefault:false", async () => {
    createTestBook("book-b")
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)

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
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
    const res = await app.request("/books/book-c/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "not-a-real-voice", instructions: "Hi." }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects empty instructions", async () => {
    createTestBook("book-d")
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
    const res = await app.request("/books/book-d/kids-voices/dino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "   " }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown buddy id", async () => {
    createTestBook("book-e")
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
    const res = await app.request("/books/book-e/kids-voices/not-a-buddy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "nova", instructions: "Hi." }),
    })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /books/:label/kids-voices/:buddyId", () => {
  it("resets an overridden buddy back to isDefault:true with default values", async () => {
    createTestBook("book-f")
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)

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
    const app = createKidsVoiceRoutes(booksDir, webAssetsDir)
    const res = await app.request("/books/book-g/kids-voices/bunny", {
      method: "DELETE",
    })
    expect(res.status).toBe(200)
    expect((await res.json()).isDefault).toBe(true)
  })
})
