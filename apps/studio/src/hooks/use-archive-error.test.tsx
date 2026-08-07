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
  it("explains a duplicate ADT revision without calling the valid archive invalid", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "This exact exported ADT revision is already imported",
    ))

    expect(result.current).toEqual({
      title: "This revision is already in the project",
      hint: "Nothing was changed. Open the existing project, or choose Create a new project to keep a separate copy.",
    })
  })

  it("tells the editor when a changed page structure requires a separate project", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "The edited ADT has a different page structure. Import it as a new project instead.",
    ))

    expect(result.current?.title).toBe("This publication can't be added as a revision")
    expect(result.current?.hint).toContain("Create a new project")
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
