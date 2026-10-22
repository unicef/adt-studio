// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const navigation = vi.hoisted(() => ({ save: async () => {}, discard: () => {} }));
vi.mock("../../../components/floating-save", () => ({ useFloatingSave: (entry: { onSaveStay: () => Promise<void>; onDiscard: () => void }) => { navigation.save = entry.onSaveStay; navigation.discard = entry.onDiscard; } }));
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }) }))
const { WordTimestampViewer } = await import("./WordTimestampViewer")
afterEach(cleanup)
const entry = { textId: "pg001_t001", language: "en", version: 1, audioHash: "original", words: [{ word: "Hello", start: 0, end: 1 }], duration: 1 }
function changeStart(value: string) {
  const input = screen.getByTitle("Start")
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}
it("retains a successor draft and advances only to its own save receipt", async () => {
  let finish!: (value: unknown) => void
  const onSave = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, entry: { ...entry, version: 3 } })
  const view = render(<WordTimestampViewer bookLabel="book" timestamps={entry} onSave={onSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.100")
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  changeStart("0.200")
  // A later writer's refetch is not an acknowledgement of our draft.
  view.rerender(<WordTimestampViewer bookLabel="book" timestamps={{ ...entry, version: 9 }} onSave={onSave} />)
  await act(async () => { finish({ ok: true, entry: { ...entry, version: 2, audioHash: "snapshot", audioIdentity: "snapshot-identity" } }) })
  expect((screen.getByTitle("Start") as HTMLInputElement).value).toBe("0.200")
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  expect(onSave.mock.calls[1]).toEqual([[{ word: "Hello", start: 0.2, end: 1 }], 1, { baseVersion: 2, audioHash: "snapshot", audioIdentity: "snapshot-identity" }])
  await act(async () => {})
})

it.each(["conflict", "network"])("retains the draft and original guard after a %s failure", async error => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error(error)).mockResolvedValue({ ok: true, entry: { ...entry, version: 2 } })
  render(<WordTimestampViewer bookLabel="book" timestamps={entry} onSave={onSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.200")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })) })
  expect(screen.getByRole("alert").textContent).toBe(error)
  expect((screen.getByTitle("Start") as HTMLInputElement).value).toBe("0.200")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })) })
  expect(onSave.mock.calls[1][2]).toMatchObject({ baseVersion: 1, audioHash: "original" })
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.queryByRole("button", { name: "Save", exact: true })).toBeNull()
})

it("retains unblurred edits and collapsed drafts, and does not send overlapping saves", async () => {
  let finish!: (value: unknown) => void
  const onSave = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<WordTimestampViewer bookLabel="book" timestamps={entry} onSave={onSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.100")
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  fireEvent.change(screen.getByTitle("Start"), { target: { value: "0.200" } })
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  expect(onSave).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ ok: true, entry: { ...entry, version: 2 } }) })
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  expect((screen.getByTitle("Start") as HTMLInputElement).value).toBe("0.200")
  expect(screen.getByRole("button", { name: "Save", exact: true })).toBeTruthy()
})

it("does not acknowledge another book/language/voice editor with an old save", async () => {
  let finish!: (value: unknown) => void
  const oldSave = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const nextSave = vi.fn().mockResolvedValue({ ok: true, entry: { ...entry, version: 8 } })
  const view = render(<WordTimestampViewer bookLabel="book" key="book:en:primary" timestamps={entry} onSave={oldSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.100")
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }))
  view.rerender(<WordTimestampViewer bookLabel="book" key="other:fr:secondary" timestamps={{ ...entry, language: "fr", voiceSlot: "secondary", version: 7 }} onSave={nextSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.300")
  await act(async () => { finish({ ok: true, entry: { ...entry, version: 2 } }) })
  expect((screen.getByTitle("Start") as HTMLInputElement).value).toBe("0.300")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })) })
  expect(nextSave.mock.calls[0][2]).toMatchObject({ baseVersion: 7 })
})

it("uses the identity receipt for legacy empty hashes", async () => {
  const onSave = vi.fn().mockResolvedValue({ ok: true, entry: { ...entry, version: 2 } })
  render(<WordTimestampViewer bookLabel="book" timestamps={{ ...entry, audioHash: "", audioIdentity: "legacy" }} onSave={onSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.100")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })) })
  expect(onSave.mock.calls[0][2]).toEqual({ baseVersion: 1, audioHash: undefined, audioIdentity: "legacy" })
})

it("Save & leave refuses pending work and successor drafts until they are saved", async () => {
  let finish!: (value: unknown) => void
  const onSave = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, entry: { ...entry, version: 3 } })
  render(<WordTimestampViewer bookLabel="book" timestamps={entry} onSave={onSave} />)
  fireEvent.click(screen.getByRole("button", { name: /words/ }))
  changeStart("0.100")
  let save!: Promise<void>
  await act(async () => { save = navigation.save(); void save.catch(() => {}) })
  await expect(navigation.save()).rejects.toThrow("A save is still in progress")
  changeStart("0.200")
  await act(async () => { finish({ ok: true, entry: { ...entry, version: 2 } }); await expect(save).rejects.toThrow("Newer edits are still unsaved") })
  expect(screen.getByRole("button", { name: "Save", exact: true })).toBeTruthy()
  await act(async () => { await navigation.save() })
  expect(screen.queryByRole("button", { name: "Save", exact: true })).toBeNull()
})
