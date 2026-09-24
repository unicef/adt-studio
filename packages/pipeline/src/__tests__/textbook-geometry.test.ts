import { describe, expect, it } from "vitest"
import type { TextbookGeometryPlan } from "@adt/types"
import { applyTextbookGeometryPlan, textbookGeometryPlanErrors } from "../textbook-geometry.js"

const plan: TextbookGeometryPlan = {
  reasoning: "Focused geometry",
  images: [
    {
      image_id: "bank",
      role: "worksheet_form_composite",
      keep_visible: false,
      crop: null,
      baked_text_ids: [],
      text_regions: [],
      writable_regions: [],
      reasoning: "Semantic number bank",
    },
    {
      image_id: "figure",
      role: "worksheet_form_composite",
      keep_visible: true,
      crop: { x: 40, y: 50, width: 320, height: 400 },
      baked_text_ids: ["figure-label"],
      text_regions: [{
        text_id: "figure-label",
        legibility: "complete",
        x: 60,
        y: 70,
        width: 80,
        height: 20,
      }],
      writable_regions: [
        { purpose: "answer blank", x: 152, y: 250, width: 96, height: 40 },
      ],
      reasoning: "Essential figure with one blank",
    },
  ],
}

const images = [
  { image_id: "bank", image_url: "/bank", width: 800, height: 100 },
  { image_id: "figure", image_url: "/figure", width: 400, height: 500 },
]

describe("textbookGeometryPlanErrors", () => {
  it("applies the plan as stable crop and overlay HTML", () => {
    const source = '<section><div><img data-id="bank" src="/bank"><span data-id="bank-text">25</span></div><div class="relative aspect-[400/500]"><img data-id="figure" src="/figure" class="w-full"><input id="old" data-activity-item="item-1" class="absolute left-[1%] top-[1%] w-[5%] h-[5%] min-h-11"><span data-id="figure-label" class="sr-only">Label</span></div></section>'
    const adapted = applyTextbookGeometryPlan(source, plan, images)

    expect(adapted).not.toContain('data-id="bank"')
    expect(adapted).toContain('data-textbook-crop="true"')
    expect(adapted).toContain('aspect-[320/400]')
    expect(adapted).toContain('left-[35%]')
    expect(adapted).toContain('top-[50%]')
    expect(adapted).toContain('data-activity-item="item-1"')
    expect(adapted).not.toContain("min-h-11")
    expect(adapted).toContain('</div><span data-id="figure-label" class="sr-only">Label</span>')
    expect(textbookGeometryPlanErrors(adapted, plan, images)).toEqual([])
  })

  it("accepts crop and control percentages derived from the focused plan", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"><input data-activity-item="item-1" class="absolute left-[35%] top-[50%] w-[30%] h-[10%]"></div></section>'
    expect(textbookGeometryPlanErrors(html, plan, images)).toEqual([])
  })

  it("rejects an omitted image and missing writable region", () => {
    const html = '<section><img data-id="bank" src="/bank"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"></div></section>'
    const errors = textbookGeometryPlanErrors(html, plan, images)
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("Geometry plan omits bank"),
      expect.stringContaining("figure requires 1 image-anchored controls"),
    ]))
  })

  it("rejects control geometry that is relative to the full image instead of the crop", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"><input data-activity-item="item-1" class="absolute left-[38%] top-[50%] w-[24%] h-[8%]"></div></section>'
    expect(textbookGeometryPlanErrors(html, plan, images)).toEqual([
      expect.stringContaining("must follow planned answer blank rectangle"),
    ])
  })

  it("rejects semantic text leaves trapped inside a clipping geometry canvas", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"><input data-activity-item="item-1" class="absolute left-[35%] top-[50%] w-[30%] h-[10%]"><span data-id="figure-label" class="sr-only">Label</span></div></section>'
    expect(textbookGeometryPlanErrors(html, plan, images)).toEqual([
      expect.stringContaining("geometry canvas contains transcription leaves"),
    ])
  })

  it("allows visual review to tighten a leaking crop with no anchored controls", () => {
    const cropOnlyPlan: TextbookGeometryPlan = {
      reasoning: "Crop-only figure",
      images: [{
        image_id: "figure",
        role: "page_replica",
        keep_visible: true,
        crop: { x: 40, y: 50, width: 320, height: 400 },
        baked_text_ids: [],
        text_regions: [],
        writable_regions: [],
        reasoning: "Initial safe candidate",
      }],
    }
    const tighter = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[300/350]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[133.3333%] left-[-13.3333%] top-[-14.2857%]"></div></section>'
    expect(textbookGeometryPlanErrors(tighter, cropOnlyPlan, images, { allowTighterCrops: true })).toEqual([])
    expect(textbookGeometryPlanErrors(tighter, cropOnlyPlan, images)).not.toEqual([])
  })

  it("rejects a decorative visible copy of text already baked into a figure", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"><input data-activity-item="item-1" class="absolute left-[35%] top-[50%] w-[30%] h-[10%]"></div><span data-id="figure-label" class="sr-only">Label</span><span aria-hidden="true">Label</span></section>'
    expect(textbookGeometryPlanErrors(html, plan, images)).toEqual([
      expect.stringContaining("duplicated by visible non-data-id HTML"),
    ])
  })

  it("allows a different authoritative leaf to repeat a diagram label", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[320/400]"><img data-id="figure" src="/figure" class="absolute max-w-none h-auto w-[125%] left-[-12.5%] top-[-12.5%]"><input data-activity-item="item-1" class="absolute left-[35%] top-[50%] w-[30%] h-[10%]"></div><span data-id="figure-label" class="sr-only">Label</span><div><h2 data-id="explanation-heading">Label</h2></div></section>'

    expect(textbookGeometryPlanErrors(html, plan, images)).toEqual([])
  })

  it("escapes AI-authored writable-region labels before inserting them into HTML", () => {
    const unsafePlan: TextbookGeometryPlan = {
      ...plan,
      images: plan.images.map((image) => image.image_id === "figure"
        ? {
            ...image,
            writable_regions: [{
              purpose: 'price <script>alert("x")</script> & total',
              x: 152,
              y: 250,
              width: 96,
              height: 40,
            }],
          }
        : image),
    }
    const source = '<section><img data-id="bank" src="/bank"><div class="relative aspect-[400/500]"><img data-id="figure" src="/figure"><span data-id="figure-label">Label</span></div></section>'
    const adapted = applyTextbookGeometryPlan(source, unsafePlan, images)

    expect(adapted).not.toContain("<script>")
    expect(adapted).toContain("&lt;script&gt;")
    expect(adapted).toContain("&amp; total")
    expect(textbookGeometryPlanErrors(adapted, unsafePlan, images)).toEqual([])
  })
})
