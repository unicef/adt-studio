import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { collectSpentContentIds } from "../content-ids.js"
import { reconcileGlossaryEditIds } from "../glossary.js"
import { saveQuizOutput } from "../quiz-ids.js"
import { createSectionIdFactory } from "../section-ids.js"
import { reconcileSectioningIdentities } from "../sectioning-identity.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-content-identity-"))
  storage = createBookStorage("book", root)
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("reserves derived answers, legacy glossary/quiz slots, malformed history and source-less output without writing", () => {
  storage.putNodeData("web-rendering", "retired-page", { sections: [{ sectionId: "owner", html: '<section data-section-id="owner"><input data-id="activity_gen_input1"/></section>', activityAnswers: { activity_gen_input1: "Answer" } }] })
  storage.putNodeData("glossary", "book", { items: [null, { word: "Old term" }] })
  storage.putNodeData("quiz-generation", "book", { quizzes: [{ options: [{ optionId: "malformed-option", text: "Old option" }] }] })
  storage.putNodeData("tts", "legacy-language", { entries: [{ textId: "retired-source", source: "manual" }] })
  storage.putNodeData("tts", "legacy-language", null)
  const before = storage.getNodeVersionFingerprint()
  const ids = collectSpentContentIds(storage)
  for (const id of ["owner__activity_gen_input1", "owner_ans_owner__activity_gen_input1", "gl002", "gl002_def", "qz001_que", "malformed-option", "malformed-option_exp", "retired-source"]) expect(ids.has(id), id).toBe(true)
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it("reserves blank legacy identities verbatim even after their source disappears", () => {
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "", text: "Retained empty-ID correction", source: "manual" }, { id: "   ", text: "Retained whitespace-ID correction", source: "manual" }] })
  storage.putNodeData("text-catalog-translation", "fr", { entries: [] })
  const before = storage.getNodeVersionFingerprint()
  const ids = collectSpentContentIds(storage)
  expect(ids.has("")).toBe(true)
  expect(ids.has("   ")).toBe(true)
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it("new glossary terms skip identities already spent by other source kinds, including a definition-only correction", () => {
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "gl001_def", text: "Retained correction", source: "manual" }] })
  const correction = storage.getLatestNodeData("text-catalog-translation", "fr")
  const edited = reconcileGlossaryEditIds(storage, { items: [{ id: "gl001", word: "New word", definition: "New definition", variations: [], emojis: [] }], pageCount: 1, generatedAt: "now" })
  expect(edited.items[0].id).toBe("gl002")
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction)
})

it("new quizzes skip IDs whose question or option survives only in another source history", () => {
  storage.putNodeData("page-sectioning", "retired-page", { sections: [{ nodes: [{ nodeId: "qz001_que", text: "An unrelated page text" }] }] })
  storage.putNodeData("tts", "fr", { entries: [{ textId: "qz002_o0_exp", source: "manual", fileName: "retained.wav" }] })
  const retained = storage.getLatestNodeData("tts", "fr")
  const { output } = saveQuizOutput(storage, { quizzes: [{ quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "New question", options: [{ text: "New option", explanation: "New explanation" }], answerIndex: 0, reasoning: "" }], generatedAt: "now" }, "replace")
  expect(output.quizzes[0].quizId).toBe("qz003")
  expect(storage.getLatestNodeData("tts", "fr")).toEqual(retained)
})

