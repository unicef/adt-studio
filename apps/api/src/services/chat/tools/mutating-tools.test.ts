import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { ChatToolContext } from "../context.js"
import type { StageService } from "../../stage-service.js"
import type { TaskService } from "../../task-service.js"
import { buildToolPreview } from "../tool-preview.js"
import {
  editStoryboardSection,
  editTranslation,
  runStages,
  updateStageConfig,
} from "./mutating-tools.js"

const LABEL = "mutation-book"

let booksDir: string
let ctx: ChatToolContext
let startStageRun: ReturnType<typeof vi.fn>

function putNode(node: string, itemId: string, data: unknown) {
  const storage = createBookStorage(LABEL, booksDir)
  try {
    storage.putNodeData(node, itemId, data)
  } finally {
    storage.close()
  }
}

function rendering(html: string) {
  return {
    sections: [
      { sectionIndex: 0, sectionType: "content", reasoning: "", html },
      { sectionIndex: 1, sectionType: "content", reasoning: "", html: "<p>Other</p>" },
    ],
  }
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-mutations-"))
  createBookStorage(LABEL, booksDir).close()
  startStageRun = vi.fn(() => ({ status: "started" as const, id: "run-1" }))
  ctx = {
    paths: {
      booksDir,
      promptsDir: path.join(booksDir, "prompts"),
      webAssetsDir: path.join(booksDir, "assets"),
      configPath: path.join(booksDir, "config.yaml"),
    },
    safeLabel: LABEL,
    chatId: "chat-1",
    threadId: "thread-1",
    credentials: { openaiApiKey: "sk-test" },
    locale: "en",
    screen: {},
    stageService: {
      getStatus: () => ({}) as never,
      getQueuedStages: () => [],
      startStageRun,
      cancelStageRun: () => null,
    } as unknown as StageService,
    taskService: {} as TaskService,
  }
})

afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true })
})

function markRunning(step: string) {
  const storage = createBookStorage(LABEL, booksDir)
  try {
    storage.markStepStarted(step)
  } finally {
    storage.close()
  }
}

describe("pipeline-run guard", () => {
  it("returns a tool error rather than throwing while a step runs", async () => {
    markRunning("page-sectioning")
    putNode("web-rendering", "pg001", rendering("<p>Before</p>"))

    const result = (await editStoryboardSection.execute(ctx, {
      pageId: "pg001",
      sectionIndex: 0,
      html: "<p>After</p>",
    } as never)) as { status: string; runningSteps: string[] }

    expect(result.status).toBe("blocked")
    expect(result.runningSteps).toEqual(["page-sectioning"])
  })

  it("blocks run_stages too", async () => {
    markRunning("web-rendering")
    const result = (await runStages.execute(ctx, {
      fromStage: "storyboard",
      toStage: "storyboard",
    } as never)) as { status: string }
    expect(result.status).toBe("blocked")
    expect(startStageRun).not.toHaveBeenCalled()
  })
})

describe("run_stages", () => {
  it("starts the run and reports exactly what was cleared", async () => {
    const result = (await runStages.execute(ctx, {
      fromStage: "glossary",
      toStage: "package",
    } as never)) as {
      status: string
      clearedNodes: string[]
      resetStages: string[]
      clearedExtractedData: boolean
    }

    expect(result.status).toBe("started")
    expect(startStageRun).toHaveBeenCalledOnce()
    expect(result.resetStages).toContain("package")
    expect(result.clearedExtractedData).toBe(false)
    // Glossary re-merges its own prior output, so it survives a run that
    // includes it — the card must not claim otherwise.
    expect(result.clearedNodes).not.toContain("glossary")
    expect(result.clearedNodes).toContain("catalog-translation")
  })

  it("refuses without an OpenAI key, whatever the chat model is", async () => {
    const result = (await runStages.execute(
      { ...ctx, credentials: { anthropicApiKey: "sk-ant" } },
      { fromStage: "glossary", toStage: "glossary" } as never,
    )) as { status: string; message: string }
    expect(result.status).toBe("error")
    expect(result.message).toMatch(/OpenAI/)
    expect(startStageRun).not.toHaveBeenCalled()
  })
})

describe("update_stage_config", () => {
  it("merges keys and drops the ones set to null", async () => {
    await updateStageConfig.execute(ctx, {
      changes: { glossary_amount: "comprehensive", storyboard_effort: "high" },
    } as never)

    const result = (await updateStageConfig.execute(ctx, {
      changes: { storyboard_effort: null },
    } as never)) as { config: Record<string, unknown>; removedKeys: string[] }

    expect(result.config).toEqual({ glossary_amount: "comprehensive" })
    expect(result.removedKeys).toEqual(["storyboard_effort"])
  })
})

