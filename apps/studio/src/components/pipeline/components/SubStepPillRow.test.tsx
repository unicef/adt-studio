// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { StepWarningSource, StepWarningView } from "@adt/types"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (s: TemplateStringsArray, ...v: unknown[]) => s.reduce((r, x, i) => r + x + (v[i] ?? ""), ""),
    i18n: { _: (d: { id?: string }) => d.id ?? "" },
  }),
}))
vi.mock("@lingui/core/macro", () => ({
  msg: (s: TemplateStringsArray | { message: string }) => ({ id: Array.isArray(s) ? s.join("") : (s as { message: string }).message }),
  plural: (count: number, forms: { one: string; other: string }) => (count === 1 ? forms.one : forms.other).replace("#", String(count)),
}))
vi.mock("../pipeline-i18n", () => ({
  getStepLabelI18n: (key: string) => key,
  getStepDescriptionI18n: () => "",
}))

const { SubStepPillRow, SubStepPopoverCard } = await import("./SubStepPillRow")
const { TooltipProvider } = await import("@/components/ui/tooltip")

afterEach(cleanup)

it("AC-26: a done pill is amber with a warning only when its step has warnings", () => {
  const warnings: Record<string, StepWarningView[]> = {
    "image-segmentation": [{ kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] }],
  }
  render(
    <TooltipProvider>
      <SubStepPillRow
        subSteps={[{ key: "image-segmentation", label: "" }, { key: "image-filtering", label: "" }, { key: "image-cropping", label: "" }]}
        stepState={(key) => (key === "image-cropping" ? "running" : "done")}
        stepProgress={() => undefined}
        stepError={() => undefined}
        stepWarnings={(key) => warnings[key] ?? []}
      />
    </TooltipProvider>,
  )
  const warned = screen.getAllByLabelText("Completed with a warning")
  expect(warned).toHaveLength(1)
  expect(warned[0].closest("span")?.textContent).toContain("image-segmentation")
  expect(warned[0].closest("span")?.className).toContain("amber")
})

it("AC-26: warnings this version can't show still turn the pill amber", () => {
  render(
    <TooltipProvider>
      <SubStepPillRow
        subSteps={[{ key: "glossary", label: "" }]}
        stepState={() => "done"}
        stepProgress={() => undefined}
        stepError={() => undefined}
        stepWarnings={() => [{ kind: "unrecognized", count: 1 }]}
      />
    </TooltipProvider>,
  )
  expect(screen.getAllByLabelText("Completed with a warning")).toHaveLength(1)
})

it("shows provider text as a muted technical-details line under the translated summary", () => {
  render(
    <SubStepPopoverCard
      stepKey="image-segmentation"
      state="done"
      warnings={[{ kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] }]}
    />,
  )
  expect(screen.getByText("1 page kept its extracted images unchanged because the model call failed.")).toBeTruthy()
  expect(screen.getByText("pg002")).toBeTruthy()
  expect(screen.getByText("Technical details: HTTP 500")).toBeTruthy()
})

it("AC-27: a step completed by an older version says so in the popover and stays green", () => {
  const source: StepWarningSource = "legacy"
  render(<SubStepPopoverCard stepKey="glossary" state="done" warnings={[]} warningSource={source} />)
  expect(screen.getByText("Completed by an older version of ADT Studio; it may not have recorded every warning.")).toBeTruthy()
  expect(screen.getByText("Completed")).toBeTruthy()
})
