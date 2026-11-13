// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query"
import { PIPELINE } from "@adt/types"
import { runConfirmationQueryKey } from "./run-confirmation-query"

vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getStepStatus: vi.fn(), getStagesStatus: vi.fn() } }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("./use-api-key", () => ({ useApiKey: () => ({ ownCredentials: {} }) }))
vi.mock("./use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/components/a11y/LiveRegionAnnouncer", () => ({ useAnnouncer: () => ({ announce: vi.fn() }) }))
vi.mock("@/lib/completion-sound", () => ({ playCompletionSound: vi.fn(), playErrorSound: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }))
vi.mock("@lingui/core", () => ({ i18n: { _: () => "event" } }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage, getStageRunningLabelI18n: (stage: string) => stage }))
const { useBookRunStatus } = await import("./use-book-run")
const { api } = await import("@/api/client")
const { useOutputReviewRun } = await import("./use-output-review-run")

// Invoke listeners directly so handler exceptions fail the test instead of
// disappearing into jsdom's EventTarget exception reporting.
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function setup({ settle = true } = {}) {
  vi.stubGlobal("EventSource", Events)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const state = { stages: Object.fromEntries(PIPELINE.map(stage => [stage.name, "done"])), steps: Object.fromEntries(PIPELINE.flatMap(stage => stage.steps.map(step => [step.name, "done"]))), error: null, runRevision: "before", runStatus: "running" as const }
  vi.mocked(api.getStepStatus).mockResolvedValue({ ...state, runRevision: settle ? "after" : "before", runStatus: settle ? "idle" : "running", stepErrors: null, stepMessages: null, pendingDecisions: [] })
  client.setQueryData(["books", "book", "step-status"], state)
  client.setQueryData(["books", "book", "observed-run-publications"], ["before"])
  const read = vi.fn(async () => 2)
  const key = ["books", "book", "outputs"]
  client.setQueryData(key, 1)
  const observer = new QueryObserver(client, { queryKey: key, queryFn: read })
  const stop = observer.subscribe(() => {})
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useBookRunStatus("book"), { wrapper })
  return { client, read, key, hook, close: () => { hook.unmount(); stop(); client.clear() } }
}

it("a late subscriber discovers committed pages without another progress event or reload", async () => {
  const { client, close } = setup()
  const key = ["books", "book", "pages"]
  client.setQueryData(key, [])
  const readPages = vi.fn(async () => [{ pageId: "pg001", hasRendering: true }])
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  try {
    expect(client.getQueryData(key)).toEqual([])
    await act(async () => Events.current.emit("ready", { label: "book", runStatus: "running" }))
    await waitFor(() => expect(client.getQueryData(key)).toEqual([{ pageId: "pg001", hasRendering: true }]))
  } finally { stop(); close() }
})

// SPEC-0003 RAC-9 / NOV-R1: keep the same running revision throughout, so
// polling or terminal reconciliation cannot mask a missed page publication.
it.each([
  { kind: "list", cached: false }, { kind: "detail", cached: false },
  { kind: "list", cached: true }, { kind: "detail", cached: true },
])("publishes the first page despite a pending $kind read (cached: $cached)", async ({ kind, cached }) => {
  const { client, hook, read: readOutputs, close } = setup({ settle: false })
  const key = ["books", "book", "pages", ...(kind === "detail" ? ["pg001"] : [])]
  const before = kind === "list"
    ? [{ pageId: "pg001", hasRendering: false }, { pageId: "pg002", hasRendering: false }]
    : { pageId: "pg001", rendering: null }
  const after = kind === "list"
    ? [{ pageId: "pg001", hasRendering: true }, { pageId: "pg002", hasRendering: false }]
    : { pageId: "pg001", rendering: { sections: [{ html: "Published page 1" }] } }
  const oldResponses: Array<() => void> = []
  let published = false
  const readPages = vi.fn(() => published ? Promise.resolve(after) : new Promise<typeof before>((resolve) => {
    // Ignore cancellation at the transport layer, like a response already in flight.
    oldResponses.push(() => resolve(before))
  }))
  if (cached) client.setQueryData(key, before)
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  const otherKey = ["books", "other", "pages"]
  let releaseOther!: () => void
  const readOther = vi.fn(() => new Promise<string>((resolve) => { releaseOther = () => resolve("Other book") }))
  const stopOther = new QueryObserver(client, { queryKey: otherKey, queryFn: readOther }).subscribe(() => {})
  try {
    await act(async () => Events.current.emit("ready", { label: "book", runStatus: "running" }))
    expect(readPages).toHaveBeenCalledTimes(cached ? 1 : 2)
    expect(client.getQueryData(key)).toEqual(cached ? before : undefined)
    published = true
    await act(async () => Events.current.emit("progress", {
      type: "step-progress", step: "web-rendering", publishedPageId: "pg001", page: 1, totalPages: 2,
    }))
    await act(async () => { oldResponses.forEach(release => release()); releaseOther() })
    await waitFor(() => expect(client.getQueryData(key)).toEqual(after))
    expect(readPages).toHaveBeenCalledTimes(cached ? 2 : 3)
    expect(client.getQueryState(key)).toMatchObject({ fetchStatus: "idle", isInvalidated: false })
    expect(hook.result.current.isRunning).toBe(true)
    expect(client.getQueryData(["books", "book", "observed-run-publications"])).toEqual(["before"])
    expect(readOutputs).not.toHaveBeenCalled()
    expect(readOther).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(otherKey)).toBe("Other book")
  } finally { stop(); stopOther(); close() }
})

