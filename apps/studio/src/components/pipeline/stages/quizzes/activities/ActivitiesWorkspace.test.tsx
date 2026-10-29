// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((out, part, index) => out + part + (values[index] ?? ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (message: { message: string }) => message.message } }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: join }), Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, params, onClick }: { children: React.ReactNode; params: { pageId: string }; onClick?: () => void }) => <a href={`/storyboard/${params.pageId}`} onClick={(event) => { event.preventDefault(); onClick?.() }}>{children}</a> }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookAgentAvailability: () => true, useBookStructuredTextAvailability: () => state.hasTextProvider }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: state.pipelineRunning }) }))
vi.mock("@/hooks/use-editable-activities", () => ({ useEditableActivities: () => ({
  data: { activities: state.stepper ? { "1": { enabled: true, sectionType: "activity_sorting" } } : {} }, isSuccess: true,
}) }))
const state = vi.hoisted(() => ({
  fixed: false, rendered: true, task: undefined as { taskId: string; status: string; error?: string } | undefined,
  pageImageBase64: "page-image-data",
  generate: vi.fn(), remove: vi.fn(), recreate: vi.fn(),
  hasTextProvider: true, pipelineRunning: false, runningTask: false, stepper: false, secondActivity: false, renderingVersion: 5,
  selectSection: vi.fn(), skipReset: { current: false },
}))
vi.mock("@/routes/books.$label", () => ({ useSectionNav: () => ({ setSectionIndex: state.selectSection, skipNextResetRef: state.skipReset }) }))
vi.mock("@/api/client", () => ({ BASE_URL: "/api", api: { agentGenerateActivity: state.generate, deleteSection: state.remove, aiEditSection: state.recreate } }))
vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [{ pageId: "pg001", pageNumber: 1, hasRendering: true }] }),
  usePageImage: () => ({ data: state.pageImageBase64 ? { imageBase64: state.pageImageBase64 } : undefined, isError: false }),
  usePage: () => ({ data: {
    pageId: "pg001", pageNumber: 1, versions: { rendering: state.renderingVersion },
    sectioningTree: { sections: [
      { sectionId: "retired", sectionType: "activity_matching", isPruned: true },
      { sectionId: "pg001_sec017", sectionType: "activity_sorting", isPruned: false },
      ...(state.secondActivity ? [{ sectionId: "pg001_sec018", sectionType: "activity_custom", isPruned: false }] : []),
    ] },
    rendering: { sections: state.rendered ? [
      { sectionIndex: 1, sectionType: state.fixed ? "fixed-layout-page" : "activity_sorting" },
      ...(state.secondActivity ? [{ sectionIndex: 2, sectionType: "activity_custom" }] : []),
    ] : [] },
  } }),
}))
vi.mock("@/hooks/use-book-tasks", () => ({
  bookTasksKey: (label: string) => ["books", label, "tasks"],
  useBookTasks: () => ({ getTask: () => state.task, isTaskRunning: () => state.runningTask }),
}))
const { ActivitiesWorkspace } = await import("./ActivitiesWorkspace")
let client: QueryClient
beforeEach(() => {
  state.fixed = false
  state.rendered = true
  state.task = undefined
  state.pageImageBase64 = "page-image-data"
  state.hasTextProvider = true
  state.pipelineRunning = false
  state.runningTask = false
  state.stepper = false
  state.secondActivity = false
  state.renderingVersion = 5
  state.generate.mockReset().mockResolvedValue({ taskId: "task-1" })
  state.remove.mockReset().mockResolvedValue({ remainingSections: 1 })
  state.recreate.mockReset().mockResolvedValue({ taskId: "edit-1" })
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear() })
const workspace = () => <QueryClientProvider client={client}><ActivitiesWorkspace bookLabel="book" /></QueryClientProvider>

it("generates from the selected page with inclusive guidance and shows asynchronous failures", async () => {
  const view = render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Create activity" }))
  expect(screen.getByRole("dialog")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Use a standard layout" }))
  fireEvent.click(screen.getByRole("button", { name: "Matching pairs" }))
  expect((screen.getByLabelText("Describe the activity") as HTMLTextAreaElement).value).toContain("matching activity")
  expect(screen.queryByRole("checkbox")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Generate", exact: true }))
  await waitFor(() => expect(state.generate).toHaveBeenCalledWith("book", "pg001", expect.stringContaining("matching activity"), "", { inclusiveDesign: true, mode: "templated" }))
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(false))
  state.task = { taskId: "task-1", status: "failed", error: "Provider unavailable" }
  view.rerender(workspace())
  expect(screen.getByRole("alert").textContent).toContain("Provider unavailable")
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(false)
})

it("previews a retained activity by its stable section ID and links to its source page", () => {
  render(workspace())
  expect(screen.getByTitle("Activity preview").getAttribute("src")).toContain("pg001_sec017.html")
  expect(screen.getAllByRole("button", { name: /^Activity \d+$/ })).toHaveLength(1)
  expect(screen.getByRole("link", { name: "Edit activity" }).getAttribute("href")).toBe("/storyboard/pg001")
  fireEvent.click(screen.getByRole("link", { name: "Edit activity" }))
  expect(state.selectSection).toHaveBeenCalledWith(1)
  expect(state.skipReset.current).toBe(true)
})

it("shows the selected source page image on hover or keyboard focus", async () => {
  render(workspace())
  const preview = screen.getByRole("button", { name: "Preview source page 1" })
  fireEvent.focus(preview)
  await waitFor(() => expect(screen.getByRole("img", { name: "Source page 1 preview" }).getAttribute("src")).toBe("data:image/png;base64,page-image-data"))
})

it.each(["fixed", "unrendered"])("blocks generation for %s pages", (kind) => {
  state.fixed = kind === "fixed"
  state.rendered = kind !== "unrendered"
  render(workspace())
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(true)
  expect(screen.getByRole("status").textContent).toContain("reflowable")
})

it("refreshes page results when task polling reports completion", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const view = render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Create activity" }))
  fireEvent.click(screen.getByRole("button", { name: "Use a standard layout" }))
  fireEvent.click(screen.getByRole("button", { name: "Select all that apply" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate", exact: true }))
  await waitFor(() => expect(state.generate).toHaveBeenCalled())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["books", "book", "tasks"] }))
  state.task = { taskId: "task-1", status: "completed" }
  view.rerender(workspace())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["books", "book", "pages"] }))
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(false)
})

