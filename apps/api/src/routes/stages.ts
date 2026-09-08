import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage, openBookDb } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { StageName, STAGE_ORDER, PIPELINE, parseBookLabel, getStageRerunClearNodes, getStageClearOrder, PageErrorPolicy, DecisionBody, TTSOutput, WordTimestampOutput, parseVoiceSlotEntryId, sectionIdOfAnswerTextId } from "@adt/types"
import { assertStageRunModelCredentials } from "@adt/llm"
import {
  loadBookConfig,
  collectSpentSectionIds,
  retireSectionIds,
  NOTHING_RETIRED,
  PAGE_SECTIONING_NODE,
} from "@adt/pipeline"
import type { SectionIdRetirementResult, DetachedRecording } from "@adt/pipeline"
import type { StageService } from "../services/stage-service.js"
import type { BookEventBus, BookSSEEvent } from "../services/book-event-bus.js"
import type { PageErrorDecisions } from "../services/page-error-decisions.js"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

const StageRunBody = z
  .object({
    fromStage: StageName,
    toStage: StageName,
    renderOnly: z.boolean().optional(),
    pageErrorPolicy: PageErrorPolicy.optional(),
  })
  .strict()

/**
 * Does this rerun delete the `page-sectioning` history that section ids are
 * allocated from?
 *
 * Only that node. `fixed-layout-sectioning` is cleared by a storyboard rerun
 * too, but its id is not allocated — `sectionFixedLayoutPage` derives the page's
 * single section id from the pageId alone, so regenerating it produces the same
 * id and nothing pinned to it was ever at risk. Retiring those ids would detach
 * every pinned video on each storyboard rerun of a fixed-layout book, and on a
 * reflowable book carrying a stale fixed-layout row it would retire a `_sec001`
 * the live `page-sectioning` still owns.
 */
function clearsSectionIdHistory(fromStage: StageName, toStage: StageName): boolean {
  // `clearExtractedData` drops every node except the font ones, sectioning included.
  if (fromStage === "extract") return true
  const cleared: string[] = getStageRerunClearNodes(fromStage, toStage)
  return cleared.includes(PAGE_SECTIONING_NODE)
}

/**
 * Does any speech manifest hold audio keyed to a section at all?
 *
 * Only `${sectionId}_ans_*` entries can ever be retired, so a book whose audio
 * is all page text, glossary and quiz content has nothing at stake no matter how
 * its sections are renumbered. Reads the rows rather than merely checking that
 * they exist, which is what makes the fast path below still worth having.
 */
function hasAnswerSpeechEntries(storage: Storage): boolean {
  const isAnswer = (textId: string): boolean => sectionIdOfAnswerTextId(textId) !== null
  for (const itemId of storage.getNodeItemIds("tts")) {
    const parsed = TTSOutput.safeParse(storage.getLatestNodeData("tts", itemId)?.data)
    // An unreadable row cannot be ruled out, so treat it as a reason to look.
    if (!parsed.success) return true
    // `failed` counts as much as `entries`: the prune reconciles both, so a row
    // whose only answer reference is a failed item still has work to do.
    if (parsed.data.entries.some((entry) => isAnswer(entry.textId))) return true
    if (parsed.data.failed?.some((entry) => isAnswer(entry.textId))) return true
  }
  for (const itemId of storage.getNodeItemIds("tts-timestamps")) {
    const parsed = WordTimestampOutput.safeParse(
      storage.getLatestNodeData("tts-timestamps", itemId)?.data
    )
    if (!parsed.success) return true
    if (
      Object.keys(parsed.data.entries).some((key) =>
        isAnswer(parseVoiceSlotEntryId(key).textId)
      )
    ) {
      return true
    }
    if (parsed.data.failed?.some((entry) => isAnswer(entry.textId))) return true
  }
  return false
}

