import { IN_LAB_FRAME } from "./frame"
import { useEffect } from "react"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { useQueryClient } from "@tanstack/react-query"
import { STAGE_BY_NAME, type StageName } from "@adt/types"
import { api, setRequestInterceptor, type AccessibilityAssessmentResponse, type PageDetail, type PageSummaryItem, type TaskInfoResponse } from "@/api/client"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { LAB_ENABLED, getVariant } from "./variants"
import { keptCount, mockPage, openFirstPage, openPageId, type PageMock } from "./pageMocks"
import { keptImageIds, mockCaptionPage, mockCaptionPages, withCaptionsDone, type CaptionMock } from "./captionMocks"
import { mockPrunePage, mockPruneSummary, rememberPrunePut, type PruneMock } from "./pruneMocks"

export interface RunScenario {
  kind: "run"
  book: string
  stage: string
  step?: string
  durationMs: number
  total: number
  startedAt: number
  loop?: boolean
  arrivingPages?: boolean
  pausedAt?: number
  pauseAtMs?: number
  captionMock?: CaptionMock
}

export interface SlowLoadScenario {
  kind: "slow-load"
  delayMs: number
  all?: boolean
  keepShell?: boolean
}

const SHELL_PATH = /^\/books(\/[^/?]+(\/(step-status|stages\/status|tasks|pages))?)?(\?|$)/

export interface JourneyPhase {
  stage: string
  step: string
  durationMs: number
}

export interface JourneyScenario {
  kind: "journey"
  book: string
  phases: JourneyPhase[]
  total: number
  startedAt: number
  holdFresh?: boolean
  idleAt?: number
  runs?: Record<string, number>
  pausedAt?: number
  pauseAtMs?: number
}

const SIM_RUN_MS = 12000

export function simNow(scenario: { pausedAt?: number }): number {
  return scenario.pausedAt ?? Date.now()
}

function simulatedRunState(scenario: JourneyScenario, stage: string, now = simNow(scenario)): "running" | "done" | null {
  const started = scenario.runs?.[stage]
  if (started === undefined) return null
  return now - started < SIM_RUN_MS ? "running" : "done"
}

export interface FaultStatus {
  stages?: Record<string, string>
  steps?: Record<string, string>
  stepErrors?: Record<string, string> | null
  stepMessages?: Record<string, string> | null
  error?: string | null
  runStatus?: string
  pendingDecisions?: Array<{ decisionId: string; step: string; pageId: string; error: string }>
}

export interface FaultScenario {
  kind: "fault"
  book: string
  status: FaultStatus
  pages?: "empty"
  warnedPages?: number
  spreadSuggestions?: number[]
  pageMock?: PageMock
  pruneMock?: PruneMock
  slowPagesMs?: number
  failSpreads?: boolean
  captionMock?: CaptionMock
  noProviders?: boolean
  startedAt: number
  pausedAt?: number
  pauseAtMs?: number
}

export type Scenario = RunScenario | SlowLoadScenario | JourneyScenario | FaultScenario

const scenarioStore = createPersistentStore<Scenario | null>(
  "adt.lab.sim",
  null,
  (value): value is Scenario | null =>
    value === null || (typeof value === "object" && value !== null && "kind" in value),
)

export const useScenario = scenarioStore.use

export function startScenario(scenario: Scenario | null) {
  scenarioStore.set(scenario)
}

const held = new Set<() => void>()

function holdFor(ms: number) {
  return new Promise<void>((resolve) => {
    const release = () => {
      window.clearTimeout(timer)
      held.delete(release)
      resolve()
    }
    const timer = window.setTimeout(release, ms)
    held.add(release)
  })
}

export function stopScenario() {
  scenarioStore.set(null)
  for (const release of [...held]) release()
}

export function getScenario(): Scenario | null {
  return scenarioStore.get()
}

export function isPaused(scenario: Scenario | null): boolean {
  return !!scenario && scenario.kind !== "slow-load" && scenario.pausedAt !== undefined
}

export function pauseScenario() {
  const scenario = scenarioStore.get()
  if (!scenario || scenario.kind === "slow-load" || scenario.pausedAt !== undefined) return
  scenarioStore.set({ ...scenario, pausedAt: Date.now(), pauseAtMs: undefined })
}

