import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  applyAutoRepairs,
  buildPageSectioningConfig,
  finalizePageSectioning,
  flattenTreeToText,
  runValidator,
  sectionPage,
  type PageSectioningConfig,
  type PageSectioningInput,
} from "../page-sectioning.js"

// ── Test helpers ────────────────────────────────────────────────

/** Minimal validator context for testing invariants. */
function makeCtx(overrides?: {
  structureKeys?: string[]
  roleKeys?: string[]
  sectionTypeKeys?: string[]
  availableImageIds?: string[]
  mode?: "page" | "dynamic"
}) {
  return {
    structureKeys: new Set(
      overrides?.structureKeys ?? [
        "paragraph",
        "group",
        "image_group",
        "table_cell",
        "list",
      ]
    ),
    roleKeys: new Set(overrides?.roleKeys ?? ["heading", "text", "caption", "image"]),
    sectionTypeKeys: new Set(
      overrides?.sectionTypeKeys ?? ["text_only", "images_only"]
    ),
    availableImageIds: new Set(overrides?.availableImageIds ?? []),
    mode: overrides?.mode,
  }
}

function makeInput(
  overrides?: Partial<PageSectioningInput>
): PageSectioningInput {
  return {
    pageId: "pg001",
    pageNumber: 1,
    text: "Page text",
    imageBase64: "base64img",
    availableImages: [],
    ...overrides,
  }
}

function makeConfig(
  overrides?: Partial<PageSectioningConfig>
): PageSectioningConfig {
  return {
    structureTypes: [{ key: "paragraph", description: "Paragraph" }],
    roleTypes: [{ key: "text", description: "Body text" }],
    sectionTypes: [{ key: "text_only", description: "Text only" }],
    prunedRoleTypes: [],
    prunedSectionTypes: [],
    disabledSectionTypes: [],
    promptName: "page_sectioning",
    refinementPromptName: "page_sectioning_refinement",
    modelId: "openai:gpt-5.4",
    maxRetries: 5,
    maxRefinements: 0,
    mode: "dynamic",
    ...overrides,
  }
}

// ── buildPageSectioningConfig ───────────────────────────────────

describe("buildPageSectioningConfig", () => {
  it("extracts structureTypes, roleTypes, and sectionTypes from AppConfig", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading", text: "Body" },
      structure_types: { paragraph: "Paragraph", group: "Group" },
      section_types: {
        text_only: "Text only",
        images_only: "Images only",
      },
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.structureTypes).toEqual([
      { key: "paragraph", description: "Paragraph" },
      { key: "group", description: "Group" },
    ])
    expect(config.roleTypes).toEqual([
      { key: "heading", description: "Heading" },
      { key: "text", description: "Body" },
    ])
    expect(config.sectionTypes).toEqual([
      { key: "text_only", description: "Text only" },
      { key: "images_only", description: "Images only" },
    ])
  })

  it("excludes disabled_section_types from sectionTypes", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      section_types: {
        text_only: "Text only",
        images_only: "Images only",
        credits: "Credits",
      },
      disabled_section_types: ["images_only"],
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.sectionTypes).toEqual([
      { key: "text_only", description: "Text only" },
      { key: "credits", description: "Credits" },
    ])
    expect(config.disabledSectionTypes).toEqual(["images_only"])
  })

  it("hides all activity_* section types when generate_activities is false", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      section_types: {
        text_only: "Text only",
        activity_multiple_choice: "MCQ",
        activity_other: "Other activity",
      },
      generate_activities: false,
    }

    const config = buildPageSectioningConfig(appConfig)
    // activity_* types (including activity_other, which has no render strategy)
    // are excluded by the prefix rule — not a hand-maintained list.
    expect(config.sectionTypes).toEqual([{ key: "text_only", description: "Text only" }])
  })

  it("keeps activity types when generate_activities is not false", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      section_types: { text_only: "Text only", activity_multiple_choice: "MCQ" },
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.sectionTypes.map((t) => t.key)).toEqual(["text_only", "activity_multiple_choice"])
  })

  it("carries through pruned_role_types and pruned_section_types", () => {
    const appConfig: AppConfig = {
      role_types: { page_number: "Page number", text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      section_types: { text_only: "Text", credits: "Credits" },
      pruned_role_types: ["page_number"],
      pruned_section_types: ["credits"],
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.prunedRoleTypes).toEqual(["page_number"])
    expect(config.prunedSectionTypes).toEqual(["credits"])
  })

  it("applies defaults when page_sectioning is not specified", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.promptName).toBe("page_sectioning")
    expect(config.modelId).toBe("openai:gpt-5.4")
    expect(config.maxRetries).toBe(5)
    expect(config.maxRefinements).toBe(0)
  })

  it("uses page_sectioning overrides when provided", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      page_sectioning: {
        prompt: "custom_sectioning",
        model: "openai:gpt-4.1-mini",
        max_retries: 7,
        max_refinements: 2,
      },
    }

    const config = buildPageSectioningConfig(appConfig)
    expect(config.promptName).toBe("custom_sectioning")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.maxRetries).toBe(7)
    expect(config.maxRefinements).toBe(2)
  })

  it("defaults mode to dynamic when not set", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
    }
    expect(buildPageSectioningConfig(appConfig).mode).toBe("dynamic")
  })

  it("propagates mode from page_sectioning.mode", () => {
    const appConfig: AppConfig = {
      role_types: { text: "Body" },
      structure_types: { paragraph: "Paragraph" },
      page_sectioning: { mode: "page" },
    }
    expect(buildPageSectioningConfig(appConfig).mode).toBe("page")
  })
})

