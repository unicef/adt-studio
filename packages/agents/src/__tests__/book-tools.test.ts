import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createBookTools } from "../tools/book-tools.js"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

function tempStorage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-agents-test-"))
  dirs.push(root)
  return createBookStorage("test-book", root)
}

function sectioningSection(
  sectionId: string,
  sectionType: string,
  isPruned = false,
) {
  return {
    sectionId,
    sectionType,
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: 1,
    isPruned,
    nodes: [],
  }
}

function renderingSection(sectionIndex: number, sectionType: string) {
  return {
    sectionIndex,
    sectionType,
    reasoning: "",
    html: `<section data-section-type="${sectionType}" data-id="pg001_s${sectionIndex}"></section>`,
  }
}

describe("createCustomSection — sectionIndex assignment", () => {
  it("indexes a new section by the sectioning-array length, not the rendering length (which has gaps from pruned sections)", async () => {
    const storage = tempStorage()
    const pageId = "pg001"

    // 3 sectioning sections; section index 1 is pruned, so renderPage would
    // skip it — the rendering array has only indices [0, 2] (length 2) while
    // the sectioning array has length 3. The pre-fix code used
    // rendering.sections.length (2), which collides with the existing section
    // at index 2. The fix uses the sectioning length (3).
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "seed",
      sections: [
        sectioningSection("pg001_sec000", "text_only"),
        sectioningSection("pg001_sec001", "text_only", true),
        sectioningSection("pg001_sec002", "text_only"),
      ],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [
        renderingSection(0, "text_only"),
        renderingSection(2, "text_only"),
      ],
    })

    const { tools } = createBookTools({
      storage,
      bookLabel: "test-book",
      booksDir: "",
      promptsDir: "",
      credentials: {},
      restrictWritesToPageId: pageId,
      activityMode: "custom",
    })

    const html = `<section data-section-type="activity_custom_test" data-id="pg001_s3"><p data-id="pg001_s3_p">Q</p><script>window.adtRegisterCustomActivity(document.currentScript.closest('section'),{validate:()=>true});</script></section>`
    // The AI SDK tool signature is (args, options); our wrapper ignores options.
    const execute = tools.createCustomSection!.execute as (
      args: unknown,
      options: unknown,
    ) => Promise<{ ok: boolean; sectionIndex: number; sectionId: string }>
    const res = await execute(
      {
        pageId,
        sectionType: "activity_custom_test",
        html,
        reasoning: "test",
        activityAnswers: null,
      },
      {},
    )

    expect(res.ok).toBe(true)
    expect(res.sectionIndex).toBe(3)
    // The index is positional; the id is allocated above the page's high-water
    // mark (`_sec002`), so the two deliberately do not match.
    expect(res.sectionId).toBe("pg001_sec003")

    // The new section is appended to sectioning at index 3 (no overwrite).
    const sectioning = storage.getLatestNodeData("page-sectioning", pageId)!
      .data as { sections: Array<{ sectionId: string }> }
    expect(sectioning.sections).toHaveLength(4)
    expect(sectioning.sections[3]?.sectionId).toBe("pg001_sec003")

    // And the rendering keeps a single section at index 2 — the append did not
    // collide with the pre-existing section.
    const rendering = storage.getLatestNodeData("web-rendering", pageId)!
      .data as { sections: Array<{ sectionIndex: number }> }
    expect(
      rendering.sections.filter((s) => s.sectionIndex === 2),
    ).toHaveLength(1)
    expect(
      rendering.sections.filter((s) => s.sectionIndex === 3),
    ).toHaveLength(1)
  })

  it("returns a tool error (does not throw) when the custom section is missing its <script>", async () => {
    const storage = tempStorage()
    const pageId = "pg001"
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "seed",
      sections: [sectioningSection("pg001_sec000", "text_only")],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [renderingSection(0, "text_only")],
    })

    const { tools, touchedPageIds } = createBookTools({
      storage,
      bookLabel: "test-book",
      booksDir: "",
      promptsDir: "",
      credentials: {},
      restrictWritesToPageId: pageId,
      activityMode: "custom",
    })

    const execute = tools.createCustomSection!.execute as (
      args: unknown,
      options: unknown,
    ) => Promise<{ ok: boolean; error?: string }>
    // No <script> → recoverable failure. The tool must return an error object
    // for the model to retry against, NOT throw (which would abort the run).
    const res = await execute(
      {
        pageId,
        sectionType: "activity_custom_test",
        html: `<section data-section-type="activity_custom_test" data-id="pg001_s1"></section>`,
        reasoning: "test",
        activityAnswers: null,
      },
      {},
    )

    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/<script>/)
    // Nothing was written.
    expect(touchedPageIds.has(pageId)).toBe(false)
  })
})

