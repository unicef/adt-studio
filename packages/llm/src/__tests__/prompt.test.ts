import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createPromptEngine } from "../prompt.js"

const dirs: string[] = []

describe("Luna prompt variants", () => {
  it("ships the image-sizing web rendering variant with the base Liquid contract", async () => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const folder = path.join(root, "openai_gpt_6_luna")
    const engine = createPromptEngine(root)
    expect(fs.readdirSync(folder).filter((file) => file.endsWith(".liquid"))).toEqual(["web_generation_html.liquid"])
    expect(engine.resolvePrompt("web_generation_html", { modelId: "openai:gpt-6-luna" }).filePath)
      .toBe(path.join(folder, "web_generation_html.liquid"))
    expect(engine.resolvePrompt("visual_review", { modelId: "openai:gpt-6-luna" }).filePath)
      .toBe(path.join(root, "visual_review.liquid"))
    const base = fs.readFileSync(path.join(root, "web_generation_html.liquid"), "utf8")
    const luna = fs.readFileSync(path.join(folder, "web_generation_html.liquid"), "utf8")
    const liquidTokens = (text: string) => text.match(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g)
    expect(liquidTokens(luna)).toEqual(liquidTokens(base))
    await expect(engine.renderPrompt("web_generation_html", {}, { modelId: "openai:gpt-6-luna" })).resolves.toBeDefined()
  })
})