export function resumeScenario() {
  const scenario = scenarioStore.get()
  if (!scenario || scenario.kind === "slow-load" || scenario.pausedAt === undefined) return
  const delta = Date.now() - scenario.pausedAt
  const runs =
    scenario.kind === "journey" && scenario.runs
      ? Object.fromEntries(Object.entries(scenario.runs).map(([stage, at]) => [stage, at + delta]))
      : undefined
  scenarioStore.set({ ...scenario, startedAt: scenario.startedAt + delta, pausedAt: undefined, pauseAtMs: undefined, ...(runs ? { runs } : {}) })
}

export function scenarioElapsed(scenario: Scenario | null): number | null {
  if (!scenario || scenario.kind === "slow-load") return null
  return simNow(scenario) - scenario.startedAt
}

export function runProgress(scenario: RunScenario, now = simNow(scenario)) {
  const elapsed = now - scenario.startedAt
  const cycle = scenario.loop ? elapsed % scenario.durationMs : Math.min(elapsed, scenario.durationMs)
  const finished = !scenario.loop && elapsed >= scenario.durationMs
  const done = Math.min(scenario.total, Math.floor((cycle / scenario.durationMs) * (scenario.total + 1)))
  return { done, finished }
}

export function journeyProgress(scenario: JourneyScenario, now = simNow(scenario)) {
  if (scenario.idleAt !== undefined) return { phaseIndex: scenario.idleAt, done: 0, finished: false, idle: true }
  let elapsed = now - scenario.startedAt
  for (let index = 0; index < scenario.phases.length; index++) {
    const phase = scenario.phases[index]
    if (elapsed < phase.durationMs) {
      const done = Math.min(scenario.total, Math.floor((elapsed / phase.durationMs) * (scenario.total + 1)))
      return { phaseIndex: index, done, finished: false, idle: false }
    }
    elapsed -= phase.durationMs
  }
  return { phaseIndex: scenario.phases.length, done: scenario.total, finished: true, idle: false }
}

const SIM_PACKAGE_TASK = "lab-sim-package"

const OPTIONAL_HIDDEN = new Set(["quizzes", "captions", "glossary", "toc", "easy-read", "translate", "speech", "package", "preview", "validation", "sign-language"])

function stepsOf(stage: string): string[] {
  return STAGE_BY_NAME[stage as StageName]?.steps.map((step) => step.name) ?? []
}

interface BookSummaryLike {
  label: string
  completedStages: string[]
  [key: string]: unknown
}

function journeyCompleted(scenario: JourneyScenario, phaseIndex: number): string[] {
  return scenario.phases.slice(0, phaseIndex).map((phase) => phase.stage)
}

async function simulateJourneyStatus(scenario: JourneyScenario, passthrough: () => Promise<unknown>) {
  const real = (await passthrough()) as StepStatusLike
  const { phaseIndex, done, finished, idle } = journeyProgress(scenario)
  const completed = new Set(journeyCompleted(scenario, phaseIndex))
  const current = finished || idle ? null : scenario.phases[phaseIndex]
  const stages: Record<string, string> = {}
  for (const key of Object.keys(real.stages)) {
    stages[key] = completed.has(key) ? "done" : current?.stage === key ? "running" : "idle"
  }
  const doneSteps = new Set([...completed].flatMap(stepsOf))
  const steps: Record<string, string> = {}
  for (const key of Object.keys(real.steps)) {
    steps[key] = doneSteps.has(key) ? "done" : current?.step === key ? "running" : "idle"
  }
  const progress = `page ${done}/${scenario.total}` // eslint-disable-line lingui/no-unlocalized-strings -- mirrors the server's step-message protocol, parsed by progressCounts
  const stepMessages: Record<string, string> = current ? { [current.step]: progress } : {}
  let anyRunning = !!current
  for (const stage of Object.keys(scenario.runs ?? {})) {
    const state = simulatedRunState(scenario, stage)
    if (!state || !(stage in stages)) continue
    stages[stage] = state
    const stageSteps = stepsOf(stage)
    stageSteps.forEach((step, index) => {
      if (!(step in steps)) return
      steps[step] = state === "done" ? "done" : index === 0 ? "running" : "idle"
    })
    if (state === "running") {
      anyRunning = true
      const startedAt = scenario.runs?.[stage] ?? simNow(scenario)
      const runDone = Math.min(scenario.total, Math.floor(((simNow(scenario) - startedAt) / SIM_RUN_MS) * (scenario.total + 1)))
      if (stageSteps[0]) stepMessages[stageSteps[0]] = `page ${runDone}/${scenario.total}` // eslint-disable-line lingui/no-unlocalized-strings -- step-message protocol
    }
  }
  return {
    ...real,
    stages,
    steps,
    stepMessages,
    runStatus: anyRunning ? "running" : "idle",
    stepErrors: null,
    error: null,
    pendingDecisions: [],
  }
}