/**
 * Retire every sectionId a rerun is about to invalidate, and report what that
 * reconciled.
 *
 * Clearing a stage deletes *every* version of the nodes it clears. When
 * `page-sectioning` is among them the section-id high-water mark goes with it,
 * so the re-section re-mints densely from `_sec001` and hands out ids that named
 * different content a moment ago.
 *
 * That is only harmful while something still points at the old ids, and the
 * clear does not reach everything:
 *
 * - `sign_language_videos.section_id` lives in a table, not `node_data`, so a
 *   pinned video would reappear on whatever unrelated section inherits its id.
 * - The speech manifests are keyed by *language*, not by page. `tts` is
 *   deliberately preserved by `getStageRerunClearNodes` whenever Speech is in
 *   the rerun range, and `tts-timestamps` is in no clear list at all — the node
 *   name differs from the `word-timestamps` step name that
 *   `STAGE_OUTPUT_NODES` is derived from. Generated audio still heals itself on
 *   `computeSpeechCacheKey`, but `canReuseSpeechEntry` accepts a
 *   `provider: "manual"` entry on file existence alone, so a re-minted id would
 *   inherit a recording of the old content.
 *
 * Retiring here is what makes the dense re-mint safe. Everything else keyed by
 * sectionId (`toc-generation`, `text-catalog`, `editable-activity`) is deleted
 * by the same clear.
 *
 * Nothing the user uploaded is deleted, as in the structural edit routes: a
 * video is unassigned in place, and a recording is parked by the caller (see
 * `parkDetachedRecordings`, which is needed because audio filenames — unlike
 * video paths — are derived from the very id being reissued). Same shape as the
 * `spreads/apply` reconcile, which retires ids before `deletePage` drops the
 * history for the identical reason — and it goes through the same
 * `retireSectionIds`, because the two paths previously reconciled different
 * reference sets and that divergence is how the speech manifests were missed.
 *
 * Must run *before* the clear: it reads the sectioning history the ids come
 * from, and the `pages` table itself, both of which the extract branch deletes.
 * The pruned `tts` version it writes has to survive that clear, which it does
 * precisely because neither speech node is in `getStageRerunClearNodes`. On the
 * extract branch `clearExtractedData` does delete them, making the write moot —
 * but not special-cased, because "the clear will get it anyway" is the reasoning
 * that produced the stale claim this doc comment replaces.
 */
export function retireSectionIdsForClearedSectioning(
  storage: Storage,
  fromStage: StageName,
  toStage: StageName
): SectionIdRetirementResult {
  if (!clearsSectionIdHistory(fromStage, toStage)) return NOTHING_RETIRED
  // Scanning every stored sectioning version of every page is not free —
  // `JSON.stringify` plus a global regex per version — so establish that
  // *something* could be retired before paying for it. "Any book that has run
  // speech" would be too coarse a guard to be worth having: the manifests are
  // small and in memory, so ask them whether they hold any answer audio at all.
  if (
    !storage.getSignLanguageVideos().some((video) => video.sectionId !== null) &&
    !hasAnswerSpeechEntries(storage)
  ) {
    return NOTHING_RETIRED
  }

  const retired = new Set<string>()
  for (const page of storage.getPages()) {
    for (const id of collectSpentSectionIds(storage, page.pageId, [PAGE_SECTIONING_NODE])) {
      retired.add(id)
    }
  }
  // Page-scoped by construction, so glossary assignments (`gl001`…) are untouched.
  return retireSectionIds(storage, retired)
}

/** Where a detached upload is parked, relative to the book directory. */
export const DETACHED_AUDIO_DIR = path.join("audio", ".detached")

/**
 * Move uploaded recordings out of the way of the run that is about to reissue
 * their filenames, and return where each landed.
 *
 * Necessary because audio filenames are derived from the textId: the re-section
 * re-mints the id, the catalog rebuilds `${sectionId}_ans_*` under it, and Speech
 * writes generated audio to `audio/<lang>/<textId>.<ext>` — the upload's own
 * path. Dropping the manifest entry stops the recording being *served* for
 * content it was never made for, but on its own it would leave the file to be
 * overwritten minutes later, so "the upload is the user's" would be a promise
 * this code breaks. Parking it under a dot-directory keeps it out of the
 * language dirs that `resolveSpeechAudioPath` probes, and packaging copies
 * individual files named by manifest entries rather than walking `audio/`, so
 * nothing here can reach a bundle.
 *
 * Best-effort: a book whose audio has already been cleared from disk has nothing
 * to move, and failing to park a file must not abort the run the user asked for.
 */
function parkDetachedRecordings(
  bookDir: string,
  detached: readonly DetachedRecording[]
): string[] {
  const parked: string[] = []
  // One stamp for the whole batch, so a single run's detachments stay together
  // and a later run cannot overwrite an earlier one's.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  for (const { language, fileName } of detached) {
    const source = path.join(bookDir, "audio", language, fileName)
    if (!fs.existsSync(source)) continue
    const targetDir = path.join(bookDir, DETACHED_AUDIO_DIR, stamp, language)
    try {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.renameSync(source, path.join(targetDir, fileName))
      parked.push(path.join(DETACHED_AUDIO_DIR, stamp, language, fileName))
    } catch (err) {
      console.warn(
        `[stages] could not preserve detached recording ${fileName} (${language}): ${String(err)}`
      )
    }
  }
  return parked
}

