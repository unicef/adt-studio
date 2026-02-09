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
})
