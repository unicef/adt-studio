// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { OutputStatus } from "@adt/types"
import { buildReviewPlan, reviewGuard } from "./review-plan"

const calls = vi.hoisted(() => ({ run: vi.fn(), review: vi.fn(), dirty: false, running: false, status: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({
  i18n: { locale: "en" },
  t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
}) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: calls.running }) }))
vi.mock("../floating-save", () => ({ useFloatingSaveDirtyEntries: () => calls.dirty ? [{ id: "draft" }] : [] }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value === "easy-read" ? "Easy Read" : value }))
vi.mock("@/api/client", () => ({ api: { runStages: calls.run, reviewOutput: calls.review, getStagesStatus: calls.status } }))

const { OutputReviewPanel } = await import("./OutputReviewPanel")
const clients: QueryClient[] = []
afterEach(() => {
  cleanup(); clients.splice(0).forEach((client) => client.clear())
  vi.resetAllMocks(); calls.dirty = false; calls.running = false
})

beforeEach(() => {
  calls.run.mockResolvedValue({ id: "review-run", status: "started" })
  calls.status.mockImplementation(async () => ({ id: "review-run", status: calls.running ? "running" : "completed" }))
})

function output(id: string, overrides: Partial<OutputStatus> = {}): OutputStatus {
  return { identity: { kind: "translation", id, language: "fr" }, sourceText: id,
    signature: `inputs-${id}`, contentHash: `content-${id}`, usable: true, current: false,
    protected: false, manual: false, excluded: false, missing: false, updateNeeded: true,
    warnings: [], pageIds: [], sectionIds: [], ...overrides }
}

function setup(outputs: OutputStatus[], catalog = outputs, disclosure = false, conflicts: import("@adt/types").CatalogConflict[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  const refresh = vi.spyOn(client, "invalidateQueries")
  const ui = () => <QueryClientProvider client={client}>
    <OutputReviewPanel bookLabel="book" outputs={outputs} catalog={catalog} conflicts={conflicts} disclosure={disclosure} renderDetail={(item) => <p>{item.identity.id}</p>} />
  </QueryClientProvider>
  const view = render(ui())
  return { ...view, refresh, ui, client }
}

it("offers Update all immediately, ignores healthy/excluded content and never replaces edits", async () => {
  const generated = output("outdated")
  const missing = output("absent", { missing: true, usable: false })
  const manual = output("my edit", { protected: true, manual: true, updateNeeded: false, warnings: [{ reason: "source-changed" }] })
  const { refresh } = setup([generated, missing, manual, output("healthy", { current: true, updateNeeded: false }), output("excluded", { excluded: true })])
  expect(screen.getByText("Items needing attention: 3")).toBeTruthy()
  expect(screen.queryByRole("checkbox")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Update all", exact: true }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1))
  expect(calls.run).toHaveBeenCalledWith("book", undefined, {
    fromStage: "translate", toStage: "translate", outputScope: { selection: { identities: [generated.identity, missing.identity] }, retry: [] },
  })
  expect(calls.review).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole("button", { name: "Updating…" })).toBeNull())
  // Admission only updates the accepted-run status. Publication is refreshed
  // by the run boundary, not by an immediate full catalog read.
  expect(refresh.mock.calls.some(([filter]) => JSON.stringify(filter?.queryKey) === JSON.stringify(["books", "book"]))).toBe(false)
})

it("keeps count, list and bulk targets aligned with content, language and status filters", async () => {
  const selected = output("gl001_def", { group: "glossary", sourceText: "French definition" })
  setup([selected, output("gl002_def", { group: "glossary", missing: true }),
    output("gl001_en", { group: "glossary", identity: { kind: "translation", id: "gl001_en", language: "en" } }), output("pg001_tx001")])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  fireEvent.change(screen.getByRole("combobox", { name: "Content type" }), { target: { value: "glossary" } })
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "fr" } })
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "update" } })
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
  expect(screen.getByText("French definition")).toBeTruthy()
  expect(screen.queryByText("pg001_tx001")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Hide details" }))
  fireEvent.click(screen.getByRole("button", { name: "Update filtered items" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1))
  expect(calls.run.mock.calls[0][2].outputScope.selection.identities).toEqual([selected.identity])
})

