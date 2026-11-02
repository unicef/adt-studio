// @vitest-environment jsdom
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ config: vi.fn(), state: vi.fn(), update: vi.fn(),
  active: { merged: { page_sectioning: { mode: "dynamic" }, section_types: { activity_quiz: "Quiz" }, generate_activities: true } },
}))
vi.mock("@/api/client", () => ({ api: { getBookConfig: mocks.config, getSectioningModeState: mocks.state, updateBookConfig: mocks.update } }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: false, queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-book-tasks", () => ({ useBookTasks: () => ({ runningCount: 0 }) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [], isLoading: false }) }))
vi.mock("@/hooks/use-parts", () => ({ useSplitStatus: () => ({ data: {}, isLoading: false }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: mocks.active }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "fixture" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/components/pipeline/components/LandingPageShell", () => ({ LandingPageShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./components/SectioningPreview", () => ({ SectioningPreview: () => null }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join(""), i18n: { _: (d: { id?: string }) => d?.id ?? "" } }) }))
const { SectioningLandingPage } = await import("./SectioningLandingPage")

const original = { generate_activities: true, page_sectioning: { mode: "dynamic", max_refinements: 2 }, editing_language: "fr" }
beforeEach(() => {
  mocks.config.mockResolvedValue({ config: original })
  mocks.state.mockResolvedValue({ effectiveMode: "dynamic", hasOutput: true, stale: false })
  mocks.update.mockResolvedValue({ config: original })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><SectioningLandingPage bookLabel="book" /></QueryClientProvider>)
  return client
}
const mode = () => screen.getByRole("radio", { name: "By Page" }) as HTMLButtonElement

it("waits for book overrides before allowing a mode save that could replace them", async () => {
  let loaded!: (value: unknown) => void
  mocks.config.mockImplementation(() => new Promise((resolve) => { loaded = resolve }))
  const client = mount()
  await waitFor(() => expect(client.getQueryData(["books", "book", "sectioning-mode-state"])).toBeDefined())
  expect(mode().disabled).toBe(true)
  fireEvent.click(mode())
  expect(mocks.update).not.toHaveBeenCalled()
  await act(async () => loaded({ config: original }))
  await waitFor(() => expect(mode().disabled).toBe(false))
})

it("preserves overrides refreshed while the mode confirmation was open", async () => {
  const client = mount()
  await waitFor(() => expect(mode().disabled).toBe(false))
  fireEvent.click(mode())
  expect(screen.getByRole("dialog")).toBeTruthy()
  act(() => { client.setQueryData(["book-config", "book"], { config: { ...original, generate_activities: false } }) })
  fireEvent.click(screen.getByRole("button", { name: "Change mode" }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("book", {
    ...original, generate_activities: false, page_sectioning: { ...original.page_sectioning, mode: "page" },
  }))
})