/** Build a beforeRun callback that clears downstream data for a stage.
 *  The returned function is idempotent — only runs once even if called multiple times.
 *  Exported so tests can pin the retire-park-clear ordering it depends on. */
export function makeBeforeRun(label: string, fromStage: StageName, toStage: StageName, booksDir: string): () => void {
  let ran = false
  return () => {
    if (ran) return
    ran = true
    const storage = createBookStorage(label, booksDir)
    try {
      const retired = retireSectionIdsForClearedSectioning(storage, fromStage, toStage)
      if (retired.videos > 0) {
        console.warn(
          `[stages] ${label}: unassigned ${retired.videos} sign-language video(s) — the sections they were pinned to are being regenerated. The uploads are kept and can be reattached.`
        )
      }
      if (retired.detachedRecordings.length > 0) {
        // Park them before the clear, for the same reason the retirement runs
        // before it: this reads the manifest the clear may delete.
        const parked = parkDetachedRecordings(
          path.join(path.resolve(booksDir), label),
          retired.detachedRecordings
        )
        console.warn(
          `[stages] ${label}: detached ${retired.detachedRecordings.length} uploaded audio recording(s) — the sections their text belonged to are being regenerated, so the recordings no longer match. ${parked.length} file(s) moved to ${DETACHED_AUDIO_DIR}/ so this run cannot overwrite them; re-upload the ones you still want.`
        )
      }

      if (fromStage === "extract") {
        // clearExtractedData also clears step_runs
        storage.clearExtractedData()
      } else {
        const nodes = getStageRerunClearNodes(fromStage, toStage)
        if (nodes.length > 0) {
          storage.clearNodesByType(nodes)
        }
        if (fromStage === "storyboard" && typeof storage.clearDebugImages === "function") {
          storage.clearDebugImages()
        }
        // Clear step run records for all downstream stages
        const stagesToClear = getStageClearOrder(fromStage)
        const stepsToClear = PIPELINE
          .filter((s) => stagesToClear.includes(s.name))
          .flatMap((s) => s.steps.map((step) => step.name))
        storage.clearStepRuns(stepsToClear)
      }
    } finally {
      storage.close()
    }
  }
}

function formatStepErrors(stepErrors: Record<string, string>): string {
  const entries = Object.entries(stepErrors)
  if (entries.length === 1) return entries[0][1]
  return entries.map(([step, err]) => `${step}: ${err}`).join("\n")
}

