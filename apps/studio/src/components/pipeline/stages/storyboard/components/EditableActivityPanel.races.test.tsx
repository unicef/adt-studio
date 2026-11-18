// @vitest-environment jsdom
// Adapted from the independent reviewer’s asynchronous draft probes:
// apps/studio/src/components/pipeline/stages/storyboard/components/EditableActivityPanel.races.test.tsx
// Reuses that suite's real component/guard/FloatingSaveProvider pattern. Only
// API mutation/feedback response timing is controlled; no guard is mocked.
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { EditableActivity } from "@adt/types"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({ save: vi.fn(), feedback: vi.fn(), reload: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce((result, part, index) => result + part + (index < values.length ? String(values[index]) : ""), "")
} }), Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getEditableActivities: mocks.reload }, ApiError: class ApiError extends Error { constructor(message: string, readonly status: number) { super(message) } } }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "", anthropicKey: "", googleKey: "", customBaseUrl: "", customApiKey: "", geminiKey: "" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-editable-activities", async () => {
  const { useState } = await import("react")
  return {
    useSaveEditableActivities: () => {
      const [isPending, setPending] = useState(false)
      return { isPending, mutateAsync: async (payload: unknown) => {
        setPending(true)
        try { return await mocks.save(payload) } finally { setPending(false) }
      } }
    },
    useGenerateActivityFeedback: () => {
      const [isPending, setPending] = useState(false)
      return { isPending, mutate: (payload: unknown, callbacks: { onSuccess: (value: unknown) => void; onError: (error: Error) => void }) => {
        setPending(true)
        mocks.feedback(payload, {
          onSuccess(value: unknown) { setPending(false); callbacks.onSuccess(value) },
          onError(error: Error) { setPending(false); callbacks.onError(error) },
        })
      } }
    },
  }
})
vi.mock("./ReplaceFromBookDialog", () => ({ ReplaceFromBookDialog: () => null }))
vi.mock("./style-editor/controls/ColorPicker", () => ({ ColorPicker: () => null }))
vi.mock("./style-editor/controls/Select", () => ({ Select: () => null }))

import { FloatingSaveProvider, useHasUnsavedChanges, useFloatingSaveLeaveAction } from "@/components/pipeline/components/floating-save"
import { ApiError } from "@/api/client"
import { EditableActivityPanel } from "./EditableActivityPanel"

type MapOfActivities = Record<string, EditableActivity>
const original: EditableActivity = { kind: "open-ended", sectionType: "activity_open_ended_answer", enabled: true,
  title: { text: "Original title" }, steps: [{ id: "step-1", prompt: { text: "Original question" }, multiline: true }] }
const neighbor: EditableActivity = { ...original, title: { text: "Neighbor original" }, steps: [{ id: "neighbor-step", prompt: { text: "Neighbor question" }, multiline: true }] }
const defaultMap = (): MapOfActivities => ({ "0": structuredClone(original), "1": structuredClone(neighbor) })
let leaveAction: ReturnType<typeof useFloatingSaveLeaveAction>
function SaveBarrierProbe() {
  leaveAction = useFloatingSaveLeaveAction()
  return <output data-testid="activity-unsaved-barrier">{String(useHasUnsavedChanges())}</output>
}
function mount(activities = defaultMap(), version = 1) {
  const client = new QueryClient()
  const view = (next: MapOfActivities, nextVersion: number) => <QueryClientProvider client={client}><FloatingSaveProvider>
    <EditableActivityPanel open onClose={() => {}} bookLabel="book" pageId="page-1" sectionIndex={0}
      activity={next["0"]} activities={next} version={nextVersion} paletteAccent="#2563EB" />
    <SaveBarrierProbe />
  </FloatingSaveProvider></QueryClientProvider>
  const mounted = render(view(activities, version))
  return { ...mounted, refresh: (next: MapOfActivities, nextVersion: number) => mounted.rerender(view(next, nextVersion)) }
}
const title = () => screen.getByPlaceholderText("Title") as HTMLInputElement
const instructions = () => screen.getByPlaceholderText("Instructions") as HTMLInputElement
const changeTitle = (text: string) => fireEvent.change(title(), { target: { value: text } })
const saveButton = () => screen.getByRole("button", { name: "Save activity" }) as HTMLButtonElement
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue({ version: 3 })
  mocks.feedback.mockReset(); mocks.reload.mockReset(); mocks.error.mockReset(); mocks.success.mockReset()
})
afterEach(cleanup)

