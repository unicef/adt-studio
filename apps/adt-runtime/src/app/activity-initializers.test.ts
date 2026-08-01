import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The runtime has two entry points that must boot the same activity handlers:
 *
 *   - `app/lifecycle.ts`      — the full web runtime (base.bundle), used by the
 *                               standalone ADT web output.
 *   - `activities-entry.tsx`  — the standalone activities bundle, injected into
 *                               EPUB and WebPub pages by `injectActivitiesBundle`
 *                               after `stripRuntimeBundle` removes base.bundle.
 *
 * Nothing but this test couples them, and a handler added to only one silently
 * ships a page whose Submit button renders but does nothing in the other
 * format. That is exactly how `initializeCustomActivity` came to be missing
 * from the activities bundle.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function initializerCalls(relativePath: string): Set<string> {
  const source = fs
    .readFileSync(path.join(SRC, relativePath), "utf-8")
    // Strip comments so a call that was commented out doesn't count as wired.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
  const calls = new Set<string>()
  for (const m of source.matchAll(/\b(initialize\w*Activity)\(\)/g)) {
    calls.add(m[1])
  }
  return calls
}

describe("activity initializers", () => {
  it("are called by both the web runtime and the standalone activities bundle", () => {
    const lifecycle = initializerCalls("app/lifecycle.ts")
    const activitiesEntry = initializerCalls("activities-entry.tsx")

    expect(lifecycle.size).toBeGreaterThan(0)
    const missing = [...lifecycle].filter((name) => !activitiesEntry.has(name))
    expect(missing).toEqual([])
  })
})