describe("createCustomSection — sectionId allocation", () => {
  /** Append one custom activity section to `pageId`, returning its new id. */
  async function createSection(
    storage: ReturnType<typeof tempStorage>,
    pageId: string,
  ): Promise<string> {
    const { tools } = createBookTools({
      storage,
      bookLabel: "test-book",
      booksDir: "",
      promptsDir: "",
      credentials: {},
      restrictWritesToPageId: pageId,
      activityMode: "custom",
    })
    const execute = tools.createCustomSection!.execute as (
      args: unknown,
      options: unknown,
    ) => Promise<{ ok: boolean; sectionId: string; error?: string }>
    const res = await execute(
      {
        pageId,
        sectionType: "activity_custom_test",
        html: `<section data-section-type="activity_custom_test"><p>Q</p><script>window.adtRegisterCustomActivity(document.currentScript.closest('section'),{validate:()=>true});</script></section>`,
        reasoning: "test",
        activityAnswers: null,
      },
      {},
    )
    expect(res.error).toBeUndefined()
    expect(res.ok).toBe(true)
    return res.sectionId
  }

  it("does not reissue an id after a deletion leaves a gap in the array", async () => {
    const storage = tempStorage()
    const pageId = "pg001"
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "seed",
      sections: [sectioningSection("pg001_sec001", "text_only")],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [renderingSection(0, "text_only")],
    })

    const first = await createSection(storage, pageId)
    expect(first).toBe("pg001_sec002")

    // Delete the original section the way the structural routes do: splice the
    // array, leave every survivor's id alone. The array is now length 1 again,
    // but `_sec002` is spent.
    const afterCreate = storage.getLatestNodeData("page-sectioning", pageId)!
      .data as { reasoning: string; sections: Array<{ sectionId: string }> }
    storage.putNodeData("page-sectioning", pageId, {
      ...afterCreate,
      sections: afterCreate.sections.slice(1),
    })

    // Pre-fix this minted `${pageId}_s1` a second time, because the id came
    // from `sections.length`. Two sections sharing an id are ambiguous in the
    // pages manifest and overwrite each other's `${sectionId}.html` on package.
    const second = await createSection(storage, pageId)
    expect(second).toBe("pg001_sec003")
    expect(second).not.toBe(first)

    const sectioning = storage.getLatestNodeData("page-sectioning", pageId)!
      .data as { sections: Array<{ sectionId: string }> }
    const ids = sectioning.sections.map((s) => s.sectionId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("allocates canonical `_secNNN` ids, so previews and bundles can resolve them", async () => {
    const storage = tempStorage()
    const pageId = "pg001"
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "seed",
      sections: [sectioningSection("pg001_sec001", "text_only")],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [renderingSection(0, "text_only")],
    })

    // The legacy `${pageId}_s${index}` shape does not satisfy the `_sec\d+`
    // form that adt-preview and the packaging manifest parse, so activities
    // minted that way were unreachable in preview.
    expect(await createSection(storage, pageId)).toMatch(/^pg001_sec\d{3}$/)
  })

  it("counts a legacy `_sN` id already in history, so it is never shadowed", async () => {
    const storage = tempStorage()
    const pageId = "pg001"
    // A page edited before the tools used the factory: `_s2` is spent, and the
    // canonical high-water mark alone would not see it.
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "seed",
      sections: [
        sectioningSection("pg001_sec001", "text_only"),
        sectioningSection("pg001_s2", "text_only"),
      ],
    })
    storage.putNodeData("web-rendering", pageId, {
      sections: [renderingSection(0, "text_only"), renderingSection(1, "text_only")],
    })

    expect(await createSection(storage, pageId)).toBe("pg001_sec003")
  })
})