it("feedback begun before a neighboring query refresh cannot borrow its newer whole-map version", async () => {
  const initial = defaultMap()
  const mounted = mount(initial)
  fireEvent.click(screen.getByRole("button", { name: "Generate feedback" }))
  expect(mocks.feedback).toHaveBeenCalledTimes(1)
  const latest = { ...initial, "1": { ...neighbor, title: { text: "Neighbor saved elsewhere" } } }
  mounted.refresh(latest, 2)
  await act(async () => { mocks.feedback.mock.calls[0][1].onSuccess({ feedback: { "step-1": { correct: "Generated feedback retained" } } }) })
  expect((screen.getByPlaceholderText("Message when correct (may include the answer)") as HTMLTextAreaElement).value).toBe("Generated feedback retained")
  mocks.save.mockRejectedValueOnce(new Error("VERSION_CONFLICT: current activity entity changed"))
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  const submitted = mocks.save.mock.calls[0][0]
  // The new implementation freezes the full map before the request. Rejection
  // is safe; silently combining the old neighbor with baseVersion2 is not.
  expect(submitted.baseVersion).toBe(1)
  expect(submitted.activities["1"]).toEqual(initial["1"])
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect((screen.getByPlaceholderText("Message when correct (may include the answer)") as HTMLTextAreaElement).value).toBe("Generated feedback retained")
  expect(saveButton().disabled).toBe(false)
})

it.each(["Successor typed in the acknowledgement turn", "Original title"])("preserves Save successor '%s', including a revert to the pre-save original", async successor => {
  const pending = deferred<{ version: number }>()
  mocks.save.mockImplementationOnce(() => pending.promise)
  const initial = defaultMap(), mounted = mount(initial)
  changeTitle("Submitted title")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  const submitted = mocks.save.mock.calls[0][0].activities as MapOfActivities
  expect(submitted["0"].title?.text).toBe("Submitted title")
  if (successor === "Original title") {
    changeTitle(successor)
    // Equal to the old baseline is still unsaved relative to in-flight B.
    await waitFor(() => expect(screen.getByTestId("activity-unsaved-barrier").textContent).toBe("true"))
  }
  // Outer act keeps update and promise completion in the same scheduling turn.
  await act(async () => {
    changeTitle(successor)
    pending.resolve({ version: 2 })
    await Promise.resolve()
  })
  // Match the actual hook's successful cache update with the acknowledged map.
  // This prevents stale props from falsely making a discarded successor visible.
  mounted.refresh(submitted, 2)
  expect(title().value).toBe(successor)
  await waitFor(() => expect(saveButton().disabled).toBe(false))
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0]).toMatchObject({ baseVersion: 2, activities: { "0": { title: { text: successor } }, "1": initial["1"] } })
})

it.each(["other-field", "removed-sentence"] as const)("rebases a %s successor over FITB empty-sentence cleanup", async edit => {
  const fitb: EditableActivity = { kind: "fill-in-the-blank", sectionType: "activity_fill_in_the_blank", enabled: true,
    title: { text: "Original title" }, steps: [{ id: "fitb-step", sentences: [{ text: "Keep [[blank:item-1]]" }, { text: "" }], blanks: [{ itemId: "item-1", answers: ["yes"] }] }] }
  const initial = { "0": fitb, "1": structuredClone(neighbor) }
  const mounted = mount(initial)
  const pending = deferred<{ version: number }>()
  mocks.save.mockImplementationOnce(() => pending.promise)
  changeTitle("Submitted title")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  const submitted = mocks.save.mock.calls[0][0].activities as MapOfActivities
  expect((submitted["0"] as Extract<EditableActivity, { kind: "fill-in-the-blank" }>).steps[0].sentences).toEqual([{ text: "Keep [[blank:item-1]]" }])
  if (edit === "other-field") fireEvent.change(instructions(), { target: { value: "Instructions typed while saving" } })
  else fireEvent.change(screen.getAllByLabelText("Sentence with blank markers")[1], { target: { value: "Typed successor sentence" } })
  await act(async () => { pending.resolve({ version: 2 }); await Promise.resolve() })
  mounted.refresh(submitted, 2)
  if (edit === "other-field") {
    expect(instructions().value).toBe("Instructions typed while saving")
    expect(screen.getAllByLabelText("Sentence with blank markers")).toHaveLength(1)
  } else {
    expect(screen.getAllByLabelText("Sentence with blank markers")).toHaveLength(2)
    expect((screen.getAllByLabelText("Sentence with blank markers")[1] as HTMLTextAreaElement).value).toBe("Typed successor sentence")
  }
  await waitFor(() => expect(saveButton().disabled).toBe(false))
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  const next = mocks.save.mock.calls[1][0]
  expect(next.baseVersion).toBe(2)
  expect(next.activities["1"]).toEqual(initial["1"])
  expect(next.activities["0"].steps[0].sentences.map((sentence: { text: string }) => sentence.text)).toEqual(edit === "other-field" ? ["Keep [[blank:item-1]]"] : ["Keep [[blank:item-1]]", "Typed successor sentence"])
})

