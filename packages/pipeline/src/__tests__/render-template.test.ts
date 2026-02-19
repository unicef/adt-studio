import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { createTemplateEngine, renderSectionTemplate } from "../render-template.js"
import type { RenderConfig, RenderSectionInput } from "../web-rendering.js"

const templateConfig: RenderConfig = {
  renderType: "template",
  promptName: "",
  modelId: "",
  maxRetries: 0,
  timeoutMs: 0,
  templateName: "test_render",
}

function makeInput(overrides?: Partial<RenderSectionInput>): RenderSectionInput {
  return {
    label: "test-book",
    pageId: "pg001",
    pageImageBase64: "base64img",
    sectionIndex: 0,
    sectionId: "pg001_sec001",
    sectionType: "text_only",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    parts: [
      {
        type: "group",
        groupId: "pg001_gp001",
        groupType: "paragraph",
        texts: [
          { textId: "pg001_gp001_tx001", textType: "section_text", text: "Hello world" },
        ],
      },
    ],
    ...overrides,
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
      '<section><p data-id="{{ parts[0].texts[0].text_id }}">{{ parts[0].texts[0].text }}</p></section>'
    )

    const engine = createTemplateEngine(tmpDir)
    const html = await engine.render("simple", {
      parts: [
        {
          type: "group",
          texts: [{ text_id: "tx001", text: "Hello" }],
        },
      ],
    })

    expect(html).toContain('data-id="tx001"')
    expect(html).toContain("Hello")
  })

  it("supports iteration over parts", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "loop.liquid"),
      '<section>{% for part in parts %}{% if part.type == "group" %}{% for text in part.texts %}<p data-id="{{ text.text_id }}">{{ text.text }}</p>{% endfor %}{% else %}<img data-id="{{ part.image_id }}" src="{{ part.image_url }}">{% endif %}{% endfor %}</section>'
    )

    const engine = createTemplateEngine(tmpDir)
    const html = await engine.render("loop", {
      parts: [
        {
          type: "group",
          texts: [
            { text_id: "tx001", text: "First" },
            { text_id: "tx002", text: "Second" },
          ],
        },
        {
          type: "image",
          image_id: "im001",
          image_url: "/api/books/test/images/im001",
        },
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
      '<section>{% for part in parts %}{% if part.type == "group" %}{% for text in part.texts %}<p data-id="{{ text.text_id }}">{{ text.text }}</p>{% endfor %}{% endif %}{% endfor %}</section>'
    )

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(makeInput(), templateConfig, engine)

    expect(result.sectionIndex).toBe(0)
    expect(result.sectionType).toBe("text_only")
    expect(result.reasoning).toBe("template-based rendering")
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain("Hello world")
    expect(result.html).toContain("<section>")
  })

  it("renders images with rewritten src URLs", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      '<section>{% for part in parts %}{% if part.type == "image" %}<img data-id="{{ part.image_id }}" src="{{ part.image_url }}">{% endif %}{% endfor %}</section>'
    )

    const input = makeInput({
      parts: [
        { type: "image", imageId: "pg001_im001", imageBase64: "base64data" },
      ],
    })

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(input, templateConfig, engine)

    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain('src="/api/books/test-book/images/pg001_im001"')
  })

  it("passes section metadata to the template context", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      '<section data-section-type="{{ section_type }}" style="background: {{ background_color }}; color: {{ text_color }};"><p data-id="{{ parts[0].texts[0].text_id }}">{{ parts[0].texts[0].text }}</p></section>'
    )

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(makeInput(), templateConfig, engine)

    expect(result.html).toContain('data-section-type="text_only"')
    expect(result.html).toContain("background: #ffffff")
    expect(result.html).toContain("color: #000000")
  })

  it("throws when template produces HTML without a section tag", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      '<div><p data-id="{{ parts[0].texts[0].text_id }}">{{ parts[0].texts[0].text }}</p></div>'
    )

    const engine = createTemplateEngine(tmpDir)
    await expect(
      renderSectionTemplate(makeInput(), templateConfig, engine)
    ).rejects.toThrow('Template "test_render" produced invalid HTML')
  })

  it("throws when template produces text outside data-id elements", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      '<section>Loose text here<p data-id="{{ parts[0].texts[0].text_id }}">{{ parts[0].texts[0].text }}</p></section>'
    )

    const engine = createTemplateEngine(tmpDir)
    await expect(
      renderSectionTemplate(makeInput(), templateConfig, engine)
    ).rejects.toThrow('Template "test_render" produced invalid HTML')
  })

  it("handles mixed text groups and images", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "test_render.liquid"),
      '<section>{% for part in parts %}{% if part.type == "group" %}{% for text in part.texts %}<p data-id="{{ text.text_id }}">{{ text.text }}</p>{% endfor %}{% elsif part.type == "image" %}<img data-id="{{ part.image_id }}" src="{{ part.image_url }}">{% endif %}{% endfor %}</section>'
    )

    const input = makeInput({
      parts: [
        {
          type: "group",
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textId: "pg001_gp001_tx001", textType: "section_text", text: "Hello" },
          ],
        },
        { type: "image", imageId: "pg001_im001", imageBase64: "base64data" },
      ],
    })

    const engine = createTemplateEngine(tmpDir)
    const result = await renderSectionTemplate(input, templateConfig, engine)

    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain('data-id="pg001_im001"')
  })
})

describe("two_column_render.liquid", () => {
  const templatesDir = path.resolve(__dirname, "../../../../templates")

  it("renders a single text group", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput()
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("<section")
    expect(result.html).toContain('data-id="pg001_gp001_tx001"')
    expect(result.html).toContain("Hello world")
  })

  it("renders text and image in two columns", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      parts: [
        {
          type: "group",
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textId: "pg001_gp001_tx001", textType: "section_text", text: "Some text" },
          ],
        },
        { type: "image", imageId: "pg001_im001", imageBase64: "base64data" },
      ],
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
      parts: [
        { type: "image", imageId: "pg001_im001", imageBase64: "base64a" },
        { type: "image", imageId: "pg001_im002", imageBase64: "base64b" },
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain('data-id="pg001_im001"')
    expect(result.html).toContain('data-id="pg001_im002"')
    expect(result.html).toContain("lg:basis-1/2")
  })

  it("escapes text content to prevent HTML injection", async () => {
    const engine = createTemplateEngine(templatesDir)
    const input = makeInput({
      parts: [
        {
          type: "group",
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            {
              textId: "pg001_gp001_tx001",
              textType: "section_text",
              text: '<img src=x onerror=alert("xss")>',
            },
          ],
        },
      ],
    })
    const config = { ...templateConfig, templateName: "two_column_render" }
    const result = await renderSectionTemplate(input, config, engine)

    expect(result.html).toContain("&lt;img src=x onerror=alert(&quot;xss&quot;)&gt;")
    expect(result.html).not.toContain('<img src=x onerror=alert("xss")>')
  })
})
