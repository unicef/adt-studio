// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { StatsTab } from "./StatsTab"

const fixture = vi.hoisted(() => ({ unknownUsageCalls: 1 }))
vi.mock("@/hooks/use-debug", () => ({
  usePipelineStats: () => ({
    data: {
      steps: [],
      pipelineRun: null,
      totals: {
        calls: 1,
        cacheHits: 0,
        cacheMisses: 1,
        inputTokens: 0,
        outputTokens: 0,
        errorCount: 0,
        skipped: 0,
        unknownUsageCalls: fixture.unknownUsageCalls,
      },
    },
  }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray) => strings.join(""),
    i18n: { locale: "en" },
  }),
}))
afterEach(cleanup)
it("does not report zero cost when provider usage is missing", () => {
  fixture.unknownUsageCalls = 1
  render(<StatsTab label="book" isRunning={false} />)
  expect(screen.getByRole("status").textContent).toContain(
    "Usage is unavailable for 1 provider calls",
  )
  expect(screen.queryByText("$0.0000")).toBeNull()
})
it("still reports measured zero usage without an unknown-usage warning", () => {
  fixture.unknownUsageCalls = 0
  render(<StatsTab label="book" isRunning={false} />)
  expect(screen.queryByRole("status")).toBeNull()
  expect(screen.getByText("$0.0000")).toBeTruthy()
})
