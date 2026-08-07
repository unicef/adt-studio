import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import type { ContentNodeData, PageSectioningSection } from "@adt/types"
import { createTemplateEngine, renderSectionTemplate } from "../render-template.js"
import {
  buildRenderContext,
  type RenderConfig,
  type RenderSectionInput,
} from "../web-rendering.js"

const templateConfig: RenderConfig = {
  renderType: "template",
  promptName: "",
  modelId: "",
  maxRetries: 0,
  timeoutMs: 0,
  temperature: 0,
  answerPromptName: "",
  templateName: "test_render",
}

// ── Tree-node helpers ────────────────────────────────────────────

function leafNode(nodeId: string, role: string, text: string, isPruned = false): ContentNodeData {
  return { nodeId, isPruned, role, text }
}

function groupNode(
  nodeId: string,
  structure: string,
  children: ContentNodeData[],
  isPruned = false,
): ContentNodeData {
  return { nodeId, isPruned, structure, children }
}

function imageNode(nodeId: string, imageId: string, isPruned = false): ContentNodeData {
  return {
    nodeId,
    isPruned,
    structure: "image_group",
    children: [{ nodeId: imageId, isPruned: false, role: "image" }],
  }
}

interface InputOverrides {
  sectionId?: string
  sectionType?: string
  nodes?: ContentNodeData[]
  backgroundColor?: string
  textColor?: string
  images?: Map<string, { base64: string; width?: number; height?: number }>
  label?: string
}

function makeInput(overrides: InputOverrides = {}): RenderSectionInput {
  const label = overrides.label ?? "test-book"
  const nodes = overrides.nodes ?? [
    groupNode("pg001_gp001", "paragraph", [
      leafNode("pg001_gp001_tx001", "text", "Hello world"),
    ]),
  ]
  const section: PageSectioningSection = {
    sectionId: overrides.sectionId ?? "pg001_sec001",
    sectionType: overrides.sectionType ?? "text_only",
    nodes,
    backgroundColor: overrides.backgroundColor ?? "#ffffff",
    textColor: overrides.textColor ?? "#000000",
    pageNumber: 1,
    isPruned: false,
  }
  const images = overrides.images ?? new Map()
  const context = buildRenderContext(section, images, label)
  return {
    label,
    pageId: "pg001",
    pageImageBase64: "base64img",
    sectionIndex: 0,
    section,
    context,
  }
}

describe("createTemplateEngine", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("renders a Liquid template with context", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "simple.liquid"),
      '<section><p data-id="{{ nodes[0].node_id }}">{{ nodes[0].text }}</p></section>',
    )

    const engine = createTemplateEngine(tmpDir)
    const html = await engine.render("simple", {
      nodes: [{ node_id: "tx001", role: "text", text: "Hello" }],
    })

    expect(html).toContain('data-id="tx001"')
    expect(html).toContain("Hello")
  })

  it("supports recursive iteration over a tree", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "loop.liquid"),
      `<section>{% for node in nodes %}{% if node.role %}<p data-id="{{ node.node_id }}">{{ node.text }}</p>{% elsif node.structure == "image_group" %}<img data-id="{{ node.image_id }}" src="{{ node.image_url }}">{% endif %}{% endfor %}</section>`,
    )

    const engine = createTemplateEngine(tmpDir)
    const html = await engine.render("loop", {
      nodes: [
        { node_id: "tx001", role: "text", text: "First" },
        { node_id: "tx002", role: "text", text: "Second" },
        { node_id: "ig001", structure: "image_group", image_id: "im001", image_url: "/api/books/test/images/im001" },
      ],
    })

    expect(html).toContain('data-id="tx001"')
    expect(html).toContain('data-id="tx002"')
    expect(html).toContain('data-id="im001"')
  })
})

