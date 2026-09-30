// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useNavigate, useParams } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { PreviewValidationCard } from "@/components/pipeline/stages/PreviewValidationCard"
import { ValidationReturnBanner } from "./ValidationReturnBanner"
import { useValidationFixNavigation } from "@/hooks/use-validation-fix-navigation"
import { parseBookStepSearch } from "@/lib/book-step-search"

const save = vi.fn()
const getPages = vi.fn()
const warning = vi.fn()
const failure = vi.fn()
const catalog = {
  identificationFields: [], instructions: [],
  pageSections: [{ id: "text", label: "Text", criteria: [{ id: "reading", label: "Reading order", guidance: "Check order", requires_comment_on_failure: true, requires_suggested_modification_on_failure: false }] }],
}
const session = { version: 1, session: { session_id: "original", reviewer_name: "Reviewer", catalog_snapshot: catalog } }
const records = { records: [] }

vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ id: strings.reduce((s, part, i) => s + part + String(values[i] ?? ""), "") }) }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((s, part, i) => s + part + String(values[i] ?? ""), ""),
    i18n: { _: (value: { id?: string } | string) => typeof value === "string" ? value : value.id },
  }),
}))
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("@/components/pipeline/components/FloatingSaveBar", () => ({ FloatingSaveBar: () => null }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle" }) }))
vi.mock("@/hooks/use-glossary", () => ({ useGlossary: () => ({ data: { items: [] } }) }))
vi.mock("@/api/client", () => ({ api: { getPages: (...args: unknown[]) => getPages(...args), getTextCatalog: async () => ({}), getTTS: async () => ({}), getEasyRead: async () => ({}) } }))
vi.mock("sonner", () => ({ toast: { warning: (...args: unknown[]) => warning(...args), error: (...args: unknown[]) => failure(...args) } }))
vi.mock("@/hooks/use-reviewer-validation", () => ({
  useReviewerValidationCatalog: () => ({ data: catalog }),
  useReviewerValidationSessions: () => ({ data: { sessions: [session] } }),
  useReviewerPageValidationRecords: () => ({ data: records }),
  useSaveReviewerValidationSession: () => ({ mutateAsync: vi.fn() }),
  useSaveReviewerPageValidationRecord: () => ({ mutateAsync: (...args: unknown[]) => save(...args), isPending: false }),
}))

const initialPreviewPage = { pageId: "pg001", pageNumber: 1, sectionId: "stable", href: "stable.html", title: "Page", hasImages: false, hasActivity: false, signLanguageEnabled: false }
let previewPage = initialPreviewPage

function Surface() {
  const { step } = useParams({ strict: false }) as { step: string }
  const navigate = useNavigate()
  const fix = useValidationFixNavigation("book")
  if (step === "preview") return <PreviewValidationCard label="book" panelOpen={false} currentPage={previewPage} onOpenValidation={() => void navigate({ to: "/books/$label/$step", params: { label: "book", step: "validation" } })} />
  if (step === "validation") return <button onClick={() => void fix.open({ stage: "storyboard", pageId: "old-page", sectionId: "stable" }, { tab: "accessibility-summary", assessment: "original", category: "structure-semantics", pageId: "old-page", findingId: "heading-order" })}>Open repair</button>
  return <><ValidationReturnBanner label="book" /><div>Editor</div></>
}

async function setup(step: string, initialHref?: string) {
  const root = createRootRoute({ component: () => <FloatingSaveProvider><UnsavedChangesGuard /><Outlet /></FloatingSaveProvider> })
  const route = createRoute({ getParentRoute: () => root, path: "/books/$label/$step", validateSearch: parseBookStepSearch, component: Surface })
  const page = createRoute({ getParentRoute: () => root, path: "/books/$label/$step/$pageId", validateSearch: parseBookStepSearch, component: Surface })
  const history = createMemoryHistory({ initialEntries: [initialHref ?? `/books/book/${step}?unrelated=keep#original-fragment`] })
  const router = createRouter({ routeTree: root.addChildren([route, page]), history })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)
  await act(async () => { await router.load() })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  previewPage = initialPreviewPage
  window.sessionStorage.clear()
  window.sessionStorage.setItem("adt-preview-review-card:book", "expanded")
  save.mockResolvedValue({})
  getPages.mockResolvedValue([{ pageId: "new-page", sections: [{ sectionId: "stable", hasStableId: true, isPruned: false }] }])
})
afterEach(cleanup)

