import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import { runFullPipeline } from "../index.js"
it(
  "skip during a request cannot publish abandoned generated extract scope",
  { timeout: 60000 },
  async () => {
    const f = setupFullResumeFixture()
    try {
      expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
      const calls = f.transport.mock.calls.length
      const before = f.histories()
      const prompt = path.join(f.root, "prompts/book_summary.liquid")
      fs.writeFileSync(
        prompt,
        fs
          .readFileSync(prompt, "utf8")
          .replace("{% endchat %}", " changed {% endchat %}"),
      )
      let callbackFired = false
      const scope: any = { skip: [] }
      const original = f.transport.getMockImplementation()!
      f.transport.mockImplementation(async (url, init) => {
        const response = await original(url, init)
        callbackFired = true
        scope.skip.push({ kind: "extract-generation", id: "book" })
        return response
      })
      const result = await runFullPipeline({
        ...f.options(),
        toStage: "extract",
        outputScope: scope,
      })
      expect(callbackFired).toBe(true)
      expect(f.transport.mock.calls.length - calls).toBe(1)
      expect(f.histories()).toEqual(before)
      expect(result.resume?.outputs[0]).toMatchObject({
        state: "skipped",
        reason: "user-skipped",
        current: false,
      })
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(f.root, { recursive: true, force: true })
    }
  },
)
