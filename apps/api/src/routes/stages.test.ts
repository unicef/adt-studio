import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { formatSectionId, parseVoiceSlotEntryId } from "@adt/types"
import { retireSectionIdsForClearedSectioning, makeBeforeRun } from "./stages.js"

/**
 * A rerun that clears `page-sectioning` deletes the history section ids are
 * allocated from, so the re-section re-mints densely from `_sec001`. These cover
 * the references that clear does not reach, which is what would otherwise let
 * them reappear on unrelated regenerated content:
 *
 * - `sign_language_videos` lives in a table, not `node_data`.
 * - `tts` is deliberately preserved whenever Speech is in the rerun range, and
 *   `tts-timestamps` is in no clear list at all — both are keyed by language,
 *   not by page.
 */
describe("retireSectionIdsForClearedSectioning", () => {
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

  /** A `tts` manifest row plus the audio files its entries name. */
  function seedTts(
    language: string,
    entries: Array<{ textId: string; manual?: boolean }>,
    failed: string[] = []
  ): void {
    const audioDir = path.join(tmpDir, label, "audio", language)
    fs.mkdirSync(audioDir, { recursive: true })
    withStorage((storage) => {
      storage.putNodeData("tts", language, {
        entries: entries.map(({ textId, manual }) => {
          fs.writeFileSync(path.join(audioDir, `${textId}.mp3`), "fake-audio")
          return {
            textId,
            language,
            fileName: `${textId}.mp3`,
            voice: manual ? "uploaded" : "alloy",
            model: manual ? "uploaded" : "tts-1",
            cached: false,
            provider: manual ? "manual" : "openai",
            voiceSlot: "primary" as const,
          }
        }),
        ...(failed.length > 0
          ? { failed: failed.map((textId) => ({ textId, error: "boom" })) }
          : {}),
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    })
  }

  function seedTimestamps(language: string, keys: string[], failed: string[] = []): void {
    withStorage((storage) => {
      storage.putNodeData("tts-timestamps", language, {
        entries: Object.fromEntries(
          keys.map((key) => [
            key,
            {
              ...parseVoiceSlotEntryId(key),
              language,
              words: [{ word: "hi", start: 0, end: 1 }],
              duration: 1,
            },
          ])
        ),
        ...(failed.length > 0
          ? { failed: failed.map((textId) => ({ textId, error: "boom" })) }
          : {}),
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    })
  }

  function ttsTextIds(language: string): string[] {
    return withStorage((storage) => {
      const row = storage.getLatestNodeData("tts", language)
      const data = row?.data as { entries?: Array<{ textId: string }> } | undefined
      return (data?.entries ?? []).map((entry) => entry.textId)
    })
  }

  function ttsFailedIds(language: string): string[] {
    return withStorage((storage) => {
      const row = storage.getLatestNodeData("tts", language)
      const data = row?.data as { failed?: Array<{ textId: string }> } | undefined
      return (data?.failed ?? []).map((entry) => entry.textId)
    })
  }

  function timestampKeys(language: string): string[] {
    return withStorage((storage) => {
      const row = storage.getLatestNodeData("tts-timestamps", language)
      const data = row?.data as { entries?: Record<string, unknown> } | undefined
      return Object.keys(data?.entries ?? {})
    })
  }

  function audioExists(language: string, fileName: string): boolean {
    return fs.existsSync(path.join(tmpDir, label, "audio", language, fileName))
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

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.videos).toBe(1)
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

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.videos).toBe(1)
    expect(sectionIdsByVideo().get("vid-old")).toBeNull()
  })

  it("leaves glossary assignments alone — they are a separate id namespace", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-gl", Buffer.from("a"), "gl.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-gl", "gl001")
    })

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.videos).toBe(0)
    expect(sectionIdsByVideo().get("vid-gl")).toBe("gl001")
  })

  it("leaves assignments alone when the rerun does not clear sectioning", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 3))
    })

    // Rerunning from storyboard re-renders but keeps `page-sectioning`, so the
    // ids — and everything pinned to them — stay valid.
    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(retired.videos).toBe(0)
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

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(retired.videos).toBe(0)
    expect(sectionIdsByVideo().get("vid-1")).toBe(formatSectionId(pageId, 1))
  })

  it("drops the manual recording for a re-minted id, keeping the file on disk", () => {
    const retiredSection = formatSectionId(pageId, 3)
    seedTts("en", [
      { textId: `${retiredSection}_ans_a`, manual: true },
      { textId: `${retiredSection}_ans_b` },
      { textId: "pg001_t001" },
    ])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.speechEntries).toBe(2)
    expect(retired.detachedRecordings).toHaveLength(1)
    expect(ttsTextIds("en")).toEqual(["pg001_t001"])
    // The upload is the user's: only the association goes, never the bytes.
    expect(audioExists("en", `${retiredSection}_ans_a.mp3`)).toBe(true)
  })

  it("drops timestamps for every slot and suffix of a retired answer", () => {
    const retiredSection = formatSectionId(pageId, 3)
    seedTimestamps(
      "en",
      [
        `${retiredSection}_ans_a`,
        // Slot-qualified: a bare key comparison would leave this behind.
        `${retiredSection}_ans_a--secondary`,
        `${retiredSection}_ans_a_easy_read`,
        "pg001_t001",
      ],
      [`${retiredSection}_ans_a`]
    )

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.wordTimestamps).toBe(3)
    expect(timestampKeys("en")).toEqual(["pg001_t001"])
    expect(
      withStorage((storage) => storage.getLatestNodeData("tts-timestamps", "en")?.data),
    ).not.toHaveProperty("failed")
  })

  it("treats the `_ans_` separator as the boundary, not a bare id prefix", () => {
    const retiredSection = formatSectionId(pageId, 3)
    seedTts("en", [
      // Shares the section id as a prefix but is not an answer of it.
      { textId: `${retiredSection}_answer`, manual: true },
      { textId: "gl001_def" },
      { textId: "qz001_que" },
    ])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.speechEntries).toBe(0)
    expect(ttsTextIds("en")).toEqual([`${retiredSection}_answer`, "gl001_def", "qz001_que"])
  })

  it("does not let a legacy `_s1` id swallow `_s11`'s answers", () => {
    // The agent tools once minted variable-length `_sN` ids, so the separator is
    // the only thing keeping `_s1` from matching `_s11`'s answers.
    withStorage((storage) => {
      storage.putNodeData("page-sectioning", pageId, {
        reasoning: "legacy",
        sections: [{ sectionId: `${pageId}_s1`, nodes: [] }],
      })
    })
    seedTts("en", [
      { textId: `${pageId}_s1_ans_a`, manual: true },
      { textId: `${pageId}_s11_ans_a`, manual: true },
    ])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.speechEntries).toBe(1)
    expect(ttsTextIds("en")).toEqual([`${pageId}_s11_ans_a`])
  })

  it("drops the failed entry for a retired answer too", () => {
    const retiredSection = formatSectionId(pageId, 3)
    seedTts("en", [{ textId: "pg001_t001" }], [`${retiredSection}_ans_a`, "pg001_t002"])

    withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(ttsFailedIds("en")).toEqual(["pg001_t002"])
  })

  it("drops the `failed` key entirely once its last entry is retired", () => {
    // Rebuilding with `{...parsed.data, entries, ...(failed.length ? {failed} : {})}`
    // silently keeps the *original* array when the filter empties it. Asserted on
    // the `tts` loop as well as the timestamps one — they are structurally
    // identical but written separately.
    const retiredSection = formatSectionId(pageId, 3)
    seedTts("en", [{ textId: "pg001_t001" }], [`${retiredSection}_ans_a`])

    withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(
      withStorage((storage) => storage.getLatestNodeData("tts", "en")?.data)
    ).not.toHaveProperty("failed")
  })

  it("parks a detached recording so the run cannot overwrite it, then clears", () => {
    // The ordering `makeBeforeRun` depends on, end to end: retire, move the
    // upload out of the path the re-mint will regenerate into, then clear — and
    // the pruned `tts` row has to survive that clear, which is the only reason
    // pruning it was worth doing.
    const retiredSection = formatSectionId(pageId, 3)
    const fileName = `${retiredSection}_ans_a.mp3`
    seedTts("en", [{ textId: `${retiredSection}_ans_a`, manual: true }, { textId: "pg001_t001" }])

    makeBeforeRun(label, "sectioning", "speech", tmpDir)()

    // Moved aside, not deleted, and out of the language dir the run writes into.
    expect(audioExists("en", fileName)).toBe(false)
    const parked = path.join(tmpDir, label, "audio", ".detached")
    const found = fs
      .readdirSync(parked)
      .flatMap((stamp) => fs.readdirSync(path.join(parked, stamp, "en")))
    expect(found).toEqual([fileName])
    // `page-sectioning` is gone; the pruned manifest is not.
    expect(withStorage((storage) => storage.getLatestNodeData("page-sectioning", pageId))).toBeNull()
    expect(ttsTextIds("en")).toEqual(["pg001_t001"])
  })

  it("reconciles both the canonical and legacy language row spellings", () => {
    const retiredSection = formatSectionId(pageId, 3)
    seedTts("pt-BR", [{ textId: `${retiredSection}_ans_a`, manual: true }])
    seedTts("pt_BR", [{ textId: `${retiredSection}_ans_a`, manual: true }])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.speechEntries).toBe(2)
    expect(ttsTextIds("pt-BR")).toEqual([])
    expect(ttsTextIds("pt_BR")).toEqual([])
  })

  it("keeps a valid manual recording when the rerun does not clear sectioning", () => {
    const section = formatSectionId(pageId, 3)
    seedTts("en", [{ textId: `${section}_ans_a`, manual: true }])

    // Rerunning from storyboard keeps `page-sectioning`, so the ids stay valid
    // and the recording still describes the text it was made for.
    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(retired.speechEntries).toBe(0)
    expect(retired.detachedRecordings).toHaveLength(0)
    expect(ttsTextIds("en")).toEqual([`${section}_ans_a`])
    expect(audioExists("en", `${section}_ans_a.mp3`)).toBe(true)
  })

  it("keeps recordings across a storyboard rerun that clears fixed-layout sectioning", () => {
    // Same scoping as the video case above, but here over-retiring would destroy
    // a real recording rather than merely detach a pin.
    withStorage((storage) => {
      storage.putNodeData("fixed-layout-sectioning", pageId, {
        sections: [{ sectionId: formatSectionId(pageId, 1), nodes: [] }],
      })
    })
    seedTts("en", [{ textId: `${formatSectionId(pageId, 1)}_ans_a`, manual: true }])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "storyboard", "speech")
    )

    expect(retired.speechEntries).toBe(0)
    expect(ttsTextIds("en")).toEqual([`${formatSectionId(pageId, 1)}_ans_a`])
  })

  it("prunes speech entries even when no video is pinned", () => {
    // The fast path used to bail on "nothing pinned", which skipped the speech
    // manifests entirely.
    seedTts("en", [{ textId: `${formatSectionId(pageId, 3)}_ans_a`, manual: true }])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired.detachedRecordings).toHaveLength(1)
    expect(ttsTextIds("en")).toEqual([])
  })

  it("skips the history scan for a book whose audio names no section", () => {
    // A `tts` row alone must not be enough to pay for the scan — otherwise the
    // fast path is dead for every book that has ever run speech.
    seedTts("en", [{ textId: "pg001_t001", manual: true }, { textId: "gl001_def" }])
    seedTimestamps("en", ["pg001_t001"])

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired).toEqual({
      videos: 0,
      speechEntries: 0,
      detachedRecordings: [],
      wordTimestamps: 0,
    })
    expect(ttsTextIds("en")).toEqual(["pg001_t001", "gl001_def"])
  })

  it("does not scan sectioning history when nothing points at a section id", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-loose", Buffer.from("a"), "loose.mp4", "video/mp4")
    })

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "sectioning", "speech")
    )

    expect(retired).toEqual({
      videos: 0,
      speechEntries: 0,
      detachedRecordings: [],
      wordTimestamps: 0,
    })
    expect(sectionIdsByVideo().get("vid-loose")).toBeNull()
  })

  it("unassigns on a full extract rerun, which clears every node", () => {
    withStorage((storage) => {
      storage.putSignLanguageVideo("vid-1", Buffer.from("a"), "one.mp4", "video/mp4")
      storage.assignSignLanguageVideo("vid-1", formatSectionId(pageId, 1))
    })

    const retired = withStorage((storage) =>
      retireSectionIdsForClearedSectioning(storage, "extract", "speech")
    )

    expect(retired.videos).toBe(1)
    expect(sectionIdsByVideo().get("vid-1")).toBeNull()
  })
})