describe("edit_storyboard_section", () => {
  it("writes a new version and leaves other sections alone", async () => {
    putNode("web-rendering", "pg001", rendering("<p>Before</p>"))

    const result = (await editStoryboardSection.execute(ctx, {
      pageId: "pg001",
      sectionIndex: 0,
      html: "<p>After</p>",
    } as never)) as { status: string; version: number }

    expect(result.status).toBe("ok")
    expect(result.version).toBe(2)

    const storage = createBookStorage(LABEL, booksDir)
    try {
      const saved = storage.getLatestNodeData("web-rendering", "pg001")?.data as {
        sections: Array<{ html: string }>
      }
      expect(saved.sections[0].html).toBe("<p>After</p>")
      expect(saved.sections[1].html).toBe("<p>Other</p>")
    } finally {
      storage.close()
    }
  })

  it("names the available sections when the index is wrong", async () => {
    putNode("web-rendering", "pg001", rendering("<p>Before</p>"))
    const result = (await editStoryboardSection.execute(ctx, {
      pageId: "pg001",
      sectionIndex: 7,
      html: "<p>x</p>",
    } as never)) as { status: string; message: string }
    expect(result.status).toBe("not-found")
    expect(result.message).toMatch(/0, 1/)
  })

  it("tells the user to run Storyboard when nothing is rendered", async () => {
    const result = (await editStoryboardSection.execute(ctx, {
      pageId: "pg404",
      sectionIndex: 0,
      html: "<p>x</p>",
    } as never)) as { status: string; message: string }
    expect(result.status).toBe("not-found")
    expect(result.message).toMatch(/Storyboard/)
  })
})

describe("edit_translation", () => {
  beforeEach(() => {
    putNode("text-catalog-translation", "es", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        { id: "pg001_t001", text: "Hola" },
        { id: "pg001_t002", text: "Adiós" },
      ],
    })
  })

  it("replaces one entry and versions the catalog", async () => {
    const result = (await editTranslation.execute(ctx, {
      language: "es",
      entryId: "pg001_t001",
      text: "Buenos días",
    } as never)) as { status: string; version: number }

    expect(result.status).toBe("ok")
    expect(result.version).toBe(2)

    const storage = createBookStorage(LABEL, booksDir)
    try {
      const saved = storage.getLatestNodeData("text-catalog-translation", "es")?.data as {
        entries: Array<{ id: string; text: string }>
      }
      expect(saved.entries).toEqual([
        { id: "pg001_t001", text: "Buenos días" },
        { id: "pg001_t002", text: "Adiós" },
      ])
    } finally {
      storage.close()
    }
  })

  it("refuses an entry id that is not in the catalog", async () => {
    const result = (await editTranslation.execute(ctx, {
      language: "es",
      entryId: "nope",
      text: "x",
    } as never)) as { status: string; message: string }
    expect(result.status).toBe("not-found")
    expect(result.message).toMatch(/get_translations/)
  })

  it("refuses a language that was never translated", async () => {
    const result = (await editTranslation.execute(ctx, {
      language: "fr",
      entryId: "pg001_t001",
      text: "x",
    } as never)) as { status: string }
    expect(result.status).toBe("not-found")
  })
})

describe("tool previews", () => {
  it("computes the stage-run blast radius from the pipeline, not from the model", () => {
    const preview = buildToolPreview(booksDir, LABEL, "run_stages", {
      fromStage: "extract",
      toStage: "package",
    })
    expect(preview.preview).toMatchObject({
      kind: "stage-run",
      clearsExtractedData: true,
    })
    if (preview.preview.kind !== "stage-run") throw new Error("wrong preview kind")
    expect(preview.preview.stagesInRange[0]).toBe("extract")
    expect(preview.preview.resetStages).toContain("speech")
  })

  it("diffs an edit against the stored section, not against the tool input", () => {
    putNode("web-rendering", "pg001", rendering("<p>Before</p>"))
    const preview = buildToolPreview(booksDir, LABEL, "edit_storyboard_section", {
      pageId: "pg001",
      sectionIndex: 0,
      html: "<p>After</p>",
    })
    expect(preview.preview).toMatchObject({
      kind: "diff",
      before: "<p>Before</p>",
      after: "<p>After</p>",
    })
  })

  it("has no proposed content for rerun_with_instructions, only the instruction", () => {
    putNode("web-rendering", "pg001", rendering("<p>Before</p>"))
    const preview = buildToolPreview(booksDir, LABEL, "rerun_with_instructions", {
      pageId: "pg001",
      sectionIndex: 0,
      instruction: "Make it shorter",
    })
    expect(preview.preview).toMatchObject({
      kind: "diff",
      before: "<p>Before</p>",
      after: null,
      note: "Make it shorter",
    })
  })

  it("pairs each config key with its current value", () => {
    fs.writeFileSync(
      path.join(booksDir, LABEL, "config.yaml"),
      "glossary_amount: concise\n",
      "utf8",
    )
    const preview = buildToolPreview(booksDir, LABEL, "update_stage_config", {
      changes: { glossary_amount: "comprehensive", toc_mode: "dynamic" },
    })
    expect(preview.preview).toMatchObject({
      kind: "config",
      changes: [
        { key: "glossary_amount", before: "concise", after: "comprehensive" },
        { key: "toc_mode", before: null, after: "dynamic" },
      ],
    })
  })

  it("reports the running steps that would block the mutation", () => {
    markRunning("tts")
    const preview = buildToolPreview(booksDir, LABEL, "run_stages", {
      fromStage: "speech",
      toStage: "speech",
    })
    expect(preview.runningSteps).toEqual(["tts"])
  })
})
