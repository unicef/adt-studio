import { describe, it, expect } from "vitest"
import { classifyPageImages, buildImageClassifyConfig } from "../image-classification.js"
import type { ImageClassifyConfig } from "../image-classification.js"
import type { ImageData } from "@adt/storage"
import type { AppConfig } from "@adt/types"

function makeImage(imageId: string, width: number, height: number): ImageData {
  return { imageId, width, height }
}

describe("classifyPageImages", () => {
  const defaultConfig: ImageClassifyConfig = {
    filters: { min_side: 100, max_side: 5000 },
  }

  it("prunes full-page renders", () => {
    const images = [makeImage("pg001_page", 800, 600)]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toEqual({
      imageId: "pg001_page",
      isPruned: true,
      reason: "full-page render",
    })
  })

  it("keeps images within size bounds", () => {
    const images = [makeImage("pg001_im001", 400, 300)]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: false,
    })
  })

  it("prunes images with shortest side below min_side", () => {
    const images = [makeImage("pg001_im001", 200, 50)]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "shortest side 50px < min_side 100px",
    })
  })

  it("prunes images with longest side above max_side", () => {
    const images = [makeImage("pg001_im001", 6000, 3000)]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "longest side 6000px > max_side 5000px",
    })
  })

  it("checks min_side before max_side", () => {
    // Image with both short side < min and long side > max: min_side triggers first
    const images = [makeImage("pg001_im001", 6000, 50)]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images[0].reason).toContain("min_side")
  })

  it("handles empty image list", () => {
    const result = classifyPageImages("pg001", [], defaultConfig)
    expect(result.images).toHaveLength(0)
  })

  it("classifies multiple images per page", () => {
    const images = [
      makeImage("pg001_page", 800, 600),
      makeImage("pg001_im001", 400, 300),
      makeImage("pg001_im002", 20, 20),
      makeImage("pg001_im003", 6000, 4000),
    ]
    const result = classifyPageImages("pg001", images, defaultConfig)

    expect(result.images).toHaveLength(4)
    expect(result.images[0].isPruned).toBe(true) // full-page render
    expect(result.images[1].isPruned).toBe(false) // good size
    expect(result.images[2].isPruned).toBe(true) // too small
    expect(result.images[3].isPruned).toBe(true) // too big
  })

  it("skips min_side check when not configured", () => {
    const config: ImageClassifyConfig = { filters: { max_side: 5000 } }
    const images = [makeImage("pg001_im001", 10, 5)]
    const result = classifyPageImages("pg001", images, config)

    expect(result.images[0].isPruned).toBe(false)
  })

  it("skips max_side check when not configured", () => {
    const config: ImageClassifyConfig = { filters: { min_side: 100 } }
    const images = [makeImage("pg001_im001", 10000, 8000)]
    const result = classifyPageImages("pg001", images, config)

    expect(result.images[0].isPruned).toBe(false)
  })

  it("keeps all non-page images when no filters configured", () => {
    const config: ImageClassifyConfig = { filters: {} }
    const images = [
      makeImage("pg001_page", 800, 600),
      makeImage("pg001_im001", 10, 5),
      makeImage("pg001_im002", 10000, 8000),
    ]
    const result = classifyPageImages("pg001", images, config)

    expect(result.images[0].isPruned).toBe(true) // page render always pruned
    expect(result.images[1].isPruned).toBe(false)
    expect(result.images[2].isPruned).toBe(false)
  })

  it("uses min of width/height for min_side check", () => {
    const config: ImageClassifyConfig = { filters: { min_side: 100 } }

    // Portrait: width=80, height=200 → shortSide=80 < 100 → pruned
    const portrait = classifyPageImages("pg001", [makeImage("pg001_im001", 80, 200)], config)
    expect(portrait.images[0].isPruned).toBe(true)

    // Landscape: width=200, height=80 → shortSide=80 < 100 → pruned
    const landscape = classifyPageImages("pg001", [makeImage("pg001_im001", 200, 80)], config)
    expect(landscape.images[0].isPruned).toBe(true)

    // Both sides above: width=150, height=120 → shortSide=120 ≥ 100 → kept
    const ok = classifyPageImages("pg001", [makeImage("pg001_im001", 150, 120)], config)
    expect(ok.images[0].isPruned).toBe(false)
  })

  it("uses max of width/height for max_side check", () => {
    const config: ImageClassifyConfig = { filters: { max_side: 5000 } }

    // Portrait: width=3000, height=6000 → longSide=6000 > 5000 → pruned
    const portrait = classifyPageImages("pg001", [makeImage("pg001_im001", 3000, 6000)], config)
    expect(portrait.images[0].isPruned).toBe(true)

    // Landscape: width=6000, height=3000 → longSide=6000 > 5000 → pruned
    const landscape = classifyPageImages("pg001", [makeImage("pg001_im001", 6000, 3000)], config)
    expect(landscape.images[0].isPruned).toBe(true)

    // Both sides below: width=4000, height=3000 → longSide=4000 ≤ 5000 → kept
    const ok = classifyPageImages("pg001", [makeImage("pg001_im001", 4000, 3000)], config)
    expect(ok.images[0].isPruned).toBe(false)
  })

  it("handles edge case: image exactly at min_side boundary", () => {
    const config: ImageClassifyConfig = { filters: { min_side: 100 } }
    const images = [makeImage("pg001_im001", 100, 200)]
    const result = classifyPageImages("pg001", images, config)

    // Exactly 100 is not < 100, so kept
    expect(result.images[0].isPruned).toBe(false)
  })

  it("handles edge case: image exactly at max_side boundary", () => {
    const config: ImageClassifyConfig = { filters: { max_side: 5000 } }
    const images = [makeImage("pg001_im001", 5000, 3000)]
    const result = classifyPageImages("pg001", images, config)

    // Exactly 5000 is not > 5000, so kept
    expect(result.images[0].isPruned).toBe(false)
  })
})

describe("buildImageClassifyConfig", () => {
  it("extracts image_filters from AppConfig", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { min_side: 50, max_side: 3000 },
    }

    const config = buildImageClassifyConfig(appConfig)
    expect(config.filters).toEqual({ min_side: 50, max_side: 3000 })
  })

  it("defaults to empty filters when image_filters not set", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildImageClassifyConfig(appConfig)
    expect(config.filters).toEqual({})
  })
})
