import { textbookGeometryPlanLLMSchema } from "@adt/types"
import type { TextbookGeometryPlan, TextbookPixelRect } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { DomUtils, parseDocument } from "htmlparser2"
import type { ImageRef, RenderNode } from "./web-rendering.js"

interface PlanTextbookGeometryInput {
  pageId: string
  pageImageBase64: string
  sectionType: string
  nodes: RenderNode[]
  images: ImageRef[]
  signal?: AbortSignal
}

function rectangleErrors(
  label: string,
  rect: TextbookPixelRect,
  width: number,
  height: number,
): string[] {
  const errors: string[] = []
  if (rect.x + rect.width > width || rect.y + rect.height > height) {
    errors.push(
      `${label} rectangle (${rect.x},${rect.y},${rect.width},${rect.height}) exceeds native image bounds ${width}x${height}.`,
    )
  }
  return errors
}

export async function planTextbookGeometry(
  input: PlanTextbookGeometryInput,
  llmModel: LLMModel,
): Promise<TextbookGeometryPlan> {
  if (input.images.length === 0) return { reasoning: "No candidate images.", images: [] }
  const dimensions = new Map(
    input.images.map((image) => [image.image_id, { width: image.width, height: image.height }]),
  )
  const expectedIds = input.images.map((image) => image.image_id)
  const textIds = new Set<string>()
  const collectTextIds = (nodes: RenderNode[]): void => {
    for (const node of nodes) {
      if (node.role && node.role !== "image") textIds.add(node.node_id)
      if (node.children) collectTextIds(node.children)
    }
  }
  collectTextIds(input.nodes)

  const validatePlan = (raw: unknown): ValidationResult => {
    const plan = raw as TextbookGeometryPlan
    const returnedIds = plan.images.map((image) => image.image_id)
    const errors: string[] = []
    const missing = expectedIds.filter((id) => !returnedIds.includes(id))
    const extra = returnedIds.filter((id) => !expectedIds.includes(id))
    const duplicates = returnedIds.filter((id, index) => returnedIds.indexOf(id) !== index)
    if (missing.length > 0) errors.push(`Missing geometry plans for: ${missing.join(", ")}.`)
    if (extra.length > 0) errors.push(`Unknown image IDs in geometry plan: ${extra.join(", ")}.`)
    if (duplicates.length > 0) errors.push(`Duplicate geometry plans for: ${[...new Set(duplicates)].join(", ")}.`)
    for (const image of plan.images) {
      const dims = dimensions.get(image.image_id)
      if (!dims?.width || !dims.height) {
        errors.push(`Native dimensions are unavailable for ${image.image_id}; do not invent coordinates.`)
        continue
      }
      if (
        !image.keep_visible &&
        (image.crop !== null ||
          image.writable_regions.length > 0 ||
          image.baked_text_ids.length > 0 ||
          image.text_regions.length > 0)
      ) {
        errors.push(`${image.image_id} is omitted, so crop, baked_text_ids, text_regions, and writable_regions must be empty/null.`)
      }
      if (
        image.keep_visible &&
        (image.role === "page_replica" || image.role === "worksheet_form_composite") &&
        image.crop === null
      ) {
        errors.push(`${image.image_id} is a kept ${image.role} and requires a safe crop rectangle.`)
      }
      if (image.crop) errors.push(...rectangleErrors(`${image.image_id} crop`, image.crop, dims.width, dims.height))
      for (const [index, region] of image.writable_regions.entries()) {
        errors.push(...rectangleErrors(`${image.image_id} writable region ${index + 1}`, region, dims.width, dims.height))
        if (region.height < 12) {
          errors.push(
            `${image.image_id} writable region ${index + 1} is only ${region.height}px tall; ` +
            "return the usable writing zone around a printed line, not the stroke itself.",
          )
        }
        if (image.crop) {
          const insideCrop =
            region.x >= image.crop.x &&
            region.y >= image.crop.y &&
            region.x + region.width <= image.crop.x + image.crop.width &&
            region.y + region.height <= image.crop.y + image.crop.height
          if (!insideCrop) {
            errors.push(`${image.image_id} writable region ${index + 1} must remain fully inside the final crop.`)
          }
        }
      }
      for (const textId of image.baked_text_ids) {
        if (!textIds.has(textId)) errors.push(`${image.image_id} references unknown baked text ID ${textId}.`)
      }
      const repeatedTextRegions = image.text_regions
        .map((region) => region.text_id)
        .filter((id, index, ids) => ids.indexOf(id) !== index)
      if (repeatedTextRegions.length > 0) {
        errors.push(`${image.image_id} has duplicate text regions for ${[...new Set(repeatedTextRegions)].join(", ")}.`)
      }
      const visibleRect = image.crop ?? { x: 0, y: 0, width: dims.width, height: dims.height }
      const fullyInside = (region: TextbookPixelRect): boolean =>
        region.x >= visibleRect.x &&
        region.y >= visibleRect.y &&
        region.x + region.width <= visibleRect.x + visibleRect.width &&
        region.y + region.height <= visibleRect.y + visibleRect.height
      const intersects = (region: TextbookPixelRect): boolean =>
        region.x < visibleRect.x + visibleRect.width &&
        region.x + region.width > visibleRect.x &&
        region.y < visibleRect.y + visibleRect.height &&
        region.y + region.height > visibleRect.y
      for (const region of image.text_regions) {
        if (!textIds.has(region.text_id)) {
          errors.push(`${image.image_id} references unknown text-region ID ${region.text_id}.`)
        }
        errors.push(...rectangleErrors(`${image.image_id} text ${region.text_id}`, region, dims.width, dims.height))
        const isBaked = image.baked_text_ids.includes(region.text_id)
        if (region.legibility === "clipped") {
          const touchesCandidateBoundary =
            region.x <= 2 ||
            region.y <= 2 ||
            region.x + region.width >= dims.width - 2 ||
            region.y + region.height >= dims.height - 2
          if (!touchesCandidateBoundary) {
            errors.push(
              `${image.image_id} text ${region.text_id} is marked clipped but its rectangle does not touch a native image boundary.`,
            )
          }
          if (isBaked) {
            errors.push(`${image.image_id} text ${region.text_id} is clipped in the candidate and cannot be baked.`)
          }
        } else if (region.legibility === "complete" && image.keep_visible) {
          if (fullyInside(region) && !isBaked) {
            errors.push(`${image.image_id} complete text ${region.text_id} remains inside the crop and must be baked.`)
          }
          if (intersects(region) && !fullyInside(region)) {
            errors.push(`${image.image_id} crop cuts through complete text ${region.text_id}; include or exclude the full glyph rectangle.`)
          }
          if (!intersects(region) && !isBaked) {
            const exclusionSafety = 24
            const nearCrop =
              region.x - exclusionSafety < visibleRect.x + visibleRect.width &&
              region.x + region.width + exclusionSafety > visibleRect.x &&
              region.y - exclusionSafety < visibleRect.y + visibleRect.height &&
              region.y + region.height + exclusionSafety > visibleRect.y
            if (nearCrop) {
              errors.push(
                `${image.image_id} crop excludes complete text ${region.text_id} with less than a ${exclusionSafety}px no-glyph safety margin; ` +
                "move the crop edge farther away or retain the complete marker as baked text.",
              )
            }
          }
          if (!fullyInside(region) && isBaked) {
            errors.push(`${image.image_id} baked text ${region.text_id} is not fully inside the final crop.`)
          }
        }
      }
      for (const textId of image.baked_text_ids) {
        const region = image.text_regions.find((candidate) => candidate.text_id === textId)
        if (!region) {
          errors.push(`${image.image_id} baked text ${textId} requires a native text_regions entry.`)
        }
      }
    }
    return { valid: errors.length === 0, errors }
  }

  const draft = await llmModel.generateObject<TextbookGeometryPlan>({
    schema: textbookGeometryPlanLLMSchema,
    prompt: "textbook_geometry_plan",
    context: {
      page_image_base64: input.pageImageBase64,
      section_type: input.sectionType,
      nodes: input.nodes,
      images: input.images,
    },
    validate: validatePlan,
    maxRetries: 3,
    maxTokens: 4096,
    temperature: 0,
    timeoutMs: 120_000,
    signal: input.signal,
    log: {
      taskType: "textbook-geometry",
      pageId: input.pageId,
      promptName: "textbook_geometry_plan",
    },
  })

  const audited = await llmModel.generateObject<TextbookGeometryPlan>({
    schema: textbookGeometryPlanLLMSchema,
    prompt: "textbook_geometry_review",
    context: {
      page_image_base64: input.pageImageBase64,
      section_type: input.sectionType,
      nodes: input.nodes,
      images: input.images,
      draft_plan: draft.object,
    },
    validate: validatePlan,
    maxRetries: 3,
    maxTokens: 4096,
    temperature: 0,
    timeoutMs: 120_000,
    signal: input.signal,
    log: {
      taskType: "textbook-geometry-review",
      pageId: input.pageId,
      promptName: "textbook_geometry_review",
    },
  })
  return audited.object
}

