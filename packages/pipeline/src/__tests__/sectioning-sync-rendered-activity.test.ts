import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { PageSectioningOutput } from "@adt/types"
import { renderPage, type RenderConfig } from "../web-rendering.js"
import { classifyStoredSectioning, stampGeneratedRendering } from "../sectioning-sync-evidence.js"

const sectionId = "pg005_sec007"
const source = PageSectioningOutput.parse({ reasoning: "Source activity", sections: [{
  sectionId, sectionType: "activity_multiple_choice", backgroundColor: "#fff", textColor: "#000", pageNumber: 5, isPruned: false,
  nodes: [{ nodeId: "pg005_n002", role: "text", text: "Pick the tree.", isPruned: false }],
}] })
const html = `<section data-section-id="${sectionId}" data-section-type="activity_multiple_choice"><p data-id="pg005_n002" class="adt-body">Pick the tree.</p><button type="button" data-id="activity_gen_option" data-answer-id="activity_gen_option" class="choice">Tree</button><button type="button" data-id="activity_gen_check" aria-controls="activity_gen_option">Check</button></section>`
const config: RenderConfig = { renderType: "activity", promptName: "activity_multiple_choice", answerPromptName: "activity_multiple_choice_answers",
  modelId: "openai:gpt-4o-mini", maxRetries: 0, timeoutMs: 1000, temperature: 0, templateName: "" }
let directory: string | undefined
afterEach(() => {
  vi.unstubAllGlobals()
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

function classify(rendering: ReturnType<typeof stampGeneratedRendering>, proposed = source) {
  return classifyStoredSectioning({ pageId: "pg005", source: { version: 3, data: source }, proposed,
    rendering: { version: 8, data: rendering }, history: [{ version: 3, data: source }], layout: "reflowable", sectionOwners: { [sectionId]: ["pg005"] } })
}

describe("synchronization of production-generated activity identities", () => {
  it("patches real renderPage output without rewriting generated buttons or answer references and makes no synchronization transport calls", async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "adt-sync-generated-activity-"))
    const replies = [
      { reasoning: "Activity layout", content: html },
      { reasoning: "Answer key", answers: [{ id: "activity_gen_option", value: "tree" }] },
    ]
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      expect(String(url)).toBe("https://api.openai.com/v1/chat/completions")
      const reply = replies.shift()
      if (!reply) throw new Error("Unexpected provider call")
      return Response.json({ id: "activity-response", object: "chat.completion", created: 0, model: config.modelId,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(reply) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    })
    vi.stubGlobal("fetch", transport)
    const llm = createLLMModel({ modelId: config.modelId, credentials: { openaiApiKey: "stub-only" },
      promptEngine: createPromptEngine(path.resolve("prompts")), cacheDir: directory, logLevel: "silent" })
    const generated = await renderPage({ label: "test-book", pageId: "pg005", pageImageBase64: "", sectioning: source, images: new Map() }, () => config, llm)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(classify(generated).sections[0].status).toBe("unknown-origin")
    const rendering = stampGeneratedRendering(generated, source, "pg005", 3)
    const currentHtml = rendering.sections[0].html
    const answerId = Object.keys(rendering.sections[0].activityAnswers!)[0]
    const generatedIds = [...currentHtml.matchAll(/data-id="(pg005_sec007_activity_[a-f0-9]{24})"/g)].map((match) => match[1])
    expect(generatedIds).toHaveLength(2)
    expect(generatedIds).toContain(answerId)
    expect(currentHtml).toContain(`data-answer-id="${answerId}"`)
    expect(currentHtml).toContain(`aria-controls="${answerId}"`)
    expect(classify(rendering).sections[0]).toMatchObject({ status: "current", diagnostics: [] })

    const proposed = structuredClone(source)
    proposed.sections[0].nodes[0].text = "Pick a tree & <be safe>."
    const patched = classify(rendering, proposed)
    expect(patched.sections[0].status).toBe("text-patched")
    expect(patched.rendering!.sections[0].html).toBe(currentHtml.replace("Pick the tree.", "Pick a tree &amp; &lt;be safe&gt;."))
    expect(patched.rendering!.sections[0].activityAnswers).toEqual({ [answerId]: "tree" })
    expect(rendering.sections[0].html).toBe(currentHtml)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it.each([
    `pg006_sec007_activity_${"a".repeat(24)}`,
    `${sectionId}_activity_${"a".repeat(23)}`,
    `${sectionId}_activity_${"a".repeat(25)}`,
    `${sectionId}_activity_${"g".repeat(24)}`,
    `${sectionId}_activity_${"A".repeat(24)}`,
  ])("retains rendering with a foreign or malformed generated ID: %s", (id) => {
    const rendering = stampGeneratedRendering({ sections: [{ sectionIndex: 22, sectionType: source.sections[0].sectionType,
      reasoning: "Generated fixture with invalid identity", html: html.replaceAll("activity_gen_option", id) }] }, source, "pg005", 3)
    const proposed = structuredClone(source)
    proposed.sections[0].nodes[0].text = "Changed source."
    const result = classify(rendering, proposed)
    expect(result.changed).toBe(false)
    expect(result.sections[0].status).toBe("structural-drift")
    expect(result.rendering).toEqual(rendering)
  })
})
