import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import yaml from "js-yaml"
import { ConfigYamlEditError, setYamlPathValue } from "./config-yaml.js"

const SAMPLE = [
  "# global config",
  "default_model: \"openai:gpt-6.1-sol\"",
  "",
  "metadata:",
  "  prompt: metadata_extraction",
  "",
  "render_strategies:",
  "  llm:",
  "    render_type: llm",
  "    config:",
  "      prompt: web_generation_html",
  "      visual_refinement:",
  "        enabled: true",
  "  two_column:",
  "    render_type: template",
  "",
  "concurrency: 32",
  "",
].join("\n")

describe("setYamlPathValue", () => {
  it("adds a nested value inside an existing block and keeps comments", () => {
    const updated = setYamlPathValue(SAMPLE, ["metadata", "model"], "openai:gpt-5.4")
    expect(updated).toContain("# global config")
    expect(updated).toContain("metadata:\n  prompt: metadata_extraction\n  model: \"openai:gpt-5.4\"\n\nrender_strategies:")
  })

  it("adds a deep value next to sibling mappings", () => {
    const updated = setYamlPathValue(SAMPLE, ["render_strategies", "llm", "config", "model"], "openai:gpt-5.4")
    const parsed = yaml.load(updated) as { render_strategies: Record<string, { config?: Record<string, unknown> }> }
    expect(parsed.render_strategies.llm.config).toEqual({
      prompt: "web_generation_html",
      visual_refinement: { enabled: true },
      model: "openai:gpt-5.4",
    })
  })

  it("creates a missing top-level block", () => {
    const updated = setYamlPathValue(SAMPLE, ["glossary", "model"], "openai:gpt-5.4")
    expect((yaml.load(updated) as Record<string, unknown>).glossary).toEqual({ model: "openai:gpt-5.4" })
    expect(updated.startsWith("# global config")).toBe(true)
  })

  it("replaces an existing value", () => {
    const once = setYamlPathValue(SAMPLE, ["metadata", "model"], "openai:gpt-5.4")
    const twice = setYamlPathValue(once, ["metadata", "model"], "openai:gpt-5.5")
    expect(twice.match(/^\s+model:/gm)).toHaveLength(1)
    expect((yaml.load(twice) as { metadata: { model: string } }).metadata.model).toBe("openai:gpt-5.5")
  })

  it("removes a value and restores the original text", () => {
    const added = setYamlPathValue(SAMPLE, ["metadata", "model"], "openai:gpt-5.4")
    expect(setYamlPathValue(added, ["metadata", "model"], null)).toBe(SAMPLE)
  })

  it("removes blocks that only existed to hold the value", () => {
    const added = setYamlPathValue(SAMPLE, ["glossary", "model"], "openai:gpt-5.4")
    const removed = setYamlPathValue(added, ["glossary", "model"], null)
    expect((yaml.load(removed) as Record<string, unknown>).glossary).toBeUndefined()
  })

  it("leaves content untouched when removing a missing value", () => {
    expect(setYamlPathValue(SAMPLE, ["glossary", "model"], null)).toBe(SAMPLE)
  })

  it("preserves CRLF line endings", () => {
    const crlf = SAMPLE.replace(/\n/g, "\r\n")
    const updated = setYamlPathValue(crlf, ["metadata", "model"], "openai:gpt-5.4")
    expect(updated.replace(/\r\n/g, "")).not.toContain("\n")
  })

  it("refuses inline flow mappings instead of rewriting the file", () => {
    expect(() => setYamlPathValue("metadata: { prompt: x }\n", ["metadata", "model"], "openai:gpt-5.4"))
      .toThrow(ConfigYamlEditError)
  })

  it("round-trips every task path on the shipped config.yaml", () => {
    const shipped = fs.readFileSync(path.resolve(__dirname, "../../../../config.yaml"), "utf-8")
    const paths = [
      ["metadata", "model"],
      ["page_sectioning", "model"],
      ["styleguide_generation", "model"],
      ["render_strategies", "llm-overlay", "config", "model"],
      ["render_strategies", "llm", "config", "model"],
      ["visual_review", "prompt"],
    ]
    for (const target of paths) {
      const added = setYamlPathValue(shipped, target, "openai:gpt-5.4")
      expect(setYamlPathValue(added, target, null)).toBe(shipped)
    }
  })
})
