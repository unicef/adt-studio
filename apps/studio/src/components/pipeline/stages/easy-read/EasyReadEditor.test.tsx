// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { OutputStatus } from "@adt/types"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: join, i18n: { locale: "en" } }),
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("../../components/floating-save", () => ({ useFloatingSaveDirtyEntries: () => [] }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: () => {} }) }))
vi.mock("../../components/VersionPicker", () => ({ VersionPicker: () => null }))
vi.mock("./components/PageJumper", () => ({ PageJumper: () => null }))
vi.mock("./components/PageCover", () => ({ PageCover: () => null }))
vi.mock("../../components/PageLightbox", () => ({ PageLightbox: () => null }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getEasyRead: vi.fn(), getOutputs: vi.fn(), runStages: vi.fn(), reviewOutput: vi.fn() } }))

const { api } = await import("@/api/client")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { EasyReadEditor } = await import("./EasyReadEditor")
let client: QueryClient

const entry = { sourceId: "pg001_t001", easyReadId: "pg001_t001_easy_read", originalText: "The Nile floods every year.",
  text: "The river Nile floods each year.", pageId: "pg001", sectionId: "pg001_sec001", sectionIndex: 0 }

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  vi.mocked(api.getEasyRead).mockResolvedValue({ sourceSignature: "source", generatedAt: "2026-01-01T00:00:00.000Z", version: 1,
    blocks: [{ pageId: "pg001", pageNumber: 1, sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "text", entries: [entry] }] } as never)
})
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals() })

function setup() {
  const output: OutputStatus = { identity: { kind: "easy-read", id: entry.easyReadId, language: "en" }, signature: "inputs", contentHash: "content",
    usable: true, current: false, protected: true, manual: true, excluded: false, missing: false, updateNeeded: false,
    warnings: [{ reason: "source-changed" }], pageIds: ["pg001"], sectionIds: ["pg001_sec001"] }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "book", "outputs", false, undefined], { outputs: [output] })
  render(<QueryClientProvider client={client}><TooltipProvider>
    <EasyReadEditor bookLabel="book" isRunning={false} hasStructuredTextProvider onRegenerate={vi.fn()} />
  </TooltipProvider></QueryClientProvider>)
}

it("shows a protected Easy Read entry as a compact Manual edit pill with its actions in the popover", async () => {
  setup()
  const pill = await screen.findByRole("button", { name: "Easy Read: Edited manually" })
  // No inline callout: the reason and actions stay behind the pill.
  expect(screen.queryByText("Source changed. Your edit has been kept.")).toBeNull()
  fireEvent.click(pill)
  expect(screen.getByText("Source changed. Your edit has been kept.")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Keep my edit" })).toBeTruthy()
})

it("labels an entry that differs from its saved text as an unsaved edit", async () => {
  setup()
  fireEvent.change(await screen.findByLabelText("Easy Read text"), { target: { value: "The Nile floods once a year." } })
  expect(await screen.findByRole("button", { name: "Easy Read: Unsaved edit" })).toBeTruthy()
})

it("discloses that a shared edit also updates the section hidden by the page filter", async () => {
  vi.mocked(api.getEasyRead).mockResolvedValue({ sourceSignature: "source", generatedAt: "before", version: 1, blocks: [
    { pageId: "pg001", sectionId: "shared-section", sectionIndex: 0, sectionType: "text", entries: [entry] },
    { pageId: "pg002", sectionId: "shared-section", sectionIndex: 0, sectionType: "text", entries: [{ ...entry, pageId: "pg002", sectionId: "shared-section" }] },
  ] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><TooltipProvider>
    <EasyReadEditor bookLabel="book" selectedPageId="pg001" isRunning={false} hasStructuredTextProvider onRegenerate={vi.fn()} />
  </TooltipProvider></QueryClientProvider>)
  expect(await screen.findByText("This Easy Read text is shared across sections. Saving it updates every referring section, including sections outside the current filter.")).toBeTruthy()
  expect(screen.getAllByLabelText("Easy Read text")).toHaveLength(1)
})