it("shows distinct issue totals and lets the summary chips filter without double-counting", () => {
  setup([
    output("outdated", { warnings: [{ reason: "upstream", source: { kind: "easy-read", id: "source" } }] }),
    output("protected", { protected: true, updateNeeded: false, warnings: [{ reason: "source-changed" }] }),
    output("fallback", { identity: { kind: "preparation", id: "fallback" }, updateNeeded: false, warnings: [{ reason: "preparation-failed" }] }),
    output("missing", { missing: true, warnings: [{ reason: "preparation-missing" }] }),
  ])
  expect(screen.getByText("Items needing attention: 4")).toBeTruthy()
  const chips = within(screen.getByRole("group", { name: "Issue types" }))
  for (const name of [/Out of sync\s*1/, /Needs review\s*1/, /Warnings\s*1/, /Missing\s*1/]) {
    expect(chips.getByRole("button", { name })).toBeTruthy()
  }
  fireEvent.click(chips.getByRole("button", { name: /Warnings/ }))
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
  expect((screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement).value).toBe("warning")
  expect(screen.getByRole("button", { name: /fallback.*Speech text.*Warning/ })).toBeTruthy()
  // Facet counts stay available when switching issue types within this scope.
  fireEvent.click(chips.getByRole("button", { name: /Needs review/ }))
  expect(screen.getByRole("button", { name: /protected.*Translation.*Needs review/ })).toBeTruthy()
  expect(screen.queryByRole("button", { name: /fallback.*Speech text.*Warning/ })).toBeNull()
  fireEvent.click(chips.getByRole("button", { name: /Needs review/ }))
  expect(screen.getByText("Items needing attention: 4")).toBeTruthy()
})

it("narrows sections by page and sends only matching identities to a bulk update, including shared locations", async () => {
  const shared = output("shared", { pageIds: ["pg002", "pg003"], sectionIds: ["section-shared"], locations: [{ pageId: "pg002", sectionId: "section-shared" }, { pageId: "pg003", sectionId: "section-shared" }] })
  const otherSection = output("other-section", { pageIds: ["pg002"], sectionIds: ["section-two"] })
  const otherPage = output("other-page", { pageIds: ["pg010"], sectionIds: ["section-ten"] })
  setup([shared, otherSection, otherPage, output("glossary", { group: "glossary" })])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  const page = screen.getByRole("combobox", { name: "Page" }) as HTMLSelectElement
  const section = screen.getByRole("combobox", { name: "Section" }) as HTMLSelectElement
  expect(Array.from(page.options).map((option) => option.value)).toEqual(["", "pg002", "pg003", "pg010"])
  fireEvent.change(page, { target: { value: "pg002" } })
  expect(screen.getByText("Items needing attention: 2")).toBeTruthy()
  expect(Array.from(section.options).map((option) => option.value)).toEqual(["", "section-shared", "section-two"])
  fireEvent.change(section, { target: { value: "section-shared" } })
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Update filtered items" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1))
  expect(calls.run.mock.calls[0][2].outputScope.selection.identities).toEqual([shared.identity])
  fireEvent.change(page, { target: { value: "pg010" } })
  expect(section.value).toBe("")
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
  expect(Array.from(section.options).map((option) => option.value)).toEqual(["", "section-ten"])
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
  expect(page.value).toBe("")
  expect(screen.getByText("Items needing attention: 4")).toBeTruthy()
})

