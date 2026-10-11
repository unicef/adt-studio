// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ i18n: { _: (d: { id: string }) => d.id } }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isCancelling: false, cancelRun() {} }) }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => [] }))
vi.mock("@/components/parts/PartialMergeNotice", () => ({ PartialMergeNotice: () => null }))
vi.mock("@/components/wizard/shared/PreviewShell", () => ({ PreviewShell: () => null }))
vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn() } }))
const { api } = await import("@/api/client")
const { LandingPageShell } = await import("./LandingPageShell")
afterEach(() => { cleanup(); vi.clearAllMocks() })
async function mount(stageSlug: string, protectedWork: unknown[]) {
  vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork } as never)
  const onRun = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><LandingPageShell bookLabel="book" stageSlug={stageSlug} colorClass="bg-blue-500" isRunning={false} isCompleted hasError={false} canRun runLabel="Run" rerunLabel="Rerun" previewLabel="Preview" onRun={onRun} preview={null}>{null}</LandingPageShell></QueryClientProvider>)
  await waitFor(() => expect(client.getQueryState(["books", "book", "step-status"])?.status).toBe("success"))
  return { onRun, client }
}
it("lists protected page numbers, defaults replacement off on every open and sends only the named versions", async () => {
  const { onRun } = await mount("sectioning", [{ node: "page-sectioning", itemId: "pg003", pageNumber: 3, version: 7 }])
  await waitFor(() => expect(api.getStepStatus).toHaveBeenCalled())
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  expect(await screen.findByText(/Protected pages:/)).toBeTruthy()
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onRun).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [{ node: "page-sectioning", itemId: "pg003", version: 7 }] })
})
it("requires the TOC replacement notice to be confirmed and cancellation makes no request", async () => {
  const { onRun } = await mount("toc", [{ node: "toc-generation", itemId: "book", version: 2 }])
  await waitFor(() => expect(api.getStepStatus).toHaveBeenCalled())
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  expect(await screen.findByText(/This replaces the manually edited/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onRun).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 2 }] })
})

it.each(["sectioning", "toc"])("keeps the %s replacement confirmation bound to the version shown when opened", async (stage) => {
  const record = { node: stage === "toc" ? "toc-generation" : "page-sectioning", itemId: stage === "toc" ? "book" : "pg003", version: 2 }
  const { onRun, client } = await mount(stage, [record])
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  if (stage === "sectioning") fireEvent.click(screen.getByRole("checkbox"))
  await act(async () => {
    client.setQueryData(["books", "book", "step-status"], { protectedWork: [{ ...record, version: 3 }] })
    // Let TanStack Query deliver its scheduled cache notification to React.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [record] })
})
