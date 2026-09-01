import { describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { invalidateStoryboardDependents } from "./use-page-mutations"
import { readingOrderKey } from "./use-reading-order"

/**
 * Every structural operation on the storyboard — clone, split, merge, delete,
 * prune/unprune — and every re-render task completion routes through this one
 * helper. The reading order is derived from exactly what those change, so it has
 * to be part of what the helper refreshes.
 *
 * The bug this pins: re-adding a removed page submits a re-render, and the order
 * only gains that page's position once the render lands. Without this
 * invalidation the sidebar kept showing the stale order until something
 * unrelated happened to refetch it — moving another page, say.
 */
describe("invalidateStoryboardDependents", () => {
  function capture() {
    const client = new QueryClient()
    const spy = vi.spyOn(client, "invalidateQueries").mockReturnValue(Promise.resolve())
    invalidateStoryboardDependents(client, "my-book")
    return spy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey))
  }

  it("refreshes the reading order", () => {
    expect(capture()).toContain(JSON.stringify(readingOrderKey("my-book")))
  })

  it("still refreshes the rest of the storyboard's dependents", () => {
    const keys = capture()
    for (const key of [
      ["books", "my-book", "easy-read"],
      ["books", "my-book", "text-catalog"],
      ["books", "my-book", "tts"],
      ["books", "my-book", "step-status"],
      ["package-adt-status", "my-book"],
    ]) {
      expect(keys).toContain(JSON.stringify(key))
    }
  })
})