it("resolves a shared upstream source once before updating its filtered consumers", async () => {
  const source = output("simple", { identity: { kind: "easy-read", id: "simple" } })
  const consumers = ["first", "second"].map((id) => output(id, { current: true, updateNeeded: false, warnings: [{ reason: "upstream", source: source.identity }] }))
  setup(consumers, [source, ...consumers, output("unrelated")])
  expect(screen.getByText(/Includes linked source items in: Easy Read\./)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Update all" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(2))
  expect(calls.run.mock.calls.map((args) => args[2].fromStage)).toEqual(["easy-read", "translate"])
  expect(calls.run.mock.calls[0][2].outputScope.selection.identities).toEqual([source.identity])
  expect(calls.run.mock.calls[1][2].outputScope.selection.identities).toEqual(consumers.map((item) => item.identity))
})

it("accepts protected source warnings and usable fallbacks once with guards, without generating", async () => {
  const source = output("manual", { protected: true, manual: true, updateNeeded: false, warnings: [{ reason: "source-changed" }] })
  const consumers = ["first", "second"].map((id) => output(id, { updateNeeded: false, warnings: [{ reason: "upstream", source: source.identity }] }))
  const fallback = output("fallback", { identity: { kind: "preparation", id: "fallback", language: "fr" }, updateNeeded: false, warnings: [{ reason: "preparation-failed" }] })
  const absentFallback = output("absent", { identity: { kind: "preparation", id: "absent" }, missing: true, usable: false, warnings: [{ reason: "preparation-missing" }] })
  const { refresh } = setup([...consumers, fallback, absentFallback], [source, ...consumers, fallback, absentFallback])
  fireEvent.click(screen.getByRole("button", { name: "Keep all existing content" }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(calls.review.mock.calls).toEqual([
    ["book", { ...reviewGuard(source), action: "keep" }], ["book", { ...reviewGuard(fallback), action: "checked" }],
  ])
  expect(calls.run).not.toHaveBeenCalled()
})

it("does not offer an ineffective update for warnings inherited only from protected sources", () => {
  const source = output("manual", { protected: true, updateNeeded: false, warnings: [{ reason: "legacy" }] })
  const child = output("child", { updateNeeded: false, warnings: [{ reason: "upstream", source: source.identity }] })
  setup([child], [child, source])
  expect(screen.queryByRole("button", { name: "Update all" })).toBeNull()
  expect(screen.getByRole("button", { name: "Keep all existing content" })).toBeTruthy()
})

it("requires an explicit listed replacement and sends signature/content guards", async () => {
  const manual = output("protected edit", { protected: true, manual: true, warnings: [{ reason: "source-changed" }] })
  setup([manual])
  fireEvent.click(screen.getByRole("button", { name: "Replace edits…" }))
  expect(screen.getByRole("listitem").textContent).toContain("protected edit")
  expect(calls.run).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Regenerate and replace edits", exact: true }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1))
  expect(calls.run.mock.calls[0][2].outputScope.replace).toEqual([reviewGuard(manual)])
})

it.each(["draft", "run"])("blocks all bulk changes during a %s", (mode) => {
  calls.dirty = mode === "draft"; calls.running = mode === "run"
  setup([output("generated"), output("protected", { protected: true, warnings: [{ reason: "legacy" }] })])
  // A run this panel did not start leaves Update all disabled, not "Updating…".
  for (const name of ["Update all", "Keep all existing content", "Replace edits…"]) {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement
    expect(button.disabled).toBe(true); fireEvent.click(button)
  }
  expect(calls.run).not.toHaveBeenCalled(); expect(calls.review).not.toHaveBeenCalled()
})

it("styles Update all as the amber primary action and shows progress until the run it started finishes", async () => {
  let finish = () => {}
  calls.run.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ id: "review-run", status: "started" }) }))
  const view = setup([output("outdated")])
  const button = screen.getByRole("button", { name: "Update all" }) as HTMLButtonElement
  expect(button.className).toContain("bg-amber-500")
  expect(button.className).toContain("text-amber-950")
  fireEvent.click(button)
  const busy = await screen.findByRole("button", { name: "Updating…" })
  expect(busy).toBe(button)
  // Busy, but still focusable for keyboard and screen-reader users.
  expect(button.disabled).toBe(false)
  expect(busy.getAttribute("aria-disabled")).toBe("true")
  expect(busy.getAttribute("aria-busy")).toBe("true")
  fireEvent.click(busy)
  expect(calls.run).toHaveBeenCalledTimes(1)
  calls.running = true
  finish()
  await waitFor(() => expect(view.refresh).toHaveBeenCalled())
  view.rerender(view.ui())
  expect(screen.getByRole("button", { name: "Updating…" })).toBe(button)
  calls.running = false
  await view.client.invalidateQueries({ queryKey: ["books", "book", "output-review-status"] })
  view.rerender(view.ui())
  await waitFor(() => expect(screen.getByRole("button", { name: "Update all" }).getAttribute("aria-busy")).toBeNull())
})