interface PageLike {
  pageId: string
  hasRendering: boolean
  renderingVersion: number | null
  sections: unknown[]
  sectionCount: number
  [key: string]: unknown
}

function journeyPages(scenario: JourneyScenario, pages: PageLike[]): PageLike[] {
  const { phaseIndex, done, finished } = journeyProgress(scenario)
  if (finished) return pages
  const stage = scenario.phases[phaseIndex].stage
  if (stage === "extract") {
    return pages.slice(0, done).map((page) => ({ ...page, sections: [], sectionCount: 0, hasRendering: false, renderingVersion: null }))
  }
  if (stage === "sectioning") {
    return pages.map((page, index) =>
      index < done
        ? { ...page, hasRendering: false, renderingVersion: null }
        : { ...page, sections: [], sectionCount: 0, hasRendering: false, renderingVersion: null },
    )
  }
  if (stage === "storyboard") {
    return pages.map((page, index) => (index < done ? page : { ...page, hasRendering: false, renderingVersion: null }))
  }
  return pages
}

function journeyIntercept(scenario: JourneyScenario, path: string, passthrough: () => Promise<unknown>) {
  const { phaseIndex, finished, idle } = journeyProgress(scenario)
  if (finished && !scenario.holdFresh) return null
  const book = scenario.book
  if (path === "/books") {
    return (passthrough() as Promise<BookSummaryLike[]>).then((books) =>
      books.map((summary) =>
        summary.label === book ? { ...summary, completedStages: journeyCompleted(scenario, phaseIndex) } : summary,
      ),
    )
  }
  if (path === `/books/${book}`) {
    return (passthrough() as Promise<BookSummaryLike>).then((detail) => ({ ...detail, completedStages: journeyCompleted(scenario, phaseIndex) }))
  }
  if (path === `/books/${book}/step-status`) return simulateJourneyStatus(scenario, passthrough)
  if (path === `/books/${book}/stages/status`) {
    const current = finished || idle ? null : scenario.phases[phaseIndex]
    return Promise.resolve(
      current
        ? { label: book, status: "running", fromStage: scenario.phases[0].stage, toStage: scenario.phases.at(-1)?.stage, startedAt: scenario.startedAt, queue: [] }
        : { label: book, status: "idle", queue: [] },
    )
  }
  if (path === `/books/${book}/pages`) return (passthrough() as Promise<PageLike[]>).then((pages) => journeyPages(scenario, pages))
  if (path === `/books/${book}/tasks`) {
    return (passthrough() as Promise<{ tasks: TaskInfoResponse[] }>).then((data) =>
      simulatedRunState(scenario, "package") === "running"
        ? {
            ...data,
            tasks: [
              ...data.tasks,
              { taskId: SIM_PACKAGE_TASK, kind: "package-adt", status: "running" as const, description: "", startedAt: scenario.runs?.package },
            ],
          }
        : data,
    )
  }
  if (path === `/books/${book}/debug/accessibility`) {
    return (passthrough() as Promise<AccessibilityAssessmentResponse>).then((data) =>
      simulatedRunState(scenario, "package") === "done" ? data : { ...data, version: null, assessment: null },
    )
  }
  if (path === `/books/${book}/quizzes`) {
    return (passthrough() as Promise<Record<string, unknown>>).then((data) => ({ ...data, quizzes: [] }))
  }
  return null
}

export function isHiddenByJourney(stage: string): boolean {
  const scenario = scenarioStore.get()
  if (scenario?.kind !== "journey" || !OPTIONAL_HIDDEN.has(stage)) return false
  const runStage = stage === "validation" || stage === "sign-language" ? "package" : stage
  return simulatedRunState(scenario, runStage) !== "done"
}

const BOOT_WINDOW_MS = 20000
const fakeEdits = new Map<string, { pageId: string; until: number }>()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function bookOf(path: string): string | null {
  return path.match(/^\/books\/([^/?]+)/)?.[1] ?? null
}

