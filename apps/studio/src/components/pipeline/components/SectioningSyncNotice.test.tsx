// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { SectioningSynchronization } from "@adt/types"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.map((s, i) => s + (values[i] ?? "")).join("") }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, params }: { children: React.ReactNode; params: { label: string; step: string; pageId: string } }) => <a href={`/books/${params.label}/${params.step}/${params.pageId}`}>{children}</a> }))
const { repair, invalidateQueries, taskState, draftState } = vi.hoisted(() => ({
  repair: vi.fn(), invalidateQueries: vi.fn(),
  taskState: { dataUpdatedAt: 0, isFetching: false, tasks: [] as Array<{ taskId: string; kind: string; pageId: string; status: string; error?: string }> },
  draftState: { entries: [] as Array<{ id: string }> },
}))
vi.mock("@/api/client", () => ({ api: { repairSectioningSynchronization: repair } }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "key" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-book-tasks", () => ({ useBookTasks: () => taskState, bookTasksKey: (label: string) => ["books", label, "tasks"] }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("./floating-save", () => ({ useFloatingSaveDirtyEntries: () => draftState.entries }))
vi.mock("./OutputReview", () => ({ OutputReview: ({ id }: { id: string }) => <div data-testid="common-review">{id}</div> }))
import { SectioningSyncNotice } from "./SectioningSyncNotice"

const snapshot: SectioningSynchronization = {
  sourceVersion: 2, renderingVersion: 1, layout: "reflowable", diagnostics: [],
  sections: [{ sectionId: "pg001_sec007", status: "unknown-origin", diagnostics: [] }],
}
beforeEach(() => { repair.mockReset(); invalidateQueries.mockReset(); taskState.tasks = []; taskState.dataUpdatedAt = 0; taskState.isFetching = false; draftState.entries = [] })
afterEach(cleanup)
const notice = (s = snapshot) => <SectioningSyncNotice bookLabel="book" pageId="pg001" synchronization={s} showStoryboardLink />

describe("persistent synchronization notice", () => {
  it("lists stable identities with accessible review guidance and no rerender action", () => {
    render(notice())
    expect(screen.getByRole("status").textContent).toContain("pg001_sec007")
    expect(screen.getByText(/relationship.*unverified/)).toBeTruthy()
    expect(screen.getByRole("link").getAttribute("href")).toBe("/books/book/storyboard/pg001")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("survives unmount/reopen and an unverified new rendering version", () => {
    const first = render(notice())
    first.unmount()
    const next = render(notice())
    expect(screen.getByRole("status")).toBeTruthy()
    next.rerender(notice({ ...snapshot, renderingVersion: 2 }))
    expect(screen.getByRole("status").textContent).toContain("unverified")
    next.rerender(notice({ ...snapshot, sections: [{ ...snapshot.sections[0], status: "current" }] }))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows the persistent fixed-layout limitation and supported navigation", () => {
    render(notice({ ...snapshot, layout: "fixed", sections: [{ ...snapshot.sections[0], status: "fixed-layout-unmapped" }] }))
    expect(screen.getByRole("status").textContent).toContain("do not change the visible positioned page")
    expect(screen.getByRole("status").textContent).toContain("Rerendering semantic text cannot synchronize it")
    expect(screen.getByRole("link", { name: "Open Storyboard" })).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("handles invalid legacy data and older APIs without pretending they are current", () => {
    const view = render(notice({ ...snapshot, sections: [], diagnostics: ["invalid"] }))
    expect(screen.getByText(/Some source or rendering data/)).toBeTruthy()
    view.rerender(<SectioningSyncNotice bookLabel="book" pageId="pg001" />)
    expect(screen.queryByRole("status")).toBeNull()
  })
  it("offers common review for protected output and no targeted repair", () => {
    render(notice({ ...snapshot, sections: [{ ...snapshot.sections[0], status: "protected-divergence", action: "review" }] }))
    expect(screen.getByTestId("common-review").textContent).toBe("pg001")
    expect(screen.queryByRole("button", { name: "Repair listed sections" })).toBeNull()
  })

  it("submits only eligible stable IDs and retains drift until an authoritative read confirms committed output", async () => {
    const drift: SectioningSynchronization = { ...snapshot, sections: [
      { sectionId: "pg001_sec007", status: "text-drift", action: "repair", diagnostics: [] },
      { sectionId: "pg001_sec002", status: "unknown-origin", action: "review", diagnostics: [] },
      { sectionId: "retired_sec003", status: "structural-drift", action: "none", diagnostics: [] },
    ] }
    repair.mockResolvedValue({ taskId: "repair-1", status: "submitted" })
    const view = render(notice(drift))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Repair listed sections" })))
    expect(repair).toHaveBeenCalledWith("book", "pg001", "key", { baseVersion: 2, renderingVersion: 1, sectionIds: ["pg001_sec007"] })
    expect(screen.getByRole("status")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Repair listed sections" }) as HTMLButtonElement).disabled).toBe(true)
    taskState.tasks = [{ taskId: "repair-1", kind: "re-render", pageId: "pg001", status: "running" }]
    view.rerender(notice(drift))
    expect(screen.getByText(/Repair is queued or running/)).toBeTruthy()
    taskState.tasks = [{ ...taskState.tasks[0], status: "completed" }]
    view.rerender(notice(drift))
    expect(screen.getByText(/Saved source text differs/)).toBeTruthy()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["books", "book", "pages"] })
    view.rerender(notice({ ...drift, sections: drift.sections.map((section) => ({ ...section, status: "current", action: "none" })) }))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it.each(["Provider failed", "Task cancelled"])("keeps previous drift actionable after %s", async (error) => {
    const drift: SectioningSynchronization = { ...snapshot, sections: [{ ...snapshot.sections[0], status: "structural-drift", action: "repair" }] }
    repair.mockResolvedValue({ taskId: "repair-1" })
    const view = render(notice(drift))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Repair listed sections" })))
    taskState.tasks = [{ taskId: "repair-1", kind: "re-render", pageId: "pg001", status: "failed", error }]
    view.rerender(notice(drift))
    expect(screen.getByRole("alert").textContent).toBe(error)
    expect((screen.getByRole("button", { name: "Repair listed sections" }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole("status")).toBeTruthy()
  })

  it("keeps drafts safe and fixed-layout repair disabled even if an inconsistent action is supplied", () => {
    draftState.entries = [{ id: "sectioning:pg001" }]
    const drift: SectioningSynchronization = { ...snapshot, sections: [{ ...snapshot.sections[0], action: "repair" }] }
    const view = render(notice(drift))
    expect((screen.getByRole("button", { name: "Repair listed sections" }) as HTMLButtonElement).disabled).toBe(true)
    view.rerender(notice({ ...drift, layout: "fixed" }))
    expect(screen.queryByRole("button", { name: "Repair listed sections" })).toBeNull()
    expect(repair).not.toHaveBeenCalled()
  })

  it("recovers an actionable notice after task records disappear on restart without treating the first read as failure", async () => {
    const drift: SectioningSynchronization = { ...snapshot, sections: [{ ...snapshot.sections[0], status: "structural-drift", action: "repair" }] }
    repair.mockResolvedValue({ taskId: "lost-task" })
    const view = render(notice(drift))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Repair listed sections" })))
    taskState.dataUpdatedAt = Date.now() + 100
    view.rerender(notice(drift))
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByRole("button", { name: "Repair listed sections" }) as HTMLButtonElement).disabled).toBe(true)
    taskState.dataUpdatedAt += 5000
    view.rerender(notice(drift))
    expect(screen.getByRole("alert").textContent).toContain("Repair status is unavailable")
    expect((screen.getByRole("button", { name: "Repair listed sections" }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole("status")).toBeTruthy()
    expect(repair).toHaveBeenCalledTimes(1)
  })

})