it("keeps the newest publication after a slow populated read and an obsolete initial response", async () => {
  vi.useFakeTimers()
  const { client, hook, close } = setup({ settle: false })
  const key = ["books", "book", "pages"]
  let publishedPages = 0
  const responses: Array<() => void> = []
  const readPages = vi.fn(() => {
    const pages = ["pg001", "pg002", "pg003"].map((pageId, index) => ({ pageId, hasRendering: index < publishedPages }))
    return new Promise<typeof pages>(resolve => { responses.push(() => resolve(pages)) })
  })
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  try {
    for (const page of [1, 2]) {
      publishedPages = page
      await act(async () => Events.current.emit("progress", {
        type: "step-progress", step: "web-rendering", publishedPageId: `pg00${page}`, page, totalPages: 3,
      }))
    }
    expect(readPages).toHaveBeenCalledTimes(2)
    await act(async () => { responses[1](); await vi.advanceTimersByTimeAsync(2000) })
    expect(readPages).toHaveBeenCalledTimes(3)
    await act(async () => { responses[2](); responses[0]() })
    expect(client.getQueryData(key)).toEqual([
      { pageId: "pg001", hasRendering: true }, { pageId: "pg002", hasRendering: true }, { pageId: "pg003", hasRendering: false },
    ])
    expect(hook.result.current.isRunning).toBe(true)
  } finally { stop(); close() }
})

it("refreshes an inactive page detail when navigation subscribes after publication", async () => {
  const { client, close } = setup({ settle: false })
  const key = ["books", "book", "pages", "pg001"]
  client.setQueryData(key, { pageId: "pg001", rendering: null })
  const after = { pageId: "pg001", rendering: { sections: [{ html: "Published page 1" }] } }
  const readPage = vi.fn(async () => after)
  const observer = new QueryObserver(client, { queryKey: key, queryFn: readPage })
  let stop = observer.subscribe(() => {})
  stop()
  try {
    await act(async () => Events.current.emit("progress", {
      type: "step-progress", step: "web-rendering", publishedPageId: "pg001", page: 1, totalPages: 2,
    }))
    expect(readPage).not.toHaveBeenCalled()
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    stop = observer.subscribe(() => {})
    await waitFor(() => expect(client.getQueryData(key)).toEqual(after))
    expect(readPage).toHaveBeenCalledTimes(1)
  } finally { stop(); close() }
})

it.each(["complete", "cancelled", "error"])("refreshes aggregate data once on %s, despite retained completed steps", async (terminal) => {
  const { client, read, key, close } = setup()
  try {
    await act(async () => {
      for (const step of PIPELINE.find(stage => stage.name === "translate")!.steps) {
        Events.current.emit("progress", { type: "step-start", step: step.name })
        Events.current.emit("progress", { type: "step-complete", step: step.name })
      }
    })
    expect(read).not.toHaveBeenCalled()
    await act(async () => Events.current.emit(terminal, terminal === "error" ? { error: "Late failure after partial publication" } : {}))
    await waitFor(() => expect(client.getQueryData(key)).toBe(2))
    await act(async () => { Events.current.emit(terminal); Events.current.emit("open") })
    expect(read).toHaveBeenCalledTimes(1)
  } finally { close() }
})

it.each(["idle", "completed", "failed", "cancelled"] as const)("recovers missed terminal SSE through reconnect into %s", async (runStatus) => {
  const { client, read, key, close } = setup()
  vi.mocked(api.getStepStatus).mockResolvedValue({ stages: {}, steps: {}, error: null, runStatus, runRevision: "after", stepErrors: null, stepMessages: null, pendingDecisions: [] })
  try {
    await act(async () => Events.current.emit("progress", { type: "step-complete", step: PIPELINE.find(stage => stage.name === "translate")!.steps.at(-1)!.name }))
    expect(read).not.toHaveBeenCalled()
    await act(async () => Events.current.emit("open"))
    await waitFor(() => expect(client.getQueryData(key)).toBe(2))
    expect(read).toHaveBeenCalledTimes(1)
  } finally { close() }
})