interface StepStatusLike {
  stages: Record<string, string>
  steps: Record<string, string>
  stepMessages: Record<string, string> | null
  runStatus: string
  [key: string]: unknown
}

async function simulateStepStatus(scenario: RunScenario, passthrough: () => Promise<unknown>) {
  const real = (await passthrough()) as StepStatusLike
  const { done, finished } = runProgress(scenario)
  if (finished) return real
  const stages = { ...real.stages, [scenario.stage]: "running" }
  const steps = { ...real.steps, ...(scenario.step ? { [scenario.step]: "running" } : {}) }
  const progress = `page ${done}/${scenario.total}` // eslint-disable-line lingui/no-unlocalized-strings -- mirrors the server's step-message protocol, parsed by progressCounts
  const stepMessages = scenario.step ? { ...(real.stepMessages ?? {}), [scenario.step]: progress } : real.stepMessages
  return { ...real, stages, steps, stepMessages, runStatus: "running", stepErrors: null, error: null }
}

function mockIntercept(scenario: FaultScenario, mock: PageMock, path: string, method: string, passthrough: () => Promise<unknown>) {
  const pageId = openPageId()
  const pagesPath = `/books/${scenario.book}/pages`
  const pagePath = pageId ? `${pagesPath}/${pageId}` : null
  if (method !== "GET") return pagePath && path.startsWith(pagePath) ? Promise.resolve({ version: 0 }) : null
  if (pagePath && path === pagePath) return (passthrough() as Promise<PageDetail>).then((page) => mockPage(scenario.book, page, mock.spec))
  if (path === pagesPath) {
    return (passthrough() as Promise<PageLike[]>).then((pages) => {
      if (!pageId) setTimeout(() => openFirstPage(scenario.startedAt, pages), 0)
      return pages.map((page) => (page.pageId === pageId ? { ...page, imageCount: keptCount(mock.spec) } : page))
    })
  }
  return null
}

const PAGE_DETAIL_PATH = /^\/books\/[^/]+\/pages\/[^/?]+(\/image)?(\?|$)/

export function isPageDetailKey(key: readonly unknown[], book: string): boolean {
  return key[0] === "books" && key[1] === book && key[2] === "pages" && typeof key[3] === "string" && key.length === 4
}

const keptCache = new Map<string, number>()

async function keptCounts(book: string, pages: ReadonlyArray<{ pageId: string; imageCount: number }>): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  await Promise.all(
    pages.map(async (page) => {
      if (page.imageCount === 0) return
      const key = `${book}/${page.pageId}`
      if (!keptCache.has(key)) keptCache.set(key, keptImageIds(await api.getPage(book, page.pageId)).length)
      counts.set(page.pageId, keptCache.get(key) ?? 0)
    }),
  )
  return counts
}

function captionPagesMock(book: string, mock: CaptionMock, passthrough: () => Promise<unknown>) {
  return (passthrough() as Promise<Parameters<typeof mockCaptionPages>[1]>).then(async (pages) =>
    mockCaptionPages(book, pages, mock, mock.synthetic ? await keptCounts(book, pages) : undefined),
  )
}

function pruneIntercept(scenario: FaultScenario, mock: PruneMock, path: string, method: string, body: unknown, passthrough: () => Promise<unknown>) {
  const book = scenario.book
  const put = path.match(/^\/books\/[^/]+\/pages\/([^/?]+)\/image-filtering$/)
  if (put && method === "PUT") {
    rememberPrunePut(book, scenario.startedAt, put[1], typeof body === "string" ? JSON.parse(body) : null)
    return Promise.resolve({ version: 0 })
  }
  if (method !== "GET") return null
  if (path === `/books/${book}/pages`) {
    return (passthrough() as Promise<PageSummaryItem[]>).then((pages) => mockPruneSummary(book, scenario.startedAt, pages, mock, (pageId) => api.getPage(book, pageId)))
  }
  if (/^\/books\/[^/]+\/pages\/[^/?]+$/.test(path)) {
    return (passthrough() as Promise<PageDetail>).then((page) => mockPrunePage(book, scenario.startedAt, page, mock))
  }
  return null
}

