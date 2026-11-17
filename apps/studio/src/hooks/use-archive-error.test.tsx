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
      "Archive upload exceeds the 1 GiB compressed size limit",
    ))

    expect(result.current).toEqual({
      title: "This archive is too large",
      hint: "ADT Studio accepts ZIP archives up to 1 GiB compressed. Choose a smaller bundle and try again.",
    })
  })

  // F15: decided by status, whatever language or proxy wrote the message.
  it("calls a 5xx a server problem in every locale and behind a proxy", () => {
    for (const [raw, status] of [
      ["La solicitud falló: 502", 502],
      ["Échec de la requête : 504", 504],
      ["A solicitação falhou: 500", 500],
      ["Request failed: 503", 503],
    ] as const) {
      const { result } = renderHook(() => useFriendlyArchiveError(raw, status))
      expect(result.current?.kind).toBe("server")
    }
  })

  it("calls a 413 too large even without the API's message", () => {
    const { result } = renderHook(() => useFriendlyArchiveError("Request failed: 413", 413))
    expect(result.current?.title).toBe("This archive is too large")
  })

  it("still names a corrupt backup database, though the API answers it with 500", () => {
    const { result } = renderHook(() => useFriendlyArchiveError(
      "Could not read the project database. The file may be corrupted or not a valid ADT Studio project.",
      500,
    ))
    expect(result.current?.kind).not.toBe("server")
  })

  it("explains a full disk without blaming the archive", () => {
    const { result } = renderHook(() => useFriendlyArchiveError("Not enough disk space to import this archive"))
    expect(result.current).toMatchObject({ title: "Not enough disk space", kind: "server" })
  })

  it("does not quote the upload limit when what is inside the archive is too big", () => {
    for (const raw of [
      "ADT bundle exceeds the 1 GiB expanded size limit",
      "Archive entry exceeds the size limit: videos/a.mp4",
      "Archive contains too many entries",
    ]) {
      const { result } = renderHook(() => useFriendlyArchiveError(raw))
      expect(result.current?.title).toBe("This archive is too large")
      expect(result.current?.hint).not.toMatch(/MiB|GiB/)
    }
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

  it("does not blame the file for an unexpected server failure", () => {
    for (const raw of [
      "Internal server error",
      "Internal server error (reference 1a2b3c4d). Include this reference when you report the problem.",
      "Request failed: 502",
    ]) {
      const { result } = renderHook(() => useFriendlyArchiveError(raw))
      expect(result.current?.title).toBe("ADT Studio couldn't check this archive")
      expect(result.current?.hint).toContain("not necessarily in your file")
    }
  })

  it("says the server didn't answer when the request never got a response", () => {
    for (const raw of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      const { result } = renderHook(() => useFriendlyArchiveError(raw))
      expect(result.current?.kind).toBe("server")
      expect(result.current?.hint).toContain("server didn't answer")
    }
  })
})
