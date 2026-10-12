import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import { runFullPipeline, readOutputCatalog, loadBookConfig } from "../index.js"
it("missing page2 storyboard does not block selected page1 translation", async () => {
  const f = setupFullResumeFixture()
  try {
    fs.writeFileSync(
      f.options().configPath,
      fs
        .readFileSync(f.options().configPath, "utf8")
        .replace("end_page: 1", "end_page: 2"),
    )
    expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
    fs.appendFileSync(f.options().configPath, "\noutput_languages: [fr-FR]\n")
    fs.writeFileSync(
      path.join(f.root, "prompts/translation.liquid"),
      '{% chat role: "user" %}{% for t in texts %}TEXT|{{ t.text }}\n{% endfor %}{% endchat %}',
    )
    const original = f.transport.getMockImplementation()!
    f.transport.mockImplementation(async (url, init) => {
      const prompt = String(init?.body)
      if (!prompt.includes("TEXT|")) return original(url, init)
      const parsed = JSON.parse(prompt)
      const joined = parsed.messages.map((m: any) => m.content).join("\n")
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
                translations: [...joined.matchAll(/TEXT\|([^\n]+)/g)].map(
                  ([, s]) => "French " + s,
                ),
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    })
    const s = f.storage()
    s.putNodeData("web-rendering", "pg002", null)
    const outputs = readOutputCatalog({
      storage: s,
      config: loadBookConfig(
        "book",
        f.options().booksRoot,
        f.options().configPath,
      ),
      bookDir: s.bookDir!,
      promptsDir: f.options().promptsDir,
      configDir: f.options().configDir,
    })
    s.close()
    const chosen = outputs.find((o) => o.identity.kind === "translation")!
    expect(chosen).toBeDefined()
    const calls = f.transport.mock.calls.length
    const result = await runFullPipeline({
      ...f.options(),
      fromStage: "translate",
      toStage: "translate",
      outputScope: { selection: { identities: [chosen.identity] } },
    })
    expect(f.transport.mock.calls.length - calls).toBe(1)
    expect(
      result.resume?.outputs.find((o) => o.identity.id === chosen.identity.id)
        ?.current,
    ).toBe(true)
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(f.root, { recursive: true, force: true })
  }
}, 60000)
