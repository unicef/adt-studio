import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolvePromptOverridesDir, resolvePromptRoots } from "./prompt-roots.js"

const originalPromptOverridesDir = process.env.PROMPT_OVERRIDES_DIR

afterEach(() => {
  if (originalPromptOverridesDir == null) delete process.env.PROMPT_OVERRIDES_DIR
  else process.env.PROMPT_OVERRIDES_DIR = originalPromptOverridesDir
})

describe("prompt roots", () => {
  it("keeps book data first, writable global overrides second, and bundled defaults last", () => {
    delete process.env.PROMPT_OVERRIDES_DIR
    const booksDir = path.resolve("/tmp/adt-books")
    const bookPromptsDir = path.join(booksDir, "sample", "prompts")
    const bundledDir = path.resolve("/opt/adt/prompts")

    expect(resolvePromptRoots({ booksDir, promptsDir: bundledDir, bookPromptsDir })).toEqual([
      bookPromptsDir,
      path.join(booksDir, ".adt-studio", "prompt-overrides"),
      bundledDir,
    ])
  })

  it("honors an explicit writable override directory", () => {
    process.env.PROMPT_OVERRIDES_DIR = "/var/lib/adt/prompt-overrides"
    expect(resolvePromptOverridesDir("/tmp/books")).toBe("/var/lib/adt/prompt-overrides")
  })
})
