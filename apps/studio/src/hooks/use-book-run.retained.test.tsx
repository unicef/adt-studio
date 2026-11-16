// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
vi.mock("@lingui/core", () => ({ i18n: { _: (value: {message?: string}) => value.message ?? "message" } }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ message: strings.join("") }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ credentials: {} }) }))
vi.mock("@/components/a11y/LiveRegionAnnouncer", () => ({ useAnnouncer: () => ({ announce: vi.fn() }) }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage, getStageRunningLabelI18n: (stage: string) => stage }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/hooks/use-book-tasks", () => ({ bookTasksKey: (label: string) => ["tasks", label] }))
vi.mock("@/lib/completion-sound", () => ({ playCompletionSound: vi.fn(), playErrorSound: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
const mocked = vi.hoisted(() => ({ run: vi.fn(), status: vi.fn() }))
vi.mock("@/api/client", () => ({ BASE_URL: "http://unused", api: { getStepStatus: mocked.status, runStages: mocked.run } }))
const { useBookRunStatus } = await import("@/hooks/use-book-run")
let client: QueryClient
const pages = [{ pageId: "pg001", sectionCount: 1, hasRendering: true, renderingVersion: 3, sectioningVersion: 4, sections: [{ sectionId: "pg001_sec001" }], prunedSections: [] }]
const detail = { pageId: "pg001", sectioningTree: { source: "manual", sections: [{ sectionId: "pg001_sec001" }] }, rendering: { sections: [{ html: "Retained manual HTML" }] } }
function wrapper({children}: {children: ReactNode}) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
beforeEach(() => {
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} })
  mocked.run.mockReset().mockRejectedValue(new Error("BOOK_BUSY"))
  mocked.status.mockReset().mockImplementation(() => new Promise(() => {}))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "retained", "step-status"], { stages: { sectioning: "done", storyboard: "done", toc: "done" }, steps: {}, error: null })
  client.setQueryData(["books", "retained", "pages"], structuredClone(pages))
  client.setQueryData(["books", "retained", "pages", "pg001"], structuredClone(detail))
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })
it.each(["sectioning", "storyboard"] as const)("queuing %s preserves current page/tree/rendering caches through rejected admission", async (stage) => {
  const hook = renderHook(() => useBookRunStatus("retained"), {wrapper})
  act(() => hook.result.current.queueRun({ fromStage: stage, toStage: stage, apiKey: "" }))
  expect(client.getQueryData(["books", "retained", "pages"])).toEqual(pages)
  expect(client.getQueryData(["books", "retained", "pages", "pg001"])).toEqual(detail)
  await waitFor(() => expect(mocked.run).toHaveBeenCalledTimes(1))
  expect(client.getQueryData(["books", "retained", "pages"])).toEqual(pages)
  expect(client.getQueryData(["books", "retained", "pages", "pg001"])).toEqual(detail)
})