describe("renderSectionTemplate", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("renders a section and validates the output", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div id="content" class="container"><section data-section-type="{{ section_type }}" data-section-id="{{ section_id }}">{% for leaf in leaf_texts %}<p data-id="{{ leaf.text_id }}">{{ leaf.text }}</p>{% endfor %}</section></div>`,
    )

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(makeInput(), templateConfig, engine)

    expect(result.sectionIndex).toBe(0)
    expect(result.sectionType).toBe("text_only")
    expect(result.reasoning).toBe("template-based rendering")
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain("Hello world")
    expect(result.html).toContain("<section")
  })

  it("renders images with rewritten src URLs", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div id="content" class="container"><section data-section-type="{{ section_type }}" data-section-id="{{ section_id }}">{% for img in image_refs %}<img data-id="{{ img.image_id }}" src="{{ img.image_url }}">{% endfor %}</section></div>`,
    )

    const input = makeInput({
      nodes: [imageNode("pg001_ig001", "pg001_im001")],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(input, templateConfig, engine)

    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain('src="/api/books/test-book/images/pg001_im001"')
  })

  it("passes section metadata to the template context", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div id="content" class="container"><section data-section-type="{{ section_type }}" data-section-id="{{ section_id }}" style="background: {{ background_color }}; color: {{ text_color }};">{% for leaf in leaf_texts %}<p data-id="{{ leaf.text_id }}">{{ leaf.text }}</p>{% endfor %}</section></div>`,
    )

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(makeInput(), templateConfig, engine)

    expect(result.html).toContain('data-section-type="text_only"')
    expect(result.html).toContain('data-section-id="pg001_sec001"')
    expect(result.html).toContain("background: #ffffff")
    expect(result.html).toContain("color: #000000")
  })

  it("throws when template produces HTML without a section tag", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div>{% for leaf in leaf_texts %}<p data-id="{{ leaf.text_id }}">{{ leaf.text }}</p>{% endfor %}</div>`,
    )

    const engine = createTemplateEngine(tmpDir)
    await expect(
      renderSectionTemplate(makeInput(), templateConfig, engine),
    ).rejects.toThrow('Template "test_render" produced invalid HTML')
  })

  it("throws when template produces text outside data-id elements", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div id="content" class="container"><section data-section-type="{{ section_type }}" data-section-id="{{ section_id }}">Loose text here{% for leaf in leaf_texts %}<p data-id="{{ leaf.text_id }}">{{ leaf.text }}</p>{% endfor %}</section></div>`,
    )

    const engine = createTemplateEngine(tmpDir)
    await expect(
      renderSectionTemplate(makeInput(), templateConfig, engine),
    ).rejects.toThrow('Template "test_render" produced invalid HTML')
  })

  it("handles mixed text leaves and images", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      `<div id="content" class="container"><section data-section-type="{{ section_type }}" data-section-id="{{ section_id }}">{% for leaf in leaf_texts %}<p data-id="{{ leaf.text_id }}">{{ leaf.text }}</p>{% endfor %}{% for img in image_refs %}<img data-id="{{ img.image_id }}" src="{{ img.image_url }}">{% endfor %}</section></div>`,
    )

    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", "Hello"),
        ]),
        imageNode("pg001_ig001", "pg001_im001"),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(input, templateConfig, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
  })
})

describe("one_column_render.liquid", () => {
  const templatesDir = path.resolve(__dirname, "../../../../templates")

  it("renders a single text group via the recursive partial", async () => {
    const engine = createTemplateEngine(templatesDir)
    const config = { ...templateConfig, templateName: "one_column_render" }
    const result = await renderSectionTemplate(makeInput(), config, engine)

    expect(result.html).toContain("<section")
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain("Hello world")
  })

  it("escapes text content to prevent HTML injection", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", '<img src=x onerror=alert("xss")>'),
        ]),
      ],
    })
    const config = { ...templateConfig, templateName: "one_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("&lt;img src=x onerror=alert(&quot;xss&quot;)&gt;")
    expect(result.html).not.toContain('<img src=x onerror=alert("xss")>')
  })
})

describe("two_column_render.liquid", () => {
  const templatesDir = path.resolve(__dirname, "../../../../templates")

  it("renders a single text group", async () => {
    const engine = createTemplateEngine(templatesDir)
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(makeInput(), config, engine)

    expect(result.html).toContain("<section")
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain("Hello world")
  })

  it("renders text and image in two columns", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", "Some text"),
        ]),
        imageNode("pg001_ig001", "pg001_im001"),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain("lg:basis-1/2")
  })

  it("renders two images side by side", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        imageNode("pg001_ig001", "pg001_im001"),
        imageNode("pg001_ig002", "pg001_im002"),
      ],
      images: new Map([
        ["pg001_im001", { base64: "base64a" }],
        ["pg001_im002", { base64: "base64b" }],
      ]),
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain('data-id="pg001_im002"')
  })

  it("escapes text content to prevent HTML injection", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", '<img src=x onerror=alert("xss")>'),
        ]),
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("&lt;img src=x onerror=alert(&quot;xss&quot;)&gt;")
    expect(result.html).not.toContain('<img src=x onerror=alert("xss")>')
  })

  it("renders heading leaves as <h2> with data-id", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "group", [
          leafNode("pg001_gp001_tx001", "heading", "Lesson heading"),
        ]),
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("<section")
    expect(result.html).not.toContain('role="article"')
    expect(result.html).toContain('<h2 class="adt-h2" data-id="pg001_gp001_tx001">Lesson heading</h2>')
  })

  it("renders authoritative level-four headings semantically", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        {
          nodeId: "pg001_tx001",
          isPruned: false,
          role: "heading",
          text: "A deeper heading",
          headingLevel: 4,
        },
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain(
      '<h4 class="adt-h4" data-id="pg001_tx001">A deeper heading</h4>',
    )
  })

  it("routes a non-image_group container holding an image leaf into the image column", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", "Some text"),
        ]),
        groupNode("pg001_panel001", "panel", [
          { nodeId: "pg001_im001", isPruned: false, role: "image" },
        ]),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain("lg:basis-1/2")
  })

  it("routes a deeply nested image (3+ levels) into the image column", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", "Some text"),
        ]),
        groupNode("pg001_panel001", "panel", [
          groupNode("pg001_panel001_ig001", "image_group", [
            { nodeId: "pg001_im001", isPruned: false, role: "image" },
          ]),
        ]),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain("lg:basis-1/2")
  })

  it("splits a mixed image_group (image + text leaves) into two columns", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "image_group", [
          { nodeId: "pg001_im001", isPruned: false, role: "image" },
          leafNode("pg001_gp001_tx001", "text", "Overlay line one"),
          leafNode("pg001_gp001_tx002", "text", "Overlay line two"),
        ]),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_gp001_tx002"')
    expect(result.html).toContain("lg:basis-1/2")
  })
})

describe("two_column_story.liquid", () => {
  const templatesDir = path.resolve(__dirname, "../../../../templates")

  it("renders heading leaves as <h2> with data-id", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "group", [
          leafNode("pg001_gp001_tx001", "heading", "Story heading"),
        ]),
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_story" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("<section")
    expect(result.html).not.toContain('role="article"')
    expect(result.html).toContain('<h2 class="adt-h2" data-id="pg001_gp001_tx001">Story heading</h2>')
  })

  it("splits images and text when both are present", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      nodes: [
        groupNode("pg001_gp001", "paragraph", [
          leafNode("pg001_gp001_tx001", "text", "Once upon a time"),
        ]),
        imageNode("pg001_ig001", "pg001_im001"),
      ],
      images: new Map([["pg001_im001", { base64: "base64data" }]]),
    })
    const config = { ...templateConfig, templateName: "two_column_story" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
  })
})

describe("buildRenderContext image availability", () => {
  function section(nodes: ContentNodeData[]): PageSectioningSection {
    return {
      sectionId: "pg008_sec001",
      sectionType: "images_only",
      nodes,
      backgroundColor: "#ffffff",
      textColor: "#000000",
      pageNumber: 8,
      isPruned: false,
    }
  }

  it("drops image nodes whose bytes aren't available", () => {
    // Mirrors the stale-sectioning bug: the tree references `..._seg003_v1`
    // but image-filtering superseded it with the crop `..._seg003_v1_crop1`,
    // so only the crop has bytes in the images map. The orphaned node must be
    // dropped, not emitted as a base64-less ref (which crashes the prompt).
    const ctx = buildRenderContext(
      section([
        imageNode("pg008_n1", "pg008_im001_seg001_v1"),
        imageNode("pg008_n2", "pg008_im001_seg003_v1"), // orphaned — no bytes
      ]),
      new Map([
        ["pg008_im001_seg001_v1", { base64: "aaa" }],
        ["pg008_im001_seg003_v1_crop1", { base64: "bbb" }],
      ]),
      "book",
    )

    expect(ctx.image_refs.map((r) => r.image_id)).toEqual([
      "pg008_im001_seg001_v1",
    ])
    // Every emitted ref carries real bytes — never an undefined payload.
    expect(ctx.image_refs.every((r) => Boolean(r.image_base64))).toBe(true)
  })
})
