// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useCloudflareCredentials } from "./use-cloudflare-credentials"

const TOKEN_KEY = "adt-studio-cloudflare-token"
const ACCOUNT_KEY = "adt-studio-cloudflare-account-id"

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("useCloudflareCredentials", () => {
  it("starts empty when nothing is stored", () => {
    const { result } = renderHook(() => useCloudflareCredentials())

    expect(result.current.token).toBe("")
    expect(result.current.accountId).toBe("")
    expect(result.current.hasCredentials).toBe(false)
  })

  it("reads credentials already in localStorage", () => {
    localStorage.setItem(TOKEN_KEY, "cf-token")
    localStorage.setItem(ACCOUNT_KEY, "acct-123")

    const { result } = renderHook(() => useCloudflareCredentials())

    expect(result.current.credentials).toEqual({ token: "cf-token", accountId: "acct-123" })
    expect(result.current.hasCredentials).toBe(true)
  })

  it("persists both values through setCredentials", () => {
    const { result } = renderHook(() => useCloudflareCredentials())

    act(() => {
      result.current.setCredentials({ token: "cf-token", accountId: "acct-123" })
    })

    expect(localStorage.getItem(TOKEN_KEY)).toBe("cf-token")
    expect(localStorage.getItem(ACCOUNT_KEY)).toBe("acct-123")
    expect(result.current.hasCredentials).toBe(true)
  })

  it("removes both values from localStorage on clearCredentials", () => {
    localStorage.setItem(TOKEN_KEY, "cf-token")
    localStorage.setItem(ACCOUNT_KEY, "acct-123")
    const { result } = renderHook(() => useCloudflareCredentials())

    act(() => {
      result.current.clearCredentials()
    })

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull()
    expect(result.current.hasCredentials).toBe(false)
  })

  it("needs both halves before it counts as connected", () => {
    const { result } = renderHook(() => useCloudflareCredentials())

    act(() => {
      result.current.setToken("cf-token")
    })

    expect(result.current.hasCredentials).toBe(false)

    act(() => {
      result.current.setAccountId("acct-123")
    })

    expect(result.current.hasCredentials).toBe(true)
  })
})
