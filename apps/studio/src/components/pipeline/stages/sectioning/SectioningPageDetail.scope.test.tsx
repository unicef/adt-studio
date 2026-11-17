// @vitest-environment jsdom
import React, { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PageSectioningOutput, PageSectioningSection } from "@adt/types"
import type { FloatingSaveEntry } from "../../components/floating-save"

const mocks = vi.hoisted(() => ({
  update: vi.fn(), clone: vi.fn(), getPage: vi.fn(), restore: vi.fn(),
  history: vi.fn(), invalidateDependents: vi.fn(), success: vi.fn(), error: vi.fn(),
  t: (parts: TemplateStringsArray, ...values: unknown[]) => parts.map((part, i) => part + (values[i] ?? "")).join(""),
}))
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: mocks.t }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/api/client", async (original) => ({
  ...await original<typeof import("@/api/client")>(),
  api: {
    updateSectioning: mocks.update, cloneSection: mocks.clone, getPage: mocks.getPage,
    restoreVersion: mocks.restore, getVersionHistory: mocks.history,
    getActiveConfig: async () => ({ merged: {} }),
    getPageImage: async () => null,
  },
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: mocks.invalidateDependents }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => ["storyboard"] }))
vi.mock("@/lib/section-constants", () => ({ getSectionTypeLabel: () => "Text", getSectionTypeDescription: () => "" }))
vi.mock("../../components/change-summary", () => ({ usePendingChanges: () => ({ label: null, labelKey: undefined }) }))
let header: HTMLDivElement
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ headerSlotEl: header }) }))

// Keep the actual registration/unregistration and floating bar, while retaining
// a callback as a route guard or pending confirmation could do across a wait.
let entry: FloatingSaveEntry
let confirmOperation: () => void
vi.mock("../../components/floating-save", async (original) => {
  const actual = await original<typeof import("../../components/floating-save")>()
  return { ...actual, useFloatingSave: (next: FloatingSaveEntry) => { entry = next; actual.useFloatingSave(next) } }
})
vi.mock("../../components/CascadeResetDialog", () => ({
  CascadeResetDialog: ({ open, title, onConfirm, onOpenChange, confirmDisabledReason }: {
    open: boolean; title: React.ReactNode; onConfirm: () => void;
    onOpenChange: (open: boolean) => void; confirmDisabledReason?: string;
  }) => {
    if (open) confirmOperation = onConfirm
    return open ? <div role="dialog">{title}
    <button onClick={onConfirm} disabled={!!confirmDisabledReason}>Confirm</button>
    <button onClick={() => onOpenChange(false)}>Cancel</button>
    </div> : null
  },
}))
vi.mock("@/components/section-tree-editor/SectionTreeEditor", () => ({
  SectionTreeEditor: ({ section, onChange, disabled }: {
    section: PageSectioningSection; onChange: (next: PageSectioningSection) => void; disabled?: boolean;
  }) => <textarea aria-label="Section text" disabled={disabled} value={section.nodes[0].text}
    onChange={(event) => onChange({ ...section, nodes: [{ ...section.nodes[0], text: event.target.value }] })} />,
}))
vi.mock("@/components/pipeline/stages/storyboard/components/SectionActionsDropdown", () => ({
  SectionActionsDropdown: ({ onClone, disabled }: { onClone: () => void; disabled?: boolean }) =>
    <button onClick={onClone} disabled={disabled}>Duplicate section</button>,
}))

import { ApiError, type PageDetail } from "@/api/client"
import { usePage } from "@/hooks/use-pages"
import { FloatingSaveProvider, useHasUnsavedChanges } from "../../components/floating-save"
import { SectioningPageDetail } from "./SectioningPageDetail"

let client: QueryClient
let stored: Map<string, PageDetail>
const storageKey = (book: string, pageId = "pg001") => JSON.stringify([book, pageId])
const queryKey = (book: string, pageId = "pg001") => ["books", book, "pages", pageId]
const textOf = (page: PageDetail) => page.sectioningTree!.sections[0].nodes[0].text

