// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { useGuardedDraft } from "./use-guarded-draft"

it("pins the displayed version, retains a draft across query refresh and reapplies only its own changes after 409", async () => {
  const base = [{ id: "a", text: "A" }, { id: "b", text: "B" }]
  const latest = [{ id: "a", text: "A" }, { id: "b", text: "Other writer" }]
  const reload = vi.fn(async () => ({ value: latest, version: 2 }))
  const { result, rerender } = renderHook(({ value, version }) => useGuardedDraft(value, version, reload), { initialProps: { value: base, version: 1 } })
  act(() => result.current.setPending([{ ...base[0], text: "Mine" }, base[1]]))
  rerender({ value: latest, version: 2 })
  expect(result.current.baseVersion).toBe(1)
  expect(result.current.pending?.[0].text).toBe("Mine")
  await act(() => result.current.handleError(new ApiError("Conflict", 409)))
  expect(result.current.baseVersion).toBe(2)
  expect(result.current.pending).toEqual([{ id: "a", text: "Mine" }, latest[1]])
  expect(result.current.conflict).toBeNull()
  expect(reload).toHaveBeenCalledTimes(1)
})
it("retains overlapping drafts until an explicit conflict choice and does not reload on a transport failure", async () => {
  const reload = vi.fn(async () => ({ value: { title: "Other writer" }, version: 2 }))
  const { result } = renderHook(() => useGuardedDraft({ title: "Before" }, 1, reload))
  act(() => result.current.setPending({ title: "Mine" }))
  await act(() => result.current.handleError(new Error("Offline")))
  expect(result.current.pending).toEqual({ title: "Mine" })
  expect(result.current.baseVersion).toBe(1)
  expect(reload).not.toHaveBeenCalled()
  await act(() => result.current.handleError(new ApiError("Conflict", 409)))
  expect(result.current.conflict?.paths).toEqual(["/title"])
  expect(result.current.pending).toEqual({ title: "Mine" })
  act(() => result.current.resolve("latest"))
  expect(result.current.pending).toEqual({ title: "Other writer" })
  expect(result.current.conflict).toBeNull()
})

it("keeps the draft and original version if the conflict reload fails, and ignores a late reload after discard", async () => {
  let finish!: (value: { value: { title: string }; version: number }) => void
  const reload = vi.fn().mockRejectedValueOnce(new Error("Reload offline")).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const { result } = renderHook(() => useGuardedDraft({ title: "Before" }, 1, reload))
  act(() => result.current.setPending({ title: "Mine" }))
  await act(() => result.current.handleError(new ApiError("Conflict", 409)))
  expect(result.current.pending).toEqual({ title: "Mine" })
  expect(result.current.baseVersion).toBe(1)
  expect(result.current.error).toBe("Reload offline")
  let reloading!: Promise<void>
  act(() => { reloading = result.current.handleError(new ApiError("Conflict", 409)) })
  act(() => result.current.setPending(null))
  await act(async () => { finish({ value: { title: "Other" }, version: 2 }); await reloading })
  expect(result.current.pending).toBeNull()
  expect(result.current.conflict).toBeNull()
})

it.each(["draft", "latest"] as const)("retains edits typed after the conflict before choosing %s", async (choice) => {
  const base = { title: "Before", note: "Original note" }
  const reload = vi.fn(async () => ({ value: { ...base, title: "Other writer" }, version: 2 }))
  const { result } = renderHook(() => useGuardedDraft(base, 1, reload))
  act(() => result.current.setPending({ ...base, title: "Mine" }))
  await act(() => result.current.handleError(new ApiError("Conflict", 409)))
  act(() => result.current.setPending((pending) => ({ ...pending!, note: "Typed after conflict" })))
  act(() => result.current.resolve(choice))
  expect(result.current.pending).toEqual({ title: choice === "draft" ? "Mine" : "Other writer", note: "Typed after conflict" })
})
