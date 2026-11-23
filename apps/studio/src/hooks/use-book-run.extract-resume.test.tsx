// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query"
import { PIPELINE, type ExtractRerunStatus } from "@adt/types"

vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getStepStatus: vi.fn(), runStages: vi.fn(async () => ({})) } }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("./use-api-key", () => ({ useApiKey: () => ({ ownCredentials: {} }) }))
vi.mock("./use-books", () => ({ useBook: () => ({ data: undefined }) }))
vi.mock("./use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/components/a11y/LiveRegionAnnouncer", () => ({ useAnnouncer: () => ({ announce: vi.fn() }) }))
vi.mock("@/lib/completion-sound", () => ({ playCompletionSound: vi.fn(), playErrorSound: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }))
vi.mock("@lingui/core", () => ({ i18n: { _: () => "event" } }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage, getStageRunningLabelI18n: (stage: string) => stage }))
const { useBookRunStatus } = await import("./use-book-run")
const { api } = await import("@/api/client")

// Invoke listeners directly so handler exceptions fail the test.
class Events {
  static current: Events
  static CLOSED = 2
  readyState = 1
  listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  constructor() { Events.current = this }
  close() { this.listeners.clear() }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const extractRerun: ExtractRerunStatus = { actions: ["resume", "replace"], attemptId: "7b0e9d4c-52a1-4a43-9c0e-2f6f3f1f8a11", blockedReason: null }
const pagesKey = ["books", "book", "pages"]
const statusKey = ["books", "book", "step-status"]
const pages = [{ pageId: "pg001" }, { pageId: "pg002" }]
/** Case B: PDF extraction and metadata finished, the summary failed, nothing later ran. */
const unfinished = () => ({
  stages: { ...Object.fromEntries(PIPELINE.map(stage => [stage.name, "idle"])), extract: "error" },
  steps: { ...Object.fromEntries(PIPELINE.flatMap(stage => stage.steps.map(step => [step.name, "idle"]))),
    extract: "done", metadata: "done", "book-summary": "error", "image-meaningfulness": "skipped" },
  error: "book-summary failed", stepErrors: { "book-summary": "provider failed" }, stepMessages: null,
  runStatus: "failed" as const, runRevision: "before", pendingDecisions: [], extractRerun,
})

function setup() {
  vi.stubGlobal("EventSource", Events)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  vi.mocked(api.getStepStatus).mockResolvedValue(unfinished())
  client.setQueryData(statusKey, unfinished())
  client.setQueryData(["books", "book", "observed-run-publications"], ["before"])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useBookRunStatus("book"), { wrapper })
  return { client, hook, close: () => { hook.unmount(); client.clear() } }
}
const status = (client: QueryClient) => client.getQueryData<ReturnType<typeof unfinished>>(statusKey)!

it("exposes the Extract re-run status from step-status", () => {
  const { hook, close } = setup()
  try { expect(hook.result.current.extractRerun).toEqual(extractRerun) } finally { close() }
})

it("RAC-24: queueRun keeps the page list and the finished steps for a resume", async () => {
  const { client, hook, close } = setup()
  try {
    client.setQueryData(pagesKey, pages)
    const extraction = { action: "resume" as const, attemptId: extractRerun.attemptId }
    act(() => hook.result.current.queueRun({ fromStage: "extract", toStage: "extract", apiKey: "key", extraction }))
    expect(client.getQueryData(pagesKey)).toBe(pages)
    expect(status(client).stages.extract).toBe("queued")
    expect(status(client).steps).toMatchObject({ extract: "done", metadata: "done", "image-meaningfulness": "skipped", "book-summary": "idle", "book-outline": "idle" })
    expect(status(client).error).toBeNull()
    await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.runStages).mock.calls[0].slice(0, 3)).toEqual(["book", "key", expect.objectContaining({ fromStage: "extract", toStage: "extract", extraction })])
  } finally { close() }
})

it("a first extraction still empties the page list and resets every step", async () => {
  const { client, hook, close } = setup()
  try {
    client.setQueryData(pagesKey, pages)
    act(() => hook.result.current.queueRun({ fromStage: "extract", toStage: "extract", apiKey: "key" }))
    expect(client.getQueryData(pagesKey)).toEqual([])
    expect(status(client).steps).toMatchObject({ extract: "idle", metadata: "idle", "image-meaningfulness": "idle" })
    await waitFor(() => expect(api.runStages).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.runStages).mock.calls[0][2]).not.toHaveProperty("extraction", expect.anything())
  } finally { close() }
})

it.each([
  { event: "error", data: { label: "book", error: "EXTRACTION_RERUN_STALE: changed", code: "EXTRACTION_RERUN_STALE" } },
  { event: "cancelled", data: { label: "book" } },
])("RAC-24: the page list comes back after a run ends with $event", async ({ event, data }) => {
  const { client, close } = setup()
  // The optimistic wipe of a queued first extraction that then failed or was cancelled.
  client.setQueryData(pagesKey, [])
  const readPages = vi.fn(async () => pages)
  const stop = new QueryObserver(client, { queryKey: pagesKey, queryFn: readPages }).subscribe(() => {})
  try {
    expect(readPages).not.toHaveBeenCalled()
    await act(async () => Events.current.emit(event, data))
    await waitFor(() => expect(client.getQueryData(pagesKey)).toEqual(pages))
  } finally { stop(); close() }
})

it("a dropped connection does not refetch the page list", async () => {
  const { client, close } = setup()
  client.setQueryData(pagesKey, [])
  const readPages = vi.fn(async () => pages)
  const stop = new QueryObserver(client, { queryKey: pagesKey, queryFn: readPages }).subscribe(() => {})
  try {
    await act(async () => { for (const listener of Events.current.listeners.get("error") ?? []) listener(new MessageEvent("error")) })
    expect(readPages).not.toHaveBeenCalled()
  } finally { stop(); close() }
})
