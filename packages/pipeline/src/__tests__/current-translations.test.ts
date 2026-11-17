import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import { loadBookConfig } from "../config.js"
import { readOutputCatalog } from "../output-catalog.js"
import { translatedDisplayEntries } from "../output-sources.js"

let root: string, storage: Storage
const sources = [{ id: "stable", text: "Original" }, { id: "neighbor", text: "Other" }, { id: "new-id", text: "Original" }]
const retained = { id: "stable", text: "Correção guardada", source: "manual" as const }
const neighbor = { id: "neighbor", text: "Vizinho", source: "manual" as const }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "current-translations-"))
  storage = createBookStorage("current", root)
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("text-catalog", "book", { entries: sources, generatedAt: "source" })
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })
function statuses() {
  const config = { ...loadBookConfig("current", root, path.resolve("config.yaml")), output_languages: ["en", "pt-BR"] }
  return readOutputCatalog({ storage, config, bookDir: storage.bookDir!, promptsDir: path.resolve("prompts"), configDir: path.resolve("config"), kinds: ["translation"] })
}
const status = (id: string) => statuses().find(output => output.identity.id === id)!

it.each([{ entries: [] }, { entries: [neighbor] }])("keeps retired history out of current status/display after restart (%j)", ({ entries }) => {
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries: [retained, neighbor], generatedAt: "old" })
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries, generatedAt: "retired" })
  const history = storage.getAllNodeVersions("text-catalog-translation", "pt-BR")
  storage.close(); storage = createBookStorage("current", root)
  expect(status("stable")).toMatchObject({ current: false, missing: true, usable: false })
  expect(status("new-id")).toMatchObject({ missing: true })
  expect(translatedDisplayEntries(storage, "pt-BR", sources).find(entry => entry.id === "stable")?.text).toBe("")
  expect(storage.getAllNodeVersions("text-catalog-translation", "pt-BR")).toEqual(history)
  if (entries.length) expect(status("neighbor")).toMatchObject({ text: neighbor.text, manual: true, usable: true })
})

it.each([null, {}, { entries: "invalid" }, { entries: [null] }, { entries: [{ id: "stable", text: null }] }, { entries: [], generatedAt: "empty" }])("does not revive legacy namespace or historical content through canonical %j", canonical => {
  storage.putNodeData("text-catalog-translation", "pt_BR", { entries: [retained], generatedAt: "legacy" })
  expect(status("stable")).toMatchObject({ text: retained.text, manual: true, missing: false })
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries: [retained], generatedAt: "canonical-before" })
  storage.putNodeData("text-catalog-translation", "pt-BR", canonical)
  expect(status("stable")).toMatchObject({ missing: true, usable: false })
  expect(translatedDisplayEntries(storage, "pt-BR", sources)[0].text).toBe("")
})

it("honors an older selected current version and keeps every current duplicate in the conflict guard", () => {
  const duplicates = [retained, { ...retained, text: "Hidden legacy correction", source: undefined }]
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries: duplicates, generatedAt: "selected" })
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries: [{ ...retained, text: "Newer unselected" }], generatedAt: "later" })
  storage.setCurrentNodeVersion("text-catalog-translation", "pt-BR", 1)
  expect(status("stable")).toMatchObject({ text: retained.text, protected: true, current: false, warnings: expect.arrayContaining([expect.objectContaining({ reason: "output-conflict" })]) })
  expect(translatedDisplayEntries(storage, "pt-BR", sources)[0].text).toBe(retained.text)
  expect(storage.getLatestNodeData("text-catalog-translation", "pt-BR")?.version).toBe(1)
})

// GET text-catalog accepts an otherwise valid legacy list without generatedAt.
it("keeps a readable legacy current list visible without inventing authorship", () => {
  const entries = [retained, { ...neighbor, source: undefined }]
  storage.putNodeData("text-catalog-translation", "pt-BR", { entries })
  expect(status("stable")).toMatchObject({ text: retained.text, manual: true, usable: true })
  expect(status("neighbor")).toMatchObject({ text: neighbor.text, protected: true, usable: true })
  expect(translatedDisplayEntries(storage, "pt-BR", sources).map(entry => entry.text)).toEqual([retained.text, neighbor.text, ""])
  expect(storage.getLatestNodeData("text-catalog-translation", "pt-BR")?.data).toEqual({ entries })
})
