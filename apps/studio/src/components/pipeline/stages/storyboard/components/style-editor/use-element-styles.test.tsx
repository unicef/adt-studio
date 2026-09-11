// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { textColorClassMap } from "./class-maps"
import { ElementProvider } from "./element-context"
import { useElementStyles } from "./use-element-styles"

const options = { preserveDefaultClass: true } as const

function wrapperFor(
  classes: string[],
  onClassesChange: ReturnType<typeof vi.fn>,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ElementProvider
        value={{
          dataId: "body",
          classes,
          onClassesChange,
          deviceView: "mobile",
        }}
      >
        {children}
      </ElementProvider>
    )
  }
}

describe("useElementStyles responsive semantic defaults", () => {
  it("materializes the desktop default before adding a mobile override", () => {
    const onClassesChange = vi.fn()
    const { result } = renderHook(
      () => useElementStyles(textColorClassMap, "#111827", options),
      { wrapper: wrapperFor([], onClassesChange) },
    )

    act(() => result.current.setValue("#2563EB"))

    expect(onClassesChange).toHaveBeenCalledWith(
      "body",
      ["text-[#111827]", "max-sm:text-[#2563EB]"],
      options,
    )
  })

  it("keeps the desktop default when resetting a mobile override", () => {
    const onClassesChange = vi.fn()
    const { result } = renderHook(
      () => useElementStyles(textColorClassMap, "#111827", options),
      {
        wrapper: wrapperFor(
          ["max-sm:text-[#2563EB]"],
          onClassesChange,
        ),
      },
    )

    act(() => result.current.override?.reset())

    expect(onClassesChange).toHaveBeenCalledWith(
      "body",
      ["text-[#111827]"],
      options,
    )
  })
})
