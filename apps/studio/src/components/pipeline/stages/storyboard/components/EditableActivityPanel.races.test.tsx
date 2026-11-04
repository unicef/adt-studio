// @vitest-environment jsdom
// Adapted from the independent reviewer’s asynchronous draft probes:
// apps/studio/src/components/pipeline/stages/storyboard/components/EditableActivityPanel.races.test.tsx
// Reuses that suite's real component/guard/FloatingSaveProvider pattern. Only
// API mutation/feedback response timing is controlled; no guard is mocked.
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { EditableActivity } from "@adt/types"

const mocks = vi.hoisted(() => ({ save: vi.fn(), feedback: vi.fn(), reload: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce((result, part, index) => result + part + (index < values.length ? String(values[index]) : ""), "")
} }) }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getEditableActivities: mocks.reload }, ApiError: class ApiError extends Error {} }))
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
  const view = (next: MapOfActivities, nextVersion: number) => <FloatingSaveProvider>
    <EditableActivityPanel open onClose={() => {}} bookLabel="book" pageId="page-1" sectionIndex={0}
      activity={next["0"]} activities={next} version={nextVersion} paletteAccent="#2563EB" />
    <SaveBarrierProbe />
  </FloatingSaveProvider>
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
