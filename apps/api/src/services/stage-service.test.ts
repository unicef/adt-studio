import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { createBookEventBus, type BookSSEEvent } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import {
  createStageService,
  type StageRunner,
  type StageRunOptions,
  type StageRunProgress,
} from "./stage-service.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-stage-service-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  // A step left "running" — the cancel cleanup should delete it.
  db.run(
    "INSERT INTO step_runs (step, status, started_at) VALUES (?, 'running', ?)",
    ["page-sectioning", new Date().toISOString()]
  )
  db.close()
}

function stepRunStatuses(label: string): Map<string, string> {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    const rows = db.all("SELECT step, status FROM step_runs") as Array<{
      step: string
      status: string
    }>
    return new Map(rows.map((r) => [r.step, r.status]))
  } finally {
    db.close()
  }
}

/** A runner whose run() blocks until we resolve it, and observes the signal. */
function controllableRunner() {
  let resolveRun: (() => void) | undefined
  let rejectRun: ((err: unknown) => void) | undefined
  let capturedSignal: AbortSignal | undefined
  let started = false
  const runner: StageRunner = {
    run(_label: string, options: StageRunOptions, _progress: StageRunProgress) {
      started = true
      capturedSignal = options.signal
      return new Promise<void>((resolve, reject) => {
        resolveRun = resolve
        rejectRun = reject
      })
    },
  }
  return {
    runner,
    finish: () => resolveRun?.(),
    fail: (err: unknown) => rejectRun?.(err),
    signal: () => capturedSignal,
    hasStarted: () => started,
  }
}

const baseOptions = (label: string): StageRunOptions => ({
  booksDir: tmpDir,
  apiKey: "sk-test",
  promptsDir: "",
  fromStage: "storyboard",
  toStage: "storyboard",
})

async function tick(): Promise<void> {
  // Let setImmediate-deferred jobs and microtasks run.
  await new Promise((r) => setTimeout(r, 10))
}

describe("stage-service cancellation", () => {
  it("cancelling an active run: cancelling → cancelled, resets running steps, no error event", async () => {
    const label = "cancel-active"
    makeBook(label)
    const bus = createBookEventBus()
    const events: BookSSEEvent[] = []
    bus.addListener(label, (e) => events.push(e))
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    expect(rc.hasStarted()).toBe(true)

    const result = svc.cancelStageRun(label)
    expect(result).toEqual({ status: "cancelling" })
    expect(svc.getStatus(label).active?.status).toBe("cancelling")
    expect(rc.signal()?.aborted).toBe(true)

    // The abort branch only runs after runner.run() settles.
    rc.fail(new Error("aborted mid-run"))
    await tick()

    expect(events.some((e) => e.type === "stage-run-cancelled")).toBe(true)
    expect(events.some((e) => e.type === "stage-run-error")).toBe(false)
    // Cancelled job is cleared from active (fully captured in DB).
    expect(svc.getStatus(label).active).toBeNull()
    // The running step returned to idle (row deleted).
    expect(stepRunStatuses(label).has("page-sectioning")).toBe(false)
  })

  it("preserves queued jobs when cancelling the active run and drains them after cancel", async () => {
    const label = "cancel-active-preserve-queue"
    makeBook(label)
    const bus = createBookEventBus()
    const runInvocations: string[] = []
    let rejectFirst: ((err: unknown) => void) | undefined
    let calls = 0
    const runner: StageRunner = {
      run(_label: string, options: StageRunOptions) {
        calls++
        runInvocations.push(`${options.fromStage}->${options.toStage}`)
        return new Promise<void>((resolve, reject) => {
          if (calls === 1) {
            rejectFirst = reject
            return
          }
          resolve()
        })
      },
    }
    const svc = createStageService(runner, bus)

    svc.startStageRun(label, {
      ...baseOptions(label),
      fromStage: "captions",
      toStage: "captions",
    })
    await tick()
    const queued = svc.startStageRun(label, {
      ...baseOptions(label),
      fromStage: "glossary",
      toStage: "glossary",
    })
    expect(queued.status).toBe("queued")
    expect(svc.getStatus(label).queue).toHaveLength(1)

    svc.cancelStageRun(label)
    expect(svc.getStatus(label).active?.status).toBe("cancelling")
    expect(svc.getStatus(label).queue).toEqual([
      expect.objectContaining({ fromStage: "glossary", toStage: "glossary" }),
    ])
    expect(runInvocations).toEqual(["captions->captions"])

    rejectFirst?.(new Error("cancelled"))
    await tick()

    expect(runInvocations).toEqual(["captions->captions", "glossary->glossary"])
    expect(svc.getStatus(label).queue).toHaveLength(0)
  })

  it("a start during cancelling queues (never runs in parallel) and drains after cancel", async () => {
    const label = "start-during-cancel"
    makeBook(label)
    const bus = createBookEventBus()
    const runInvocations: number[] = []
    let resolveFirst: (() => void) | undefined
    let calls = 0
    const runner: StageRunner = {
      run() {
        const n = ++calls
        runInvocations.push(n)
        return new Promise<void>((resolve, reject) => {
          if (n === 1) resolveFirst = () => reject(new Error("cancelled"))
          else resolve()
        })
      },
    }
    const svc = createStageService(runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    svc.cancelStageRun(label)
    // Start arrives while the first run is still unwinding.
    const during = svc.startStageRun(label, baseOptions(label))
    expect(during.status).toBe("queued")
    // Only the first run has started so far — no parallel second runner.
    expect(runInvocations).toEqual([1])

    // First run settles → drainQueue starts the queued one.
    resolveFirst?.()
    await tick()
    expect(runInvocations).toEqual([1, 2])
  })

  it("cancel with a hung failed job and empty queue returns null (→ 404)", async () => {
    const label = "cancel-failed"
    makeBook(label)
    const bus = createBookEventBus()
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    rc.fail(new Error("boom"))
    await tick()
    expect(svc.getStatus(label).active?.status).toBe("failed")

    expect(svc.cancelStageRun(label)).toBeNull()
  })

  it("a second cancel while cancelling is an idempotent no-op", async () => {
    const label = "double-cancel"
    makeBook(label)
    const bus = createBookEventBus()
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    expect(svc.cancelStageRun(label)).toEqual({ status: "cancelling" })
    expect(svc.cancelStageRun(label)).toEqual({ status: "cancelling" })
  })

  it("run() that resolves with the signal aborted is treated as completed (no cancelled event)", async () => {
    const label = "resolve-after-abort"
    makeBook(label)
    const bus = createBookEventBus()
    const events: BookSSEEvent[] = []
    bus.addListener(label, (e) => events.push(e))
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    svc.cancelStageRun(label)
    // The run finished all remaining work before the abort took effect.
    rc.finish()
    await tick()

    expect(events.some((e) => e.type === "stage-run-complete")).toBe(true)
    expect(events.some((e) => e.type === "stage-run-cancelled")).toBe(false)
  })

  it("cancel resolves pending page-error decisions as stop", async () => {
    const label = "cancel-decisions"
    makeBook(label)
    const bus = createBookEventBus()
    // A listener so the broker arms the decision instead of waiting a grace period.
    bus.addListener(label, () => {})
    const decisions = createPageErrorDecisions(bus)
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus, decisions)

    svc.startStageRun(label, baseOptions(label))
    await tick()

    const decisionPromise = decisions.requestDecision({
      label,
      step: "web-rendering",
      pageId: "pg001",
      error: "boom",
    })

    svc.cancelStageRun(label)
    await expect(decisionPromise).resolves.toBe("stop")
  })
})
