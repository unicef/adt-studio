import { promptRoots } from "@adt/llm"
import path from "node:path"

/**
 * Bundled prompts are application resources and must remain read-only. Global
 * user overrides live in writable application data that persists with books by
 * default, while per-book overrides stay inside the book directory.
 */
export function resolvePromptOverridesDir(booksDir: string): string {
  return path.resolve(
    process.env.PROMPT_OVERRIDES_DIR
      ?? path.join(path.resolve(booksDir), ".adt-studio", "prompt-overrides"),
  )
}

export function resolvePromptRoots(options: {
  booksDir: string
  promptsDir: string
  bookPromptsDir?: string
}): string[] {
  return promptRoots(options.booksDir, options.promptsDir, resolvePromptOverridesDir(options.booksDir), options.bookPromptsDir)
}