it("an edit returned to its acknowledged original is clean when no Save is in flight", async () => {
  mount()
  changeTitle("Temporary edit")
  expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
  changeTitle("Original title")
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull())
  expect(saveButton().disabled).toBe(true)
  expect(mocks.save).not.toHaveBeenCalled()
})

it("an empty post-reset query retains an old dirty draft and frozen base until explicit discard", async () => {
  const mounted = mount()
  changeTitle("Retained pre-reset draft")
  mounted.refresh({}, 2)
  expect(title().value).toBe("Retained pre-reset draft")
  mocks.save.mockRejectedValueOnce(new Error("VERSION_CONFLICT: explicit reset changed activity entity"))
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ baseVersion: 1, activities: { "0": { title: { text: "Retained pre-reset draft" } } } })
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(title().value).toBe("Retained pre-reset draft")
  fireEvent.click(screen.getAllByRole("button", { name: "Discard" })[0])
  await waitFor(() => expect(screen.queryByPlaceholderText("Title")).toBeNull())
  const repaired = { "0": { ...original, title: { text: "New current activity" } } }
  mounted.refresh(repaired, 3)
  changeTitle("Next deliberate edit")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0]).toMatchObject({ baseVersion: 3, activities: { "0": { title: { text: "Next deliberate edit" } } } })
})

it("a failed feedback request releases only its own unchanged snapshot", async () => {
  mount()
  fireEvent.click(screen.getByRole("button", { name: "Generate feedback" }))
  changeTitle("Independent edit during feedback")
  await act(async () => { mocks.feedback.mock.calls[0][1].onError(new Error("controlled feedback failure")) })
  expect(title().value).toBe("Independent edit during feedback")
  expect(saveButton().disabled).toBe(false)
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ baseVersion: 1, activities: { "0": { title: { text: "Independent edit during feedback" } } } })
})


it("Save & leave waits for the existing activity save instead of starting a competing save", async () => {
  const pending = deferred<{ version: number }>()
  mocks.save.mockImplementationOnce(() => pending.promise)
  const mounted = mount()
  changeTitle("Submitted title")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  let settled = false
  let leaving!: Promise<void>
  act(() => { leaving = leaveAction.saveAndStay().then(() => { settled = true }) })
  await act(async () => { await Promise.resolve() })
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  const submitted = mocks.save.mock.calls[0][0].activities as MapOfActivities
  await act(async () => { pending.resolve({version:2}); await leaving })
  mounted.refresh(submitted, 2)
  expect(settled).toBe(true)
  expect(screen.getByTestId("activity-unsaved-barrier").textContent).toBe("false")
})


it("rebases a 409 onto the latest neighbor while retaining edits made during the save", async () => {
  const waiting = deferred<{ version: number }>(), initial = defaultMap()
  mocks.save.mockImplementationOnce(() => waiting.promise)
  const latest = { ...initial, "1": { ...neighbor, title: { text: "Neighbor saved elsewhere" } } }
  mocks.reload.mockResolvedValue({ activities: latest, version: 2 })
  mount(initial)
  changeTitle("Submitted title"); fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  changeTitle("Successor title")
  await act(async () => { waiting.reject(new ApiError("Conflict", 409)) })
  await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
  expect(title().value).toBe("Successor title")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0]).toMatchObject({ baseVersion: 2, activities: { "0": { title: { text: "Successor title" } }, "1": latest["1"] } })
})

