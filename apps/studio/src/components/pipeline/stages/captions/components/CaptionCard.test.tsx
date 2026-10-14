// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
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
vi.mock("../../../components/floating-save", () => ({ useFloatingSaveDirtyEntries: () => [] }))
vi.mock("../../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getOutputs: vi.fn(), runStages: vi.fn(), reviewOutput: vi.fn() } }))

const { CaptionCard } = await import("./CaptionCard")
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()) })

const cap = { imageId: "pg001_im001", caption: "A river at sunrise", reasoning: "", source: "manual" as const }

function setup(edited = false) {
  const output: OutputStatus = { identity: { kind: "caption", id: cap.imageId }, signature: "inputs", contentHash: "content",
    usable: true, current: false, protected: true, manual: true, excluded: false, missing: false, updateNeeded: false,
    warnings: [{ reason: "source-changed" }], pageIds: ["pg001"], sectionIds: [] }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  client.setQueryData(["books", "book", "outputs", false, undefined], { outputs: [output] })
  render(<QueryClientProvider client={client}>
    <CaptionCard bookLabel="book" cap={cap} list={[cap]} editing={null} onStartEdit={vi.fn()} onChangeDraft={vi.fn()}
      onCommitEdit={vi.fn()} onCancelEdit={vi.fn()} onToggleDecorative={vi.fn()} onOpenLightbox={vi.fn()}
      pageId="pg001" pageNumber={1} edited={edited} />
  </QueryClientProvider>)
}

it("shows a protected caption as a compact Manual edit pill with its actions in the popover", () => {
  setup()
  // No inline callout: the reason and actions stay behind the pill.
  expect(screen.queryByText("Source changed. Your edit has been kept.")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Caption: Edited manually" }))
  expect(screen.getByText("Source changed. Your edit has been kept.")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Keep my edit" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy()
})

it("labels a caption that differs from its saved version as an unsaved edit", () => {
  setup(true)
  expect(screen.getByRole("button", { name: "Caption: Unsaved edit" })).toBeTruthy()
})
