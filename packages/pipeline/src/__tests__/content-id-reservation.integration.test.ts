import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
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