describe("Sol prompt variants", () => {
  it.each(["web_generation_html", "visual_review"])("allows %s to stack consecutive sidebars beside prose without reordering the tree", async (name) => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const engine = createPromptEngine(root)
    const messages = await engine.renderPrompt(name, {
      section_type: "text_and_images", images: [], source_pages: [], user_instructions: "",
      nodes: [
        { node_id: "question_box", structure: "sidebar", children: [
          { node_id: "question", role: "text", text: "What is the atmosphere?" },
        ] },
        { node_id: "vocabulary_box", structure: "sidebar", children: [
          { node_id: "definition", role: "text", text: "Atmosphere: the air around Earth." },
        ] },
        { node_id: "body", role: "text", text: "The atmosphere surrounds Earth." },
      ],
      viewports: [
        { label: "Desktop", width: 1280, tailwind_prefix: "" },
        { label: "Tablet", width: 768, tailwind_prefix: "max-lg:" },
        { label: "Mobile", width: 390, tailwind_prefix: "max-sm:" },
      ],
    }, { modelId: "openai:gpt-6.1-sol" })
    const system = messages[0].content as string
    expect(system).toContain("right-floating wrapper with a vertical stack")
    expect(system).toContain("normal block flow")
    const text = messages.map(message => typeof message.content === "string" ? message.content
      : message.content.filter(part => part.type === "text").map(part => part.text).join("\n")).join("\n")
    const tree = text.match(/<content_tree>([\s\S]*?)<\/content_tree>/)?.[1] ?? ""
    expect(tree).toContain('text id=question "What is the atmosphere?"')
    expect(tree.indexOf("id=question")).toBeLessThan(tree.indexOf("id=definition"))
    expect(tree.indexOf("id=definition")).toBeLessThan(tree.indexOf("id=body"))
  })

  it.each(["web_generation_html", "visual_review", "visual_review_flexible"])("scopes %s learner controls to actual response tasks", async (name) => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const engine = createPromptEngine(root)
    const messages = await engine.renderPrompt(name, {
      section_type: "text_and_images",
      nodes: [{ node_id: "caption", role: "caption", text: "What makes turbines spin? The wind pushes their blades." }],
      images: [], source_pages: [], viewports: [], user_instructions: "",
    }, { modelId: "openai:gpt-6.1-sol" })
    const system = messages[0].content as string
    expect(system).toContain("What makes turbines spin? The wind pushes their blades.")
    expect(system).toContain("explicit response task")
    expect(system).toContain("oral/pair-work tasks retain their accessible response option")
    if (name !== "web_generation_html") {
      expect(system).toContain("Do not reject rhetorical prose for lacking a field")
      expect(system).toContain("never remove a control belonging to an explicit activity")
      expect(system).toContain("Do not reclassify saved activity nodes")
      expect(system).toContain("retain that class on a non-interactive wrapper")
    }
  })

  it.each(["visual_review", "visual_review_flexible"])("renders %s review scope and desktop-first viewport context", async (name) => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const engine = createPromptEngine(root)
    const context = {
      nodes: [{ node_id: "toc_1", role: "text", text: "Introduction vi" }],
      section_type: "table_of_contents",
      has_merged_content: true,
      user_instructions: "Use blue panels.",
      viewports: [
        { label: "Desktop", width: 1280, tailwind_prefix: "" },
        { label: "Tablet", width: 768, tailwind_prefix: "max-lg:" },
        { label: "Mobile", width: 390, tailwind_prefix: "max-sm:" },
      ],
    }
    const messages = await engine.renderPrompt(name, context, { modelId: "openai:gpt-6.1-sol" })
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe("system")
    const system = messages[0].content as string
    expect(system).toContain("## TABLE OF CONTENTS")
    expect(system).toContain('data-toc-title="true"')
    expect(system).toContain('data-toc-leader="true"')
    expect(system).toContain('data-toc-page-number="true"')
    expect(system).toContain("continuation")
    expect(system).toContain("**Desktop**: 1280px → default (no prefix — desktop)")
    expect(system).toContain("**Tablet**: 768px → `max-lg:` prefix")
    expect(system).toContain("**Mobile**: 390px → `max-sm:` prefix")
    if (name === "visual_review") {
      expect(system).toMatch(/<content_tree>\s*text id=toc_1 "Introduction vi"\s*<\/content_tree>/)
    } else {
      expect(system).toMatch(/<user_instructions>\s*Use blue panels\.\s*<\/user_instructions>/)
      expect(system).toContain("`{{ ... }}`") // Literal example must survive Liquid parsing.
    }
    const plain = await engine.renderPrompt(name, {
      ...context, section_type: "text_and_images", has_merged_content: false, user_instructions: "",
    }, { modelId: "openai:gpt-6.1-sol" })
    expect(plain[0].content).not.toContain("## TABLE OF CONTENTS")
    expect(plain[0].content).not.toContain("<user_instructions>")
  })

  it.each(["text_and_images", "table_of_contents"])("renders %s with continuation images and book settings", async (sectionType) => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const engine = createPromptEngine(root)
    const messages = await engine.renderPrompt("web_generation_html", {
      page_image_base64: "main-image",
      source_pages: [{ page_id: "pg002", image_base64: "continuation-image" }],
      section_id: "pg001_sec001",
      section_type: sectionType,
      images: [{ image_id: "figure_1", image_base64: "figure-image" }],
      nodes: [
        { node_id: "title", role: "heading", heading_level: 2, text: "Éléments" },
        { node_id: "figure_1", role: "image" },
        { node_id: "continuation", role: "text", text: "Suite à la page suivante." },
      ],
      styleguide: "Use a cream background.",
      book_fonts: [{ family: "Book Serif", role: "body", category: "serif", usage_notes: "For reading" }],
      typography: [{ className: "adt-h2", label: "Section heading", mobilePx: 24, desktopPx: 36 }],
      viewports: [
        { label: "Desktop", width: 1280, tailwind_prefix: "" },
        { label: "Tablet", width: 768, tailwind_prefix: "max-lg:" },
        { label: "Mobile", width: 375, tailwind_prefix: "max-sm:" },
      ],
      user_instructions: "Use a blue background.",
    }, { modelId: "openai:gpt-6.1-sol" })

    expect(messages.map((message) => message.role)).toEqual(["system", "user"])
    const textOf = (message: typeof messages[number]) => typeof message.content === "string"
      ? message.content
      : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")
    const system = textOf(messages[0])
    const user = textOf(messages[1])
    expect(system.includes("## TABLE OF CONTENTS LAYOUT")).toBe(sectionType === "table_of_contents")
    expect(system).toContain("Use a cream background.")
    expect(system).toContain('"Book Serif" — role: body (serif) — For reading')
    expect(system).toContain("`adt-h2` — Section heading (24px mobile → 36px desktop)")
    expect(system).toContain("**Mobile** (375px): `max-sm:`")
    expect(system).toContain("On mixed reading pages, render native answer controls")
    expect(system).toContain('data-word-bank-chip="EXACT CHOICE"')
    expect(system).toContain('data-word-bank-target="true"')
    expect(system).toContain('data-word-bank-status` element with `role="status" aria-live="polite"')
    expect(system).toContain("only when those same words are legible in the displayed image")
    const exampleClasses = [...system.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/))
    expect(exampleClasses.filter((className) => /^(?:sm|md|lg|xl|2xl):/.test(className))).toEqual([])
    expect(user).toContain("Section ID: pg001_sec001")
    expect(user).toContain(`Section type: ${sectionType}`)
    expect(user).toContain("pg002")
    expect(user).toMatch(/<user_instructions>\s*Use a blue background\.\s*<\/user_instructions>/)
    const tree = user.match(/<content_tree>([\s\S]*?)<\/content_tree>/)?.[1] ?? ""
    expect(tree.trim().split("\n")).toEqual([
      'heading id=title heading_level=2 "Éléments"',
      "image id=figure_1",
      'text id=continuation "Suite à la page suivante."',
    ])
    const userContent = messages[1].content
    expect(typeof userContent).not.toBe("string")
    if (typeof userContent !== "string") {
      expect(userContent.filter((part) => part.type === "image").map((part) => part.image))
        .toEqual(["main-image", "continuation-image", "figure-image"])
    }
  })

  it("AC-4: ships renderable variants with the original Liquid variables, tags, images and includes", async () => {
    const root = path.resolve(import.meta.dirname, "../../../../prompts")
    const folder = path.join(root, "openai_gpt_6_1_sol")
    const engine = createPromptEngine(root)
    const files = fs.readdirSync(folder).filter((file) => file.endsWith(".liquid")).sort()
    // Only the explicitly adapted prompts ship a Sol variant; the rest
    // fall back to the base templates.
    expect(files).toEqual(["visual_review.liquid", "visual_review_flexible.liquid", "web_generation_html.liquid"])
    expect(engine.resolvePrompt("page_sectioning", { modelId: "openai:gpt-6.1-sol" }).filePath)
      .toBe(path.join(root, "page_sectioning.liquid"))
    for (const file of files) {
      const base = fs.readFileSync(path.join(root, file), "utf8")
      const variant = fs.readFileSync(path.join(folder, file), "utf8")
      const liquidTokens = (text: string) => text.match(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g)
      expect(liquidTokens(variant)).toEqual(liquidTokens(base))
      const name = file.slice(0, -7)
      expect(engine.resolvePrompt(name, { modelId: "openai:gpt-6.1-sol" }).filePath).toBe(path.join(folder, file))
      expect(engine.resolvePrompt(name, { modelId: "openai:gpt-5.4" }).resolvedName).toBe(name)
      await expect(engine.renderPrompt(name, {}, { modelId: "openai:gpt-6.1-sol" })).resolves.toBeDefined()
    }
  })

  it("AC-4: keeps global Sol ahead of book base edits and honors version selection and base rollback", async () => {
    const book = tmpDir()
    const global = tmpDir()
    const folder = path.join(global, "openai_gpt_6_1_sol")
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(global, "section.liquid"), "Legacy GPT-5.4")
    fs.writeFileSync(path.join(book, "section.liquid"), "Book base edit")
    fs.writeFileSync(path.join(folder, "section.liquid"), "Global Sol")
    const engine = createPromptEngine([book, global])
    expect(engine.resolvePrompt("section", { modelId: "gpt-6.1-sol" }).filePath).toBe(path.join(folder, "section.liquid"))
    expect(engine.resolvePrompt("section", { modelId: "gpt-5.4" }).filePath).toBe(path.join(book, "section.liquid"))
    const versionDir = path.join(book, ".versions", "section__openai_gpt_6_1_sol")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, "20261005T000000000Z-000.liquid"), "Old Sol edit")
    fs.writeFileSync(path.join(versionDir, "20261005T000000001Z-000.liquid"), "New Sol edit")
    fs.writeFileSync(path.join(versionDir, ".current"), "20261005T000000000Z-000.liquid")
    expect(engine.resolvePrompt("section", { modelId: "gpt-6.1-sol" }).filePath).toBe(path.join(versionDir, "20261005T000000000Z-000.liquid"))
  })
})

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-prompt-test-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

