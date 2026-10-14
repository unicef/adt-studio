// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join, i18n: { _: (d: { message: string }) => d.message } }) }))
const HeaderContext = createContext<{ setExtra: (extra: ReactNode) => void }>({ setExtra: () => {} })
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => useContext(HeaderContext) }))
const retainedToc = { version: 2, generatedAt: "fixture", entries: [{ id: "toc001", title: "My saved chapter", sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "chapter1", level: 1 }] }
vi.mock("@/hooks/use-toc", () => ({ useToc: () => ({ data: retainedToc, isLoading: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false }) }))
vi.mock("./TocLandingPage", () => ({ TocLandingPage: () => <div>TOC landing</div> }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookStructuredTextAvailability: () => false }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => <div>Generate TOC</div> }))
vi.mock("../../components/VersionPicker", () => ({ VersionPicker: ({ onSave, dirty }: { onSave: () => void; dirty: boolean }) => <button type="button" disabled={!dirty} onClick={onSave}>Save</button> }))
vi.mock("./components/TocHintBanner", () => ({ TocHintBanner: () => null }))
vi.mock("@/api/client", () => ({ api: { getTocSections: vi.fn().mockResolvedValue([]), updateToc: vi.fn().mockResolvedValue({ version: 3 }) } }))
const { api } = await import("@/api/client")
const { TocIndex } = await import("./TocIndex")
function Harness() {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}><header>{extra}</header><TocIndex bookLabel="book" /></HeaderContext.Provider>
}
afterEach(cleanup)
it("keeps the retained TOC editable after its attempt resets, without credentials or regeneration", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  expect(screen.queryByText("Generate TOC")).toBeNull()
  expect(screen.queryByText("TOC landing")).toBeNull()
  const input = await screen.findByLabelText("Entry title")
  expect((input as HTMLInputElement).value).toBe("My saved chapter")
  await waitFor(() => expect(api.getTocSections).toHaveBeenCalledWith("book"))
  fireEvent.change(input, { target: { value: "My revised chapter" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updateToc).toHaveBeenCalledWith("book", expect.objectContaining({ entries: [expect.objectContaining({ id: "toc001", title: "My revised chapter" })] })))
  client.clear()
})
