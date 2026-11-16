// @vitest-environment node
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildUnreadableRepairPrompt } from "./repair-prompt"

// The API builds the review's repair request; Studio builds the one for
// exports it couldn't read. Both carry the same "do not introduce new
// problems" rules, so a change to one must reach the other.
const apiRepairGuide = fs.readFileSync(
  fileURLToPath(new URL("../../../../../api/src/services/adt-import/repair-guide.ts", import.meta.url)),
  "utf8",
)

describe("unreadable repair request", () => {
  it("carries the API's do-not-introduce-problems rules word for word", () => {
    const block = apiRepairGuide.match(/DO_NOT_INTRODUCE_PROBLEMS = \[([\s\S]*?)\] as const/)?.[1]
    expect(block).toBeTruthy()
    const lines = [...block!.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?$/gm)].map((match) => JSON.parse(`"${match[1]}"`) as string)
    expect(lines.length).toBeGreaterThan(3)
    const prompt = buildUnreadableRepairPrompt("book.zip", "Archive file is not valid JSON: manifest.json")
    for (const line of lines) expect(prompt).toContain(line)
  })
})
