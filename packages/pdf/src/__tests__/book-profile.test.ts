import { describe, expect, it } from "vitest"
import { profileBook, profileBookAsync } from "../book-profile.js"
import { createWatermarkedTestPdf } from "./create-test-pdf.js"

describe("profileBookAsync", () => {
  const pdf = new Uint8Array(createWatermarkedTestPdf(6))
  const strip = <T extends { ms: number }>(p: T) => ({ ...p, ms: 0 })

  it("gives the same profile as profileBook", async () => {
    expect(strip(await profileBookAsync(pdf))).toEqual(strip(profileBook(pdf)))
    expect(strip(await profileBookAsync(pdf, { range: { start: 2, end: 4 }, pagesPerTurn: 1 }))).toEqual(strip(profileBook(pdf, { start: 2, end: 4 })))
  })

  it("lets other work run between pages", async () => {
    let ticks = 0
    const timer = setInterval(() => ticks++, 0)
    await profileBookAsync(pdf, { pagesPerTurn: 1 })
    clearInterval(timer)
    // A synchronous pass would leave no turn for the timer; one page per turn leaves several.
    expect(ticks).toBeGreaterThan(0)
  })

  it("stops when the request is cancelled", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(profileBookAsync(pdf, { signal: controller.signal, pagesPerTurn: 1 })).rejects.toThrow()
  })
})