function faultIntercept(scenario: FaultScenario, path: string, method: string, passthrough: () => Promise<unknown>, body?: unknown) {
  const book = scenario.book
  if (scenario.pruneMock && bookOf(path) === book) {
    const mocked = pruneIntercept(scenario, scenario.pruneMock, path, method, body, passthrough)
    if (mocked) return mocked
  }
  if (scenario.slowPagesMs && method === "GET" && bookOf(path) === book && PAGE_DETAIL_PATH.test(path)) {
    return sleep(scenario.slowPagesMs).then(passthrough)
  }
  if (scenario.failSpreads && method !== "GET" && bookOf(path) === book) {
    if (path === `/books/${book}/spreads/apply`) return sleep(600).then(() => Promise.reject(new Error(i18n._(msg`Simulated: the spread merge failed`))))
    return Promise.resolve({})
  }
  if (scenario.captionMock && method === "GET" && bookOf(path) === book) {
    const mock = scenario.captionMock
    if (path === `/books/${book}/pages`) return captionPagesMock(book, mock, passthrough)
    if (/^\/books\/[^/]+\/pages\/[^/?]+$/.test(path)) {
      return (passthrough() as Promise<PageDetail>).then((page) => mockCaptionPage(book, page, mock))
    }
  }
  if (scenario.pageMock && bookOf(path) === book) {
    const mocked = mockIntercept(scenario, scenario.pageMock, path, method, passthrough)
    if (mocked) return mocked
  }
  if (method !== "GET" || bookOf(path) !== book) return null
  const { status } = scenario
  if (path === `/books/${book}/step-status`) {
    return (passthrough() as Promise<StepStatusLike>).then((fetched) => scenario.captionMock?.synthetic ? withCaptionsDone(fetched) : fetched).then((real) => ({
      ...real,
      ...status,
      stages: { ...real.stages, ...status.stages },
      steps: { ...real.steps, ...status.steps },
      pendingDecisions: status.pendingDecisions ?? [],
    }))
  }
  if (path === `/books/${book}/stages/status` && status.runStatus === "running") {
    return Promise.resolve({ label: book, status: "running", fromStage: "extract", toStage: "extract", startedAt: scenario.startedAt, queue: [] })
  }
  if (path === `/books/${book}/spread-suggestions` && scenario.spreadSuggestions) {
    return Promise.resolve({ suggestions: scenario.spreadSuggestions.map((lead) => ({ lead, confidence: 0.82 })) })
  }
  if (path === `/books/${book}/pages` && (scenario.pages === "empty" || scenario.warnedPages)) {
    if (scenario.pages === "empty") return Promise.resolve([])
    return (passthrough() as Promise<PageLike[]>).then((pages) =>
      pages.map((page, index) => (index < (scenario.warnedPages ?? 0) ? { ...page, extractionWarning: "text-layer-missing" } : page)),
    )
  }
  return null
}

interface ProvidersLike {
  providers: Array<{ configuredOnServer?: boolean; fieldStatus: Array<{ key: string; configuredOnServer: boolean }> }>
}

function simulateUnconfiguredProviders(passthrough: () => Promise<unknown>) {
  return (passthrough() as Promise<ProvidersLike>).then((real) => ({
    ...real,
    providers: real.providers.map((provider) => ({
      ...provider,
      configuredOnServer: false,
      fieldStatus: provider.fieldStatus.map((field) => ({ ...field, configuredOnServer: false })),
    })),
  }))
}

function simulateConfiguredProviders(passthrough: () => Promise<unknown>) {
  return (passthrough() as Promise<ProvidersLike>).then((real) => ({
    ...real,
    providers: real.providers.map((provider) => ({
      ...provider,
      configuredOnServer: true,
      fieldStatus: provider.fieldStatus.map((field) => ({ ...field, configuredOnServer: true })),
    })),
  }))
}