// ── runValidator ────────────────────────────────────────────────

describe("runValidator", () => {
  it("requires exactly one section in page mode", () => {
    const result = runValidator(
      {
        reasoning: "Split the page",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "First" }],
          },
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Second" }],
          },
        ],
      },
      makeCtx({ mode: "page" }),
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Page mode requires exactly one section, but the response contains 2. Merge all page content into one section."
    )
  })

  it("accepts a simple section with a leaf-only node", () => {
    const result = runValidator(
      {
        reasoning: "ok",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Hello" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("reports error when node has both structure and role", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "paragraph",
                role: "text",
                text: "oops",
              },
            ],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/cannot set both "structure" and "role"/)
  })

  it("reports error when node has neither structure nor role", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ text: "orphan" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/every node must have either/)
  })

  it("reports error when a non-image_group/table_cell container has no children", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ structure: "paragraph" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/"paragraph" must have children/)
  })

  it("accepts empty table_cell and a bare image leaf", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              { structure: "table_cell" },
              { role: "image", image_id: "pg001_im001" },
            ],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
  })

  it("accepts an image_group with an image leaf plus a caption", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "image_group",
                children: [
                  { role: "image", image_id: "pg001_im001" },
                  { role: "caption", text: "A caption." },
                ],
              },
            ],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
  })

  it("reports error when image_group lacks an image leaf", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ structure: "image_group" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(
      /image_group's first child must be a leaf with role "image"/
    )
  })

  it("reports error when image_group contains only an image leaf (standalone should be bare)", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "image_group",
                children: [{ role: "image", image_id: "pg001_im001" }],
              },
            ],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(
      /image_group must contain the image leaf plus at least one associated content leaf/
    )
  })

  it("reports error when image_group's first child is not an image leaf", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "image_group",
                children: [
                  { role: "caption", text: "A caption." },
                  { role: "image", image_id: "pg001_im001" },
                ],
              },
            ],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(
      /image_group's first child must be a leaf with role "image"/
    )
  })

  it("reports error when image leaf's image_id is not available", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "image", image_id: "pg001_im999" }],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(
      /"pg001_im999" is not one of the available image IDs/
    )
  })

  it("reports error when same image_id appears twice", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              { role: "image", image_id: "pg001_im001" },
              { role: "image", image_id: "pg001_im001" },
            ],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/already placed elsewhere/)
  })

  it("allows available images to be omitted when not relevant to the page", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Hi" }],
          },
        ],
      },
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("reports error on unknown section_type", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "bogus_type",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Hi" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/invalid section_type "bogus_type"/)
  })

  it("reports error on unknown structure", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "bogus_container",
                children: [{ role: "text", text: "Hi" }],
              },
            ],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/invalid value "bogus_container"/)
  })

  it("reports error on unknown role", () => {
    const result = runValidator(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "bogus_role", text: "Hi" }],
          },
        ],
      },
      makeCtx()
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join("\n")).toMatch(/invalid value "bogus_role"/)
  })
})

// ── finalizePageSectioning ──────────────────────────────────────

