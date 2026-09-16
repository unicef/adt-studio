import { describe, it, expect } from "vitest"
import { repairOverlayStacking } from "../overlay-stacking-repair.js"

function classOf(html: string, marker: string): string {
  const re = new RegExp(`<div class="([^"]*)"[^>]*>\\s*<p data-id="${marker}"`)
  return html.match(re)?.[1] ?? ""
}

describe("repairOverlayStacking", () => {
  it("lifts an unpositioned text block above a full-bleed image sibling", () => {
    const html =
      '<section class="relative"><div class="flex flex-col">' +
      '<div class="w-full max-w-5xl text-[#2f2d2c]"><p data-id="n1">A menina gritou.</p></div>' +
      '<img data-id="im1" src="x.jpg" alt="" class="absolute inset-0 h-full w-full object-cover">' +
      '<div class="relative z-10 text-white"><p data-id="n2">La embaixo.</p></div>' +
      "</div></section>"

    const out = repairOverlayStacking(html)

    expect(classOf(out, "n1")).toContain("relative")
    expect(classOf(out, "n1")).toContain("z-10")
    expect(classOf(out, "n2")).toBe("relative z-10 text-white")
  })

  it("outranks a decorative image that shares the text column's z-index", () => {
    const html =
      '<section class="relative overflow-hidden">' +
      '<div class="relative z-10 mx-auto flex max-w-[1040px] flex-col"><p data-id="n1">Ela foi ate a pedra.</p></div>' +
      '<img data-id="im1" src="x.jpg" alt="" class="absolute bottom-[8%] right-[8%] z-10 w-[19%]">' +
      "</section>"

    const out = repairOverlayStacking(html)

    expect(out).toContain('class="relative mx-auto flex max-w-[1040px] flex-col z-20"')
  })

  it("lifts text above an aria-hidden page-number tab", () => {
    const html =
      '<section class="relative bg-[#efe2cf]">' +
      '<div class="mx-auto max-w-[1020px]"><p data-id="n1">Foi quando Gaia tinha dois anos.</p></div>' +
      '<div aria-hidden="true" class="absolute left-0 top-1/2 h-12 w-[122px] bg-[#e7b300]"></div>' +
      "</section>"

    const out = repairOverlayStacking(html)

    expect(classOf(out, "n1")).toContain("relative")
    expect(classOf(out, "n1")).toContain("z-10")
  })

  it("treats a digits-only tab as decorative and outranks its z-index", () => {
    const html =
      '<section class="relative">' +
      '<div class="relative z-10 mx-auto flex w-full max-w-5xl flex-col"><p data-id="n1">Esse dialogo.</p></div>' +
      '<div class="absolute left-0 top-[48%] z-10"><div class="flex h-12 w-24 bg-[#e3b11e]">76</div></div>' +
      "</section>"

    const out = repairOverlayStacking(html)

    expect(out).toContain('class="relative mx-auto flex w-full max-w-5xl flex-col z-20"')
    expect(out).toContain(">76<")
  })

  it("leaves an anchored text overlay that already paints after the image", () => {
    const html =
      '<section class="relative"><div class="relative">' +
      '<img data-id="im1" src="x.jpg" alt="" class="block h-auto w-full">' +
      '<div class="pointer-events-none absolute inset-0"><p data-id="n1">Gaia?</p></div>' +
      "</div></section>"

    expect(repairOverlayStacking(html)).toBe(html)
  })

  it("leaves markup with no positioned overlays untouched", () => {
    const html =
      '<section class="w-full"><div class="mx-auto"><p data-id="n1">Texto simples.</p></div></section>'

    expect(repairOverlayStacking(html)).toBe(html)
  })

  it("leaves text that already outranks the overlay", () => {
    const html =
      '<section class="relative">' +
      '<div class="relative z-30"><p data-id="n1">Ja esta acima.</p></div>' +
      '<img data-id="im1" src="x.jpg" alt="" class="absolute inset-0 z-10">' +
      "</section>"

    expect(repairOverlayStacking(html)).toBe(html)
  })

  it("lifts the sibling that competes with the overlay, not a nested descendant", () => {
    const html =
      '<section class="relative">' +
      '<div class="relative z-10 wrapper"><div class="inner"><p data-id="n1">Texto.</p></div></div>' +
      '<img data-id="im1" src="x.jpg" alt="" class="absolute inset-0 z-10">' +
      "</section>"

    const out = repairOverlayStacking(html)

    expect(out).toContain('class="relative wrapper z-20"')
    expect(out).toContain('class="inner"')
  })

  it("is idempotent", () => {
    const html =
      '<section class="relative"><div class="flex">' +
      '<div class="text-block"><p data-id="n1">Uma vez.</p></div>' +
      '<img data-id="im1" src="x.jpg" alt="" class="absolute inset-0">' +
      "</div></section>"

    const once = repairOverlayStacking(html)
    expect(repairOverlayStacking(once)).toBe(once)
  })

  it("preserves the section contract attributes", () => {
    const html =
      '<section data-section-id="pg054_sec001" data-section-type="text_and_single_image" class="relative">' +
      '<div class="col"><p data-id="pg054_n0002">A menina.</p></div>' +
      '<img data-id="pg054_im002" src="images/x.jpg" alt="" class="absolute inset-0">' +
      "</section>"

    const out = repairOverlayStacking(html)

    expect(out).toContain('data-section-id="pg054_sec001"')
    expect(out).toContain('data-section-type="text_and_single_image"')
    expect(out).toContain('data-id="pg054_n0002"')
    expect(out).toContain('data-id="pg054_im002"')
  })
})
