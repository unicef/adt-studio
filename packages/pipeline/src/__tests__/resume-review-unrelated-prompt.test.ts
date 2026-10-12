import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import { runFullPipeline } from "../index.js"
it(
  "unused dynamic extraction prompt cannot block current storyboard-only reuse",
  { timeout: 60000 },
  async () => {
    const f = setupFullResumeFixture()
    try {
      expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
      fs.appendFileSync(
        path.join(f.root, "prompts/book_summary.liquid"),
        "{% include extra_partial %}",
      )
      const before = f.histories(),
        calls = f.transport.mock.calls.length
      const result = await runFullPipeline({
        ...f.options(),
        fromStage: "storyboard",
        toStage: "storyboard",
      })
      expect(f.errors(result)).toEqual([])
      expect(result.resume?.status).toBe("complete")
      expect(f.histories()).toEqual(before)
      expect(f.transport.mock.calls.length).toBe(calls)
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(f.root, { recursive: true, force: true })
    }
  },
)
