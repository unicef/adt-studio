// @vitest-environment jsdom
import React from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    i18n: { locale: "en" },
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
  }),
}))

vi.mock("@/components/pipeline/components/FloatingSaveBar", () => ({
  FloatingSaveBar: () => null,
}))

vi.mock("@/hooks/use-downstream-with-output", () => ({
  useDownstreamWithOutput: () => [],
}))

const { FloatingSaveProvider, useFloatingSaveDirtyEntries, useFloatingSaveLeaveAction } = await import(
  "@/components/pipeline/components/floating-save"
)
const { useDocumentEdits } = await import("./useDocumentEdits")
const { createDraftStore } = await import("./pageview/draftStore")

interface Term {
  id: string
  word: string
}

interface Doc {
  version: number
  items: Term[]
}

const getItems = (doc: Doc) => doc.items
const setItems = (doc: Doc, items: Term[]) => ({ ...doc, items })
const keyOf = (item: Term) => item.id

function setup(initial: Doc, save = vi.fn(async (_next: Doc) => undefined), extra: { locked?: boolean } = {}) {
  const wrapper = ({ children }: { children: React.ReactNode }) => <FloatingSaveProvider>{children}</FloatingSaveProvider>
  const hook = renderHook(
    ({ doc, locked }: { doc: Doc; locked?: boolean }) => {
      const edits = useDocumentEdits({
        id: "glossary",
        stage: "glossary",
        doc,
        versionKey: String(doc.version),
        getItems,
        setItems,
        keyOf,
        noun: { one: "term", other: "terms" },
        save,
        locked,
        scope: { language: "en" },
      })
      const entries = useFloatingSaveDirtyEntries()
      const leave = useFloatingSaveLeaveAction()
      return { edits, entries, leave }
    },
    { wrapper, initialProps: { doc: initial, locked: extra.locked } },
  )
  return { ...hook, save }
}

const base: Doc = {
  version: 1,
  items: [
    { id: "a", word: "alpha" },
    { id: "b", word: "beta" },
  ],
}

afterEach(cleanup)