it.each(["Keep my changes", "Load latest saved values"])("requires an explicit overlapping activity conflict choice: %s", async choice => {
  const initial = defaultMap(), latest = { ...initial, "0": { ...original, title: { text: "Other writer" } } }
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockResolvedValue({ activities: latest, version: 2 })
  mount(initial); changeTitle("Mine"); fireEvent.click(saveButton())
  await waitFor(() => expect(screen.getByRole("button", { name: choice })).toBeTruthy())
  expect(saveButton().disabled).toBe(true)
  // The leave guard is registered by an effect; exercise it after that commit.
  await act(async () => {})
  await act(async () => { await expect(leaveAction.saveAndStay()).rejects.toThrow() })
  expect(mocks.save).toHaveBeenCalledTimes(1)
  fireEvent.change(instructions(), { target: { value: "Typed after conflict" } })
  fireEvent.click(screen.getByRole("button", { name: choice }))
  expect(title().value).toBe(choice === "Keep my changes" ? "Mine" : "Other writer")
  expect(instructions().value).toBe("Typed after conflict")
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0].baseVersion).toBe(2)
})

it("does not graft a draft onto a rebuilt activity before an explicit choice", async () => {
  const initial = defaultMap()
  initial["0"] = { ...original, sourceRenderingVersion: 1 }
  const latest = { ...initial, "0": { ...original, sourceRenderingVersion: 2, title: { text: "Rebuilt" }, steps: [{ id: "new-step", prompt: { text: "New question" }, multiline: true }] } as EditableActivity }
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockResolvedValue({ activities: latest, version: 2 })
  mount(initial); changeTitle("My retained draft"); fireEvent.click(saveButton())
  await waitFor(() => expect(screen.getByRole("button", { name: "Load latest saved values" })).toBeTruthy())
  expect(title().value).toBe("My retained draft")
  expect(screen.queryByDisplayValue("New question")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Load latest saved values" }))
  expect(title().value).toBe("Rebuilt")
  expect(screen.getByDisplayValue("New question")).toBeTruthy()
  expect(mocks.save).toHaveBeenCalledTimes(1)
})

it("follows later saved activities after accepting a deleted activity in a conflict", async () => {
  const initial = defaultMap(), latest = { "1": initial["1"] }
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockResolvedValue({ activities: latest, version: 2 })
  const mounted = mount(initial)
  changeTitle("Discard this draft"); fireEvent.click(saveButton())
  fireEvent.click(await screen.findByRole("button", { name: "Load latest saved values" }))
  expect(screen.queryByPlaceholderText("Title")).toBeNull()
  mounted.refresh(latest, 2)
  const recreated = { ...latest, "0": { ...original, title: { text: "New saved activity" } } }
  mounted.refresh(recreated, 3)
  expect(title().value).toBe("New saved activity")
  changeTitle("Next deliberate edit"); fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0]).toMatchObject({ baseVersion: 3, activities: { "0": { title: { text: "Next deliberate edit" } } } })
})

it.each([false, true])("a real query observer becomes clean after accepting latest (deleted=%s)", async deleted => {
  const initial = defaultMap(), latest = deleted ? { "1": initial["1"] } : { ...initial, "0": { ...original, title: { text: "Saved elsewhere" } } }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(["editable-activities", "book", "page-1"], { activities: initial, version: 1 })
  function Connected() {
    const { data } = useQuery({ queryKey: ["editable-activities", "book", "page-1"], queryFn: mocks.reload, enabled: false })
    return <FloatingSaveProvider><EditableActivityPanel open onClose={() => {}} bookLabel="book" pageId="page-1" sectionIndex={0}
      activity={data.activities["0"]} activities={data.activities} version={data.version} paletteAccent="#2563EB" /><SaveBarrierProbe /></FloatingSaveProvider>
  }
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockResolvedValue({ activities: latest, version: 2 })
  render(<QueryClientProvider client={client}><Connected /></QueryClientProvider>)
  changeTitle("Discard my draft"); fireEvent.click(saveButton())
  fireEvent.click(await screen.findByRole("button", { name: "Load latest saved values" }))
  await waitFor(() => expect(screen.getByTestId("activity-unsaved-barrier").textContent).toBe("false"))
  expect(client.getQueryData(["editable-activities", "book", "page-1"])).toEqual({ activities: latest, version: 2 })
  if (deleted) {
    act(() => { client.setQueryData(["editable-activities", "book", "page-1"], { activities: initial, version: 3 }) })
    await waitFor(() => expect(title().value).toBe("Original title"))
  } else {
    expect(title().value).toBe("Saved elsewhere")
    fireEvent.click(screen.getByRole("button", { name: "Generate feedback" }))
    await act(async () => { mocks.feedback.mock.calls[0][1].onError(new Error("Feedback failed")) })
    expect(screen.getByTestId("activity-unsaved-barrier").textContent).toBe("false")
    expect(title().value).toBe("Saved elsewhere")
  }
  expect(mocks.save).toHaveBeenCalledTimes(1)
})