describe("createPromptEngine", () => {
  it("renders a simple template with chat blocks", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "test.liquid"),
      `{% chat role: "system" %}You are an expert.{% endchat %}
{% chat role: "user" %}Analyze page {{ page.pageNumber }}.{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("test", {
      page: { pageNumber: 5 },
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({
      role: "system",
      content: "You are an expert.",
    })
    expect(messages[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Analyze page 5." }],
    })
  })

  it("handles image tags", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "img_test.liquid"),
      `{% chat role: "user" %}Here is an image:
{% image page.imageBase64 %}{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("img_test", {
      page: { imageBase64: "abc123" },
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe("user")
    const content = messages[0].content as Array<{ type: string }>
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: "text", text: "Here is an image:" })
    expect(content[1]).toEqual({ type: "image", image: "abc123" })
  })

  it("skips image tags whose value is missing or empty", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "img_missing.liquid"),
      `{% chat role: "user" %}Images:
{% for image in images %}ID: {{ image.id }}
{% image image.base64 %}{% endfor %}
{% image missing_top_level %}{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("img_missing", {
      images: [
        { id: "good", base64: "aGVsbG8=" }, // present
        { id: "missing" }, // no `base64` → tag must emit nothing, not "undefined"
      ],
    })

    const content = messages[0].content as Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    >
    const imageParts = content.filter((p) => p.type === "image")
    // Only the one real image survives; the missing per-item value and the
    // missing top-level value are skipped rather than emitted as "undefined".
    expect(imageParts).toEqual([{ type: "image", image: "aGVsbG8=" }])
    expect(JSON.stringify(content)).not.toContain("undefined")
  })

  it("skips image tags whose value is undefined or empty", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "img_undefined.liquid"),
      `{% chat role: "user" %}Before.
{% image page.missing %}
After.{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("img_undefined", {
      page: {},
    })

    expect(messages).toHaveLength(1)
    const content = messages[0].content as Array<{ type: string; text?: string }>
    // No image part — just the surrounding text.
    expect(content.every((p) => p.type === "text")).toBe(true)
    expect(content.map((p) => p.text).join(" ")).toContain("Before.")
    expect(content.map((p) => p.text).join(" ")).toContain("After.")
  })

  it("renders for-loops in templates", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "loop_test.liquid"),
      `{% chat role: "system" %}TYPES:
{% for t in types %}- {{ t.key }}: {{ t.description }}
{% endfor %}{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("loop_test", {
      types: [
        { key: "heading", description: "A heading" },
        { key: "paragraph", description: "A paragraph" },
      ],
    })

    expect(messages).toHaveLength(1)
    const content = messages[0].content as string
    expect(content).toContain("- heading: A heading")
    expect(content).toContain("- paragraph: A paragraph")
  })

  it("uses exact model-specific prompt variants before the base prompt", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(
      path.join(dir, "section__openai_gpt_5_5.liquid"),
      `{% chat role: "user" %}GPT 5.5{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "GPT 5.5" }],
    })
    expect(engine.resolvePrompt("section", { modelId: "openai:gpt-5.5" }).resolvedName)
      .toBe("section__openai_gpt_5_5")
  })

  it("uses prompt files from model folders before legacy flat variants", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(
      path.join(dir, "section__openai_gpt_5_5.liquid"),
      `{% chat role: "user" %}Legacy flat{% endchat %}`
    )
    const modelDir = path.join(dir, "openai_gpt_5_5")
    fs.mkdirSync(modelDir, { recursive: true })
    fs.writeFileSync(
      path.join(modelDir, "section.liquid"),
      `{% chat role: "user" %}Model folder{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const resolution = engine.resolvePrompt("section", { modelId: "openai:gpt-5.5" })
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(resolution.resolvedName).toBe("section__openai_gpt_5_5")
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Model folder" }],
    })
  })

  it("resolves includes from the selected model folder before root includes", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(path.join(dir, "_shared.liquid"), "Root include")
    const modelDir = path.join(dir, "openai_gpt_5_5")
    fs.mkdirSync(modelDir, { recursive: true })
    fs.writeFileSync(
      path.join(modelDir, "section.liquid"),
      `{% chat role: "user" %}{% include "_shared" %}{% endchat %}`
    )
    fs.writeFileSync(path.join(modelDir, "_shared.liquid"), "Model include")

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Model include" }],
    })
  })

  it("uses versioned model overrides before prompt files from model folders", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    const modelDir = path.join(dir, "openai_gpt_5_5")
    fs.mkdirSync(modelDir, { recursive: true })
    fs.writeFileSync(
      path.join(modelDir, "section.liquid"),
      `{% chat role: "user" %}Model folder{% endchat %}`
    )
    const versionDir = path.join(dir, ".versions", "section__openai_gpt_5_5")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(
      path.join(versionDir, "20260101T000000Z.liquid"),
      `{% chat role: "user" %}Versioned{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Versioned" }],
    })
  })

  it("uses exact variants for any non-default model id", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(
      path.join(dir, "section__google_gemini_2_5_pro.liquid"),
      `{% chat role: "user" %}Gemini{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const resolution = engine.resolvePrompt("section", { modelId: "google:gemini-2.5-pro" })
    const messages = await engine.renderPrompt("section", {}, { modelId: "google:gemini-2.5-pro" })

    expect(resolution.resolvedName).toBe("section__google_gemini_2_5_pro")
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Gemini" }],
    })
  })

  it("treats bare model ids as OpenAI model ids for prompt variants", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(
      path.join(dir, "section__openai_gpt_5_5.liquid"),
      `{% chat role: "user" %}GPT 5.5{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const resolution = engine.resolvePrompt("section", { modelId: "gpt-5.5" })
    const messages = await engine.renderPrompt("section", {}, { modelId: "gpt-5.5" })

    expect(resolution.resolvedName).toBe("section__openai_gpt_5_5")
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "GPT 5.5" }],
    })
  })

  it("treats gpt-5.4 as the base prompt model", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )
    fs.writeFileSync(
      path.join(dir, "section__openai_gpt_5_4.liquid"),
      `{% chat role: "user" %}Should not be used{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const resolution = engine.resolvePrompt("section", { modelId: "openai:gpt-5.4" })
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.4" })

    expect(resolution.resolvedName).toBe("section")
    expect(resolution.modelId).toBeNull()
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Base" }],
    })
  })

  it("uses a GPT-5.6-sol variant even when it is the runtime default model", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`,
    )
    fs.writeFileSync(
      path.join(dir, "section__openai_gpt_5_6_sol.liquid"),
      `{% chat role: "user" %}Variant{% endchat %}`,
    )

    const engine = createPromptEngine(dir)
    const resolution = engine.resolvePrompt("section", {
      modelId: "openai:gpt-5.6-sol",
    })
    const messages = await engine.renderPrompt(
      "section",
      {},
      { modelId: "openai:gpt-5.6-sol" },
    )

    expect(resolution.resolvedName).toBe("section__openai_gpt_5_6_sol")
    expect(resolution.modelId).toBe("openai:gpt-5.6-sol")
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Variant" }],
    })
  })

  it("falls back to the base prompt when a model-specific variant is missing", async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, "section.liquid"),
      `{% chat role: "user" %}Base{% endchat %}`
    )

    const engine = createPromptEngine(dir)
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Base" }],
    })
    const resolution = engine.resolvePrompt("section", { modelId: "openai:gpt-5.5" })
    expect(resolution.resolvedName).toBe("section")
    expect(resolution.modelId).toBe("openai:gpt-5.5")
  })

  it("uses the newest versioned book override before flat prompts", async () => {
    const bookDir = tmpDir()
    const globalDir = tmpDir()
    fs.writeFileSync(
      path.join(globalDir, "section__openai_gpt_5_5.liquid"),
      `{% chat role: "user" %}Global variant{% endchat %}`
    )
    const versionDir = path.join(bookDir, ".versions", "section__openai_gpt_5_5")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(
      path.join(versionDir, "20260101T000000Z.liquid"),
      `{% chat role: "user" %}Old{% endchat %}`
    )
    fs.writeFileSync(
      path.join(versionDir, "20260102T000000Z.liquid"),
      `{% chat role: "user" %}New{% endchat %}`
    )

    const engine = createPromptEngine([bookDir, globalDir])
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "New" }],
    })
  })

  it("uses the selected current versioned book override before the newest version", async () => {
    const bookDir = tmpDir()
    const globalDir = tmpDir()
    fs.writeFileSync(
      path.join(globalDir, "section__openai_gpt_5_5.liquid"),
      `{% chat role: "user" %}Global variant{% endchat %}`
    )
    const versionDir = path.join(bookDir, ".versions", "section__openai_gpt_5_5")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(
      path.join(versionDir, "20260101T000000Z.liquid"),
      `{% chat role: "user" %}Selected old{% endchat %}`
    )
    fs.writeFileSync(
      path.join(versionDir, "20260102T000000Z.liquid"),
      `{% chat role: "user" %}Newest{% endchat %}`
    )
    fs.writeFileSync(path.join(versionDir, ".current"), "20260101T000000Z.liquid\n")

    const engine = createPromptEngine([bookDir, globalDir])
    const messages = await engine.renderPrompt("section", {}, { modelId: "openai:gpt-5.5" })

    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Selected old" }],
    })
  })
})
