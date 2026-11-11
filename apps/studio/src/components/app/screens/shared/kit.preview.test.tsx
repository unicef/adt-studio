// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { i18n } from "@lingui/core"
import type { BookVM } from "../../data"
import { StageBar } from "./kit"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Plural: () => null,
  useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }),
}))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray) => ({ id: s.join("") }), plural: (n: number) => String(n) }))
afterEach(cleanup)

it.each([false, true])("distinguishes unverified Preview in Library presentation (labels=%s)", labels => {
  i18n.load("en", {}); i18n.activate("en")
  const vm = { discs: [], needsRebuild: false, isNew: false, raw: { previewStatus: "unverified" } } as unknown as BookVM
  const view = render(<StageBar vm={vm} labels={labels} />)
  expect(screen.getByText("Open the book to verify Preview")).toBeTruthy()
  for (const previewStatus of ["complete", "incomplete"] as const) {
    view.rerender(<StageBar vm={{ ...vm, raw: { ...vm.raw, previewStatus } }} labels={labels} />)
    expect(screen.queryByText("Open the book to verify Preview")).toBeNull()
  }
})
