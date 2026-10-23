import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { LLMModel } from "@adt/llm"
import { regenerateGlossaryPreservingEdits, getGlossaryItemTextId } from "../glossary.js"
import { buildTextCatalogSnapshot } from "../text-catalog.js"

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "glossary-identity-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const term = (word: string) => ({ word, definition: `Definition of ${word}`, variations: [], emojis: [], source: "ai" as const })

it("inserting an earlier term retains legacy/manual identities and downstream corrections; rollback cannot recycle a spent ID", async () => {
  const storage = createBookStorage("book", root)
  try {
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>Glossary source.</p>" }] })
    const original = storage.putNodeData("glossary", "book", { items: [term("Forest"), { ...term("River"), id: "gl_manual_river", source: "manual" }], pageCount: 1, generatedAt: "old" })
    storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "gl001_def", text: "Correction forêt", source: "manual" }], generatedAt: "old" })
    const translateBefore = storage.getLatestNodeData("text-catalog-translation", "fr")
    const run = async (words: string[], seedTerms?: Array<ReturnType<typeof term> & { id: string }>) => regenerateGlossaryPreservingEdits({ storage, pages: [{ pageId: "pg001", pageNumber: 1, text: "" }], config: { promptName: "glossary", modelId: "test", maxRetries: 0, language: "en", batchSize: 10, seedTerms },
      llmModel: { generateObject: async () => ({ object: { items: words.map(term) } }) } as unknown as LLMModel })
    const first = await run(["Ash", "Forest", "River"])
    const id = (word: string) => { const index = first.items.findIndex((item) => item.word === word); return getGlossaryItemTextId(first.items[index], index) }
    expect(id("Forest")).toBe("gl001")
    expect(id("River")).toBe("gl_manual_river")
    expect(id("Ash")).not.toBe("gl001")
    storage.putNodeData("glossary", "book", first)
    expect(buildTextCatalogSnapshot(storage, []).entries.find((entry) => entry.id === "gl001_def")?.text).toBe("Definition of Forest")
    expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translateBefore)
    storage.setCurrentNodeVersion("glossary", "book", original)
    const afterRollback = await run(["Beech", "Forest"])
    const beech = afterRollback.items.findIndex((item) => item.word === "Beech")
    expect(getGlossaryItemTextId(afterRollback.items[beech], beech)).not.toBe(id("Ash"))
    expect(afterRollback.items.find((item) => item.word === "Forest")?.id).toBe("gl001")
    // Imported seed settings may carry an ID used by a different retired term.
    const withSeed = await run(["Forest"], [{ ...term("Oak"), id: id("Ash") }])
    expect(withSeed.items.find((item) => item.word === "Oak")?.id).not.toBe(id("Ash"))
    expect(withSeed.items.find((item) => item.word === "Forest")?.id).toBe("gl001")
  } finally { storage.close() }
})


it.each([false, true])("Run before opening Glossary retains the first legacy collision owner (explicit: %s)", async (explicit) => {
  const storage = createBookStorage("book", root)
  try {
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>Forest and River</p>" }] })
    const oldItems = [{ ...term("Forest"), ...(explicit ? { id: "gl002" } : {}) }, { ...term("River"), id: explicit ? "gl002" : "gl001" }]
    const original = storage.putNodeData("glossary", "book", { items: oldItems, pageCount: 1, generatedAt: "old" })
    const ownerId = explicit ? "gl002" : "gl001"
    storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: `${ownerId}_def`, text: "Correction forêt", source: "manual" }], generatedAt: "old" })
    const before = storage.getLatestNodeData("text-catalog-translation", "fr")
    const generated = await regenerateGlossaryPreservingEdits({ storage, pages: [{ pageId: "pg001", pageNumber: 1, text: "" }], config: { promptName: "glossary", modelId: "test", maxRetries: 0, language: "en", batchSize: 10,  }, llmModel: { generateObject: async () => ({ object: { items: [term("River"), term("Forest")] } }) } as unknown as LLMModel })
    storage.putNodeData("glossary", "book", generated)
    expect(generated.items.find(item => item.word === "Forest")?.id).toBe(ownerId)
    expect(generated.items.find(item => item.word === "River")?.id).not.toBe(ownerId)
    expect(buildTextCatalogSnapshot(storage, []).entries.find(entry => entry.id === `${ownerId}_def`)?.text).toBe("Definition of Forest")
    expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(before)
    expect(storage.getAllNodeVersions("glossary", "book").find(row => row.version === original)?.data).toMatchObject({ items: oldItems })
  } finally { storage.close() }
})


it.each([false, true])("Run retains distinct same-word senses with images/videos (including pruned: %s)", async (pruned) => {
  const storage = createBookStorage("book", root)
  try {
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "", html: "<p>Bank</p>" }] })
    const senses = [
      { ...term("Bank"), id: "gl001", definition: "River bank", source: "manual" as const, imageId: "river" },
      { ...term("Bank"), id: "gl002", definition: "Financial bank", source: "manual" as const, imageId: "building" },
      { ...term("Bank"), id: "gl003", definition: "Pruned one", pruned: true },
      { ...term("Bank"), id: "gl004", definition: "Pruned two", pruned: true },
    ]
    if (!pruned) senses.splice(2)
    storage.putNodeData("glossary", "book", { items: senses, pageCount: 1, generatedAt: "old" })
    storage.putSignLanguageVideo("bank", Buffer.from("retained video"), "bank.mp4", "video/mp4")
    storage.assignSignLanguageVideo("bank", "gl001")
    const videos = storage.getSignLanguageVideos()
    const result = await regenerateGlossaryPreservingEdits({ storage, pages: [{ pageId: "pg001", pageNumber: 1, text: "" }], config: { promptName: "glossary", modelId: "test", maxRetries: 0, language: "en", batchSize: 10 }, llmModel: { generateObject: async () => ({ object: { items: [term("Bank")] } }) } as unknown as LLMModel })
    expect(result.items).toEqual(senses)
    expect(storage.getSignLanguageVideos()).toEqual(videos)
  } finally { storage.close() }
})
