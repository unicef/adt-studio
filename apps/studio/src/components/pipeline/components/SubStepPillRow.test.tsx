// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { StepWarning } from "@adt/types"

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

const { SubStepPillRow } = await import("./SubStepPillRow")
const { TooltipProvider } = await import("@/components/ui/tooltip")

afterEach(cleanup)

it("AC-26: a done pill is amber with a warning only when its step has warnings", () => {
  const warnings: Record<string, StepWarning[]> = {
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
