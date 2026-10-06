// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { EFFECTS_KEY, effectsReduced, initEffects, lowEndReasons, markNoticeSeen, pendingNotice, readEffectsMode, readNoticeSeen, REDUCED_CLASS, resolvesToReduced, setEffectsMode } from "./effects"

const isReduced = () => document.documentElement.classList.contains(REDUCED_CLASS)
const strong = { cores: 10, memoryGb: 16, softwareRendering: false }
const weak = { cores: 4, memoryGb: 8, softwareRendering: false }

function mockSystemMotion(reduce: boolean, onChange?: (cb: () => void) => void) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: reduce,
      addEventListener: (_: string, cb: () => void) => onChange?.(cb),
      removeEventListener: () => {},
    }),
  })
}

function mockHardware(hw: typeof strong | undefined) {
  window.api = { ...(window.api ?? {}), hardware: hw } as Window["api"]
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove(REDUCED_CLASS)
  mockSystemMotion(false)
  mockHardware(strong)
})

afterEach(() => {
  document.documentElement.classList.remove(REDUCED_CLASS)
})

describe("low-end detection", () => {
  it("flags few cores, little memory and software rendering, strongest first", () => {
    expect(lowEndReasons(strong)).toEqual([])
    expect(lowEndReasons({ cores: 4, memoryGb: 4, softwareRendering: true })).toEqual(["software-rendering", "cores", "memory"])
    expect(lowEndReasons({ cores: 6, memoryGb: 8 })).toEqual([])
  })

  it("ignores what the machine doesn't report", () => {
    expect(lowEndReasons({})).toEqual([])
  })
})

describe("reduce effects preference", () => {
  it("defaults to Auto and ignores garbage", () => {
    expect(readEffectsMode()).toBe("auto")
    localStorage.setItem(EFFECTS_KEY, "sometimes")
    expect(readEffectsMode()).toBe("auto")
  })

  it("Auto follows the hardware", () => {
    expect(resolvesToReduced("auto", strong)).toBe(false)
    expect(resolvesToReduced("auto", weak)).toBe(true)
  })

  it("Auto follows the OS motion setting", () => {
    mockSystemMotion(true)
    expect(resolvesToReduced("auto", strong)).toBe(true)
  })

  it("On and Off override the hardware", () => {
    expect(resolvesToReduced("on", strong)).toBe(true)
    expect(resolvesToReduced("off", weak)).toBe(false)
  })

  it("stores the choice and paints it", () => {
    setEffectsMode("on")
    expect(localStorage.getItem(EFFECTS_KEY)).toBe("on")
    expect(isReduced()).toBe(true)
    setEffectsMode("off")
    expect(isReduced()).toBe(false)
  })

  it("the OS motion setting still reduces animations when effects are Off", () => {
    mockSystemMotion(true)
    setEffectsMode("off")
    expect(isReduced()).toBe(false)
    expect(effectsReduced()).toBe(true)
  })

  it("repaints Auto when the OS motion setting changes", () => {
    let fire = () => {}
    mockSystemMotion(false, (cb) => (fire = cb))
    initEffects()
    expect(isReduced()).toBe(false)
    mockSystemMotion(true)
    fire()
    expect(isReduced()).toBe(true)
  })

  it("falls back to what the browser reports outside the desktop app", () => {
    mockHardware(undefined)
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 2 })
    expect(resolvesToReduced("auto")).toBe(true)
  })
})

describe("reduced-effects notice", () => {
  it("tells the user once when Auto turns effects down for the hardware", () => {
    expect(pendingNotice("auto", ["cores"], null)).toEqual(["cores"])
    markNoticeSeen(["cores"])
    expect(pendingNotice("auto", ["cores"], readNoticeSeen())).toEqual([])
  })

  it("tells them again only when the reasons change", () => {
    markNoticeSeen(["memory", "cores"])
    expect(pendingNotice("auto", ["cores", "memory"], readNoticeSeen())).toEqual([])
    expect(pendingNotice("auto", ["software-rendering", "cores", "memory"], readNoticeSeen())).toHaveLength(3)
  })

  it("stays quiet when the user chose it, or the machine isn't low-end", () => {
    expect(pendingNotice("on", ["cores"], null)).toEqual([])
    expect(pendingNotice("off", ["cores"], null)).toEqual([])
    expect(pendingNotice("auto", [], null)).toEqual([])
  })
})