it.each(["newer-cache", "older-fetch"])("conflict reload preserves query ordering with %s", async race => {
  const initial = defaultMap()
  const latest = { ...initial, "0": { ...original, title: { text: "Latest saved" } } }
  const newest = { ...initial, "0": { ...original, title: { text: "Newest saved" } } }
  const key = ["editable-activities", "book", "page-1"]
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(key, { activities: initial, version: 1 })
  function Connected() {
    const { data } = useQuery({ queryKey: key, queryFn: mocks.reload, enabled: false })
    return <FloatingSaveProvider><EditableActivityPanel open onClose={() => {}} bookLabel="book" pageId="page-1" sectionIndex={0}
      activity={data.activities["0"]} activities={data.activities} version={data.version} paletteAccent="#2563EB" /><SaveBarrierProbe /></FloatingSaveProvider>
  }
  const reload = deferred<{ activities: MapOfActivities; version: number }>()
  const older = deferred<{ activities: MapOfActivities; version: number }>()
  let cancelled = false
  let olderRequest: Promise<unknown> | undefined
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockImplementationOnce(() => reload.promise)
  render(<QueryClientProvider client={client}><Connected /></QueryClientProvider>)
  if (race === "older-fetch") {
    act(() => {
      olderRequest = client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: ({ signal }) => {
        signal.addEventListener("abort", () => { cancelled = true })
        return older.promise
      } }).catch(() => undefined)
    })
  }
  changeTitle("My retained draft"); fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
  if (race === "newer-cache") act(() => { client.setQueryData(key, { activities: newest, version: 3 }) })
  await act(async () => { reload.resolve({ activities: latest, version: 2 }) })
  fireEvent.click(await screen.findByRole("button", { name: "Load latest saved values" }))
  if (race === "older-fetch") {
    expect(cancelled).toBe(true)
    await act(async () => { older.resolve({ activities: initial, version: 1 }); await olderRequest })
  }
  const expected = race === "newer-cache" ? { activities: newest, version: 3 } : { activities: latest, version: 2 }
  await waitFor(() => expect(screen.getByTestId("activity-unsaved-barrier").textContent).toBe("false"))
  expect(client.getQueryData(key)).toEqual(expected)
  expect(title().value).toBe(expected.activities["0"].title!.text)
})


it.each([false, true])("keeps Save disabled and drafts intact during a delayed conflict reload (fails=%s)", async fails => {
  const reload = deferred<{ activities: MapOfActivities; version: number }>(), initial = defaultMap()
  mocks.save.mockRejectedValueOnce(new ApiError("Conflict", 409))
  mocks.reload.mockImplementationOnce(() => reload.promise)
  mount(initial); changeTitle("My draft"); fireEvent.click(saveButton())
  await waitFor(() => expect(screen.getByText("Checking the latest saved version…").getAttribute("role")).toBe("status"))
  const checking = screen.getByRole("button", { name: "Checking latest…" }) as HTMLButtonElement
  expect(checking.disabled).toBe(true)
  expect(screen.queryByText("Changes not saved")).toBeNull()
  fireEvent.click(checking); expect(mocks.save).toHaveBeenCalledTimes(1)
  // Navigation uses a separate Save entrypoint, so a disabled dialog button
  // alone cannot prove that the in-flight reload excludes another save.
  let navigationResult: unknown = "pending"
  const navigationSave = leaveAction!.saveAndStay().catch(error => { navigationResult = error })
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(navigationResult).toBe("pending")
  if (fails) {
    changeTitle("Newer local draft")
    await act(async () => { reload.reject(new Error("Reload unavailable")) })
    // A successor draft invalidates the old reload result, including its error.
    await waitFor(() => expect(screen.getByText("Changes not saved")).toBeTruthy())
    expect(title().value).toBe("Newer local draft")
  } else {
    const latest = { ...initial, "1": { ...neighbor, title: { text: "Neighbor saved elsewhere" } } }
    await act(async () => { reload.resolve({ activities: latest, version: 2 }) })
    expect(title().value).toBe("My draft")
  }
  await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false))
  await navigationSave
  expect(navigationResult).toBeInstanceOf(ApiError)
  expect((navigationResult as ApiError).status).toBe(409)
  expect(mocks.save).toHaveBeenCalledTimes(1)
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
  expect(mocks.save.mock.calls[1][0].baseVersion).toBe(fails ? 1 : 2)
})
