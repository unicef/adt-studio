import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import os from "node:os"
import { HTTPException } from "hono/http-exception"
import { appendTaskEvent, readTaskLedger, readBookWriterOwner, recoverSectioningTransition, resolveBookPaths, withBookWriter } from "@adt/storage"
import type { TaskKind, TaskInfo, TaskLedgerRecord } from "@adt/types"
import type { BookEventBus } from "./book-event-bus.js"

export type TaskProgressEmitter = (message: string, percent?: number) => void
export type TaskExecutor = (emitProgress: TaskProgressEmitter, signal: AbortSignal) => Promise<unknown>
export interface TaskSubmissionOptions {
  pageId?: string
  url?: string
  cancellable?: boolean
  /** Accepted request identity is scoped to the book, not a browser instance. */
  request?: { id: string; fingerprint: string }
  /** Run under common writer admission before accepting any new work. */
  admit?: () => void
}
export interface TaskService {
  submitTask(label: string, kind: TaskKind, description: string, executor: TaskExecutor,
    options?: TaskSubmissionOptions): { taskId: string }
  cancelTask?(label: string, taskId: string): boolean
  getActiveTasks(label: string): TaskInfo[]
  getRequest?(label: string, requestId: string, fingerprint?: string): TaskInfo | undefined
}

const runtime = randomUUID()
const owner = { pid: process.pid, host: os.hostname(), runtime }
function interrupted(record: TaskLedgerRecord, bookDir: string): boolean {
  if (!["queued", "running"].includes(record.task.status)) return false
  if (record.owner.writerToken && readBookWriterOwner(bookDir)?.token !== record.owner.writerToken) return true
  if (record.owner.runtime === runtime) return false
  if (record.owner.host !== owner.host) return false // Unknown/remote ownership is never stolen.
  try { process.kill(record.owner.pid, 0); return false }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" }
}
function observed(record: TaskLedgerRecord, bookDir: string): TaskInfo {
  return interrupted(record, bookDir) ? { ...record.task, status: "failed", interrupted: true,
    error: "Task interrupted by a process restart. Inspect the editor for any committed output before explicitly starting a new request." } : record.task
}

/** The existing task service owns execution; durable receipts are state/history,
 * never a restart queue. No executor or credentials are persisted. */
export function createTaskService(eventBus: BookEventBus, booksDir?: string): TaskService {
  const books = new Map<string, Map<string, TaskInfo>>()
  const controllers = new Map<string, { label: string; controller: AbortController }>()
  const directory = (label: string) => booksDir ? resolveBookPaths(label, booksDir).bookDir : undefined
  const ledger = (label: string) => { const dir = directory(label); return dir ? readTaskLedger(dir) : [] }
  const getRequest = (label: string, requestId: string, fingerprint?: string) => {
    const record = ledger(label).find((entry) => entry.requestId === requestId)
    if (!record) return undefined
    if (fingerprint && record.fingerprint !== fingerprint) throw new HTTPException(409, { message: "This request was already accepted for different inputs. Refresh before starting a new request." })
    return books.get(label)?.get(record.task.taskId) ?? observed(record, directory(label)!)
  }
  return {
    getRequest,
    submitTask(label, kind, description, executor, options) {
      if (options?.request) {
        if (!booksDir) throw new Error("Durable task admission requires book storage")
        const accepted = getRequest(label, options.request.id, options.request.fingerprint)
        if (accepted) return { taskId: accepted.taskId }
      }
      const taskId = `task-${randomUUID()}`
      const controller = new AbortController()
      const info: TaskInfo = { taskId, kind, status: "queued", description,
        pageId: options?.pageId, url: options?.url, cancellable: options?.cancellable }
      const dir = directory(label)
      let terminalPersisted = false
      let writerToken: string | undefined
      if (dir && options?.request && !fs.existsSync(path.join(dir, `${label}.db`))) throw new HTTPException(404, { message: "Book not found" })
      const persist = () => {
        if (dir && options?.request) appendTaskEvent(dir, { requestId: options.request.id,
          fingerprint: options.request.fingerprint, owner: { ...owner, writerToken }, task: info })
        terminalPersisted = ["completed", "failed", "cancelled"].includes(info.status)
      }
      const run = () => {
        if (dir) { recoverSectioningTransition(dir); writerToken = readBookWriterOwner(dir)?.token }
        // A second process may have accepted the same request before this lease.
        if (options?.request) {
          const accepted = getRequest(label, options.request.id, options.request.fingerprint)
          if (accepted) { info.taskId = accepted.taskId; return Promise.resolve() }
        }
        options?.admit?.()
        persist()
        const state = books.get(label) ?? new Map<string, TaskInfo>()
        books.set(label, state)
        state.set(taskId, info)
        if (options?.cancellable) controllers.set(taskId, { label, controller })
        eventBus.emit(label, { type: "task", data: { type: "task-queued", task: { ...info } } })
        return Promise.resolve().then(async () => {
          controller.signal.throwIfAborted()
          info.status = "running"
          info.startedAt = Date.now()
          persist()
          eventBus.emit(label, { type: "task", data: { type: "task-start", taskId, kind, label, description,
            pageId: options?.pageId, url: options?.url } })
          const result = await executor((message, percent) => {
            eventBus.emit(label, { type: "task", data: { type: "task-progress", taskId, message, percent } })
          }, controller.signal)
          // Completion means the executor committed its work. A cancellation
          // arriving after that boundary cannot undo or mislabel publication.
          info.status = "completed"
          info.result = result
          info.completedAt = Date.now()
          persist()
          eventBus.emit(label, { type: "task", data: { type: "task-complete", taskId, kind, pageId: options?.pageId, result } })
        }).catch((error: unknown) => {
          if (info.status === "completed") {
            console.error("Could not persist completed task receipt", taskId, error)
            return // Publication succeeded; a receipt failure cannot undo or mislabel it.
          }
          info.status = controller.signal.aborted ? "cancelled" : "failed"
          info.error = error instanceof Error ? error.message : String(error)
          info.completedAt = Date.now()
          persist()
          eventBus.emit(label, { type: "task", data: info.status === "cancelled"
            ? { type: "task-cancelled", taskId, kind, pageId: options?.pageId }
            : { type: "task-error", taskId, kind, pageId: options?.pageId, error: info.error } })
        }).finally(() => {
          controllers.delete(taskId)
          // Durable receipts remain available after the transient event window.
          if (options?.request && !terminalPersisted) return // Retain known terminal outcome if disk receipt persistence failed.
          const timer = setTimeout(() => { state.delete(taskId); if (!state.size) books.delete(label) }, 30_000)
          timer.unref?.()
        })
      }
      // Hold the shared lease through terminal receipt publication, not only
      // through the executor's content writes. Admission failures remain synchronous.
      const work = dir ? withBookWriter(dir, run) : run()
      void work.catch((error: unknown) => { console.error("Could not persist task state", taskId, error) })
      return { taskId: info.taskId }
    },
    cancelTask(label, taskId) {
      const entry = controllers.get(taskId)
      if (!entry || entry.label !== label) return false
      entry.controller.abort(new Error("Task cancelled. Previous output is retained."))
      return true
    },
    getActiveTasks(label) {
      const tasks = new Map(ledger(label).map((record) => [record.task.taskId, observed(record, directory(label)!) ]))
      books.get(label)?.forEach((task, id) => tasks.set(id, { ...task }))
      return [...tasks.values()]
    },
  }
}