it("blocks unsaved review navigation; cancellation and failed Save & leave retain the draft", async () => {
  const router = await setup("preview")
  const note = await screen.findByLabelText("Overall page note")
  fireEvent.change(note, { target: { value: "Keep this review draft" } })
  fireEvent.click(screen.getByRole("button", { name: "Open Validation" }))
  await screen.findByRole("alertdialog")
  expect(router.state.location.pathname).toBe("/books/book/preview")
  fireEvent.click(screen.getByRole("button", { name: /Stay/i }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect((note as HTMLTextAreaElement).value).toBe("Keep this review draft")
  save.mockRejectedValueOnce(new Error("disk full"))
  fireEvent.click(screen.getByRole("button", { name: "Open Validation" }))
  fireEvent.click(await screen.findByRole("button", { name: /Save.*leave/i }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(router.state.location.pathname).toBe("/books/book/preview")
  expect((note as HTMLTextAreaElement).value).toBe("Keep this review draft")
  fireEvent.click(screen.getByRole("button", { name: /Save.*leave/i }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/books/book/validation"))
  expect(save.mock.calls[1][0]).toMatchObject({ overall_comment: "Keep this review draft", section_id: "stable", results: [] })
})

it("resolves moved identity, restores context with Return and Back, and writes no review", async () => {
  const router = await setup("validation")
  fireEvent.click(await screen.findByRole("button", { name: "Open repair" }))
  await screen.findByText("Editor")
  expect(router.state.location.pathname).toBe("/books/book/storyboard/new-page")
  expect(router.state.location.search).toMatchObject({ sectionId: "stable", validationReturn: { assessment: "original" } })
  await act(async () => { router.history.back() })
  await screen.findByRole("button", { name: "Open repair" })
  expect(router.state.location.hash).toBe("original-fragment")
  expect(router.state.location.search).toMatchObject({ unrelated: "keep", validationContext: { findingId: "heading-order", category: "structure-semantics" } })
  fireEvent.click(screen.getByRole("button", { name: "Open repair" }))
  fireEvent.click(await screen.findByRole("button", { name: "Return to Validation" }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/books/book/validation"))
  expect(router.state.location.search).toMatchObject({ unrelated: "keep", validationContext: { assessment: "original", pageId: "old-page" } })
  expect(router.state.location.hash).toBe("original-fragment")
  expect(save).not.toHaveBeenCalled()
})

it("keeps the finding in place when inventory resolution fails", async () => {
  getPages.mockRejectedValueOnce(new Error("offline"))
  const router = await setup("validation")
  fireEvent.click(await screen.findByRole("button", { name: "Open repair" }))
  await waitFor(() => expect(failure).toHaveBeenCalled())
  expect(router.state.location.pathname).toBe("/books/book/validation")
  expect(save).not.toHaveBeenCalled()
})

it.each(["resolve", "reject"])("ignores a late inventory %s after the user leaves Validation", async (outcome) => {
  let resolve!: (pages: unknown[]) => void
  let reject!: (error: Error) => void
  getPages.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no }))
  const router = await setup("validation")
  fireEvent.click(await screen.findByRole("button", { name: "Open repair" }))
  await waitFor(() => expect(getPages).toHaveBeenCalledTimes(1))
  await act(async () => { await router.navigate({ to: "/books/$label/$step", params: { label: "book", step: "captions" } }) })
  await act(async () => {
    if (outcome === "resolve") resolve([{ pageId: "new-page", sections: [{ sectionId: "stable", hasStableId: true, isPruned: false }] }])
    else reject(new Error("late failure"))
  })
  expect(router.state.location.pathname).toBe("/books/book/captions")
  expect(warning).not.toHaveBeenCalled()
  expect(failure).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})


it("restores the original assessment context from a freshly loaded destination URL", async () => {
  const first = await setup("validation")
  fireEvent.click(await screen.findByRole("button", { name: "Open repair" }))
  await screen.findByText("Editor")
  const href = first.state.location.href
  cleanup()
  const restored = await setup("storyboard", href)
  fireEvent.click(await screen.findByRole("button", { name: "Return to Validation" }))
  await waitFor(() => expect(restored.state.location.pathname).toBe("/books/book/validation"))
  expect(restored.state.location.search).toMatchObject({ validationContext: {
    assessment: "original", findingId: "heading-order", category: "structure-semantics", pageId: "old-page",
  } })
  expect(save).not.toHaveBeenCalled()
})

it("does not redirect or notify after the originating view unmounts", async () => {
  let reject!: (error: Error) => void
  getPages.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no }))
  const router = await setup("validation")
  fireEvent.click(await screen.findByRole("button", { name: "Open repair" }))
  await waitFor(() => expect(getPages).toHaveBeenCalledTimes(1))
  cleanup()
  await act(async () => { reject(new Error("late offline response")) })
  expect(failure).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe("/books/book/validation")
})


it("keeps an unsaved review bound to its source when the Preview iframe changes page", async () => {
  const router = await setup("preview")
  fireEvent.change(await screen.findByLabelText("Overall page note"), { target: { value: "Note for original page" } })
  previewPage = { ...initialPreviewPage, pageId: "pg002", sectionId: "second", href: "second.html", title: "Second page" }
  await act(async () => { await router.navigate({ to: "/books/$label/$step", params: { label: "book", step: "preview" }, search: { changed: true } }) })
  expect((screen.getByLabelText("Overall page note") as HTMLTextAreaElement).value).toBe("Note for original page")
  fireEvent.click(screen.getByRole("button", { name: "Save page review" }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(save.mock.calls[0][0]).toMatchObject({ page_id: "pg001", section_id: "stable", overall_comment: "Note for original page" })
})

it("shares an in-flight save with Save & leave and prevents edits until it settles", async () => {
  let finish!: () => void
  save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const router = await setup("preview")
  fireEvent.change(await screen.findByLabelText("Overall page note"), { target: { value: "Persist before leaving" } })
  fireEvent.click(screen.getByRole("button", { name: "Save page review" }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect((screen.getByLabelText("Overall page note") as HTMLTextAreaElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Open Validation" }))
  fireEvent.click(await screen.findByRole("button", { name: /Save.*leave/i }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(router.state.location.pathname).toBe("/books/book/preview")
  await act(async () => { finish() })
  await waitFor(() => expect(router.state.location.pathname).toBe("/books/book/validation"))
})

it("shows an ordinary save failure, keeps the draft, and permits retry", async () => {
  save.mockRejectedValueOnce(new Error("disk full"))
  await setup("preview")
  fireEvent.change(await screen.findByLabelText("Overall page note"), { target: { value: "Keep this after failure" } })
  fireEvent.click(screen.getByRole("button", { name: "Save page review" }))
  expect((await screen.findByRole("alert")).textContent).toBe("disk full")
  expect((screen.getByLabelText("Overall page note") as HTMLTextAreaElement).value).toBe("Keep this after failure")
  expect((screen.getByRole("button", { name: "Save page review" }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Save page review" }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][0]).toMatchObject({ overall_comment: "Keep this after failure", page_id: "pg001" })
})