function utilityPercent(className: string, name: "left" | "top" | "w" | "h"): number | undefined {
  const match = className.match(new RegExp(`(?:^|\\s)${name}-\\[(\\d+(?:\\.\\d+)?)%\\](?:\\s|$)`))
  return match ? Number(match[1]) : undefined
}

function utilityAspect(className: string): number | undefined {
  const match = className.match(/(?:^|\s)aspect-\[(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\](?:\s|$)/)
  return match ? Number(match[1]) / Number(match[2]) : undefined
}

function utilitySignedPercent(className: string, name: "left" | "top"): number | undefined {
  if (className.split(/\s+/).includes(`${name}-0`)) return 0
  const match = className.match(new RegExp(`(?:^|\\s)${name}-\\[(\\-?\\d+(?:\\.\\d+)?)%\\](?:\\s|$)`))
  return match ? Number(match[1]) : undefined
}

function closeEnough(actual: number, expected: number, span: number): boolean {
  return Math.abs(actual - expected) <= Math.max(8, span * 0.025)
}

/** Enforce the focused AI geometry plan on the subsequent HTML generation.
 * The validator turns visual planning into an inspectable contract rather than
 * advisory prose that a long generation prompt can silently ignore. */
export function textbookGeometryPlanErrors(
  html: string,
  plan: TextbookGeometryPlan | undefined,
  images: ImageRef[],
  options: { allowTighterCrops?: boolean } = {},
): string[] {
  if (!plan || plan.images.length === 0) return []
  const doc = parseDocument(html)
  const dimensions = new Map(images.map((image) => [image.image_id, image]))
  const errors: string[] = []

  for (const imagePlan of plan.images) {
    const imageNodes = DomUtils.findAll(
      (node) =>
        node.type === "tag" &&
        node.name.toLowerCase() === "img" &&
        node.attribs?.["data-id"] === imagePlan.image_id,
      doc.children,
    )
    if (!imagePlan.keep_visible) {
      if (imageNodes.length > 0) errors.push(`Geometry plan omits ${imagePlan.image_id}; rebuild its text semantically without this image.`)
      continue
    }
    if (imageNodes.length !== 1) {
      errors.push(`Geometry plan keeps ${imagePlan.image_id}; render it exactly once (found ${imageNodes.length}).`)
      continue
    }
    const imageNode = imageNodes[0]
    const dims = dimensions.get(imagePlan.image_id)
    if (!dims?.width || !dims.height) continue

    if (imagePlan.crop) {
      let wrapper = imageNode.parent
      while (wrapper && !(wrapper.type === "tag" && wrapper.attribs?.["data-textbook-crop"] === "true")) wrapper = wrapper.parent
      if (!wrapper || wrapper.type !== "tag") {
        errors.push(`Geometry plan requires ${imagePlan.image_id} crop (${imagePlan.crop.x},${imagePlan.crop.y},${imagePlan.crop.width},${imagePlan.crop.height}); use a data-textbook-crop wrapper.`)
      } else {
        const aspect = utilityAspect(wrapper.attribs?.class ?? "")
        const widthPct = utilityPercent(imageNode.attribs?.class ?? "", "w")
        const leftPct = utilitySignedPercent(imageNode.attribs?.class ?? "", "left")
        const topPct = utilitySignedPercent(imageNode.attribs?.class ?? "", "top")
        if (aspect == null || widthPct == null || leftPct == null || topPct == null || widthPct <= 0) {
          errors.push(`Cannot decode ${imagePlan.image_id} crop CSS; emit exact aspect/width/left/top percentage geometry.`)
        } else {
          const actualWidth = dims.width * 100 / widthPct
          const actualHeight = actualWidth / aspect
          const actualX = -leftPct / 100 * actualWidth
          const actualY = -topPct / 100 * actualHeight
          const expected = imagePlan.crop
          const isSafeTightening = Boolean(
            options.allowTighterCrops &&
            imagePlan.writable_regions.length === 0 &&
            actualX >= expected.x - 8 &&
            actualY >= expected.y - 8 &&
            actualX + actualWidth <= expected.x + expected.width + 8 &&
            actualY + actualHeight <= expected.y + expected.height + 8,
          )
          if (!isSafeTightening && (
            !closeEnough(actualX, expected.x, dims.width) ||
            !closeEnough(actualY, expected.y, dims.height) ||
            !closeEnough(actualWidth, expected.width, dims.width) ||
            !closeEnough(actualHeight, expected.height, dims.height)
          )) {
            errors.push(
              `${imagePlan.image_id} crop must follow the geometry plan (${expected.x},${expected.y},${expected.width},${expected.height}); ` +
              `current CSS decodes to (${actualX.toFixed(1)},${actualY.toFixed(1)},${actualWidth.toFixed(1)},${actualHeight.toFixed(1)}).`,
            )
          }
        }
      }
    }

    if (imagePlan.crop || imagePlan.writable_regions.length > 0) {
      let canvas = imageNode.parent
      while (
        canvas &&
        !(
          canvas.type === "tag" &&
          (canvas.attribs?.["data-textbook-crop"] === "true" ||
            utilityAspect(canvas.attribs?.class ?? "") != null)
        )
      ) {
        canvas = canvas.parent
      }
      if (canvas?.type === "tag") {
        const trappedTextIds = DomUtils.findAll(
          (node) =>
            node.type === "tag" &&
            node.name.toLowerCase() !== "img" &&
            typeof node.attribs?.["data-id"] === "string",
          canvas.children,
        ).map((node) => node.attribs!["data-id"])
        if (trappedTextIds.length > 0) {
          errors.push(
            `${imagePlan.image_id} geometry canvas contains transcription leaves (${trappedTextIds.join(", ")}); ` +
            "keep the canvas limited to its image and native controls, then place all text leaves immediately after it.",
          )
        }
      }
    }

    if (imagePlan.writable_regions.length > 0) {
      let wrapper = imageNode.parent
      while (wrapper && wrapper.type === "tag") {
        const controls = DomUtils.findAll(
          (node) =>
            node.type === "tag" &&
            (node.name.toLowerCase() === "input" || node.name.toLowerCase() === "textarea") &&
            (node.attribs?.class ?? "").split(/\s+/).includes("absolute"),
          wrapper.children ?? [],
        )
        if (controls.length > 0) {
          if (controls.length !== imagePlan.writable_regions.length) {
            errors.push(`${imagePlan.image_id} has ${imagePlan.writable_regions.length} planned writable regions but ${controls.length} overlaid controls.`)
          }
          for (const [index, expected] of imagePlan.writable_regions.entries()) {
            const control = controls[index]
            if (!control) continue
            const className = control.attribs?.class ?? ""
            const left = utilityPercent(className, "left")
            const top = utilityPercent(className, "top")
            const width = utilityPercent(className, "w")
            const height = utilityPercent(className, "h")
            if (left == null || top == null || width == null || height == null) continue
            // Controls are positioned against the visible coordinate canvas.
            // For an uncropped figure that is the full native image; for a
            // page-source crop it is the planned crop rectangle.
            const canvas = imagePlan.crop ?? { x: 0, y: 0, width: dims.width, height: dims.height }
            const actual = {
              x: canvas.x + canvas.width * left / 100,
              y: canvas.y + canvas.height * top / 100,
              width: canvas.width * width / 100,
              height: canvas.height * height / 100,
            }
            if (
              !closeEnough(actual.x, expected.x, dims.width) ||
              !closeEnough(actual.y, expected.y, dims.height) ||
              !closeEnough(actual.width, expected.width, dims.width) ||
              !closeEnough(actual.height, expected.height, dims.height)
            ) {
              errors.push(
                `${imagePlan.image_id} control ${index + 1} must follow planned ${expected.purpose} rectangle ` +
                `(${expected.x},${expected.y},${expected.width},${expected.height}); current CSS decodes to ` +
                `(${actual.x.toFixed(1)},${actual.y.toFixed(1)},${actual.width.toFixed(1)},${actual.height.toFixed(1)}).`,
              )
            }
          }
          wrapper = null
          break
        }
        wrapper = wrapper.parent
      }
      if (wrapper !== null) errors.push(`${imagePlan.image_id} requires ${imagePlan.writable_regions.length} image-anchored controls from the geometry plan.`)
    }

    for (const textId of imagePlan.baked_text_ids) {
      const textNode = DomUtils.findOne(
        (node) => node.type === "tag" && node.attribs?.["data-id"] === textId,
        doc.children,
        true,
      )
      if (!textNode || textNode.type !== "tag") continue
      if (!(textNode.attribs?.class ?? "").split(/\s+/).includes("sr-only")) {
        errors.push(`${imagePlan.image_id} baked transcription ${textId} must remain exactly once with sr-only.`)
      }
      const text = DomUtils.textContent(textNode).replace(/\s+/g, " ").trim()
      if (!text) continue
      const ancestors = new Set()
      let ancestor = textNode.parent
      while (ancestor) {
        ancestors.add(ancestor)
        ancestor = ancestor.parent
      }
      const visibleDuplicates = DomUtils.findAll(
        (node) => {
          if (node.type !== "tag" || node === textNode || ancestors.has(node)) return false
          if (typeof node.attribs?.["data-id"] === "string") return false
          if ((node.attribs?.class ?? "").split(/\s+/).includes("sr-only")) return false
          // A wrapper can have no data-id of its own while containing a
          // different authoritative leaf with the same wording (common in
          // textbook diagrams that label a feature and then explain that
          // feature under a repeated heading). That is real source content,
          // not an invented decorative duplicate.
          if (DomUtils.findOne(
            (descendant) =>
              descendant.type === "tag" &&
              typeof descendant.attribs?.["data-id"] === "string",
            node.children,
            true,
          )) return false
          return DomUtils.textContent(node).replace(/\s+/g, " ").trim() === text
        },
        doc.children,
      )
      if (visibleDuplicates.length > 0) {
        errors.push(
          `${imagePlan.image_id} baked transcription ${textId} ("${text}") is duplicated by visible non-data-id HTML; rely on the image marker and keep only the sr-only leaf.`,
        )
      }
    }
  }
  return errors
}

function percentage(value: number): string {
  return Number(value.toFixed(4)).toString()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function firstElement(html: string) {
  const fragment = parseDocument(html)
  return DomUtils.findOne((node) => node.type === "tag", fragment.children, true)
}

/** Apply an inspectable AI geometry plan without asking the HTML model to
 * reproduce pixel arithmetic. Text/content still comes from the validated LLM
 * rendering; this adapter only controls admitted images, exact crops, and
 * image-anchored response controls. */
export function applyTextbookGeometryPlan(
  html: string,
  plan: TextbookGeometryPlan | undefined,
  images: ImageRef[],
): string {
  if (!plan || plan.images.length === 0) return html
  const doc = parseDocument(html)
  const dimensions = new Map(images.map((image) => [image.image_id, image]))

  for (const imagePlan of plan.images) {
    const imageNode = DomUtils.findOne(
      (node) =>
        node.type === "tag" &&
        node.name.toLowerCase() === "img" &&
        node.attribs?.["data-id"] === imagePlan.image_id,
      doc.children,
      true,
    )
    if (!imageNode) continue
    if (!imagePlan.keep_visible) {
      DomUtils.removeElement(imageNode)
      continue
    }

    const dims = dimensions.get(imagePlan.image_id)
    if (!dims?.width || !dims.height) continue

    for (const textId of imagePlan.baked_text_ids) {
      const textNode = DomUtils.findOne(
        (node) => node.type === "tag" && node.attribs?.["data-id"] === textId,
        doc.children,
        true,
      )
      if (!textNode || textNode.type !== "tag") continue
      const classes = (textNode.attribs.class ?? "").split(/\s+/).filter(Boolean)
      if (!classes.includes("sr-only")) classes.push("sr-only")
      textNode.attribs.class = classes.join(" ")
    }

    // Find an existing nearest image canvas so we can remove the model's
    // approximate controls and reuse its position in the content-tree order.
    let existingCanvas = imageNode.parent
    while (existingCanvas && existingCanvas.type === "tag") {
      const tokens = (existingCanvas.attribs?.class ?? "").split(/\s+/)
      if (tokens.includes("relative") || existingCanvas.attribs?.["data-textbook-crop"] === "true") break
      existingCanvas = existingCanvas.parent
    }
    if (!existingCanvas || existingCanvas.type !== "tag") existingCanvas = null

    const oldControls = existingCanvas
      ? DomUtils.findAll(
          (node) =>
            node.type === "tag" &&
            (node.name.toLowerCase() === "input" || node.name.toLowerCase() === "textarea") &&
            (node.attribs?.class ?? "").split(/\s+/).includes("absolute"),
          existingCanvas.children ?? [],
        )
      : []
    const oldControlIds = new Set(oldControls.map((control) => control.attribs?.id).filter(Boolean))
    for (const control of oldControls) DomUtils.removeElement(control)
    if (existingCanvas) {
      const oldLabels = DomUtils.findAll(
        (node) =>
          node.type === "tag" &&
          node.name.toLowerCase() === "label" &&
          oldControlIds.has(node.attribs?.for),
        existingCanvas.children ?? [],
      )
      for (const label of oldLabels) DomUtils.removeElement(label)
    }

    const canvasRect = imagePlan.crop ?? { x: 0, y: 0, width: dims.width, height: dims.height }
    const canReuseCanvas = Boolean(
      existingCanvas &&
      (existingCanvas.attribs?.["data-textbook-crop"] === "true" ||
        utilityAspect(existingCanvas.attribs?.class ?? "") != null),
    )
    const canvas = canReuseCanvas
      ? existingCanvas
      : firstElement("<div></div>")
    if (!canvas || canvas.type !== "tag") continue
    canvas.attribs.class = `relative overflow-hidden aspect-[${canvasRect.width}/${canvasRect.height}] w-full`
    if (imagePlan.crop) canvas.attribs["data-textbook-crop"] = "true"
    else delete canvas.attribs["data-textbook-crop"]

    if (!canReuseCanvas) {
      // Replace only the image at its current DOM position. Associated text
      // leaves remain immediately after the new canvas, preserving DFS order.
      DomUtils.replaceElement(imageNode, canvas)
      DomUtils.appendChild(canvas, imageNode)
    }
    if (imagePlan.crop) {
      const widthPct = dims.width / canvasRect.width * 100
      const leftPct = canvasRect.x / canvasRect.width * 100
      const topPct = canvasRect.y / canvasRect.height * 100
      imageNode.attribs.class =
        `absolute max-w-none h-auto w-[${percentage(widthPct)}%] ` +
        `${leftPct === 0 ? "left-0" : `left-[-${percentage(leftPct)}%]`} ` +
        `${topPct === 0 ? "top-0" : `top-[-${percentage(topPct)}%]`}`
    } else {
      imageNode.attribs.class = "absolute inset-0 block w-full h-auto max-w-none"
    }

    for (const [index, region] of imagePlan.writable_regions.entries()) {
      const itemNumber = index + 1
      // Item numbers are finalized globally after every image is adapted.
      const marker = `geometry-item-${imagePlan.image_id}-${itemNumber}`
      const purpose = escapeHtml(region.purpose)
      const left = (region.x - canvasRect.x) / canvasRect.width * 100
      const top = (region.y - canvasRect.y) / canvasRect.height * 100
      const width = region.width / canvasRect.width * 100
      const height = region.height / canvasRect.height * 100
      const nodes = [...parseDocument(
        `<label for="${marker}" class="sr-only">${purpose}</label>` +
        `<input id="${marker}" type="text" data-geometry-control="true" ` +
        `aria-label="${purpose}" class="absolute z-10 border border-gray-400 rounded bg-white/95 text-center ` +
        `left-[${percentage(left)}%] top-[${percentage(top)}%] w-[${percentage(width)}%] h-[${percentage(height)}%]">`,
      ).children]
      for (const node of nodes) DomUtils.appendChild(canvas, node)
    }

    // `overflow-hidden` is required for stable crops, but it must never become
    // the clipping parent of semantic leaves. Move every supplied text leaf
    // out of the geometry canvas as adjacent siblings while retaining their
    // relative order. Baked copies remain sr-only; non-baked markers such as a)
    // or b) stay visible and can position against the model-authored outer box.
    const transcriptionLeaves = DomUtils.findAll(
      (node) =>
        node.type === "tag" &&
        node.name.toLowerCase() !== "img" &&
        typeof node.attribs?.["data-id"] === "string",
      canvas.children,
    )
    let insertionPoint = canvas
    for (const leaf of transcriptionLeaves) {
      DomUtils.removeElement(leaf)
      DomUtils.append(insertionPoint, leaf)
      insertionPoint = leaf
    }
  }

  // Assign one stable activity sequence across all adapted figures, while
  // avoiding semantic controls that legitimately occur elsewhere in a mixed
  // section. Both id and data-activity-item use the same sequence so answer
  // generation and runtime hydration share one source of truth.
  const reserved = new Set(
    DomUtils.findAll(
      (node) =>
        node.type === "tag" &&
        (node.name.toLowerCase() === "input" || node.name.toLowerCase() === "textarea") &&
        node.attribs?.["data-geometry-control"] !== "true",
      doc.children,
    )
      .map((node) => node.attribs?.["data-activity-item"])
      .filter((id): id is string => Boolean(id)),
  )
  let sequence = 1
  const plannedControls = DomUtils.findAll(
    (node) => node.type === "tag" && node.attribs?.["data-geometry-control"] === "true",
    doc.children,
  )
  for (const control of plannedControls) {
    while (reserved.has(`item-${sequence}`)) sequence += 1
    const oldId = control.attribs?.id
    const itemId = `item-${sequence}`
    control.attribs.id = itemId
    control.attribs["data-activity-item"] = itemId
    delete control.attribs["data-geometry-control"]
    if (oldId) {
      const label = DomUtils.findOne(
        (node) => node.type === "tag" && node.name.toLowerCase() === "label" && node.attribs?.for === oldId,
        doc.children,
        true,
      )
      if (label) label.attribs.for = itemId
    }
    sequence += 1
  }

  return DomUtils.getOuterHTML(doc.children)
}
