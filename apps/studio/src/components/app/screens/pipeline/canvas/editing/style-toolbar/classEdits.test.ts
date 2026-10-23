import { describe, expect, it } from "vitest"
import {
  backgroundColorClassMap,
  fontSizeClassMap,
  fontWeightClassMap,
  lineHeightClassMap,
  marginClassMap,
  paddingClassMap,
  textColorClassMap,
  textDecorationClassMap,
} from "@/components/pipeline/stages/storyboard/components/style-editor/class-maps"
import { applyEdits, edit, readValue, selfAlignClassMap, withoutZeroSides } from "./classEdits"

describe("applyEdits", () => {
  it("replaces the matching classes on desktop and keeps the rest", () => {
    const next = applyEdits(["text-base", "font-normal", "mt-4"], "desktop", [edit(fontWeightClassMap, "bold")])
    expect(next).toEqual(["text-base", "mt-4", "font-bold"])
  })

  it("writes a size step as the Tailwind token", () => {
    expect(applyEdits(["text-base"], "desktop", [edit(fontSizeClassMap, 18)])).toEqual(["text-lg"])
  })

  it("keeps an explicit line height when re-applied after a size change", () => {
    const next = applyEdits(["text-base", "leading-loose"], "desktop", [edit(fontSizeClassMap, 20), edit(lineHeightClassMap, 2)])
    expect(next).toEqual(["text-xl", "leading-loose"])
  })

  it("scopes edits to the viewport prefix and leaves wider breakpoints alone", () => {
    const next = applyEdits(["text-lg", "max-lg:text-sm"], "tablet", [edit(fontSizeClassMap, 16)])
    expect(next).toEqual(["text-lg", "max-lg:text-base"])
  })

  it("removes a colour when set back to the default", () => {
    expect(applyEdits(["text-[#ff0000]", "p-2"], "desktop", [edit(textColorClassMap, "")])).toEqual(["p-2"])
    expect(applyEdits([], "desktop", [edit(backgroundColorClassMap, "#00aa00")])).toEqual(["bg-[#00aa00]"])
  })

  it("toggles decorations as one class set", () => {
    expect(applyEdits(["italic"], "desktop", [edit(textDecorationClassMap, ["italic", "underline"])])).toEqual(["italic", "underline"])
    expect(applyEdits(["italic", "underline"], "desktop", [edit(textDecorationClassMap, ["underline"])])).toEqual(["underline"])
  })

  it("drops zero sides from a margin edit", () => {
    const change = withoutZeroSides(edit(marginClassMap, { t: 0, r: 0, b: 16, l: 0 }))
    expect(applyEdits(["mb-2"], "desktop", [change])).toEqual(["mb-4"])
  })

  it("writes uniform padding as one class", () => {
    expect(applyEdits(["px-2", "py-4"], "desktop", [edit(paddingClassMap, { t: 8, r: 8, b: 8, l: 8 })])).toEqual(["p-2"])
  })
})

describe("readValue", () => {
  it("falls back through the cascade for smaller viewports", () => {
    expect(readValue(["text-lg"], "mobile", fontSizeClassMap)).toBe(18)
    expect(readValue(["text-lg", "max-sm:text-sm"], "mobile", fontSizeClassMap)).toBe(14)
    expect(readValue(["text-lg", "max-sm:text-sm"], "tablet", fontSizeClassMap)).toBe(18)
  })

  it("returns null when nothing is set", () => {
    expect(readValue(["p-2"], "desktop", textColorClassMap)).toBeNull()
  })
})

describe("selfAlignClassMap", () => {
  it("round-trips the auto margins", () => {
    expect(selfAlignClassMap.fromClasses(["mx-auto"])).toBe("center")
    expect(selfAlignClassMap.fromClasses(["mr-auto"])).toBe("left")
    expect(applyEdits(["mx-auto", "w-[50%]"], "desktop", [edit(selfAlignClassMap, "right")])).toEqual(["w-[50%]", "ml-auto"])
  })
})