it("keeps polling a running job after the last step looks done, recovering a missed terminal event", async () => {
  vi.useFakeTimers()
  const { client, read, key, hook, close } = setup()
  try {
    expect(hook.result.current.isRunning).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(client.getQueryData(key)).toBe(2)
    expect(read).toHaveBeenCalledTimes(1)
  } finally { close() }
})


it("refreshes a fast accepted review run when every SSE event is missed", async () => {
  const { client, read, key, close } = setup()
  vi.mocked(api.getStagesStatus).mockResolvedValue({ status: "idle", label: "book", queue: [] })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const review = renderHook(() => useOutputReviewRun("book"), { wrapper })
  try {
    await act(async () => review.result.current.accepted("fast-run"))
    await waitFor(() => expect(client.getQueryData(key)).toBe(2))
    expect(read).toHaveBeenCalledTimes(1)
    expect(review.result.current.updating).toBe(false)
  } finally { review.unmount(); close() }
})


it.each([false, true])("does not restart initial content/summary requests when the first receipt arrives (cached: %s)", async (cached) => {
  vi.stubGlobal("EventSource", Events)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  vi.mocked(api.getStepStatus).mockResolvedValue({ stages: {}, steps: {}, error: null, runStatus: "idle", runRevision: "initial", publicationAgeMs: performance.now() + 100000, stepErrors: null, stepMessages: null, pendingDecisions: [] })
  const reads = [vi.fn(async () => "content"), vi.fn(async () => "slow summary")]
  const keys = [["books", "book", "pages"], ["books", "book", "outputs", "summary"]]
  let release!: () => void
  reads[1].mockImplementationOnce(() => new Promise(resolve => { release = () => resolve("slow summary") }))
  if (cached) keys.forEach(key => client.setQueryData(key, "cached"))
  const stops = keys.map((queryKey, index) => new QueryObserver(client, { queryKey, queryFn: reads[index] }).subscribe(() => {}))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useBookRunStatus("book"), { wrapper })
  try {
    await waitFor(() => expect(client.getQueryData(["books", "book", "observed-run-publications"])).toEqual(["initial"]))
    await act(async () => Events.current.emit("open"))
    expect(reads.map(read => read.mock.calls.length)).toEqual(cached ? [0, 0] : [1, 1])
    if (!cached) await act(async () => release())
  } finally { hook.unmount(); stops.forEach(stop => stop()); client.clear() }
})

it("refreshes content when completion precedes the first status receipt", async () => {
  vi.stubGlobal("EventSource", Events)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  vi.mocked(api.getStepStatus).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({ stages: {}, steps: {}, error: null, runStatus: "idle", runRevision: "finished", stepErrors: null, stepMessages: null, pendingDecisions: [] })
  const read = vi.fn(async () => "after")
  client.setQueryData(["books", "book", "outputs"], "before")
  const stop = new QueryObserver(client, { queryKey: ["books", "book", "outputs"], queryFn: read }).subscribe(() => {})
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useBookRunStatus("book"), { wrapper })
  try {
    await act(async () => Events.current.emit("complete"))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    expect(client.getQueryData(["books", "book", "outputs"])).toBe("after")
  } finally { hook.unmount(); stop(); client.clear() }
})

it('first settled receipt recovers a run that completed during initial reads before SSE connected',async()=>{
 vi.stubGlobal('EventSource',Events);
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 let releaseStatus!:()=>void;let releaseOld!:()=>void;
 const state={stages:{},steps:{},error:null,runStatus:'completed',runRevision:'settled-during-open',publicationAgeMs:0,stepErrors:null,stepMessages:null,pendingDecisions:[]};
 vi.mocked(api.getStepStatus).mockImplementationOnce(()=>new Promise(resolve=>{releaseStatus=()=>resolve(state as any)})).mockResolvedValue(state as any);
 const read=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{releaseOld=()=>resolve('before')})).mockResolvedValue('after');
 const key=['books','book','outputs'];const stop=new QueryObserver(client,{queryKey:key,queryFn:read}).subscribe(()=>{});
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>useBookRunStatus('book'),{wrapper});
 try{
  // The output request has already captured the old book. An external/admitted
  // run settles before our first status response and before SSE subscribes.
  await act(async()=>releaseStatus());
  await waitFor(()=>expect(client.getQueryData(['books','book','observed-run-publications'])).toEqual(['settled-during-open']));
  await act(async()=>{releaseOld();Events.current.emit('open')});
  await waitFor(()=>expect(client.getQueryData(key)).toBe('after'));
 }finally{hook.unmount();stop();client.clear()}
})