function makePage(book: string, pageId = "pg001", version = 2): PageDetail {
  return {
    pageId, pageNumber: pageId === "pg001" ? 1 : 2, versions: { sectioning: version },
    sectioningTree: { source: "manual", reasoning: "retained", sections: [{
      sectionId: "shared_sec001", sectionType: "text", isPruned: false,
      nodes: [{ nodeId: "shared_text001", role: "text", text: `${book}/${pageId} authored text`, isPruned: false }],
    }] },
  } as PageDetail
}
function seed(page: PageDetail, book: string) {
  stored.set(storageKey(book, page.pageId), structuredClone(page))
  client.setQueryData(queryKey(book, page.pageId), structuredClone(page))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function Host({ book, pageId }: { book: string; pageId: string }) {
  const { data: page } = usePage(book, pageId)
  const dirty = useHasUnsavedChanges()
  return <><output aria-label="Pending changes">{String(dirty)}</output>
    {page && <SectioningPageDetail bookLabel={book} pageId={pageId} page={page}
      navigationExtra={book} navigationArrows={null} />}</>
}
function setup(book = "A", pageId = "pg001") {
  const tree = (nextBook: string, nextPage: string) => <StrictMode><QueryClientProvider client={client}>
    <FloatingSaveProvider><Host book={nextBook} pageId={nextPage} /></FloatingSaveProvider>
  </QueryClientProvider></StrictMode>
  const view = render(tree(book, pageId))
  return { change: (nextBook: string, nextPage = "pg001") => view.rerender(tree(nextBook, nextPage)) }
}
function edit(text: string) {
  const input = screen.getByRole("textbox", { name: "Section text" }) as HTMLTextAreaElement
  expect(input.disabled).toBe(false)
  fireEvent.change(input, { target: { value: text } })
  fireEvent.blur(input)
}
function visibleText() { return (screen.getByRole("textbox", { name: "Section text" }) as HTMLTextAreaElement).value }
function confirm() { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" })) }
function requestSave() { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })) }
function saveAndStay() {
  let promise!: Promise<void>
  act(() => { promise = Promise.resolve(entry.onSaveStay!()) })
  return promise
}

beforeEach(() => {
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } } })
  stored = new Map()
  header = document.createElement("div")
  document.body.append(header)
  for (const book of ["A", "B"]) for (const pageId of ["pg001", "pg002"]) seed(makePage(book, pageId), book)
  mocks.getPage.mockImplementation(async (book: string, pageId: string) => structuredClone(stored.get(storageKey(book, pageId))))
  mocks.history.mockResolvedValue({ versions: [{ version: 1, data: { source: "ai" } }, { version: 2, data: { source: "manual" } }] })
  mocks.clone.mockResolvedValue({ version: 3 })
  mocks.restore.mockImplementation(async (book: string, _node: string, pageId: string) => {
    const current = stored.get(storageKey(book, pageId))!
    stored.set(storageKey(book, pageId), { ...current, versions: { ...current.versions, sectioning: 3 },
      sectioningTree: { ...current.sectioningTree!, source: "ai" } })
    return { version: 3 }
  })
  mocks.update.mockImplementation(async (book: string, pageId: string, payload: PageSectioningOutput & { baseVersion: number }) => {
    const current = stored.get(storageKey(book, pageId))!
    if (payload.baseVersion !== current.versions.sectioning) throw new ApiError("Content changed", 409)
    const { baseVersion, ...tree } = payload
    stored.set(storageKey(book, pageId), { ...current, versions: { ...current.versions, sectioning: baseVersion + 1 },
      sectioningTree: { ...tree, source: "manual" } })
    return { version: baseVersion + 1 }
  })
})
afterEach(() => { cleanup(); client.clear(); header.remove(); vi.restoreAllMocks() })