it("fresh sectioning IDs cannot reuse an ID retained only by downstream output", () => {
  storage.putNodeData("core-tts-catalog", "fr", { entries: [{ id: "pg001_n0001", source: "manual", speechText: "Retained correction" }] })
  const generated = reconcileSectioningIdentities(storage, "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "provisional", role: "text", text: "New text", isPruned: false }] }] })
  expect(generated.sections[0].nodes[0].nodeId).toBe("pg001_n0002")
})


it("new sections cannot claim retained answer namespaces without sectioning history", () => {
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_sec001_ans_input", text: "Retained answer", source: "manual" }] })
  expect(createSectionIdFactory(storage, "pg001")()).toBe("pg001_sec002")
})

// Round four: public filenames share a case-insensitive namespace with quizzes.
it.each(["edit", "insert", "replace"] as const)("%s quiz allocation skips a case-alias held by a section", mode => {
  storage.putNodeData("page-sectioning", "retired-page", { sections: [{ sectionId: "QZ001", nodes: [] }] })
  const before = storage.getAllNodeVersions("page-sectioning", "retired-page")
  const result = saveQuizOutput(storage, { quizzes: [{ quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "Question", options: [{ text: "Answer", explanation: "Why" }], answerIndex: 0, reasoning: "" }], generatedAt: "now" }, mode)
  expect(result.output.quizzes[0].quizId).toBe("qz002")
  expect(storage.getAllNodeVersions("page-sectioning", "retired-page")).toEqual(before)
})


it("does not decode unchanged history again when allocating for the next page", () => {
  const payload = { entries: [{ textId: "retired-text", speechText: "immutable-marker".repeat(5000) }] }
  storage.putNodeData("tts", "fr", payload)
  expect(collectSpentContentIds(storage).has("retired-text")).toBe(true)
  const parse = vi.spyOn(JSON, "parse")
  try {
    storage.putNodeData("page-sectioning", "pg002", { sections: [{ sectionId: "pg002_sec001", nodes: [] }] })
    expect(collectSpentContentIds(storage).has("retired-text")).toBe(true)
    expect(parse.mock.calls.filter(([text]) => text.includes("immutable-marker"))).toHaveLength(0)
  } finally { parse.mockRestore() }
})

it.each(["schema", "slot", "payload", "retired witness"])("does not let a warmed identity projection hide damaged %s evidence", damage => {
  storage.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec077", nodes: [] }] })
  expect(collectSpentContentIds(storage).has("pg001_sec077")).toBe(true)
  const db = openBookDb(path.join(root, "book/book.db"))
  try {
    if (damage === "schema") db.exec("DROP TABLE history_witnesses")
    if (damage === "slot") db.exec("DELETE FROM history_slots WHERE node='page-sectioning'")
    if (damage === "payload") db.run("UPDATE node_data SET data=? WHERE node='page-sectioning'", ['{broken'])
    if (damage === "retired witness") {
      db.exec("DELETE FROM node_data WHERE node='page-sectioning'")
      const trigger = db.get("SELECT sql FROM sqlite_master WHERE name='history_witnesses_delete'") as { sql: string }
      db.exec("DROP TRIGGER history_witnesses_delete")
      db.exec("DELETE FROM history_witnesses WHERE node='page-sectioning'")
      db.exec(trigger.sql)
    }
    expect(() => collectSpentContentIds(storage)).toThrow("HISTORY_REPAIR_REQUIRED")
  } finally { db.close() }
})


it("keeps old and changed incarnations reserved after warming and retirement", () => {
  storage.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec077", nodes: [] }] })
  expect(createSectionIdFactory(storage, "pg001")()).toBe("pg001_sec078")
  const db = openBookDb(path.join(root, "book/book.db"))
  try {
    db.run("UPDATE node_data SET data=? WHERE node='page-sectioning'", [JSON.stringify({ sections: [{ sectionId: "pg001_sec088", nodes: [] }] })])
    expect(createSectionIdFactory(storage, "pg001")()).toBe("pg001_sec089")
    // Supported retirement checkpoints the readable new incarnation first.
    storage.clearExtractedData()
    const ids = collectSpentContentIds(storage)
    expect(ids.has("pg001_sec077")).toBe(true)
    expect(ids.has("pg001_sec088")).toBe(true)
    expect(createSectionIdFactory(storage, "pg001")()).toBe("pg001_sec089")
  } finally { db.close() }
})

it("does not reuse a warm projection from another book's same tuple", () => {
  storage.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec077", nodes: [] }] })
  expect(createSectionIdFactory(storage, "pg001")()).toBe("pg001_sec078")
  const other = createBookStorage("other", root)
  try {
    other.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec003", nodes: [] }] })
    expect(createSectionIdFactory(other, "pg001")()).toBe("pg001_sec004")
  } finally { other.close() }
})
