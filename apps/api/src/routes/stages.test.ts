import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { formatSectionId } from "@adt/types"
import { retireVideosForClearedSectioning } from "./stages.js"

/**
 * A rerun that clears `page-sectioning` deletes the history section ids are
 * allocated from, so the re-section re-mints densely from `_sec001`. These cover
 * the one reference that clear does not reach — `sign_language_videos` lives
 * outside `node_data` — which is what would otherwise let a pinned video
 * reappear on unrelated regenerated content.
 */
describe("retireVideosForClearedSectioning", () => {
  let tmpDir: string
  const label = "rerun-book"
  const pageId = `${label}_p1`

  /** Sparse on purpose: a dense seed would pass even against reuse. */
  function seedSectioning(seqs: number[]): void {
    withStorage((storage) => {
      storage.putNodeData("page-sectioning", pageId, {
        reasoning: "seed",
        sections: seqs.map((seq) => ({
          sectionId: formatSectionId(pageId, seq),
          nodes: [],
        })),
      })
    })
  }

  function withStorage<T>(fn: (storage: Storage) => T): T {
    const storage = createBookStorage(label, tmpDir)
    try {
      return fn(storage)
    } finally {
      storage.close()
    }
  }

  function sectionIdsByVideo(): Map<string, string | null> {
    return withStorage(
      (storage) => new Map(storage.getSignLanguageVideos().map((v) => [v.videoId, v.sectionId]))
    )
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stages-routes-"))
    withStorage((storage) => {
      storage.putExtractedPage({
        pageId,
        pageNumber: 1,
        text: "Page one text content",
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png" as const,
          hash: "abc123",
          width: 800,
          height: 600,
        },
        images: [],
      })
    })
    seedSectioning([1, 3])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("unassigns a video pinned to a section the re-section will re-mint", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 3))
    })

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(unassigned).toBe(1)
    expect(sectionIdsByVideo().get("vid-1")).toBeNull()
    // Unassigned, never deleted — the upload is the user's to reattach.
    expect(withStorage((storage) => storage.getSignLanguageVideoPath("vid-1"))).not.toBeNull()
  })

  it("counts ids from history versions, not just the current sectioning", () => {
    // `_sec003` is retired by a later edit, but a video is still pinned to it.
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-old", Buffer.from("a"), "old.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-old", formatSectionId(pageId, 3))
    })
    seedSectioning([1])

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(unassigned).toBe(1)
    expect(sectionIdsByVideo().get("vid-old")).toBeNull()
  })

  it("leaves glossary assignments alone — they are a separate id namespace", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-gl", Buffer.from("a"), "gl.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-gl", "gl001")
    })

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(unassigned).toBe(0)
    expect(sectionIdsByVideo().get("vid-gl")).toBe("gl001")
  })

  it("leaves assignments alone when the rerun does not clear sectioning", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 3))
    })

    // Rerunning from storyboard re-renders but keeps `page-sectioning`, so the
    // ids — and everything pinned to them — stay valid.
    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(unassigned).toBe(0)
    expect(sectionIdsByVideo().get("vid-1")).toBe(formatSectionId(pageId, 3))
  })

  it("keeps assignments across a storyboard rerun that clears fixed-layout sectioning", () => {
    // A storyboard rerun does clear `fixed-layout-sectioning`, but that node's
    // id is derived from the pageId rather than allocated, so it regenerates
    // identically and nothing pinned to it is at risk. Retiring it would detach
    // every video on a fixed-layout book, and here it would also retire a
    // `_sec001` that the untouched `page-sectioning` still owns.
    withStorage((storage) => {
      storage.putNodeData("fixed-layout-sectioning", pageId, {
        sections: [{ sectionId: formatSectionId(pageId, 1), nodes: [] }],
      })
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 1))
    })

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(unassigned).toBe(0)
    expect(sectionIdsByVideo().get("vid-1")).toBe(formatSectionId(pageId, 1))
  })

  it("does not scan sectioning history when nothing is pinned", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-loose", Buffer.from("a"), "loose.mp4", "video/mp4")
    })

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(unassigned).toBe(0)
    expect(sectionIdsByVideo().get("vid-loose")).toBeNull()
  })

  it("unassigns on a full extract rerun, which clears every node", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 1))
    })

    const unassigned = withStorage((storage) =>
      retireVideosForClearedSectioning(storage, "extract", "speech")
    )

    expect(unassigned).toBe(1)
    expect(sectionIdsByVideo().get("vid-1")).toBeNull()
  })
})
