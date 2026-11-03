import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { protectedAuthoredRecords, resetSectioningStoryboard } from "@adt/pipeline"
import { EDITABLE_ACTIVITY_NODE } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createEditableActivitiesRoutes } from "./editable-activities.js"
let root: string, app: Hono
const label = "book", pageId = "p1"
const entity = { activities: { "0": { kind: "open-ended", sectionType: "activity_open_ended_answer", enabled: true, steps: [{ id: "step-1", prompt: { text: "Old manual question" }, multiline: true }] } } }
const save = (baseVersion?: number) => app.request(`/books/${label}/pages/${pageId}/editable-activities`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...entity, baseVersion }) })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reset-activity-"))
  const storage = createBookStorage(label, root)
  storage.putExtractedPage({ pageId, pageNumber: 1, text: "source", images: [], pageImage: { imageId: "p1_page", buffer: Buffer.from("pixels"), format: "png", hash: "test", width: 2, height: 2 } })
  storage.putNodeData("page-sectioning", pageId, { source: "manual", reasoning: "saved", sections: [] })
  storage.close()
  app = new Hono().onError(errorHandler).route("/", createEditableActivitiesRoutes(root, path.resolve("prompts")))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
it("requires captured save versions and rejects a pre-reset activity draft without restoring it", async () => {
  expect((await save()).status).toBe(400)
  expect((await save(0)).status).toBe(200)
  const storage = createBookStorage(label, root)
  const before = storage.getAllNodeVersions(EDITABLE_ACTIVITY_NODE, pageId)
  const protectedReplacements = protectedAuthoredRecords(storage, "receipt")
  expect(protectedReplacements[0].editableActivityVersion).toBe(1)
  resetSectioningStoryboard(storage, { fromStage: "sectioning", toStage: "sectioning", replaceManual: true, protectedReplacements }, "receipt")
  storage.close()
  const refused = await save(1)
  expect(refused.status).toBe(409)
  expect(await refused.json()).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 2 })
  const state = await app.request(`/books/${label}/pages/${pageId}/editable-activities`)
  expect(await state.json()).toMatchObject({ activities: {}, version: 2 })
  const after = createBookStorage(label, root)
  try {
    expect(after.getAllNodeVersions(EDITABLE_ACTIVITY_NODE, pageId).slice(0, before.length)).toEqual(before)
    expect(after.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)?.data).toBeNull()
    expect(after.getAllNodeVersions(EDITABLE_ACTIVITY_NODE, pageId)).toHaveLength(2)
  } finally { after.close() }
})
it("rejects reset consent when only the editable activity changed", async () => {
  expect((await save(0)).status).toBe(200)
  const storage = createBookStorage(label, root)
  const protectedReplacements = protectedAuthoredRecords(storage, "receipt")
  storage.close()
  expect((await save(1)).status).toBe(200)
  const current = createBookStorage(label, root)
  const before = current.getAllNodeVersions(EDITABLE_ACTIVITY_NODE, pageId)
  try {
    expect(() => resetSectioningStoryboard(current, { fromStage: "sectioning", toStage: "sectioning", replaceManual: true, protectedReplacements }, "receipt")).toThrow("Storyboard changed")
    expect(current.getAllNodeVersions(EDITABLE_ACTIVITY_NODE, pageId)).toEqual(before)
    expect(current.getLatestNodeData("page-sectioning", pageId)?.version).toBe(1)
  } finally { current.close() }
})
