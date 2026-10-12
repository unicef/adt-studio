import { createQuizRoutes } from "./quizzes.js"
import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import { runFullPipeline } from "@adt/pipeline"
it("unchanged quiz API save retains current evidence and stable IDs", async () => {
  const f = setupFullResumeFixture()
  try {
    fs.writeFileSync(
      f.options().configPath,
      fs
        .readFileSync(f.options().configPath, "utf8")
        .replace("end_page: 1", "end_page: 2")
        .replace(
          "quiz_generation: { quiz_section_types: [] }",
          "quiz_generation: { pages_per_quiz: 1, quiz_section_types: [text_only] }",
        ),
    )
    const file = path.join(f.root, "prompts/quiz_generation.liquid")
    fs.writeFileSync(
      file,
      '{% chat role: "user" %}quiz_generation{% for page in pages %}{{ page.pageId }}{% endfor %}{% endchat %}',
    )
    const original = f.transport.getMockImplementation()!
    f.transport.mockImplementation(async (url, init) => {
      if (!String(init?.body).includes("quiz_generation"))
        return original(url, init)
      return Response.json({
        id: "fixture",
        object: "chat.completion",
        created: 0,
        model: "fixture",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                reasoning: "fixture",
                question: "Who visits?",
                options: [
                  { text: "Raven", explanation: "Correct" },
                  { text: "Cat", explanation: "No" },
                  { text: "Dog", explanation: "No" },
                ],
                answer_index: 0,
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    })
    const initial = await runFullPipeline({
      ...f.options(),
      toStage: "quizzes",
    })
    expect(f.errors(initial)).toEqual([])
    const s = f.storage()
    const row = s.getLatestNodeData("quiz-generation", "book")!.data as any
    expect(row.quizzes).toHaveLength(2)
    const version = s.getLatestNodeData("quiz-generation", "book")!.version
    s.close()
    const app = createQuizRoutes(
      f.options().booksRoot,
      f.options().promptsDir,
      f.options().configPath,
    )
    const response = await app.request("/books/book/quizzes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...row, baseVersion: version }),
    })
    expect(response.status).toBe(200)
    const before = f.histories(),
      calls = f.transport.mock.calls.length
    const result = await runFullPipeline({
      ...f.options(),
      fromStage: "quizzes",
      toStage: "quizzes",
    })
    const check = f.storage()
    const after = check.getLatestNodeData("quiz-generation", "book")!
      .data as any
    check.close()
    expect(after.quizzes.map((q: any) => q.quizId)).toEqual(
      row.quizzes.map((q: any) => q.quizId),
    )
    expect(f.histories()).toEqual(before)
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(f.root, { recursive: true, force: true })
  }
}, 60000)