describe("useDocumentEdits", () => {
  it("keeps every fast successive edit instead of rebuilding from the server copy", () => {
    const { result } = setup(base)
    act(() => {
      result.current.edits.update("a", { word: "alpha 2" })
      result.current.edits.remove("b")
      result.current.edits.insert({ id: "c", word: "gamma" }, "a")
    })
    expect(result.current.edits.items).toEqual([
      { id: "a", word: "alpha 2" },
      { id: "c", word: "gamma" },
    ])
    expect(result.current.edits.dirty).toBe(true)
    expect([...result.current.edits.editedKeys].sort()).toEqual(["a", "c"])
  })

  it("registers one dirty floating-save entry with its scope", () => {
    const { result } = setup(base)
    expect(result.current.entries).toEqual([])
    act(() => result.current.edits.update("a", { word: "changed" }))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]).toMatchObject({ id: "glossary", stage: "glossary", scope: { language: "en" } })
  })

  it("is not dirty once an edit is reverted by hand", () => {
    const { result } = setup(base)
    act(() => result.current.edits.update("a", { word: "changed" }))
    act(() => result.current.edits.update("a", { word: "alpha" }))
    expect(result.current.edits.dirty).toBe(false)
  })

  it("discards back to the server document", () => {
    const { result } = setup(base)
    act(() => result.current.edits.update("a", { word: "changed" }))
    act(() => result.current.edits.discard())
    expect(result.current.edits.items).toEqual(base.items)
    expect(result.current.edits.dirty).toBe(false)
  })

  it("saves the whole document once with every pending change", async () => {
    const { result, save } = setup(base)
    act(() => {
      result.current.edits.update("a", { word: "one" })
      result.current.edits.update("b", { word: "two" })
    })
    await act(async () => {
      await result.current.edits.save()
    })
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith({
      version: 1,
      items: [
        { id: "a", word: "one" },
        { id: "b", word: "two" },
      ],
    })
    expect(result.current.edits.dirty).toBe(false)
  })

  it("keeps the draft and rejects when the save fails", async () => {
    const save = vi.fn(async () => {
      throw new Error("offline")
    })
    const { result } = setup(base, save)
    act(() => result.current.edits.update("a", { word: "kept" }))
    await act(async () => {
      await expect(result.current.leave.saveAndStay()).rejects.toThrow("offline")
    })
    expect(result.current.edits.items[0]).toEqual({ id: "a", word: "kept" })
    expect(result.current.edits.dirty).toBe(true)
    expect(result.current.edits.saveError?.message).toBe("offline")
  })

  it("clears a clean draft when a new version arrives", () => {
    const { result, rerender } = setup(base)
    rerender({ doc: { version: 2, items: [{ id: "a", word: "restored" }] } })
    expect(result.current.edits.dirty).toBe(false)
    expect(result.current.edits.items).toEqual([{ id: "a", word: "restored" }])
  })

  it("lets a new version replace a draft that was edited and then reverted", () => {
    const { result, rerender } = setup(base)
    act(() => result.current.edits.update("a", { word: "changed" }))
    act(() => result.current.edits.update("a", { word: "alpha" }))
    const fresh = { version: 2, items: [{ id: "a", word: "from the new run" }, { id: "z", word: "zeta" }] }
    rerender({ doc: fresh })
    expect(result.current.edits.items).toEqual(fresh.items)
    expect(result.current.edits.dirty).toBe(false)
    expect(result.current.entries).toEqual([])
  })

  it("never drops pending edits because the version changed under them", () => {
    const { result, rerender } = setup(base)
    act(() => result.current.edits.update("a", { word: "mine" }))
    rerender({ doc: { version: 2, items: base.items } })
    expect(result.current.edits.dirty).toBe(true)
    expect(result.current.edits.items[0]).toEqual({ id: "a", word: "mine" })
  })

  it("keeps edits typed after the save resolved but before its refetch landed", async () => {
    const { result, rerender } = setup(base)
    act(() => result.current.edits.update("a", { word: "saved" }))
    await act(async () => {
      await result.current.edits.save()
    })
    act(() => result.current.edits.update("b", { word: "typed after" }))
    rerender({ doc: { version: 2, items: [{ id: "a", word: "saved" }, { id: "b", word: "beta" }] } })
    expect(result.current.edits.items).toEqual([
      { id: "a", word: "saved" },
      { id: "b", word: "typed after" },
    ])
    expect(result.current.edits.dirty).toBe(true)
  })

  it("drops the saved draft once its own version lands", async () => {
    const { result, rerender } = setup(base)
    let pending: Promise<void> = Promise.resolve()
    act(() => result.current.edits.update("a", { word: "saved" }))
    act(() => {
      pending = result.current.edits.save()
    })
    rerender({ doc: { version: 2, items: [{ id: "a", word: "saved" }, { id: "b", word: "beta" }] } })
    await act(async () => {
      await pending
    })
    expect(result.current.edits.dirty).toBe(false)
  })

  it("keeps edits made while a save is in flight", async () => {
    let finish: () => void = () => undefined
    const save = vi.fn(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))))
    const { result, rerender } = setup(base, save)
    act(() => result.current.edits.update("a", { word: "first" }))
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.edits.save()
    })
    act(() => result.current.edits.update("b", { word: "second" }))
    rerender({ doc: { version: 2, items: [{ id: "a", word: "first" }, { id: "b", word: "beta" }] } })
    await act(async () => {
      finish()
      await pending
    })
    await waitFor(() => expect(result.current.edits.saving).toBe(false))
    expect(result.current.edits.items).toEqual([
      { id: "a", word: "first" },
      { id: "b", word: "second" },
    ])
    expect(result.current.edits.dirty).toBe(true)
  })

  it("refuses to insert a second item with an existing key", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { result } = setup(base)
    act(() => result.current.edits.insert({ id: "a", word: "dup" }, null))
    expect(result.current.edits.items).toEqual(base.items)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/duplicate key/))
    error.mockRestore()
  })

  it("a second save while one is in flight sends the newer edits after it", async () => {
    const releases: Array<() => void> = []
    const save = vi.fn(() => new Promise<undefined>((resolve) => releases.push(() => resolve(undefined))))
    const { result } = setup(base, save)
    act(() => result.current.edits.update("a", { word: "first" }))
    let one: Promise<void> = Promise.resolve()
    let two: Promise<void> = Promise.resolve()
    await act(async () => {
      one = result.current.edits.save()
      await Promise.resolve()
    })
    act(() => result.current.edits.update("b", { word: "second" }))
    await act(async () => {
      two = result.current.edits.save()
      releases[0]()
      await one
    })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await act(async () => {
      releases[1]()
      await two
    })
    expect(save.mock.calls[1][0]).toEqual({
      version: 1,
      items: [
        { id: "a", word: "first" },
        { id: "b", word: "second" },
      ],
    })
  })

  it("ignores edits and refuses to save while the stage is running", () => {
    const { result } = setup(base, undefined, { locked: true })
    act(() => result.current.edits.update("a", { word: "blocked" }))
    expect(result.current.edits.dirty).toBe(false)
    expect(result.current.leave.canSave).toBe(false)
  })
})

