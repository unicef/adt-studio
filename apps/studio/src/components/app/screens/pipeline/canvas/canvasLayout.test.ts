import { describe, expect, it } from "vitest"
import {
  CANVAS_PADDING,
  CAPTURE_WIDTH,
  DEVICE_FIT_MAX_SCALE,
  DEVICE_MIN_FIT_SCALE,
  DEVICE_PADDING,
  DOCK_CLEARANCE,
  DOCK_HANDLE_CLEARANCE,
  FIT_MAX_SCALE,
  canvasContentWidth,
  canvasDeviceFit,
  canvasPageScale,
  desktopFitScale,
  deviceAvailable,
  deviceFitScale,
} from "./canvasLayout"

const pane = (width: number, height = 900) => ({ width, height })

describe("desktopFitScale", () => {
  it("shrinks the page to fit a narrow canvas", () => {
    expect(desktopFitScale(pane(800))).toBeCloseTo((800 - CANVAS_PADDING) / CAPTURE_WIDTH.desktop)
  })

  it("is exactly natural size when the canvas fits the page plus padding", () => {
    expect(desktopFitScale(pane(CAPTURE_WIDTH.desktop + CANVAS_PADDING))).toBe(1)
  })

  it("grows past natural size on big canvases, up to the fit cap", () => {
    expect(desktopFitScale(pane(1648))).toBeCloseTo(1.25)
    expect(desktopFitScale(pane(3120))).toBe(FIT_MAX_SCALE)
    expect(desktopFitScale(pane(4800))).toBe(FIT_MAX_SCALE)
  })

  it("falls back to a laptop-sized canvas before the pane is measured", () => {
    expect(desktopFitScale(pane(0, 0))).toBeCloseTo(760 / CAPTURE_WIDTH.desktop)
  })
})

describe("canvasContentWidth", () => {
  it("hugs the rendered page width at fit", () => {
    const width = 1978
    const scale = desktopFitScale(pane(width))
    expect(canvasContentWidth("desktop", pane(width), 1)).toBe(Math.round(CAPTURE_WIDTH.desktop * scale))
  })

  it("never leaves card area beside the page on wide canvases", () => {
    for (const width of [1400, 1922, 2496, 3120, 4400]) {
      const content = canvasContentWidth("desktop", pane(width), 1)
      expect(content).toBeLessThanOrEqual(Math.round(CAPTURE_WIDTH.desktop * FIT_MAX_SCALE))
      expect(content).toBe(Math.round(CAPTURE_WIDTH.desktop * canvasPageScale("desktop", pane(width), 1)))
    }
  })

  it("multiplies the fit by the zoom so zooming in really enlarges the page", () => {
    const fit = desktopFitScale(pane(1978))
    expect(canvasPageScale("desktop", pane(1978), 2)).toBeCloseTo(fit * 2)
    expect(canvasContentWidth("desktop", pane(1978), 2)).toBe(Math.round(CAPTURE_WIDTH.desktop * fit * 2))
  })

  it("keeps device views at their capture width (the device frame scales them)", () => {
    expect(canvasContentWidth("tablet", pane(3000), 2)).toBe(CAPTURE_WIDTH.tablet)
    expect(canvasContentWidth("mobile", pane(600), 0.5)).toBe(CAPTURE_WIDTH.mobile)
  })
})

describe("deviceFitScale", () => {
  const tablet = { chromeWidth: 850, chromeHeight: 1100 }

  it("fits the device to the canvas height", () => {
    expect(deviceFitScale(tablet, { width: 3000, height: 1100 })).toBe(1)
    expect(deviceFitScale(tablet, { width: 3000, height: 880 })).toBeCloseTo(0.8)
  })

  it("grows past natural size on tall canvases, up to the device cap", () => {
    expect(deviceFitScale(tablet, { width: 3000, height: 1650 })).toBeCloseTo(1.5)
    expect(deviceFitScale(tablet, { width: 3000, height: 4000 })).toBe(DEVICE_FIT_MAX_SCALE)
  })

  it("does not shrink below the legibility floor because of height, scrolling instead", () => {
    expect(deviceFitScale(tablet, { width: 1000, height: 500 })).toBe(DEVICE_MIN_FIT_SCALE)
  })

  it("still fits the width when the canvas is too narrow for the device", () => {
    expect(deviceFitScale(tablet, { width: 425, height: 500 })).toBeCloseTo(0.5)
  })

  it("renders at natural size before the canvas is measured", () => {
    expect(deviceFitScale(tablet, { width: -48, height: -160 })).toBe(1)
  })
})

describe("deviceAvailable", () => {
  it("reserves room for the dock below the device", () => {
    expect(deviceAvailable(pane(1000, 800), false)).toEqual({
      width: 1000 - CANVAS_PADDING,
      height: 800 - DEVICE_PADDING - DOCK_CLEARANCE,
    })
    expect(deviceAvailable(pane(1000, 800), true).height).toBe(800 - DEVICE_PADDING - DOCK_HANDLE_CLEARANCE)
  })

  it("lets a tablet use a 4K canvas and keeps it legible at 1280×720", () => {
    expect(canvasDeviceFit("tablet", deviceAvailable(pane(3120, 2108), false))).toBeGreaterThan(1.6)
    expect(canvasDeviceFit("mobile", deviceAvailable(pane(3120, 2108), false))).toBe(DEVICE_FIT_MAX_SCALE)
    expect(canvasDeviceFit("tablet", deviceAvailable(pane(1048, 668), false))).toBe(DEVICE_MIN_FIT_SCALE)
  })
})
