import { Hono } from "hono"
import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { COMMENTER_SESSION_COOKIE, type CommenterSession } from "@adt/types"
import { issueSessionCookie, storedCommenterFromCookie } from "./sessions.js"
import type { PublicationStore, StoredCommenterSession } from "./store.js"

const SECRET = "local-dev-secret"
const TOKEN = "cookieTokenAbcdefghijklmnopqrstu"

function storeFor(session: StoredCommenterSession): Pick<PublicationStore, "findSession"> {
  return { findSession: async (id) => (id === session.id ? session : null) }
}

describe("commenter session signed cookie", () => {
  it("round-trips through Hono signing and keeps author rows unusable", async () => {
    const commenter: StoredCommenterSession = {
      id: "commenter-1",
      token: TOKEN,
      name: "Maria",
      color: "#e5484d",
      is_author: false,
      pin: null,
    }
    const author: StoredCommenterSession = { ...commenter, id: "author-1", is_author: true }
    const mintCookie = async (sessionId: string): Promise<string> => {
      const mint = new Hono()
      mint.get("/", async (c) => {
        await issueSessionCookie(c, TOKEN, sessionId, SECRET)
        return c.text("ok")
      })
      const response = await mint.request("https://example.test/")
      const setCookie = response.headers.get("set-cookie")
      expect(setCookie).toContain(`${COMMENTER_SESSION_COOKIE}=`)
      return setCookie?.split(";", 1)[0] ?? ""
    }

    const cookie = await mintCookie(commenter.id)
    expect(cookie).toBeDefined()

    const read = new Hono()
    read.get("/", async (c) => {
      const session = await storedCommenterFromCookie(
        c,
        storeFor(commenter),
        c.req.query("token") ?? TOKEN,
      )
      return c.json(session)
    })
    const accepted = await read.request(
      "https://example.test/",
      { headers: { Cookie: cookie } },
      env,
    )
    await expect(accepted.json()).resolves.toMatchObject(
      { id: commenter.id, is_author: false } satisfies Partial<CommenterSession>,
    )

    const wrongPublication = await read.request(
      "https://example.test/?token=otherPublicationToken",
      { headers: { Cookie: cookie } },
      env,
    )
    await expect(wrongPublication.json()).resolves.toBeNull()

    const tampered = await read.request(
      "https://example.test/",
      { headers: { Cookie: `${cookie.slice(0, -1)}x` } },
      env,
    )
    await expect(tampered.json()).resolves.toBeNull()

    const authorCookie = await mintCookie(author.id)

    const authorRead = new Hono()
    authorRead.get("/", async (c) => {
      const session = await storedCommenterFromCookie(c, storeFor(author), TOKEN)
      return c.json(session)
    })
    const rejected = await authorRead.request(
      "https://example.test/",
      { headers: { Cookie: authorCookie } },
      env,
    )
    await expect(rejected.json()).resolves.toBeNull()
  })
})
