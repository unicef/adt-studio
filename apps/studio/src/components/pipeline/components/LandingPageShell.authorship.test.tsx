// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""), i18n: { _: (d: { id: string }) => d.id } }) }))
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
it.each(["loading", "failed"])("does not bypass TOC consent when protection status is %s", async state => {
  vi.mocked(api.getStepStatus).mockImplementation(() => state === "loading" ? new Promise(() => {}) : Promise.reject(new Error("Status unavailable")))
  const onRun = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><LandingPageShell bookLabel="book" stageSlug="toc" colorClass="bg-blue-500" isRunning={false} isCompleted hasError={false} canRun runLabel="Run" rerunLabel="Rerun" previewLabel="Preview" onRun={onRun} preview={null}>{null}</LandingPageShell></QueryClientProvider>)
  if (state === "failed") await waitFor(() => expect(client.getQueryState(["books", "book", "step-status"])?.status).toBe("error"))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  expect(onRun).not.toHaveBeenCalled()
  view.unmount()
  client.clear()
})
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
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  expect(await screen.findByText(/Pages with manual edits or unknown authorship:/)).toBeTruthy()
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onRun).not.toHaveBeenCalled()
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  await waitFor(() => expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [{ node: "page-sectioning", itemId: "pg003", version: 7 }] }))
})
it("requires the TOC replacement notice to be confirmed and cancellation makes no request", async () => {
  const { onRun } = await mount("toc", [{ node: "toc-generation", itemId: "book", version: 2 }])
  await waitFor(() => expect(api.getStepStatus).toHaveBeenCalled())
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  expect(await screen.findByText(/This replaces the manually edited/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onRun).not.toHaveBeenCalled()
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  await waitFor(() => expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 2 }] }))
})

it.each(["sectioning", "toc"])("keeps the %s replacement confirmation bound to the version shown when opened", async (stage) => {
  const record = { node: stage === "toc" ? "toc-generation" : "page-sectioning", itemId: stage === "toc" ? "book" : "pg003", version: 2 }
  const { onRun, client } = await mount(stage, [record])
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  if (stage === "sectioning") fireEvent.click(screen.getByRole("checkbox"))
  await act(async () => {
    client.setQueryData(["books", "book", "step-status"], { protectedWork: [{ ...record, version: 3 }] })
    // Let TanStack Query deliver its scheduled cache notification to React.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  await waitFor(() => expect(onRun).toHaveBeenCalledWith({ replaceManual: true, protectedReplacements: [record] }))
})

async function scopeView(book = "a", stage = "toc") {
  const records = [{ node: "toc-generation", itemId: "book", version: 12 }, { node: "page-sectioning", itemId: "pg003", pageNumber: 3, version: 12 }]
  vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: records } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  for (const label of ["a", "b"]) client.setQueryData(["books", label, "step-status"], { protectedWork: records })
  const onRun = vi.fn()
  const component = (label: string, slug: string, flags: Partial<React.ComponentProps<typeof LandingPageShell>> = {}) => <QueryClientProvider client={client}><LandingPageShell bookLabel={label} stageSlug={slug} colorClass="bg-blue-500" isRunning={false} isCompleted hasError={false} canRun runLabel="Run" rerunLabel="Rerun" previewLabel="Preview" onRun={options => onRun(label, slug, options)} preview={null} {...flags}>{null}</LandingPageShell></QueryClientProvider>
  const view = render(component(book, stage))
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  return { onRun, show: (label: string, slug: string, flags = {}) => view.rerender(component(label, slug, flags)) }
}

it.each(["toc", "sectioning"])("invalidates %s consent on book change, including returning to the old book", async stage => {
  const { onRun, show } = await scopeView("a", stage)
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  if (stage === "sectioning") fireEvent.click(screen.getByRole("checkbox"))
  show("b", stage)
  expect(screen.queryByRole("dialog")).toBeNull()
  show("a", stage)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(onRun).not.toHaveBeenCalled()
  show("b", stage)
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  if (stage === "sectioning") expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  await waitFor(() => expect(onRun).toHaveBeenCalledExactlyOnceWith("b", stage, { replaceManual: stage === "toc", protectedReplacements: stage === "toc" ? [{ node: "toc-generation", itemId: "book", version: 12 }] : [] }))
})

it.each(["toc", "sectioning"])("invalidates %s consent when switching stages", async stage => {
  const { onRun, show } = await scopeView("a", stage)
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  show("a", stage === "toc" ? "sectioning" : "toc")
  expect(screen.queryByRole("dialog")).toBeNull()
  show("a", stage)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(onRun).not.toHaveBeenCalled()
})

it("invalidates a pre-run warning when its book or stage changes", async () => {
  const { onRun, show } = await scopeView()
  const warning = { runWarning: { title: "Layout warning", description: "Review layout" } }
  show("a", "toc", warning)
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  show("b", "toc", warning)
  expect(screen.queryByRole("dialog")).toBeNull()
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  show("b", "sectioning", warning)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(onRun).not.toHaveBeenCalled()
})

it.each([{ canRun: false }, { isRunning: true }, { extraDisabled: true }])("does not run a previously opened confirmation after availability changes: %j", async flags => {
  const { onRun, show } = await scopeView()
  await waitFor(() => expect((screen.getByRole("button", { name: "Rerun" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Rerun" }))
  await screen.findByRole("dialog")
  show("a", "toc", flags)
  fireEvent.click(screen.getAllByRole("button", { name: "Rerun" }).at(-1)!)
  expect(onRun).not.toHaveBeenCalled()
})