describe("finalizePageSectioning", () => {
  it("assigns sequential nodeId per page in DFS order", () => {
    const input = makeInput()
    const config = makeConfig()
    const output = finalizePageSectioning(
      {
        reasoning: "ok",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "paragraph",
                children: [
                  { role: "text", text: "First" },
                  { role: "text", text: "Second" },
                ],
              },
              { role: "text", text: "Third" },
            ],
          },
        ],
      },
      input,
      config
    )

    const [para, third] = output.sections[0].nodes
    expect(para.nodeId).toBe("pg001_n0001")
    expect(para.children?.[0].nodeId).toBe("pg001_n0002")
    expect(para.children?.[1].nodeId).toBe("pg001_n0003")
    expect(third.nodeId).toBe("pg001_n0004")
  })

  it("assigns sectionId per section index", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "A" }],
          },
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "B" }],
          },
        ],
      },
      makeInput(),
      makeConfig()
    )
    expect(output.sections[0].sectionId).toBe("pg001_sec001")
    expect(output.sections[1].sectionId).toBe("pg001_sec002")
  })

  it("marks leaf isPruned when role is in prunedRoleTypes", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              { role: "text", text: "Keep" },
              { role: "page_number", text: "42" },
            ],
          },
        ],
      },
      makeInput(),
      makeConfig({ prunedRoleTypes: ["page_number"] })
    )
    const leaves = output.sections[0].nodes
    expect(leaves[0].isPruned).toBe(false)
    expect(leaves[1].isPruned).toBe(true)
  })

  it("marks section isPruned when sectionType is in prunedSectionTypes", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Keep" }],
          },
          {
            section_type: "credits",
            background_color: "#fff",
            text_color: "#000",
            page_number: null,
            nodes: [{ role: "text", text: "Drop" }],
          },
        ],
      },
      makeInput(),
      makeConfig({ prunedSectionTypes: ["credits"] })
    )
    expect(output.sections[0].isPruned).toBe(false)
    expect(output.sections[1].isPruned).toBe(true)
  })
})

// ── flattenTreeToText ───────────────────────────────────────────

describe("flattenTreeToText", () => {
  it("concatenates non-pruned leaf text in reading order", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              {
                structure: "paragraph",
                children: [
                  { role: "text", text: "Hello" },
                  { role: "text", text: "world" },
                ],
              },
              { role: "text", text: "!" },
            ],
          },
        ],
      },
      makeInput(),
      makeConfig()
    )
    expect(flattenTreeToText(output)).toBe("Hello world !")
  })

  it("skips pruned leaves", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [
              { role: "text", text: "Keep" },
              { role: "page_number", text: "42" },
            ],
          },
        ],
      },
      makeInput(),
      makeConfig({ prunedRoleTypes: ["page_number"] })
    )
    expect(flattenTreeToText(output)).toBe("Keep")
  })

  it("skips pruned sections entirely", () => {
    const output = finalizePageSectioning(
      {
        reasoning: "",
        sections: [
          {
            section_type: "text_only",
            background_color: "#fff",
            text_color: "#000",
            page_number: 1,
            nodes: [{ role: "text", text: "Body" }],
          },
          {
            section_type: "credits",
            background_color: "#fff",
            text_color: "#000",
            page_number: null,
            nodes: [{ role: "text", text: "Credits copy" }],
          },
        ],
      },
      makeInput(),
      makeConfig({ prunedSectionTypes: ["credits"] })
    )
    expect(flattenTreeToText(output)).toBe("Body")
  })
})

// ── sectionPage ─────────────────────────────────────────────────