it("refreshes and reports partial acceptance if a later content guard rejects", async () => {
  calls.review.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Content changed while reviewing"))
  const { refresh } = setup(["one", "two", "three"].map((id) => output(id, { protected: true, warnings: [{ reason: "legacy" }] })))
  fireEvent.click(screen.getByRole("button", { name: "Keep all existing content" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Content changed while reviewing"))
  expect(calls.review).toHaveBeenCalledTimes(2)
  expect(refresh).toHaveBeenCalledWith({ queryKey: ["books", "book"] })
})

it("keeps export disclosure read-only", () => {
  setup([output("generated"), output("protected", { protected: true })], undefined, true)
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  expect(screen.queryByRole("button", { name: "Update all" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Keep all existing content" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Replace edits…" })).toBeNull()
})

it("deduplicates cyclic source references, retries fallbacks, and skips excluded sources", () => {
  const first = output("first", { identity: { kind: "preparation", id: "first" }, warnings: [{ reason: "preparation-failed" }] })
  const second = output("second", { warnings: [{ reason: "upstream", source: first.identity }] })
  const excluded = output("excluded", { excluded: true, protected: true })
  first.warnings.push({ reason: "upstream", source: second.identity }, { reason: "upstream", source: excluded.identity })
  const plan = buildReviewPlan([first, second], [first, second, excluded])
  expect(plan.update).toEqual([first, second])
  expect(plan.keep).toEqual([first])
  expect(plan.replace).toEqual([])
})


it("shows one legacy source-conflict warning without offering keep or generation for the source", () => {
  setup([], [], false, [{ id: "pg001_tx001", texts: ["First", "Legacy copy"], pageIds: ["pg001"], sectionIds: [] }])
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  expect(screen.getAllByRole("alert")).toHaveLength(1)
  expect(screen.getByText("Duplicate source ID: pg001_tx001")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Update all", exact: true })).toBeNull()
  expect(screen.queryByRole("button", { name: "Keep all existing content", exact: true })).toBeNull()
})


it("preserves actual page/section pairs for shared text, images and conflict warnings", async () => {
  const locations = [{ pageId: "pg001", sectionId: "A" }, { pageId: "pg002", sectionId: "B" }]
  const shared = output("shared", { pageIds: ["pg001", "pg002"], sectionIds: ["A", "B"], locations })
  const image = output("shared-image", { ...shared, identity: { kind: "caption", id: "shared-image" } })
  const local = output("local", { pageIds: ["pg001"], sectionIds: ["A"], locations: [locations[0]] })
  setup([shared, image, local], undefined, false, [{ id: "conflict", texts: ["first", "second"], pageIds: shared.pageIds, sectionIds: shared.sectionIds, locations }])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  const page = screen.getByRole("combobox", { name: "Page" }) as HTMLSelectElement
  const section = screen.getByRole("combobox", { name: "Section" }) as HTMLSelectElement
  fireEvent.change(page, { target: { value: "pg001" } })
  expect(Array.from(section.options).map((option) => option.value)).toEqual(["", "A"])
  fireEvent.change(section, { target: { value: "A" } })
  expect(screen.getByText("Items needing attention: 4")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Update filtered items" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(2))
  expect(calls.run.mock.calls.flatMap((args) => args[2].outputScope.selection.identities)).toEqual(expect.arrayContaining([shared.identity, image.identity, local.identity]))
  expect(calls.run.mock.calls.flatMap((args) => args[2].outputScope.selection.identities)).toHaveLength(3)
  fireEvent.change(page, { target: { value: "pg002" } })
  expect(Array.from(section.options).map((option) => option.value)).toEqual(["", "B"])
  fireEvent.change(section, { target: { value: "B" } })
  expect(screen.getByText("Items needing attention: 3")).toBeTruthy()
  expect(screen.queryByText("local")).toBeNull()
})

it("does not invent page/section pairs for older multi-page projections", () => {
  setup([output("old", { pageIds: ["pg001", "pg002"], sectionIds: ["A", "B"] })])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  fireEvent.change(screen.getByRole("combobox", { name: "Page" }), { target: { value: "pg001" } })
  expect(Array.from((screen.getByRole("combobox", { name: "Section" }) as HTMLSelectElement).options).map((option) => option.value)).toEqual([""])
  expect(screen.getByText("Items needing attention: 1")).toBeTruthy()
})

it("keeps long item text to one line in the list and exposes the full text on hover", () => {
  const long = Array.from({ length: 30 }, (_, i) => `A long Easy Read sentence part ${i}`).join(", ")
  setup([output("long", { sourceText: long })])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  const line = screen.getByTitle(long)
  expect(line.className).toContain("truncate")
  expect(screen.getByRole("region", { name: "Content updates" }).className).toContain("min-w-0")
})

it("keeps the owned run's Updating state after the dialog unmounts and does not adopt another run", async () => {
  calls.running = true
  const view = setup([output("outdated")])
  view.client.setQueryData(["books", "book", "output-review-runs"], ["owned-run"])
  calls.status.mockResolvedValue({ id: "owned-run", status: "running" })
  view.rerender(view.ui())
  await screen.findByRole("button", { name: "Updating…" })
  view.rerender(<QueryClientProvider client={view.client}><span>Closed</span></QueryClientProvider>)
  view.rerender(view.ui())
  expect(await screen.findByRole("button", { name: "Updating…" })).toBeTruthy()
  calls.status.mockResolvedValue({ id: "different-run", status: "running" })
  await view.client.invalidateQueries({ queryKey: ["books", "book", "output-review-status"] })
  await waitFor(() => expect(screen.queryByRole("button", { name: "Updating…" })).toBeNull())
  expect(screen.getByRole("button", { name: "Update all" }).getAttribute("disabled")).not.toBeNull()
})


it("keeps unrelated reviewed content without trying to accept unresolved duplicate outputs", async () => {
  const conflicting = output("duplicate", { protected: true, updateNeeded: false, warnings: [{ reason: "legacy" }, { reason: "output-conflict", conflictId: "duplicate" }] })
  const manual = output("safe", { protected: true, updateNeeded: false, warnings: [{ reason: "source-changed" }] })
  setup([conflicting, manual])
  fireEvent.click(screen.getByRole("button", { name: "Keep all existing content" }))
  await waitFor(() => expect(calls.review).toHaveBeenCalledTimes(1))
  expect(calls.review).toHaveBeenCalledWith("book", { ...reviewGuard(manual), action: "keep" })
  expect(calls.run).not.toHaveBeenCalled()
})

it("discloses shared Easy Read scope before a filtered bulk update with details collapsed", async () => {
  const shared = output("shared_easy_read", { identity: { kind: "easy-read", id: "shared_easy_read", language: "en" },
    pageIds: ["pg001", "pg002"], sectionIds: ["shared-section"],
    locations: [{ pageId: "pg001", sectionId: "shared-section" }, { pageId: "pg002", sectionId: "shared-section" }] })
  setup([shared])
  fireEvent.click(screen.getByRole("button", { name: "Review items" }))
  fireEvent.change(screen.getByRole("combobox", { name: "Page" }), { target: { value: "pg001" } })
  fireEvent.change(screen.getByRole("combobox", { name: "Section" }), { target: { value: "shared-section" } })
  fireEvent.click(screen.getByRole("button", { name: "Hide details" }))
  expect(screen.getByText("Selected Easy Read text is shared across sections. Updating it changes every referring section, including sections outside the current filter.")).toBeTruthy()
  expect(calls.run).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Update filtered items" }))
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1))
  expect(calls.run.mock.calls[0][2].outputScope.selection.identities).toEqual([shared.identity])
})
