import { expect, it } from "vitest"
import { tabAfterClose } from "./use-reader-workspace"

it("closing the active tab activates its right neighbor, then its left one", () => {
  const tabs = ["a.ts", "b.ts", "c.ts"]
  expect(tabAfterClose(tabs, "b.ts", "b.ts")).toBe("c.ts")
  expect(tabAfterClose(tabs, "c.ts", "c.ts")).toBe("b.ts")
  expect(tabAfterClose(["a.ts"], "a.ts", "a.ts")).toBeNull()
  expect(tabAfterClose(tabs, "a.ts", "c.ts")).toBe("c.ts")
})
