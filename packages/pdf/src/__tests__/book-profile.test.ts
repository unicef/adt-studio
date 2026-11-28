import { describe, expect, it } from "vitest"
import { profileBookAsync, renderBookPagesAsync } from "../book-profile.js"
import { createWatermarkedTestPdf } from "./create-test-pdf.js"

describe("profileBookAsync", () => {
  const pdf = new Uint8Array(createWatermarkedTestPdf(6))
  const strip = <T extends { ms: number }>(p: T) => ({ ...p, ms: 0 })

  it("gives the same profile however many pages it reads per turn", async () => {
    const profile = await profileBookAsync(pdf, { pagesPerTurn: 100 })
    expect(profile.pageCount).toBe(6)
    expect(profile.pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6])
    expect(strip(await profileBookAsync(pdf, { pagesPerTurn: 1 }))).toEqual(strip(profile))
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

describe("renderBookPagesAsync", () => {
  const pdf = new Uint8Array(createWatermarkedTestPdf(4))

  it("renders every set from one pass, each page at its set's size", async () => {
    const [small, large] = await renderBookPagesAsync(pdf, [
      { pages: [1, 2, 3], size: 64 },
      { pages: [2, 4], size: 128 },
    ], { format: "png" })
    expect([...small.keys()]).toEqual([1, 2, 3])
    expect([...large.keys()]).toEqual([2, 4])
    // PNG width is at bytes 16-19: the longest side follows the set's size.
    const longest = (png: Uint8Array) => Math.max(new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20))
    expect(longest(small.get(2)!)).toBeLessThanOrEqual(64)
    expect(longest(large.get(2)!)).toBeGreaterThan(64)
  })

  it("fails on a page the PDF doesn't have", async () => {
    await expect(renderBookPagesAsync(pdf, [{ pages: [99], size: 64 }])).rejects.toThrow()
  })
})
