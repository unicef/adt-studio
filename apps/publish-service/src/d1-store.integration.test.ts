import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { Publication } from "@adt/types"
import { createD1PublicationStore } from "./d1-store.js"
import { PinnedNameConflictError, type PublicationStore } from "./store.js"

/**
 * `idx_sessions_pinned_name_key` (migration 0008) against real D1 — the backstop behind
 * `pinnedHolderOf`'s read-then-write check in sessions.ts for two requests racing the same
 * (token, name, PIN). `sessions.ts`'s own tests (comments.integration.test.ts) cover the
 * read-based check and the route's friendly "name taken" response; this file targets the
 * constraint itself, deterministically, by driving the store directly instead of relying on two
 * HTTP requests happening to interleave.
 */

const store: PublicationStore = createD1PublicationStore(env.DB)

let tokenCounter = 0

async function publication(): Promise<string> {
  tokenCounter += 1
  const token = `d1store${String(tokenCounter).padStart(4, "0")}TokenAbcdefgh`.slice(0, 32)
  const publication: Publication = {
    token,
    title: "Raven and the Sun",
    book_label: "raven",
    current_version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
  }
  await store.create({ publication, pageManifest: [] })
  return token
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM comments").run()
  await env.DB.prepare("DELETE FROM sessions").run()
  await env.DB.prepare("DELETE FROM versions").run()
  await env.DB.prepare("DELETE FROM publications").run()
})

describe("the pinned-name unique index", () => {
  it("refuses a second createSession sharing a (token, normalized name) with a pinned row", async () => {
    const token = await publication()
    await store.createSession({
      id: "session-a",
      token,
      name: "Priya",
      color: "#0091ff",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      pin: "pbkdf2-sha256$100000$c2FsdA$aGFzaA",
    })

    await expect(
      store.createSession({
        id: "session-b",
        token,
        name: "  priya  ",
        color: "#eab308",
        isAuthor: false,
        createdAt: "2026-01-01T00:00:01.000Z",
        pin: "pbkdf2-sha256$100000$c2FsdA$aGFzaA",
      }),
    ).rejects.toBeInstanceOf(PinnedNameConflictError)

    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM sessions WHERE token = ?`)
      .bind(token)
      .first<{ total: number }>()
    expect(row?.total).toBe(1)
  })

  it("lets two pinless sessions share a name — the index is silent on rows with no pin", async () => {
    const token = await publication()
    await store.createSession({
      id: "session-a",
      token,
      name: "Priya",
      color: "#0091ff",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    })

    await expect(
      store.createSession({
        id: "session-b",
        token,
        name: "Priya",
        color: "#eab308",
        isAuthor: false,
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    ).resolves.toMatchObject({ id: "session-b", name: "Priya" })
  })

  it("refuses setSessionPin when it would pin a name another pinned row already holds", async () => {
    const token = await publication()
    await store.createSession({
      id: "session-a",
      token,
      name: "Priya",
      color: "#0091ff",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      pin: "pbkdf2-sha256$100000$c2FsdA$aGFzaA",
    })
    await store.createSession({
      id: "session-b",
      token,
      name: "Priya",
      color: "#eab308",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:01.000Z",
    })

    await expect(
      store.setSessionPin("session-b", "pbkdf2-sha256$100000$bmV3c2FsdA$bmV3aGFzaA"),
    ).rejects.toBeInstanceOf(PinnedNameConflictError)
  })

  it("refuses renameSession when the new name collides with another pinned row", async () => {
    const token = await publication()
    await store.createSession({
      id: "session-a",
      token,
      name: "Priya",
      color: "#0091ff",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      pin: "pbkdf2-sha256$100000$c2FsdA$aGFzaA",
    })
    await store.createSession({
      id: "session-b",
      token,
      name: "Ana",
      color: "#eab308",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:01.000Z",
      pin: "pbkdf2-sha256$100000$bmV3c2FsdA$bmV3aGFzaA",
    })

    await expect(store.renameSession("session-b", "Priya")).rejects.toBeInstanceOf(
      PinnedNameConflictError,
    )
  })

  it("does not block renaming a pinless session onto a name a pinned row holds", async () => {
    const token = await publication()
    await store.createSession({
      id: "session-a",
      token,
      name: "Priya",
      color: "#0091ff",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      pin: "pbkdf2-sha256$100000$c2FsdA$aGFzaA",
    })
    await store.createSession({
      id: "session-b",
      token,
      name: "Ana",
      color: "#eab308",
      isAuthor: false,
      createdAt: "2026-01-01T00:00:01.000Z",
    })

    await expect(store.renameSession("session-b", "Priya")).resolves.toMatchObject({
      id: "session-b",
      name: "Priya",
    })
  })
})
