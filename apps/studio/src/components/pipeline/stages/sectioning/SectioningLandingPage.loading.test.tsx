// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, type PageSummaryItem } from "@/api/client"
import { SectioningLandingPage } from "./SectioningLandingPage"

const state = vi.hoisted(() => ({ queueRun: vi.fn() }))
vi.mock("@/api/client", () => ({ api: { getPages: vi.fn() } }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string, ...args: unknown[]) =>
      typeof strings === "string" ? strings : strings.reduce((text, part, i) => text + part + (args[i] ?? ""), ""),
  }),
}))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => ({}) }))
vi.mock("@/hooks/use-parts", () => ({ useSplitStatus: () => ({ data: { hasMergeActivity: false }, isLoading: false }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({}) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false, isCompleted: false, hasError: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queueRun }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "stub" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-persist-config", () => ({ usePersistConfig: () => vi.fn() }))
vi.mock("@/components/pipeline/components/LandingPageShell", () => ({
  LandingPageShell: ({ onRun, extraDisabled, children }: { onRun: () => void; extraDisabled: boolean; children: ReactNode }) => (
    <><button disabled={extraDisabled} onClick={onRun}>Run</button>{children}</>
  ),
}))
vi.mock("@/components/pipeline/components/CascadeWarning", () => ({ CascadeWarning: () => null }))
vi.mock("@/components/pipeline/components/LandingPageWarning", () => ({ LandingPageWarning: () => null }))
vi.mock("@/components/pipeline/components/SettingsCard", () => ({ SettingsCard: () => null, SettingsField: () => null }))
vi.mock("@/components/pipeline/components/SettingExplainer", () => ({ SettingExplainer: () => null }))
vi.mock("@/components/pipeline/components/ToggleCard", () => ({ ToggleCard: () => null }))
vi.mock("@/components/ui/segmented-control", () => ({ SegmentedControl: () => null }))
vi.mock("./components/SectioningModeVisual", () => ({ SectioningModeVisual: () => null }))
vi.mock("./components/SectioningPreview", () => ({ SectioningPreview: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it("waits for the authoritative page read before choosing Extract from a cached empty page list", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "book", "pages"], [])
  let finish!: (pages: PageSummaryItem[]) => void
  vi.mocked(api.getPages).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const view = render(<SectioningLandingPage bookLabel="book" />, { wrapper })
  try {
    await waitFor(() => expect(api.getPages).toHaveBeenCalledTimes(1))
    expect(client.getQueryState(["books", "book", "pages"])?.fetchStatus).toBe("fetching")
    fireEvent.click(screen.getByText("Run"))
    expect(state.queueRun).not.toHaveBeenCalled()

    await act(async () => finish([{
      pageId: "pg001", pageNumber: 1, hasRendering: false, hasCaptioning: false,
      textPreview: "Historical page", imageCount: 0, wordCount: 2, sectionCount: 0,
      prunedSections: [], renderingVersion: null, sectioningVersion: null, sections: [], extractionWarning: null,
    }]))
    await waitFor(() => expect((screen.getByText("Run") as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByText("Run"))
    expect(state.queueRun).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "sectioning" }))
  } finally {
    view.unmount()
    client.clear()
  }
})
