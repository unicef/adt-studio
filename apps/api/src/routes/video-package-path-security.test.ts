import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createBookRoutes } from "./books.js"
import { createSignLanguageVideoRoutes } from "./sign-language-videos.js"

let root: string
let books: string
let book: string
let outside: string
let app: Hono
const label = "security-book"
const videoId = "sl_test"
const videoPaths = [
  `/api/books/${label}/adt-preview/content/i18n/en/video/sl_pg001_sec001.mp4`,
  `/api/books/${label}/sign-language-videos/${videoId}`,
]
const adtPath = `/api/books/${label}/adt/`

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-video-package-security-"))
  books = path.join(root, "books")
  book = path.join(books, label)
  outside = path.join(root, "outside")
  fs.mkdirSync(outside, { recursive: true })
  const storage = createBookStorage(label, books)
  try {
    storage.putSignLanguageVideo(videoId, Buffer.from("VIDEO"), "sample.mp4", "video/mp4")
    storage.assignSignLanguageVideo(videoId, "pg001_sec001")
  } finally { storage.close() }
  fs.mkdirSync(path.join(book, "adt", "content"), { recursive: true })
  fs.writeFileSync(path.join(book, "adt", "content", "pages.json"), JSON.stringify([{ href: "page.html" }]))
  fs.writeFileSync(path.join(book, "adt", "page.html"), "PAGE")
  fs.writeFileSync(path.join(outside, `${videoId}.mp4`), "OUTSIDE CANARY")
  fs.writeFileSync(path.join(outside, "page.html"), "OUTSIDE CANARY")
  fs.writeFileSync(path.join(outside, "pages.json"), JSON.stringify([{ href: "outside-canary.html" }]))
  app = new Hono()
    .route("/api", createAdtPreviewRoutes(books, path.join(root, "assets")))
    .route("/api", createSignLanguageVideoRoutes(books))
    .route("/api", createBookRoutes(books))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function setVideoPath(filePath: string) {
  const db = openBookDb(path.join(book, `${label}.db`))
  try { db.run("UPDATE sign_language_videos SET path = ? WHERE video_id = ?", [filePath, videoId]) }
  finally { db.close() }
}

it.each(["videos", "adt", "adt/content"])("rejects an outside link at %s", async (directory) => {
  const link = path.join(book, directory)
  fs.renameSync(link, `${link}-original`)
  fs.symlinkSync(outside, link, "junction")
  const urls = directory === "videos" ? videoPaths : directory === "adt"
    ? [`${adtPath}page.html`, `${adtPath}v-123/page.html`, adtPath]
    : [adtPath, `${adtPath}v-123/`, `${adtPath}content/pages.json`]
  for (const url of urls) {
    const response = await app.request(url)
    expect(response.status, url).toBe(directory === "videos" ? 403 : 400)
  }
})

it("rejects an outside book link before opening or modifying its database", async () => {
  const externalBook = path.join(outside, label)
  fs.renameSync(book, externalBook)
  fs.symlinkSync(externalBook, book, "junction")
  const dbPath = path.join(externalBook, `${label}.db`)
  const before = fs.readFileSync(dbPath)
  for (const url of [...videoPaths, `${adtPath}page.html`, adtPath]) {
    expect((await app.request(url)).status).toBe(url.includes("/adt/") ? 400 : 403)
  }
  expect(fs.readFileSync(dbPath)).toEqual(before)
})

it.each(["videos", "adt"])("rejects an outside nested link beneath %s", async (directory) => {
  fs.symlinkSync(outside, path.join(book, directory, "nested"), "junction")
  if (directory === "videos") setVideoPath(`videos/nested/${videoId}.mp4`)
  for (const url of directory === "videos" ? videoPaths : [`${adtPath}nested/page.html`]) {
    expect((await app.request(url)).status).toBe(directory === "videos" ? 403 : 400)
  }
})

it.for(["videos", "adt", "adt/content"])("rejects outside file links in %s", async (directory, { skip }) => {
  const name = directory === "videos" ? `${videoId}.mp4` : directory === "adt" ? "page.html" : "pages.json"
  const link = path.join(book, directory, name)
  fs.unlinkSync(link)
  try {
    fs.symlinkSync(path.join(outside, name), link)
  } catch (error) {
    // File symlinks require a Windows privilege that directory junctions do not.
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return skip()
    throw error
  }
  const urls = directory === "videos" ? videoPaths : directory === "adt" ? [`${adtPath}page.html`] : [adtPath]
  for (const url of urls) {
    expect((await app.request(url)).status).toBe(directory === "videos" ? 403 : 400)
  }
})

it("confines database-provided video paths to the video directory", async () => {
  setVideoPath("adt/page.html")
  for (const url of videoPaths) expect((await app.request(url)).status).toBe(403)
})

it("preserves media, MIME types, versioned assets and root redirects", async () => {
  for (const url of videoPaths) {
    const response = await app.request(url)
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("video/mp4")
    expect(await response.text()).toBe("VIDEO")
  }
  for (const version of ["", "v-123/"]) {
    const response = await app.request(`${adtPath}${version}page.html`)
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/html")
    expect(await response.text()).toBe("PAGE")
    const redirect = await app.request(`${adtPath}${version}`)
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get("Location")).toBe(`${adtPath}${version}page.html`)
  }
})

it("preserves missing file, missing manifest and unpackaged book responses", async () => {
  fs.unlinkSync(path.join(book, "videos", `${videoId}.mp4`))
  fs.unlinkSync(path.join(book, "adt", "content", "pages.json"))
  for (const url of [...videoPaths, adtPath, `${adtPath}missing.html`]) {
    expect((await app.request(url)).status).toBe(404)
  }
  fs.renameSync(path.join(book, "adt"), path.join(book, "adt-original"))
  expect((await app.request(`${adtPath}page.html`)).status).toBe(404)
})

it("preserves directory aliases contained within each media root", async () => {
  for (const directory of ["videos", "adt"]) {
    const actual = path.join(book, directory, "actual")
    fs.mkdirSync(actual)
    fs.symlinkSync(actual, path.join(book, directory, "alias"), "junction")
    const name = directory === "videos" ? `${videoId}.mp4` : "page.html"
    fs.renameSync(path.join(book, directory, name), path.join(actual, name))
  }
  setVideoPath(`videos/alias/${videoId}.mp4`)
  for (const url of videoPaths) {
    expect(await (await app.request(url)).text()).toBe("VIDEO")
  }
  expect(await (await app.request(`${adtPath}alias/page.html`)).text()).toBe("PAGE")
})
