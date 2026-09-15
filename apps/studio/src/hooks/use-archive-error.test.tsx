// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce(
    (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
    "",
  )

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: interpolate }),
}))

const { useFriendlyArchiveError } = await import("./use-archive-error")

afterEach(cleanup)

describe("useFriendlyArchiveError", () => {
  it("states the compressed upload limit for oversized archives", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "Archive upload exceeds the 512 MiB compressed size limit",
    ))

    expect(result.current).toEqual({
      title: "This archive is too large",
      hint: "ADT Studio accepts ZIP archives up to 512 MiB compressed. Choose a smaller bundle and try again.",
    })
  })

  it("prioritizes an unsafe-path explanation over the broad ADT bundle error", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "ADT bundle contains an unsafe path",
    ))

    expect(result.current?.title).toBe("This archive can't be opened safely")
  })

  it("explains which legacy export files need repair", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "Legacy ADT export is missing assets/config.json",
    ))

    expect(result.current?.title).toBe("This legacy ADT export is incomplete")
    expect(result.current?.hint).toContain("Open the error details")
  })
})
