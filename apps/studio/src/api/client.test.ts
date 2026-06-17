// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/utils", () => ({
  isElectron: vi.fn(() => false),
}))

import { isElectron } from "@/lib/utils"
import { resolveBaseUrl } from "./client.js"

const mockedIsElectron = vi.mocked(isElectron)

describe("resolveBaseUrl", () => {
  beforeEach(() => {
    mockedIsElectron.mockReturnValue(false)
  })

  it("returns relative /api in browser dev mode", () => {
    expect(resolveBaseUrl({ protocol: "http:", hostname: "localhost" })).toBe("/api")
  })

  it("returns relative /api for standard browser origins", () => {
    expect(resolveBaseUrl({ protocol: "https:", hostname: "example.com" })).toBe("/api")
  })

  describe("when running in Electron", () => {
    beforeEach(() => {
      mockedIsElectron.mockReturnValue(true)
    })

    afterEach(() => {
      delete (window as { api?: unknown }).api
    })

    it("returns http://localhost:<port>/api using window.api.apiPort", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 5421 }
      expect(resolveBaseUrl()).toBe("http://localhost:5421/api")
    })

    it("ignores location and uses the Electron port", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 5421 }
      expect(resolveBaseUrl({ protocol: "https:", hostname: "example.com" })).toBe(
        "http://localhost:5421/api",
      )
    })

    it("reflects the current apiPort on each call", () => {
      ;(window as { api: { apiPort: number } }).api = { apiPort: 9000 }
      expect(resolveBaseUrl()).toBe("http://localhost:9000/api")
      ;(window as { api: { apiPort: number } }).api = { apiPort: 9001 }
      expect(resolveBaseUrl()).toBe("http://localhost:9001/api")
    })

    it("falls back to /api when the Electron bridge is not available", () => {
      delete (window as { api?: unknown }).api
      expect(resolveBaseUrl({ protocol: "http:", hostname: "localhost" })).toBe("/api")
    })
  })
})
