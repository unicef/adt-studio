import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, type PageData } from "@adt/storage"
import { IMAGE_SET_CHANGE_CLEAR_NODE_TYPES, STAGE_ORDER, getStageRerunClearNodes } from "@adt/types"
import { buildTextCatalog } from "../text-catalog.js"

let root: string
let storage: ReturnType<typeof createBookStorage>

const pages: PageData[] = [{ pageId: "pg001", pageNumber: 1, text: "" }]

const artifact = (text = "Mago") => ({
  entries: [{ nodeId: "pg001_im001", text }],
  generatedAt: "2026-11-16T00:00:00.000Z",
})

function seedBook(text = "Mago"): void {
  storage.putNodeData("web-rendering", "pg001", {
    sections: [{
      sectionIndex: 0,
      sectionType: "images_only",
      reasoning: "",
      html: '<section data-section-id="pg001_s001"><img data-id="pg001_im001" src="placeholder" alt="Mago" /></section>',
    }],
  })
  storage.putNodeData("page-sectioning", "pg001", {
    reasoning: "",
    sections: [{
      sectionId: "pg001_s001",
      sectionType: "images_only",
      nodes: [],
      backgroundColor: "white",
      textColor: "black",
      pageNumber: 1,
      isPruned: false,
    }],
  })
  storage.putNodeData("element-audio", "pg001", artifact(text))
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-element-audio-"))
  storage = createBookStorage("book", root)
})

afterEach(() => {
  storage.close()
  fs.rmSync(root, { recursive: true, force: true })
})

it("AC-6: the artifact survives a catalog rebuild", async () => {
  seedBook()

  const first = await buildTextCatalog(storage, pages)
  const second = await buildTextCatalog(storage, pages)

  expect(second.entries).toEqual(first.entries)
  expect(second.entries).toContainEqual(expect.objectContaining({ id: "pg001_im001_audio", text: "Mago" }))
  expect(storage.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject(artifact())
})

it("AC-6: the artifact survives clearing text-catalog", async () => {
  seedBook()
  storage.clearNodesByType(["text-catalog"])

  const result = await buildTextCatalog(storage, pages)

  expect(storage.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject(artifact())
  expect(result.entries).toContainEqual(expect.objectContaining({ id: "pg001_im001_audio", text: "Mago" }))
})

it("AC-6: the artifact survives an image-set change", async () => {
  seedBook()
  storage.clearNodesByType([...IMAGE_SET_CHANGE_CLEAR_NODE_TYPES])

  const result = await buildTextCatalog(storage, pages)

  expect(storage.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject(artifact())
  expect(result.entries).toContainEqual(expect.objectContaining({ id: "pg001_im001_audio", text: "Mago" }))
})

it("AC-6: the artifact survives every stage rerun clear pair", async () => {
  seedBook()

  for (const from of STAGE_ORDER) {
    for (const to of STAGE_ORDER) {
      storage.clearNodesByType(getStageRerunClearNodes(from, to))
    }
  }

  expect(storage.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject(artifact())
})

it("AC-6: the latest artifact version wins", async () => {
  seedBook("Mago")
  storage.putNodeData("element-audio", "pg001", artifact("Maga"))

  const result = await buildTextCatalog(storage, pages)

  expect(result.entries).toContainEqual(expect.objectContaining({ id: "pg001_im001_audio", text: "Maga" }))
  expect(result.entries).not.toContainEqual(expect.objectContaining({ id: "pg001_im001_audio", text: "Mago" }))
})

it("AC-23: clearing the rendering keeps the artifact but stops the derived entry", async () => {
  seedBook()
  storage.clearNodesByType(["web-rendering"])

  const result = await buildTextCatalog(storage, pages)

  expect(storage.getLatestNodeData("element-audio", "pg001")?.data).toMatchObject(artifact())
  expect(result.entries.some((entry) => entry.id === "pg001_im001_audio")).toBe(false)
})

it("AC-6: deletePage destroys the artifact (documented non-goal)", async () => {
  seedBook()

  storage.deletePage("pg001")

  expect(storage.getLatestNodeData("element-audio", "pg001")).toBeNull()
})

it("AC-6: clearExtractedData destroys the artifact (documented non-goal)", async () => {
  seedBook()

  storage.clearExtractedData()

  expect(storage.getLatestNodeData("element-audio", "pg001")).toBeNull()
})
