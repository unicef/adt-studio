import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { analyzePublisherStyles, readPublisherSources, createSectionIdFactory } from "@adt/pipeline"
import type { PageSectioningOutput, PublisherDocument, WebRenderingOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"
import { makeBeforeRun } from "../routes/stages.js"
import { reRenderPage } from "./page-edit-service.js"

let root: string
const label = "mixed-layout-test"
const config = `structure_types: {}
role_types: {}
default_render_strategy: publisher_styles
render_strategies:
  publisher_styles:
    render_type: template
    config:
      template: publisher_styles
  two_column:
    render_type: template
    config:
      template: two_column_render
generate_activities: false
`
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "publisher-storyboard-"))
  fs.writeFileSync(path.join(root, "config.yaml"), config)
  const storage = createBookStorage(label, root)
  try {
    storage.putExtractedPage({
      pageId: "pg001", pageNumber: 1, text: "Air is matter.", images: [],
      pageImage: { imageId: "pg001_page", buffer: Buffer.from("fixture-image"), format: "png", hash: "fixture-image", width: 600, height: 800 },
    })
    storage.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [{
      sectionId: createSectionIdFactory(storage, "pg001")(), sectionType: "text", pageNumber: 1, backgroundColor: "#FFFFFF", textColor: "#000000", isPruned: false,
      nodes: [
        { nodeId: "title", role: "section_heading", headingLevel: 2, text: "Air is matter", isPruned: false },
        { nodeId: "body", structure: "paragraph", isPruned: false, children: [{ nodeId: "sentence", role: "text", text: "Air has mass.", isPruned: false }] },
        { nodeId: "sidebar", structure: "sidebar", isPruned: false, children: [{ nodeId: "question", role: "text", text: "Think about water.", isPruned: false }] },
        { nodeId: "wide", role: "text", text: "Gravity pulls air toward Earth.", isPruned: false },
      ],
    }] } satisfies PageSectioningOutput)
    const { sources, fingerprint } = readPublisherSources(storage)
    const doc = analyzePublisherStyles(sources, "editorial", fingerprint)
    storage.putNodeData("publisher-styles-prototype", "book", doc)
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "old two-column output", html: "<div>old output</div>" }] })
  } finally { storage.close() }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const options = () => ({ booksDir: root, promptsDir: path.resolve("prompts"), configPath: path.join(root, "config.yaml") })

describe("publisher strategy in the main Storyboard", () => {
  it("runs the real stage and per-page rerender, appends versions, and keeps mixed regions and styles", async () => {
    makeBeforeRun(label, "storyboard", "storyboard", root, options().configPath)()
    await createStageRunner().run(label, { ...options(), fromStage: "storyboard", toStage: "storyboard", credentials: {} }, { emit: () => {} })
    const storage = createBookStorage(label, root)
    try {
      const row = storage.getLatestNodeData("web-rendering", "pg001")!
      expect(row.version).toBe(2)
      const html = (row.data as WebRenderingOutput).sections[0].html
      expect(html).toContain('data-publisher-design-version="1"')
      expect(html).toContain('data-layout="sidebar-right"')
      expect(html.match(/data-layout="full-width"/g)).toHaveLength(2)
      expect(html).toContain('<style>')
      expect(html).toContain('adt-h2')
      expect(storage.getAllNodeVersions("web-rendering", "pg001")[0].data).toMatchObject({ sections: [{ html: "<div>old output</div>" }] })
      const saved = storage.getLatestNodeData("publisher-styles-prototype", "book")!.data as PublisherDocument
      saved.styles[0].color = "#FF0000"
      storage.putNodeData("publisher-styles-prototype", "book", saved)
    } finally { storage.close() }
    const result = await reRenderPage({ ...options(), label, pageId: "pg001", sectionIndex: 0, credentials: {} })
    expect(result.version).toBe(3)
    const section = (result.rendering as WebRenderingOutput).sections[0]
    expect(section.html).toContain('data-publisher-design-version="2"')
    expect(section.html).toContain('data-layout="sidebar-right"')
    expect(section.html).toContain('color:#FF0000')
  })

  it("rejects changed sources before replacing any storyboard output", async () => {
    const storage = createBookStorage(label, root)
    try {
      const sectioning = storage.getLatestNodeData("page-sectioning", "pg001")!.data as PageSectioningOutput
      sectioning.sections[0].nodes[0].text = "A new title"
      storage.putNodeData("page-sectioning", "pg001", sectioning)
    } finally { storage.close() }
    expect(() => makeBeforeRun(label, "storyboard", "storyboard", root, options().configPath)()).toThrow("source content changed")
    await expect(createStageRunner().run(label, { ...options(), fromStage: "storyboard", toStage: "storyboard", credentials: {} }, { emit: () => {} })).rejects.toThrow("source content changed")
    const verify = createBookStorage(label, root)
    try { expect(verify.getLatestNodeData("web-rendering", "pg001")!.version).toBe(1) } finally { verify.close() }
  })
})