describe("sectionPage", () => {
  it("throws when structureTypes is empty", async () => {
    const fakeLlm = makeFakeLlm(() => ({ reasoning: "", sections: [] }))
    await expect(
      sectionPage(
        makeInput(),
        makeConfig({ structureTypes: [] }),
        fakeLlm
      )
    ).rejects.toThrow("No structure types configured")
  })

  it("throws when roleTypes is empty", async () => {
    const fakeLlm = makeFakeLlm(() => ({ reasoning: "", sections: [] }))
    await expect(
      sectionPage(makeInput(), makeConfig({ roleTypes: [] }), fakeLlm)
    ).rejects.toThrow("No role types configured")
  })

  it("throws when sectionTypes is empty", async () => {
    const fakeLlm = makeFakeLlm(() => ({ reasoning: "", sections: [] }))
    await expect(
      sectionPage(makeInput(), makeConfig({ sectionTypes: [] }), fakeLlm)
    ).rejects.toThrow("No section types configured")
  })

  it("happy path: returns finalized tree with assigned IDs", async () => {
    const fakeLlm = makeFakeLlm(() => ({
      reasoning: "Grouped content",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "paragraph",
              children: [{ role: "text", text: "Hello" }],
            },
          ],
        },
      ],
    }))

    const output = await sectionPage(makeInput(), makeConfig(), fakeLlm)

    expect(output.reasoning).toBe("Grouped content")
    expect(output.sections).toHaveLength(1)
    expect(output.sections[0].sectionId).toBe("pg001_sec001")
    expect(output.sections[0].sectionType).toBe("text_only")
    expect(output.sections[0].nodes[0].nodeId).toBe("pg001_n0001")
    expect(output.sections[0].nodes[0].structure).toBe("paragraph")
    expect(output.sections[0].nodes[0].children?.[0].nodeId).toBe("pg001_n0002")
    expect(output.sections[0].nodes[0].children?.[0].text).toBe("Hello")
  })

  it("wires page mode into the initial generation validator", async () => {
    const invalidTree = {
      reasoning: "Split the page",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [{ role: "text", text: "First" }],
        },
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [{ role: "text", text: "Second" }],
        },
      ],
    }
    const validTree = {
      ...invalidTree,
      reasoning: "Merged the page",
      sections: invalidTree.sections.slice(0, 1),
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        if (opts.prompt === "page_sectioning") {
          expect(opts.validate?.(invalidTree, opts.context ?? {})).toEqual({
            valid: false,
            errors: [
              "Page mode requires exactly one section, but the response contains 2. Merge all page content into one section.",
            ],
          })
          return { object: validTree as T }
        }
        return {
          object: {
            approved: true,
            reasoning: "Looks good.",
            nodes_and_sections: null,
          } as T,
        }
      },
    }

    const output = await sectionPage(
      makeInput(),
      makeConfig({ mode: "page" }),
      fakeLlm,
    )

    expect(output.reasoning).toBe("Merged the page")
    expect(output.sections).toHaveLength(1)
  })

  it("adopts reviewer's replacement tree when reviewer rejects then proposes valid replacement", async () => {
    const initialTree = {
      reasoning: "Initial draft",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [{ role: "text", text: "Initial" }],
        },
      ],
    }
    const replacementTree = {
      reasoning: "Reviewer rewrote it",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [{ role: "text", text: "Refined" }],
        },
      ],
    }

    let refinementCallCount = 0
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        if (opts.prompt === "page_sectioning") {
          return { object: initialTree as T }
        }
        // refinement
        refinementCallCount++
        if (refinementCallCount === 1) {
          return {
            object: {
              approved: false,
              reasoning: "Needs clearer wording.",
              nodes_and_sections: replacementTree,
            } as T,
          }
        }
        return {
          object: {
            approved: true,
            reasoning: "Looks good now.",
            nodes_and_sections: null,
          } as T,
        }
      },
    }

    const output = await sectionPage(
      makeInput(),
      makeConfig({ maxRefinements: 2 }),
      fakeLlm
    )

    expect(refinementCallCount).toBe(2)
    expect(output.reasoning).toBe("Reviewer rewrote it")
    expect(output.sections[0].nodes[0].text).toBe("Refined")
  })
})

// ── applyAutoRepairs ────────────────────────────────────────────