function simulate(path: string, options: RequestInit | undefined, passthrough: () => Promise<unknown>) {
  const method = (options?.method ?? "GET").toUpperCase() // eslint-disable-line lingui/no-unlocalized-strings -- HTTP method identifier
  const book = bookOf(path)

  const aiEdit = path.match(/^\/books\/([^/]+)\/pages\/([^/]+)\/sections\/\d+\/ai-edit$/)
  if (aiEdit && method === "POST" && getVariant("ai") === "wired") {
    const taskId = `lab-ai-${Date.now()}`
    fakeEdits.set(taskId, { pageId: aiEdit[2], until: Date.now() + 6000 })
    return Promise.resolve({ taskId, status: "queued" })
  }

  if (book && path === `/books/${book}/tasks` && method === "GET" && fakeEdits.size > 0) {
    return (passthrough() as Promise<{ tasks: unknown[] }>).then((real) => {
      const now = Date.now()
      const fake = [...fakeEdits.entries()].map(([taskId, edit]) => ({
        taskId,
        kind: "ai-edit",
        status: now < edit.until ? "running" : "completed",
        description: i18n._(msg`AI edit (simulated)`),
        pageId: edit.pageId,
      }))
      for (const [taskId, edit] of fakeEdits) if (now - edit.until > 20000) fakeEdits.delete(taskId)
      return { tasks: [...real.tasks, ...fake] }
    })
  }

  const scenario = scenarioStore.get()
  if (!scenario) return null

  if (path === "/providers" && method === "GET" && scenario.kind === "fault" && scenario.noProviders) return simulateUnconfiguredProviders(passthrough)
  if (path === "/providers" && method === "GET" && scenario.kind !== "slow-load") return simulateConfiguredProviders(passthrough)

  if (scenario.kind === "fault") return faultIntercept(scenario, path, method, passthrough, options?.body)

  if (scenario.kind === "slow-load") {
    const isData = scenario.all ? !(scenario.keepShell && SHELL_PATH.test(path)) : /^\/books(\?|$)/.test(path) || /^\/books\/[^/]+\/pages(\?|$)/.test(path)
    if (isData && method === "GET" && performance.now() < BOOT_WINDOW_MS) {
      return holdFor(scenario.delayMs).then(passthrough)
    }
    return null
  }

  if (scenario.kind === "journey") {
    if (method === "POST" && path === `/books/${scenario.book}/stages/run`) {
      const body = typeof options?.body === "string" ? (JSON.parse(options.body) as { fromStage?: string; toStage?: string }) : {}
      const toStage = body.toStage ?? body.fromStage
      const idlePhase = scenario.idleAt !== undefined ? scenario.phases[scenario.idleAt] : undefined
      if (idlePhase && idlePhase.stage === (body.fromStage ?? toStage)) {
        const offset = scenario.phases.slice(0, scenario.idleAt).reduce((total, phase) => total + phase.durationMs, 0)
        startScenario({ ...scenario, idleAt: undefined, startedAt: Date.now() - offset, pausedAt: undefined, pauseAtMs: undefined })
      } else if (toStage) startScenario({ ...scenario, runs: { ...(scenario.runs ?? {}), [toStage]: simNow(scenario) } })
      return Promise.resolve({ status: "queued", label: scenario.book, fromStage: body.fromStage ?? toStage, toStage })
    }
    if (method === "POST" && path === `/books/${scenario.book}/package-adt`) {
      if (window.location.pathname.endsWith("/validation")) {
        startScenario({ ...scenario, runs: { ...(scenario.runs ?? {}), package: simNow(scenario) } })
        return Promise.resolve({ status: "queued", label: scenario.book, taskId: SIM_PACKAGE_TASK })
      }
      return api.getPackageAdtStatus(scenario.book).then((status) =>
        status.hasAdt ? { status: "completed", label: scenario.book, version: status.version, warnings: [] } : passthrough(),
      )
    }
    if (method !== "GET") return null
    return journeyIntercept(scenario, path, passthrough)
  }

  if (book !== scenario.book || method !== "GET") return null
  const runMock = scenario.captionMock
  if (runMock) {
    if (path === `/books/${book}/pages`) return captionPagesMock(book, runMock, passthrough)
    if (/^\/books\/[^/]+\/pages\/[^/?]+$/.test(path)) return (passthrough() as Promise<PageDetail>).then((page) => mockCaptionPage(book, page, runMock))
  }
  if (path === `/books/${book}/step-status`) {
    return simulateStepStatus(scenario, runMock?.synthetic ? () => (passthrough() as Promise<StepStatusLike>).then(withCaptionsDone) : passthrough)
  }
  if (path === `/books/${book}/stages/status`) {
    const { finished } = runProgress(scenario)
    if (finished) return null
    return Promise.resolve({ label: book, status: "running", fromStage: scenario.stage, toStage: scenario.stage, startedAt: scenario.startedAt, queue: [] })
  }
  if (scenario.arrivingPages && path === `/books/${book}/pages`) {
    const { done, finished } = runProgress(scenario)
    if (finished) return null
    return (passthrough() as Promise<unknown[]>).then((pages) => pages.slice(0, done))
  }
  return null
}

