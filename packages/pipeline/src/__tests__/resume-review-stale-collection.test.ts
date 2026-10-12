import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import {
  runFullPipeline,
  readGenerationCatalog,
  loadBookConfig,
} from "../index.js"
it("stale aggregate replacement cannot delete edited protected quiz", async () => {
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
    const manual = {
      ...row.quizzes[0],
      question: "My hand-written question",
      source: "manual",
    }
    s.putNodeData("quiz-generation", "book", {
      ...row,
      quizzes: [manual, row.quizzes[1]],
    })
    s.close()
    const st = f.storage()
    const captured = readGenerationCatalog({
      kinds: ["quizzes"],
      storage: st,
      config: loadBookConfig(
        "book",
        f.options().booksRoot,
        f.options().configPath,
      ),
      bookDir: st.bookDir!,
      promptsDir: f.options().promptsDir,
      templatesDir: f.options().templatesDir,
    }).find((o) => o.identity.id === "book")!
    const revised = { ...manual, question: "New manual edit AFTER consent" }
    const current = st.getLatestNodeData("quiz-generation", "book")!.data as any
    st.putNodeData("quiz-generation", "book", {
      ...current,
      quizzes: [revised, current.quizzes[1]],
    })
    st.close()
    const result = await runFullPipeline({
      ...f.options(),
      fromStage: "quizzes",
      toStage: "quizzes",
      outputScope: {
        replace: [
          {
            identity: captured.identity,
            signature: captured.signature,
            contentHash: captured.contentHash,
            revision: captured.revision,
          },
        ],
      },
    })
    const check = f.storage()
    const after = check.getLatestNodeData("quiz-generation", "book")!
      .data as any
    check.close()
    expect(after.quizzes.find((q: any) => q.quizId === manual.quizId)).toEqual(
      revised,
    )
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(f.root, { recursive: true, force: true })
  }
}, 60000)
