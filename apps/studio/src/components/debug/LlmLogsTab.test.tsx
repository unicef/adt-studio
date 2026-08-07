// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const join = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let text = ""
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index]
    if (index < values.length) text += String(values[index])
  }
  return text
}

// Lingui macros are not compiled in this project's vitest pipeline (importing
// `@lingui/core/macro` here throws "executed outside the context of
// compilation"), so every studio test stubs them. These stubs mirror the real
// contract closely enough to catch the regression that matters: `msg` yields a
// descriptor, and `i18n._()` resolves it back to its message.
//
// What this CANNOT catch: whether the macro actually compiles in the app build.
// An earlier version of ParamGrid built its labels in a plain helper that took
// `t` as a parameter, which the macro never transformed — every label rendered
// blank in the real app while a friendlier mock made this test pass. The guard
// for that is `pnpm --filter @adt/studio extract`: an unextracted string never
// reaches the catalog, and CI fails on catalog drift.
vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: join(strings, ...values),
    message: join(strings, ...values),
  }),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: join,
    i18n: { _: (d: { message?: string; id?: string }) => d?.message ?? d?.id ?? "" },
  }),
}))

const { ParamGrid } = await import("./LlmLogsTab")

function renderGrid(data: Record<string, unknown>) {
  return render(<ParamGrid title="Request settings" data={data} />)
}

describe("ParamGrid", () => {
  afterEach(cleanup)

  // The point of the block: the user can tell which value is the voice, which is
  // the model, and what the tuning numbers mean.
  it("labels every parameter", () => {
    renderGrid({
      voice: "QK4xDwo9ESPHA4JNUpX3",
      model: "eleven_multilingual_v2",
      language: "es-UY",
      outputFormat: "mp3_44100_128",
      stability: 0.7,
      similarityBoost: 0.5,
      style: 0,
      contextBeforeChars: 220,
    })

    for (const label of [
      "Voice",
      "Model",
      "Language",
      "Format",
      "Stability",
      "Similarity",
      "Style",
      "Context before (chars)",
    ]) {
      expect(screen.getByText(label), `missing label: ${label}`).toBeTruthy()
    }
    expect(screen.getByText("QK4xDwo9ESPHA4JNUpX3")).toBeTruthy()
    expect(screen.getByText("mp3_44100_128")).toBeTruthy()
  })

  it("renders booleans as Yes/No rather than blank", () => {
    renderGrid({ useSpeakerBoost: true, contextBefore: true, contextAfter: false })

    expect(screen.getByText("Speaker boost")).toBeTruthy()
    expect(screen.getAllByText("Yes")).toHaveLength(2)
    expect(screen.getByText("No")).toBeTruthy()
  })

  // A style of 0 is meaningful — it's the recommended value that suppresses
  // hallucinated filler sounds — so it must not be dropped as falsy.
  it("renders a zero value", () => {
    renderGrid({ style: 0 })

    expect(screen.getByText("Style")).toBeTruthy()
    expect(screen.getByText("0")).toBeTruthy()
  })

  // A param added by a future provider must still show up, keyed by its raw
  // name, rather than being silently dropped for lacking a label.
  it("falls back to the raw key for an unlabelled parameter", () => {
    renderGrid({ someNewKnob: "abc" })

    expect(screen.getByText("someNewKnob")).toBeTruthy()
    expect(screen.getByText("abc")).toBeTruthy()
  })

  it("renders nothing when there are no parameters", () => {
    const { container } = renderGrid({})

    expect(container.textContent).toBe("")
  })
})
