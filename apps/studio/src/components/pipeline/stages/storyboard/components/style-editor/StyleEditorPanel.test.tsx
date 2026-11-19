// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { StyleEditorPanel } from "./StyleEditorPanel"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
        ""
      )
    },
  }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    message: strings.reduce(
      (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
      ""
    ),
  }),
}))

vi.mock("@lingui/react", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useLingui: () => {
    const translate = (message: { id?: string } | string) =>
      typeof message === "string" ? message : (message.id ?? "")
    return {
      _: translate,
      i18n: { _: translate },
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
        ""
      )
    },
    }
  },
}))

vi.mock("./sections/AudioSection", () => ({
  AudioSection: () => <div>Element audio</div>,
}))

afterEach(cleanup)

describe("StyleEditorPanel inherited prune (#596)", () => {
  it("shows a disabled explanation instead of removing the inherited prune control", () => {
    const { container } = render(
      <StyleEditorPanel
        open
        onClose={vi.fn()}
        selectedDataId="hidden-child"
        selectedTagName="p"
        elementClasses={[]}
        elementProps={{
          isImage: false,
          isContainer: false,
          isPruned: true,
          ancestorPruned: true,
        }}
        onClassesChange={vi.fn()}
        deviceView="desktop"
      />
    )

    const toggle = container.querySelector("header button[disabled]")
    expect(toggle).not.toBeNull()
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
    expect(toggle?.parentElement?.getAttribute("title")).toBe(toggle?.getAttribute("aria-label"))
  })

  it("does not offer element audio for a pruned image", () => {
    const { container } = render(
      <StyleEditorPanel
        open
        onClose={vi.fn()}
        selectedDataId="pg001_im001"
        selectedTagName="img"
        elementClasses={[]}
        elementProps={{
          isImage: true,
          isContainer: false,
          isPruned: true,
        }}
        onClassesChange={vi.fn()}
        deviceView="desktop"
        pageId="pg001"
        isFixedLayout
      />
    )

    expect(container.textContent).not.toContain("Element audio")
  })

  it("offers element audio for a rendered image", () => {
    const { container } = render(
      <StyleEditorPanel
        open
        onClose={vi.fn()}
        selectedDataId="pg001_im001"
        selectedTagName="img"
        elementClasses={[]}
        elementProps={{
          isImage: true,
          isContainer: false,
          isPruned: false,
        }}
        onClassesChange={vi.fn()}
        deviceView="desktop"
        pageId="pg001"
        isFixedLayout
      />
    )

    expect(container.textContent).toContain("Element audio")
  })
})