it("re-enables activity creation when a completed task has left the task list", async () => {
  const view = render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Create activity" }))
  fireEvent.click(screen.getByRole("button", { name: "Use a standard layout" }))
  fireEvent.click(screen.getByRole("button", { name: "Ordering" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate", exact: true }))
  await waitFor(() => expect(state.generate).toHaveBeenCalled())
  // Task history may be pruned after completion. Its absence is not evidence
  // that work is still in progress.
  state.task = undefined
  view.rerender(workspace())
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(false)
})

it("deletes only the selected activity after confirmation and refreshes dependent views", async () => {
  state.secondActivity = true
  state.hasTextProvider = false
  const invalidate = vi.spyOn(client, "invalidateQueries")
  render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Activity 1" }))
  fireEvent.click(screen.getByRole("button", { name: "Delete activity" }))
  expect(state.remove).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
  expect(state.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Delete activity" }))
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete", exact: true }))
  await waitFor(() => expect(state.remove).toHaveBeenCalledExactlyOnceWith("book", "pg001", 1))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["books", "book", "pages"] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["editable-activities", "book", "pg001"] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["books", "book", "outputs"] })
})

it("keeps a failed deletion open for retry and retains the activity preview", async () => {
  state.remove.mockRejectedValueOnce(new Error("Page is locked"))
  render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Delete activity" }))
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete", exact: true }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Page is locked"))
  expect(screen.getByTitle("Activity preview").getAttribute("src")).toContain("pg001_sec017.html")
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete", exact: true }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
})

it("requires comment feedback and recreates a custom activity in place", async () => {
  state.secondActivity = true
  render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Recreate with feedback" }))
  const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Recreate activity", exact: true })
  expect(submit.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText("Comment feedback"), { target: { value: "   " } })
  expect(submit.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText("Comment feedback"), { target: { value: "  Make the labels larger and keep keyboard controls.  " } })
  fireEvent.click(submit)
  await waitFor(() => expect(state.recreate).toHaveBeenCalledExactlyOnceWith("book", "pg001", 2, "Make the labels larger and keep keyboard controls.", ""))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(state.generate).not.toHaveBeenCalled()
  expect(state.remove).not.toHaveBeenCalled()
})

it("retains feedback after a rejected submission and permits retry", async () => {
  state.recreate.mockRejectedValueOnce(new Error("Provider unavailable"))
  render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Recreate with feedback" }))
  fireEvent.change(screen.getByLabelText("Comment feedback"), { target: { value: "Use simpler wording." } })
  fireEvent.click(screen.getByRole("button", { name: "Recreate activity", exact: true }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Provider unavailable"))
  expect(screen.getByLabelText<HTMLTextAreaElement>("Comment feedback").value).toBe("Use simpler wording.")
  fireEvent.click(screen.getByRole("button", { name: "Recreate activity", exact: true }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(state.recreate).toHaveBeenCalledTimes(2)
})

it("tracks recreation to completion, refreshes the preview and retains feedback on asynchronous failure", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const view = render(workspace())
  fireEvent.click(screen.getByRole("button", { name: "Recreate with feedback" }))
  fireEvent.change(screen.getByLabelText("Comment feedback"), { target: { value: "Use larger labels." } })
  fireEvent.click(screen.getByRole("button", { name: "Recreate activity", exact: true }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  state.task = { taskId: "edit-1", status: "running" }
  view.rerender(workspace())
  expect(screen.getByRole("status").textContent).toContain("Recreating activity")
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Delete activity" }).disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create activity" }).disabled).toBe(true)
  state.task = { taskId: "edit-1", status: "failed", error: "AI editing failed" }
  view.rerender(workspace())
  expect(screen.getByRole("alert").textContent).toBe("AI editing failed")
  fireEvent.click(screen.getByRole("button", { name: "Recreate with feedback" }))
  expect(screen.getByLabelText<HTMLTextAreaElement>("Comment feedback").value).toBe("Use larger labels.")
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  state.task = { taskId: "edit-1", status: "completed" }
  state.renderingVersion = 6
  view.rerender(workspace())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["books", "book", "pages"] }))
  expect(screen.getByTitle("Activity preview").getAttribute("src")).toContain("v=6")
})

it.each(["pipeline", "task"])("disables activity changes while a %s is running", (kind) => {
  state.pipelineRunning = kind === "pipeline"
  state.runningTask = kind === "task"
  render(workspace())
  for (const name of ["Create activity", "Recreate with feedback", "Delete activity"]) {
    expect(screen.getByRole<HTMLButtonElement>("button", { name }).disabled).toBe(true)
  }
})

it("requires a text provider only for recreation", () => {
  state.hasTextProvider = false
  render(workspace())
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Recreate with feedback" }).disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Delete activity" }).disabled).toBe(false)
})

it("directs structured activities to their editor instead of editing hidden page HTML", () => {
  state.stepper = true
  render(workspace())
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Recreate with feedback" }).disabled).toBe(true)
  expect(screen.getByText("Use the page editor to rebuild a step-by-step activity.")).toBeTruthy()
})