function intercept(path: string, options: RequestInit | undefined, passthrough: () => Promise<unknown>) {
  const simulated = simulate(path, options, passthrough)
  if (simulated || !IN_LAB_FRAME) return simulated
  if ((options?.method ?? "GET").toUpperCase() === "GET") return null // eslint-disable-line lingui/no-unlocalized-strings -- HTTP method identifier
  const packaging = path.match(/^\/books\/([^/]+)\/package-adt$/)
  if (packaging) {
    const book = packaging[1]
    return api.getPackageAdtStatus(book).then((status) =>
      status.hasAdt
        ? { status: "completed", label: book, version: status.version, warnings: [] }
        : Promise.reject(new Error(i18n._(msg`Not saved: lab previews never change the book or start real runs`))),
    )
  }
  return Promise.reject(new Error(i18n._(msg`Not saved: lab previews never change the book or start real runs`)))
}

if (LAB_ENABLED) setRequestInterceptor(intercept)

if (LAB_ENABLED && !IN_LAB_FRAME && scenarioStore.get()?.kind === "slow-load") {
  window.setTimeout(() => {
    if (scenarioStore.get()?.kind === "slow-load") scenarioStore.set(null)
  }, BOOT_WINDOW_MS)
}

export function LabSimulationDriver() {
  const queryClient = useQueryClient()
  const [scenario] = useScenario()
  const simulating = !!scenario && scenario.kind !== "slow-load"

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["providers"] })
  }, [simulating, queryClient])

  useEffect(() => {
    if (scenario?.kind !== "fault") return
    void queryClient.invalidateQueries({ queryKey: ["books", scenario.book] })
  }, [scenario, queryClient])

  useEffect(() => {
    if (scenario?.kind !== "fault" || !scenario.slowPagesMs) return
    void queryClient.resetQueries({ predicate: (query) => isPageDetailKey(query.queryKey, scenario.book) })
  }, [scenario, queryClient])

  useEffect(() => {
    if (!scenario || scenario.kind !== "journey") return
    let lastPhase = -1
    let lastFinishedRuns = -1
    const tick = () => {
      const { phaseIndex, finished } = journeyProgress(scenario)
      const finishedRuns = Object.keys(scenario.runs ?? {}).filter((stage) => simulatedRunState(scenario, stage) === "done").length
      if (finishedRuns !== lastFinishedRuns) {
        if (lastFinishedRuns >= 0) void queryClient.invalidateQueries({ queryKey: ["books", scenario.book] })
        lastFinishedRuns = finishedRuns
      }
      void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "step-status"] })
      void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "pages"], exact: true })
      if (scenario.runs?.package !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", scenario.book] })
        void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "tasks"] })
      }
      if (phaseIndex !== lastPhase) {
        lastPhase = phaseIndex
        void queryClient.invalidateQueries({ queryKey: ["books"], exact: true })
        void queryClient.invalidateQueries({ queryKey: ["books", scenario.book], exact: true })
        void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "quizzes"] })
      }
      if (finished && !scenario.holdFresh && scenario.pausedAt === undefined) stopScenario()
    }
    tick()
    const id = window.setInterval(tick, 1500)
    return () => window.clearInterval(id)
  }, [scenario, queryClient])

  useEffect(() => {
    if (!scenario || scenario.kind !== "run") return
    const tick = () => {
      void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "step-status"] })
      if (scenario.arrivingPages) void queryClient.invalidateQueries({ queryKey: ["books", scenario.book, "pages"], exact: true })
      if (!scenario.loop && runProgress(scenario).finished) {
        void queryClient.invalidateQueries({ queryKey: ["books", scenario.book] })
        if (scenario.pausedAt === undefined && scenario.pauseAtMs === undefined) stopScenario()
      }
    }
    tick()
    const id = window.setInterval(tick, 1500)
    return () => window.clearInterval(id)
  }, [scenario, queryClient])

  useEffect(() => {
    if (!scenario || scenario.kind === "slow-load" || scenario.pausedAt !== undefined || scenario.pauseAtMs === undefined) return
    const wait = scenario.startedAt + scenario.pauseAtMs - Date.now()
    const id = window.setTimeout(pauseScenario, Math.max(0, wait))
    return () => window.clearTimeout(id)
  }, [scenario])

  return null
}