it.each([false, true])("coalesces a publication burst and delivers its final page without starving slow reads (slow=%s)", async slow => {
  vi.useFakeTimers()
  const { client, close } = setup({ settle: false })
  const key = ["books", "book", "pages"]
  client.setQueryData(key, 0)
  let published = 1, release!: () => void
  const readPages = vi.fn(async () => {
    const captured = published
    if (slow && captured === 1) await new Promise<void>(resolve => { release = resolve })
    return captured
  })
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  const publish = () => Events.current.emit("progress", { type: "step-progress", step: "web-rendering", publishedPageId: `pg${published}`, page: published, totalPages: 100 })
  try {
    await act(async () => publish())
    expect(readPages).toHaveBeenCalledTimes(1)
    for (published = 2; published <= 100; published++) await act(async () => publish())
    published = 100
    expect(readPages).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(slow ? 6000 : 2000) })
    if (slow) {
      expect(readPages).toHaveBeenCalledTimes(1)
      await act(async () => { release(); await vi.advanceTimersByTimeAsync(2000) })
    }
    expect(readPages.mock.calls.length).toBeLessThanOrEqual(3)
    expect(client.getQueryData(key)).toBe(100)
  } finally { stop(); close() }
})


it("cancels a pending trailing refresh on unmount and leads immediately in a new run", async () => {
  vi.useFakeTimers()
  const { client, hook, close } = setup({ settle: false })
  const key = ["books", "book", "pages"]
  client.setQueryData(key, 0)
  let published = 1
  const readPages = vi.fn(async () => published)
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  const publish = () => Events.current.emit("progress", { type: "step-progress", step: "web-rendering", publishedPageId: `pg${published}` })
  try {
    await act(async () => publish())
    published = 2
    await act(async () => publish())
    expect(readPages).toHaveBeenCalledTimes(1)
    await act(async () => Events.current.emit("progress", { type: "step-start", step: "web-rendering" }))
    const readsAfterStart = readPages.mock.calls.length
    published = 3
    await act(async () => publish())
    expect(readPages).toHaveBeenCalledTimes(readsAfterStart + 1)
    expect(client.getQueryData(key)).toBe(3)
    published = 4
    await act(async () => publish())
    hook.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(readPages).toHaveBeenCalledTimes(readsAfterStart + 1)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  } finally { stop(); close() }
})

it("follows an already-running populated read with a fresh read for the final publication", async () => {
  vi.useFakeTimers()
  const { client, close } = setup({ settle: false })
  const key = ["books", "book", "pages"]
  client.setQueryData(key, 0)
  let published = 1, release!: () => void
  const readPages = vi.fn(async () => {
    const captured = published
    if (captured === 2) await new Promise<void>(resolve => { release = resolve })
    return captured
  })
  const stop = new QueryObserver(client, { queryKey: key, queryFn: readPages }).subscribe(() => {})
  const publish = () => Events.current.emit("progress", { type: "step-progress", step: "web-rendering", publishedPageId: `pg${published}` })
  try {
    await act(async () => publish())
    published = 2
    void client.refetchQueries({ queryKey: key })
    published = 3
    await act(async () => { publish(); await vi.advanceTimersByTimeAsync(2000) })
    expect(readPages).toHaveBeenCalledTimes(2)
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(2000) })
    expect(readPages).toHaveBeenCalledTimes(3)
    expect(client.getQueryData(key)).toBe(3)
  } finally { stop(); close() }
})


it("SSE progress leaves an explicit confirmation read alive while cancelling stale shared status", async () => {
  const { client, close } = setup({ settle: false })
  let release!: () => void
  let signal!: AbortSignal
  const key = runConfirmationQueryKey("book", "sectioning", "explicit-action", 1)
  const confirmation = client.fetchQuery({ queryKey: key, queryFn: ({ signal: ownedSignal }) => {
    signal = ownedSignal
    return new Promise<number>(resolve => { release = () => resolve(11) })
  } }).then(value => ({ value }), error => ({ error }))
  try {
    await act(async () => Events.current.emit("progress", { type: "step-progress", step: "web-rendering", publishedPageId: "pg001" }))
    const wasAborted = signal.aborted
    release()
    expect(await confirmation).toEqual({ value: 11 })
    expect(wasAborted).toBe(false)
  } finally { close() }
})
