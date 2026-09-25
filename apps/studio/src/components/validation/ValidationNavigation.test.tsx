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

function Surface() {
  const { step } = useParams({ strict: false }) as { step: string }
  const navigate = useNavigate()
  const fix = useValidationFixNavigation("book")
  if (step === "preview") return <PreviewValidationCard label="book" panelOpen={false} currentPage={{ pageId: "pg001", pageNumber: 1, sectionId: "stable", href: "stable.html", title: "Page", hasImages: false, hasActivity: false, signLanguageEnabled: false }} onOpenValidation={() => void navigate({ to: "/books/$label/$step", params: { label: "book", step: "validation" } })} />
  if (step === "validation") return <button onClick={() => void fix.open({ stage: "storyboard", pageId: "old-page", sectionId: "stable" }, { tab: "accessibility-summary", assessment: "original", category: "structure-semantics", pageId: "old-page", findingId: "heading-order" })}>Open repair</button>
  return <><ValidationReturnBanner label="book" /><div>Editor</div></>
}

async function setup(step: string) {
  const root = createRootRoute({ component: () => <FloatingSaveProvider><UnsavedChangesGuard /><Outlet /></FloatingSaveProvider> })
  const route = createRoute({ getParentRoute: () => root, path: "/books/$label/$step", validateSearch: parseBookStepSearch, component: Surface })
  const page = createRoute({ getParentRoute: () => root, path: "/books/$label/$step/$pageId", validateSearch: parseBookStepSearch, component: Surface })
  const history = createMemoryHistory({ initialEntries: [`/books/book/${step}?unrelated=keep#original-fragment`] })
  const router = createRouter({ routeTree: root.addChildren([route, page]), history })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)
  await act(async () => { await router.load() })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
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
  expect(router.state.location.search).toMatchObject({ validationContext: { assessment: "original", pageId: "old-page" } })
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