describe("applyAutoRepairs", () => {
  it("unwraps an image_group containing only an image leaf into a bare image leaf", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "image_group",
              children: [{ role: "image", image_id: "pg001_im001" }],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    expect(raw.sections[0].nodes).toEqual([
      { role: "image", image_id: "pg001_im001" },
    ])
  })

  it("reorders an image_group so the image leaf is the first child", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "image_group",
              children: [
                { role: "caption", text: "Figure 1." },
                { role: "image", image_id: "pg001_im001" },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const ig = raw.sections[0].nodes[0] as {
      children: Array<{ role: string; text?: string; image_id?: string }>
    }
    expect(ig.children[0].role).toBe("image")
    expect(ig.children[1].role).toBe("caption")
  })

  it("moves a container's text into a leading text leaf when both text and children are present", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "paragraph",
              text: "Title text",
              children: [{ role: "text", text: "Body" }],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const para = raw.sections[0].nodes[0] as {
      structure: string
      text: string | null
      children: Array<{ role: string; text: string }>
    }
    expect(para.text).toBeNull()
    expect(para.children[0]).toEqual({ role: "text", text: "Title text" })
    expect(para.children[1]).toEqual({ role: "text", text: "Body" })
  })

  it("splits a single-letter-row leaf into one leaf per letter (crossword cells)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "activity",
              children: [
                { role: "activity_fill_in_the_blank", text: "R E C E T A S" },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const activity = raw.sections[0].nodes[0] as {
      children: Array<{ role: string; text: string }>
    }
    expect(activity.children).toHaveLength(7)
    expect(activity.children.map((c) => c.text)).toEqual([
      "R",
      "E",
      "C",
      "E",
      "T",
      "A",
      "S",
    ])
    expect(activity.children.every((c) => c.role === "activity_fill_in_the_blank")).toBe(true)
  })

  it("does not split a single-leaf single-blank line like 'Nombre: ___'", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            { role: "activity_fill_in_the_blank", text: "Nombre: ___" },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    expect(raw.sections[0].nodes).toHaveLength(1)
    expect(
      (raw.sections[0].nodes[0] as { text: string }).text
    ).toBe("Nombre: ___")
  })

  it("does not split a normal multi-word sentence", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [{ role: "text", text: "Hola mundo" }],
        },
      ],
    }
    applyAutoRepairs(raw)
    expect(raw.sections[0].nodes).toHaveLength(1)
  })

  it("repaired tree passes the validator (image_group unwrap)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "image_group",
              children: [{ role: "image", image_id: "pg001_im001" }],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const result = runValidator(
      raw,
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
  })

  it("repaired tree passes the validator (image_group reorder)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "image_group",
              children: [
                { role: "caption", text: "Figure 1." },
                { role: "image", image_id: "pg001_im001" },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const result = runValidator(
      raw,
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
  })

  it("keeps image first when image_group has both text and children (repair ordering)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "image_group",
              text: "Title overlay",
              children: [
                { role: "image", image_id: "pg001_im001" },
                { role: "caption", text: "A caption." },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const ig = raw.sections[0].nodes[0] as {
      structure: string
      text: string | null
      children: Array<{ role: string; text?: string; image_id?: string }>
    }
    expect(ig.text).toBeNull()
    expect(ig.children[0].role).toBe("image")
    const result = runValidator(
      raw,
      makeCtx({ availableImageIds: ["pg001_im001"] })
    )
    expect(result.valid).toBe(true)
  })

  it("recurses into nested children (image_group inside a paragraph)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            {
              structure: "paragraph",
              children: [
                {
                  structure: "image_group",
                  children: [{ role: "image", image_id: "pg001_im001" }],
                },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const para = raw.sections[0].nodes[0] as {
      children: Array<{ role?: string; image_id?: string; structure?: string }>
    }
    expect(para.children).toHaveLength(1)
    expect(para.children[0]).toEqual({ role: "image", image_id: "pg001_im001" })
  })

  it("canonicalizes the invented \"boxed_text\" structure to \"panel\" (at any depth)", () => {
    const raw = {
      reasoning: "",
      sections: [
        {
          section_type: "text_only",
          background_color: "#fff",
          text_color: "#000",
          page_number: 1,
          nodes: [
            { structure: "boxed_text", children: [{ role: "text", text: "Note." }] },
            {
              structure: "group",
              children: [
                { structure: "boxed_text", children: [{ role: "text", text: "Tip." }] },
              ],
            },
          ],
        },
      ],
    }
    applyAutoRepairs(raw)
    const nodes = raw.sections[0].nodes as Array<{
      structure: string
      children: Array<{ structure?: string }>
    }>
    expect(nodes[0].structure).toBe("panel")
    expect(nodes[1].children[0].structure).toBe("panel")
  })
})

// ── Shared fake LLM helper ──────────────────────────────────────

/** Fake LLM that routes on prompt name: initial prompts get the tree builder,
 * refinement prompts get approved=true by default. */
function makeFakeLlm(
  initialBuilder: () => { reasoning: string; sections: unknown[] }
): LLMModel {
  return {
    generateObject: async <T>(opts: GenerateObjectOptions) => {
      if (opts.prompt === "page_sectioning") {
        return {
          object: initialBuilder() as T,
        } as GenerateObjectResult<T>
      }
      // page_sectioning_refinement (or anything else): approve.
      return {
        object: {
          approved: true,
          reasoning: "Looks good.",
          nodes_and_sections: null,
        } as T,
      } as GenerateObjectResult<T>
    },
  }
}
