// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i]
      if (i < values.length) text += String(values[i])
    }
    return { id: text }
  },
}))

const { useProviders } = await import("./useProviders")

const OPENAI_KEY = "adt-studio-openai-key"
const AZURE_REGION = "adt-studio-azure-region"

/** What another window's write looks like to this one. */
function externalWrite(key: string | null, value: string | null) {
  if (key !== null && value !== null) window.localStorage.setItem(key, value)
  else if (key !== null) window.localStorage.removeItem(key)
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }))
}

beforeEach(() => {
  window.localStorage.clear()
  externalWrite(null, null)
})

afterEach(() => {
  window.localStorage.clear()
})

describe("credential store — cross-window sync", () => {
  it("picks up a credential written by another window", () => {
    const { result } = renderHook(() => useProviders())
    expect(result.current.credentialValue("openai", "apiKey")).toBe("")

    act(() => externalWrite(OPENAI_KEY, "sk-from-another-window"))
    expect(result.current.credentialValue("openai", "apiKey")).toBe("sk-from-another-window")
  })

  it("picks up a credential removed by another window", () => {
    const { result } = renderHook(() => useProviders())
    act(() => externalWrite(OPENAI_KEY, "sk-old"))
    expect(result.current.credentialValue("openai", "apiKey")).toBe("sk-old")

    act(() => externalWrite(OPENAI_KEY, null))
    expect(result.current.credentialValue("openai", "apiKey")).toBe("")
  })

  it("tracks every field of a multi-field provider, not just the first", () => {
    const { result } = renderHook(() => useProviders())
    act(() => externalWrite(AZURE_REGION, "brazilsouth"))
    expect(result.current.credentialValue("azure", "region")).toBe("brazilsouth")
  })

  it("re-reads when another window clears the whole store", () => {
    const { result } = renderHook(() => useProviders())
    act(() => externalWrite(OPENAI_KEY, "sk-old"))
    expect(result.current.credentialValue("openai", "apiKey")).toBe("sk-old")

    act(() => {
      window.localStorage.clear()
      window.dispatchEvent(new StorageEvent("storage", { key: null }))
    })
    expect(result.current.credentialValue("openai", "apiKey")).toBe("")
  })

  it("ignores storage events for keys that are not credentials", () => {
    const { result } = renderHook(() => useProviders())
    act(() => {
      window.localStorage.setItem(OPENAI_KEY, "sk-should-not-be-read-yet")
      window.dispatchEvent(new StorageEvent("storage", { key: "adt.theme", newValue: "dark" }))
    })
    expect(result.current.credentialValue("openai", "apiKey")).toBe("")
  })

  it("still notifies subscribers for a same-window write", () => {
    const { result } = renderHook(() => useProviders())
    act(() => result.current.setCredential("openai", "apiKey", "sk-same-window"))
    expect(result.current.credentialValue("openai", "apiKey")).toBe("sk-same-window")
    expect(window.localStorage.getItem(OPENAI_KEY)).toBe("sk-same-window")
  })
})
