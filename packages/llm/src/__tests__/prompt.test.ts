import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createPromptEngine } from "../prompt.js"

const dirs: string[] = []
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
})
