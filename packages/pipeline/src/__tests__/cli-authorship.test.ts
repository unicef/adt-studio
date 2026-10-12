import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { runFullPipeline } from "../pipeline-dag.js"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"

it("the shared CLI path stamps AI authorship on Sectioning, TOC, quizzes and translations", { timeout: 60000 }, async () => {
  const f = setupFullResumeFixture(), options = f.options()
  try {
    fs.writeFileSync(options.configPath, fs.readFileSync(options.configPath, "utf8").replace("quiz_generation: { quiz_section_types: [] }", "quiz_generation: { pages_per_quiz: 1 }") + "\noutput_languages: [fr]\n")
    fs.writeFileSync(path.join(f.root, "prompts/quiz_generation.liquid"), '{% chat role: "user" %}quiz_generation{% endchat %}')
    fs.writeFileSync(path.join(f.root, "prompts/translation.liquid"), '{% chat role: "user" %}translation:{{ texts | json }}{% endchat %}')
    const response = f.transport.getMockImplementation()!
    f.transport.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body)), prompt = body.messages?.find((entry: { role: string }) => entry.role === "user")?.content
      const object = prompt?.includes("quiz_generation") ? { reasoning: "fixture", question: "Who visits?", options: [{ text: "Raven", explanation: "Correct" }, { text: "Cat", explanation: "No" }, { text: "Dog", explanation: "No" }], answer_index: 0 }
        : prompt?.startsWith("translation:") ? { translations: JSON.parse(prompt.slice("translation:".length)).map((entry: { text: string }) => `Translated ${entry.text}`) } : undefined
      if (!object) return response(url, init)
      return Response.json({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    })
    const result = await runFullPipeline({ ...options, toStage: "translate" })
    expect(f.errors(result)).toEqual([])
    expect(result.resume?.status).toBe("complete")
    const storage = f.storage()
    try {
      expect(storage.getLatestNodeData("page-sectioning", "pg001")!.data).toMatchObject({ source: "ai" })
      expect(storage.getLatestNodeData("toc-generation", "book")!.data).toMatchObject({ source: "ai" })
      expect(storage.getLatestNodeData("quiz-generation", "book")!.data).toMatchObject({ quizzes: [expect.objectContaining({ source: "ai" })] })
      expect(storage.getLatestNodeData("text-catalog-translation", "fr")!.data).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ source: "ai" })]) })
    } finally { storage.close() }
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(f.root, { recursive: true, force: true }) }
})
