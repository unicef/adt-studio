// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const STORAGE_KEY = "adt-studio-onboarding-completed"

/** Fresh module per case: the desktop answer is memoised at module scope. */
async function load() {
  vi.resetModules()
  return import("./use-onboarding")
}

function setBridge(getStatus: (() => Promise<boolean>) | undefined) {
  Object.defineProperty(window, "api", {
    value: getStatus ? { onboarding: { getStatus, open: vi.fn(), finish: vi.fn() } } : undefined,
    configurable: true,
  })
}

beforeEach(() => {
  window.localStorage.clear()
  setBridge(undefined)
})

afterEach(() => {
  window.localStorage.clear()
})

describe("resolveOnboardingCompleted", () => {
  it("believes the main process over a missing local flag", async () => {
    setBridge(async () => true)
    const { resolveOnboardingCompleted } = await load()
    await expect(resolveOnboardingCompleted()).resolves.toBe(true)
  })

  it("heals the local flag when the main process says completed", async () => {
    setBridge(async () => true)
    const { resolveOnboardingCompleted } = await load()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    await resolveOnboardingCompleted()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1")
  })

  it("believes the main process over a stale local flag that claims completion", async () => {
    window.localStorage.setItem(STORAGE_KEY, "1")
    setBridge(async () => false)
    const { resolveOnboardingCompleted } = await load()
    await expect(resolveOnboardingCompleted()).resolves.toBe(false)
  })

  it("asks the main process only once", async () => {
    const getStatus = vi.fn(async () => true)
    setBridge(getStatus)
    const { resolveOnboardingCompleted } = await load()
    await resolveOnboardingCompleted()
    await resolveOnboardingCompleted()
    await resolveOnboardingCompleted()
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it("does not memoise a not-completed answer", async () => {
    const getStatus = vi.fn(async () => false)
    setBridge(getStatus)
    const { resolveOnboardingCompleted } = await load()
    await resolveOnboardingCompleted()
    await resolveOnboardingCompleted()
    expect(getStatus).toHaveBeenCalledTimes(2)
  })

  it("falls back to the local flag with no bridge — the web build", async () => {
    const { resolveOnboardingCompleted, markOnboardingCompleted } = await load()
    await expect(resolveOnboardingCompleted()).resolves.toBe(false)
    markOnboardingCompleted()
    await expect(resolveOnboardingCompleted()).resolves.toBe(true)
  })

  it("falls back to the local flag when the bridge throws", async () => {
    window.localStorage.setItem(STORAGE_KEY, "1")
    setBridge(async () => {
      throw new Error("ipc closed")
    })
    const { resolveOnboardingCompleted } = await load()
    await expect(resolveOnboardingCompleted()).resolves.toBe(true)
  })
})
