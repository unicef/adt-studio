import { describe, expect, it } from "vitest"
import {
  positionClassMap,
  insetClassMap,
  rotateClassMap,
  translateXClassMap,
  translateYClassMap,
  scaleClassMap,
} from "./position"

describe("positionClassMap", () => {
  it("reads the CSS position keyword", () => {
    expect(positionClassMap.fromClasses(["p-4", "absolute"])).toBe("absolute")
    expect(positionClassMap.fromClasses(["flex"])).toBeNull()
  })

  it("emits nothing for the default static", () => {
    expect(positionClassMap.toClasses("static")).toEqual([])
    expect(positionClassMap.toClasses("relative")).toEqual(["relative"])
  })
})

describe("insetClassMap", () => {
  it("reads per-side, axis and all-sides forms including negatives", () => {
    expect(insetClassMap.fromClasses(["top-4"])).toEqual({ t: 16, r: 0, b: 0, l: 0 })
    expect(insetClassMap.fromClasses(["-left-2"])).toEqual({ t: 0, r: 0, b: 0, l: -8 })
    expect(insetClassMap.fromClasses(["inset-x-4"])).toEqual({ t: 0, r: 16, b: 0, l: 16 })
    expect(insetClassMap.fromClasses(["inset-2"])).toEqual({ t: 8, r: 8, b: 8, l: 8 })
    expect(insetClassMap.fromClasses(["top-[13px]"])).toEqual({ t: 13, r: 0, b: 0, l: 0 })
  })

  it("writes the most compact form", () => {
    expect(insetClassMap.toClasses({ t: 0, r: 0, b: 0, l: 0 })).toEqual([])
    expect(insetClassMap.toClasses({ t: 8, r: 8, b: 8, l: 8 })).toEqual(["inset-2"])
    expect(insetClassMap.toClasses({ t: 16, r: 8, b: 16, l: 8 })).toEqual([
      "inset-x-2",
      "inset-y-4",
    ])
    expect(insetClassMap.toClasses({ t: 16, r: 0, b: 0, l: -8 })).toEqual([
      "top-4",
      "-left-2",
    ])
    expect(insetClassMap.toClasses({ t: 13, r: 0, b: 0, l: 0 })).toEqual(["top-[13px]"])
  })

  it("round-trips arbitrary and off-scale values", () => {
    const value = { t: 5, r: -13, b: 0, l: 0 }
    expect(insetClassMap.fromClasses(insetClassMap.toClasses(value))).toEqual(value)
  })

  it("only matches px-representable insets, leaving other utilities untouched", () => {
    // Tailwind v4 ring/shadow utilities that share the `inset-` prefix
    expect(insetClassMap.matches("inset-ring-2")).toBe(false)
    expect(insetClassMap.matches("inset-shadow-sm")).toBe(false)
    expect(insetClassMap.matches("-inset-ring-2")).toBe(false)
    // fraction / keyword insets the px control can't represent (centering idiom)
    expect(insetClassMap.matches("top-1/2")).toBe(false)
    expect(insetClassMap.matches("left-1/2")).toBe(false)
    expect(insetClassMap.matches("inset-auto")).toBe(false)
    expect(insetClassMap.matches("top-full")).toBe(false)
    // px-representable insets are matched
    expect(insetClassMap.matches("inset-4")).toBe(true)
    expect(insetClassMap.matches("top-[13px]")).toBe(true)
    expect(insetClassMap.matches("-left-2")).toBe(true)
    // an unrepresentable utility alongside a px offset must survive untouched
    expect(insetClassMap.fromClasses(["inset-ring-2", "top-1/2", "top-4"])).toEqual({
      t: 16,
      r: 0,
      b: 0,
      l: 0,
    })
  })
})

describe("rotateClassMap", () => {
  it("reads and normalizes rotation to 0..359", () => {
    expect(rotateClassMap.fromClasses(["rotate-90"])).toBe(90)
    expect(rotateClassMap.fromClasses(["-rotate-90"])).toBe(270)
    expect(rotateClassMap.fromClasses(["rotate-[270deg]"])).toBe(270)
    expect(rotateClassMap.fromClasses(["flex"])).toBeNull()
  })

  it("emits readable classes for the quarter turns", () => {
    expect(rotateClassMap.toClasses(0)).toEqual([])
    expect(rotateClassMap.toClasses(90)).toEqual(["rotate-90"])
    expect(rotateClassMap.toClasses(180)).toEqual(["rotate-180"])
    expect(rotateClassMap.toClasses(270)).toEqual(["-rotate-90"])
    // wraps past a full turn
    expect(rotateClassMap.toClasses(360)).toEqual([])
    expect(rotateClassMap.toClasses(-90)).toEqual(["-rotate-90"])
  })

  it("does not match 3D rotate utilities", () => {
    expect(rotateClassMap.matches("rotate-x-45")).toBe(false)
    expect(rotateClassMap.matches("rotate-90")).toBe(true)
  })
})

describe("translate maps", () => {
  it("read and write signed offsets", () => {
    expect(translateXClassMap.fromClasses(["translate-x-4"])).toBe(16)
    expect(translateXClassMap.fromClasses(["-translate-x-2"])).toBe(-8)
    expect(translateXClassMap.toClasses(0)).toEqual([])
    expect(translateXClassMap.toClasses(16)).toEqual(["translate-x-4"])
    expect(translateXClassMap.toClasses(-8)).toEqual(["-translate-x-2"])
    expect(translateYClassMap.toClasses(13)).toEqual(["translate-y-[13px]"])
  })

  it("ignores the other axis", () => {
    expect(translateXClassMap.fromClasses(["translate-y-4"])).toBeNull()
  })

  it("leaves fraction / keyword translates untouched", () => {
    expect(translateXClassMap.matches("-translate-x-1/2")).toBe(false)
    expect(translateXClassMap.matches("translate-x-full")).toBe(false)
    expect(translateYClassMap.matches("-translate-y-1/2")).toBe(false)
    expect(translateXClassMap.matches("translate-x-4")).toBe(true)
    expect(translateXClassMap.matches("-translate-x-[13px]")).toBe(true)
  })
})

describe("scaleClassMap", () => {
  it("reads token and arbitrary scales as percentages", () => {
    expect(scaleClassMap.fromClasses(["scale-110"])).toBe(110)
    expect(scaleClassMap.fromClasses(["scale-[1.7]"])).toBe(170)
    expect(scaleClassMap.fromClasses(["scale-x-50"])).toBeNull()
  })

  it("emits nothing for 100% and tokens where available", () => {
    expect(scaleClassMap.toClasses(100)).toEqual([])
    expect(scaleClassMap.toClasses(110)).toEqual(["scale-110"])
    expect(scaleClassMap.toClasses(170)).toEqual(["scale-[1.7]"])
  })
})