describe("Sectioning editor book/page sessions", () => {
  it.each(["book", "page"])("retires a net-clean draft across a %s change and ABA, then saves the destination's edit", async (scope) => {
    const view = setup("B")
    edit("temporary B edit")
    edit("B/pg001 authored text")
    expect(screen.getByLabelText("Pending changes").textContent).toBe("false")
    const book = scope === "book" ? "A" : "B"
    const pageId = scope === "book" ? "pg001" : "pg002"
    view.change(book, pageId)
    expect(visibleText()).toBe(`${book}/${pageId} authored text`)
    expect(screen.getByLabelText("Pending changes").textContent).toBe("false")
    expect(mocks.update).not.toHaveBeenCalled()
    edit("destination edit")
    requestSave(); confirm()
    await waitFor(() => expect(textOf(stored.get(storageKey(book, pageId))!)).toBe("destination edit"))
    expect(mocks.update).toHaveBeenLastCalledWith(book, pageId, expect.objectContaining({ baseVersion: 2 }))
    view.change("B")
    expect(visibleText()).toBe("B/pg001 authored text")
    expect(screen.getByLabelText("Pending changes").textContent).toBe("false")
  })

  it.each(["Save", "Duplicate section"])("drops a pending %s confirmation when the book changes", (action) => {
    const view = setup()
    if (action === "Save") { edit("A draft"); requestSave() }
    else fireEvent.click(screen.getByRole("button", { name: "Duplicate section" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    const oldConfirm = confirmOperation
    view.change("B")
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => oldConfirm())
    expect(visibleText()).toBe("B/pg001 authored text")
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.clone).not.toHaveBeenCalled()
  })

  it("ignores retained Save callbacks after their editor was retired", async () => {
    const view = setup()
    edit("A draft")
    const old = entry
    view.change("B")
    await act(async () => { old.onSave?.(); await old.onSaveStay?.() })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(visibleText()).toBe("B/pg001 authored text")
  })

  it("does not let an old successful Save clear or unlock a new book's in-flight Save", async () => {
    const old = deferred<{ version: number }>(), next = deferred<{ version: number }>()
    mocks.update.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const view = setup()
    edit("A submitted")
    const firstSave = saveAndStay()
    view.change("B")
    edit("B submitted")
    const secondSave = saveAndStay()
    await act(async () => { old.resolve({ version: 3 }); await firstSave })
    expect(visibleText()).toBe("B submitted")
    expect(entry.saving).toBe(true)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
    expect(mocks.invalidateDependents).toHaveBeenCalledWith(client, "A")
    await act(async () => { next.resolve({ version: 3 }); await secondSave })
    expect(entry.saving).toBe(false)
    expect(mocks.update.mock.calls.map(([book]) => book)).toEqual(["A", "B"])
  })

  it("keeps a late Save failure out of the reopened book and makes no dead-session recovery read", async () => {
    const old = deferred<{ version: number }>()
    mocks.update.mockReturnValueOnce(old.promise)
    const view = setup()
    edit("A submitted")
    const outcome = saveAndStay().catch((error: unknown) => error)
    view.change("B"); view.change("A")
    edit("new A draft")
    await act(async () => { old.reject(new ApiError("old stale save", 409)); await outcome })
    expect(visibleText()).toBe("new A draft")
    expect(screen.queryByText("old stale save")).toBeNull()
    expect(mocks.getPage).not.toHaveBeenCalled()
    await act(async () => { await entry.onSaveStay!() })
    expect(textOf(stored.get(storageKey("A"))!)).toBe("new A draft")
  })

  it("does not adopt a delayed conflict read into a later ABA session's cache or draft", async () => {
    const reload = deferred<PageDetail>()
    mocks.getPage.mockReturnValueOnce(reload.promise)
    mocks.update.mockRejectedValueOnce(new ApiError("old stale save", 409))
    const view = setup()
    edit("old A draft")
    const outcome = saveAndStay().catch((error: unknown) => error)
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledTimes(1))
    view.change("B")
    act(() => seed(makePage("A", "pg001", 4), "A"))
    view.change("A")
    edit("new A draft")
    await act(async () => { reload.resolve(makePage("A", "pg001", 3)); await outcome })
    expect(client.getQueryData<PageDetail>(queryKey("A"))!.versions.sectioning).toBe(4)
    expect(visibleText()).toBe("new A draft")
    expect(screen.queryByText("old stale save")).toBeNull()
    await act(async () => { await entry.onSaveStay!() })
    expect(mocks.update).toHaveBeenLastCalledWith("A", "pg001", expect.objectContaining({ baseVersion: 4 }))
    expect(textOf(stored.get(storageKey("A"))!)).toBe("new A draft")
  })

  it("retains a same-page draft and frozen version across refetch, then recovers and saves", async () => {
    setup()
    edit("my current draft")
    const external = makePage("A", "pg001", 3)
    external.sectioningTree!.reasoning = "independent external change"
    act(() => seed(external, "A"))
    expect(visibleText()).toBe("my current draft")
    await act(async () => { await expect(entry.onSaveStay!()).rejects.toThrow("Content changed") })
    expect(mocks.update).toHaveBeenLastCalledWith("A", "pg001", expect.objectContaining({ baseVersion: 2 }))
    expect(visibleText()).toBe("my current draft")
    await act(async () => { await entry.onSaveStay!() })
    expect(mocks.update).toHaveBeenLastCalledWith("A", "pg001", expect.objectContaining({ baseVersion: 3 }))
    expect(stored.get(storageKey("A"))!.sectioningTree).toMatchObject({ reasoning: "independent external change", source: "manual" })
    expect(textOf(stored.get(storageKey("A"))!)).toBe("my current draft")
  })

  it("keeps the new editor usable while an old structural operation finishes", async () => {
    const old = deferred<{ version: number }>()
    mocks.clone.mockReturnValueOnce(old.promise)
    const view = setup()
    fireEvent.click(screen.getByRole("button", { name: "Duplicate section" })); confirm()
    view.change("B")
    edit("B draft")
    await act(async () => { old.resolve({ version: 3 }); await old.promise })
    expect(visibleText()).toBe("B draft")
    expect(entry.dirty).toBe(true)
    await act(async () => { await entry.onSaveStay!() })
    expect(mocks.clone).toHaveBeenCalledExactlyOnceWith("A", "pg001", 0, 2)
    expect(mocks.update).toHaveBeenCalledWith("B", "pg001", expect.objectContaining({ baseVersion: 2 }))
  })

  it("keeps a new structural request busy after an old session's delayed invalidation", async () => {
    const invalidation = deferred<void>(), next = deferred<{ version: number }>()
    vi.spyOn(client, "invalidateQueries").mockImplementationOnce(() => invalidation.promise)
    mocks.clone.mockResolvedValueOnce({ version: 3 }).mockReturnValueOnce(next.promise)
    const view = setup()
    fireEvent.click(screen.getByRole("button", { name: "Duplicate section" })); confirm()
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKey("A") }))
    view.change("B")
    fireEvent.click(screen.getByRole("button", { name: "Duplicate section" })); confirm()
    await act(async () => { invalidation.resolve(); await invalidation.promise })
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
    expect(mocks.clone.mock.calls.map(([book]) => book)).toEqual(["A", "B"])
    await act(async () => { next.resolve({ version: 3 }); await next.promise })
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false))
    edit("B after structural work")
    await act(async () => { await entry.onSaveStay!() })
    expect(textOf(stored.get(storageKey("B"))!)).toBe("B after structural work")
  })

  it("retires Revert consent on a book change and unlocks the same page after a version-only refresh", async () => {
    const view = setup()
    await waitFor(() => expect((screen.getByRole("button", { name: "Revert manual edits" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Revert manual edits" }))
    view.change("B")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.restore).not.toHaveBeenCalled()
    await waitFor(() => expect((screen.getByRole("button", { name: "Revert manual edits" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Revert manual edits" })); confirm()
    await waitFor(() => expect(mocks.success).toHaveBeenCalled())
    expect(mocks.restore).toHaveBeenCalledExactlyOnceWith("B", "page-sectioning", "pg001", 1, 2)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false)
    edit("B after restore")
    await act(async () => { await entry.onSaveStay!() })
    expect(mocks.update).toHaveBeenLastCalledWith("B", "pg001", expect.objectContaining({ baseVersion: 3 }))
  })
})