export function createStageRoutes(
  stageService: StageService,
  eventBus: BookEventBus,
  decisions: PageErrorDecisions,
  booksDir: string,
  promptsDir: string,
  webAssetsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/stages/run — Start or queue a stage-scoped run
  app.post("/books/:label/stages/run", async (c) => {
    const { label } = c.req.param()

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = StageRunBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid stage run options: ${parsed.error.message}`,
      })
    }

    const { fromStage, toStage, renderOnly, pageErrorPolicy } = parsed.data
    const credentials = readProviderCredentials(c)

    // Fail before beforeRun clears any stage data: a run that cannot make a
    // single LLM call must not wipe the book. Scoped to the stages being run —
    // a speech-only rerun must not demand the text default's key, and a
    // per-step model override must be credentialed too, not just the default.
    // Keyless providers pass through.
    const fromIndex = STAGE_ORDER.indexOf(fromStage)
    const toIndex = STAGE_ORDER.indexOf(toStage)
    assertStageRunModelCredentials(
      loadBookConfig(label, booksDir, configPath),
      fromIndex <= toIndex ? STAGE_ORDER.slice(fromIndex, toIndex + 1) : STAGE_ORDER,
      credentials,
    )

    console.log(
      `[stages] ${label}: ${fromStage}→${toStage}${renderOnly ? " (render-only)" : ""} ` +
      `credentialProviders=${Object.keys(credentials).join(",") || "(none)"}`,
    )

    const clearData = makeBeforeRun(label, fromStage, toStage, booksDir)

    const result = stageService.startStageRun(label, {
      booksDir,
      credentials,
      promptsDir,
      webAssetsDir,
      configPath,
      fromStage,
      toStage,
      renderOnly,
      pageErrorPolicy,
      // Queued jobs clear data when they start executing
      beforeRun: clearData,
    })

    // For immediately started jobs, clear data synchronously so the
    // frontend can refetch and see the cleared state right away.
    if (result.status === "started") {
      clearData()
    }

    return c.json({ status: result.status, label, fromStage, toStage })
  })

  // POST /books/:label/stages/cancel — Cancel the active run. Queued runs remain queued.
  app.post("/books/:label/stages/cancel", (c) => {
    const { label } = c.req.param()
    const result = stageService.cancelStageRun(label)
    if (!result) {
      // Nothing to cancel. Benign race: the run may have completed between the
      // click and this request — the frontend treats 404 as silent success.
      throw new HTTPException(404, { message: "No active run to cancel" })
    }
    return c.json(result, 202)
  })

  // POST /books/:label/stages/decision — Resolve a pending page-error decision.
  app.post("/books/:label/stages/decision", async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = DecisionBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid decision: ${parsed.error.message}`,
      })
    }
    const { decisionId, action, applyToAll } = parsed.data
    const ok = decisions.resolveDecision(decisionId, action, applyToAll)
    if (!ok) {
      // Already resolved (timeout/cancel) or unknown — the frontend drops the
      // stale dialog silently on 409.
      throw new HTTPException(409, { message: "Decision already resolved" })
    }
    return c.json({ ok: true })
  })

  // GET /books/:label/step-status — Unified stage + step status
  // DB step_runs is the single source of truth for step/stage state.
  // Only "queued" comes from the in-memory run queue.
  app.get("/books/:label/step-status", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const dbPath = path.join(resolvedDir, safeLabel, `${safeLabel}.db`)

    const { active } = stageService.getStatus(label)
    // Explicitly queued stages (waiting behind the active run) — always
    // override "done" so re-runs show as queued before data is cleared.
    const queuedStages = new Set(stageService.getQueuedStages(label))
    // Stages in the active run's range that haven't started yet — should
    // show as "queued" only if their steps aren't already done.
    const activeRunRange = new Set<string>()
    if (active?.status === "running") {
      const from = STAGE_ORDER.indexOf(active.fromStage as StageName)
      const to = STAGE_ORDER.indexOf(active.toStage as StageName)
      if (from !== -1 && to !== -1) {
        for (let i = from; i <= to; i++) {
          activeRunRange.add(STAGE_ORDER[i])
        }
      }
    }

    const failedActiveSteps = new Set<string>()
    if (active?.status === "failed") {
      const from = STAGE_ORDER.indexOf(active.fromStage as StageName)
      const to = STAGE_ORDER.indexOf(active.toStage as StageName)
      if (from !== -1 && to !== -1) {
        const failedStages = new Set(STAGE_ORDER.slice(from, to + 1))
        for (const stage of PIPELINE) {
          if (!failedStages.has(stage.name)) continue
          for (const step of stage.steps) {
            failedActiveSteps.add(step.name)
          }
        }
      }
    }

    // Read step_runs from DB (or empty if no DB)
    let stepRunRows: Array<{ step: string; status: string; error: string | null; message: string | null }> = []
    if (fs.existsSync(dbPath)) {
      const db = openBookDb(dbPath)
      try {
        stepRunRows = db.all("SELECT step, status, error, message FROM step_runs") as typeof stepRunRows
      } finally {
        db.close()
      }
    }

    const stepRunMap = new Map(stepRunRows.map((r) => [r.step, r]))

    // Build steps
    const steps: Record<string, string> = {}
    const stepErrors: Record<string, string> = {}
    const stepMessages: Record<string, string> = {}
    for (const stage of PIPELINE) {
      for (const step of stage.steps) {
        const row = stepRunMap.get(step.name)
        let status = row?.status ?? "idle"
        if (status === "running" && failedActiveSteps.has(step.name)) {
          status = "error"
          stepErrors[step.name] = active?.error ?? "Stage run failed"
        }
        steps[step.name] = status
        if (row?.status === "error" && row.error) {
          stepErrors[step.name] = row.error
        }
        // Surface the message for running steps (page X/Y) and for done steps
        // (e.g. "Completed — 2 page(s) skipped") so a skip note survives refetch.
        if ((status === "running" || status === "done") && row?.message) {
          stepMessages[step.name] = row.message
        }
      }
    }

    // Derive stage state from steps.
    // Two sources of "queued":
    //   queuedStages — explicit queue items waiting behind the active run.
    //     These always override done (re-run data not yet cleared).
    //   activeRunRange — stages within the currently executing job.
    //     These only show as queued if their steps haven't completed yet.
    const stages: Record<string, string> = {}
    for (const stage of PIPELINE) {
      const ss = stage.steps.map((s) => steps[s.name])
      const allComplete = ss.length > 0 && ss.every((s) => s === "done" || s === "skipped")
      if (ss.some((s) => s === "running")) {
        stages[stage.name] = "running"
      } else if (queuedStages.has(stage.name)) {
        stages[stage.name] = "queued"
      } else if (allComplete) {
        stages[stage.name] = "done"
      } else if (activeRunRange.has(stage.name)) {
        stages[stage.name] = "queued"
      } else if (ss.some((s) => s === "error")) {
        stages[stage.name] = "error"
      } else {
        stages[stage.name] = "idle"
      }
    }

    // Check if ADT is packaged (preview stage)
    const adtDir = path.join(resolvedDir, safeLabel, "adt")
    if (fs.existsSync(adtDir)) stages.preview = "done"

    const hasStepErrors = Object.keys(stepErrors).length > 0
    const hasStepMessages = Object.keys(stepMessages).length > 0
    const error = active?.error ?? (hasStepErrors ? formatStepErrors(stepErrors) : null)

    // Expose the run's job status so `isCancelling` (and any future run-level
    // state) survives a refresh, and any pending page-error decisions so the
    // decision dialog can be recovered via polling after a reconnect/F5.
    const runStatus = active?.status ?? "idle"
    const pendingDecisions = decisions.getPendingDecisions(label)

    return c.json({
      stages,
      steps,
      error,
      stepErrors: hasStepErrors ? stepErrors : null,
      stepMessages: hasStepMessages ? stepMessages : null,
      runStatus,
      pendingDecisions,
    })
  })

  // GET /books/:label/stages/status — Always-on SSE stream for stage run events.
  // The connection stays open until the client disconnects. Events are pushed
  // whenever a stage run emits progress, completes, errors, or a queued run starts.
  app.get("/books/:label/stages/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const eventQueue: BookSSEEvent[] = []
        let done = false

        const unsubscribe = eventBus.addListener(label, (event) => {
          if (done) return
          eventQueue.push(event)
        })

        stream.onAbort(() => {
          done = true
          unsubscribe()
        })

        // Keep streaming until the client disconnects
        while (!done) {
          while (eventQueue.length > 0) {
            const event = eventQueue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "queue-next") {
                await stream.writeSSE({
                  event: "queue-next",
                  data: JSON.stringify({
                    fromStage: event.fromStage,
                    toStage: event.toStage,
                  }),
                })
              } else if (event.type === "stage-run-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
              } else if (event.type === "stage-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
              } else if (event.type === "stage-run-cancelled") {
                await stream.writeSSE({
                  event: "cancelled",
                  data: JSON.stringify({ label: event.label }),
                })
              } else if (event.type === "decision-required") {
                await stream.writeSSE({
                  event: "decision-required",
                  data: JSON.stringify({
                    decisionId: event.decisionId,
                    step: event.step,
                    pageId: event.pageId,
                    error: event.error,
                  }),
                })
              } else if (event.type === "task") {
                await stream.writeSSE({
                  event: "task",
                  data: JSON.stringify(event.data),
                })
              }
            } catch {
              done = true
              break
            }
          }
          if (!done) {
            await new Promise((r) => setTimeout(r, 50))
          }
        }

        unsubscribe()
      })
    }

    // JSON fallback for non-SSE requests
    const { active, queue } = stageService.getStatus(label)
    if (!active) {
      return c.json({ status: "idle", label, queue: [] })
    }
    // Omit the internal AbortController from the serialized payload.
    const { controller: _controller, ...activepublic } = active
    return c.json({ ...activepublic, queue })
  })

  // Removed Feb 2026: POST /books/:label/steps/run was renamed to /stages/run.
  // Return 410 Gone with an actionable message so callers know exactly what changed.
  app.post("/books/:label/steps/run", (c) => {
    return c.json(
      {
        error:
          "This endpoint was removed. Use POST /books/:label/stages/run " +
          "with body { fromStage: string, toStage: string }.",
      },
      410
    )
  })

  return app
}