describe("useDocumentEdits with a kept draft (feed groups that unmount)", () => {
  function mount(store: ReturnType<typeof createDraftStore<Term>>, doc: Doc | undefined) {
    const wrapper = ({ children }: { children: React.ReactNode }) => <FloatingSaveProvider>{children}</FloatingSaveProvider>
    return renderHook(
      ({ current }: { current: Doc | undefined }) =>
        useDocumentEdits({
          id: "captions:p1",
          stage: "captions",
          doc: current,
          versionKey: current ? `p1:${current.version}` : "p1:none",
          getItems,
          setItems,
          keyOf,
          noun: { one: "image", other: "images" },
          save: vi.fn(async () => undefined),
          scope: { page: "p1" },
          keepDraft: current ? store.bind("p1", `p1:${current.version}`) : undefined,
        }),
      { wrapper, initialProps: { current: doc } },
    )
  }

  it("brings an edit back after the group unmounts and mounts again", () => {
    const store = createDraftStore<Term>()
    const first = mount(store, base)
    act(() => first.result.current.update("a", { word: "alpha edited" }))
    expect(store.keys().has("p1")).toBe(true)
    first.unmount()

    const second = mount(store, base)
    expect(second.result.current.dirty).toBe(true)
    expect(second.result.current.items[0].word).toBe("alpha edited")
    act(() => second.result.current.discard())
    expect(store.keys().has("p1")).toBe(false)
  })

  it("waits for the page to load before restoring, and never drops the kept draft meanwhile", () => {
    const store = createDraftStore<Term>()
    const first = mount(store, base)
    act(() => first.result.current.update("b", { word: "beta edited" }))
    first.unmount()

    const second = mount(store, undefined)
    expect(second.result.current.dirty).toBe(false)
    expect(store.keys().has("p1")).toBe(true)
    second.rerender({ current: base })
    expect(second.result.current.dirty).toBe(true)
    expect(second.result.current.items[1].word).toBe("beta edited")
  })

  it("forgets a kept draft from an older version of the page", () => {
    const store = createDraftStore<Term>()
    const first = mount(store, base)
    act(() => first.result.current.update("a", { word: "stale" }))
    first.unmount()

    const second = mount(store, { ...base, version: 2 })
    expect(second.result.current.dirty).toBe(false)
    expect(second.result.current.items[0].word).toBe("alpha")
  })
})
