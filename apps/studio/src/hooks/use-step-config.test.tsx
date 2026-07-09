// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useStepConfig } from "./use-step-config"
import { useApiKey } from "./use-api-key"

describe("useStepConfig model inheritance", () => {
  beforeEach(() => localStorage.clear())

  it.each([
    "image_captioning",
    "glossary",
    "translation",
    "toc_generation",
  ])("uses the selected provider model for %s when there is no explicit override", async (configKey) => {
    localStorage.setItem("adt-studio-anthropic-key", "test-key")
    localStorage.setItem("adt-studio-anthropic-default-model", "anthropic:claude-haiku-4-5")

    const { result } = renderHook(() => useStepConfig({
      [configKey]: { model: "openai:gpt-5.4" },
    }, configKey, vi.fn()))

    await waitFor(() => {
      expect(result.current.model).toBe("anthropic:claude-haiku-4-5")
    })
  })

  it("ignores an unconfigured OpenAI key when choosing the default model", async () => {
    localStorage.setItem("adt-studio-openai-key", "not-a-valid-openai-key")
    localStorage.setItem("adt-studio-anthropic-key", "test-key")
    localStorage.setItem("adt-studio-anthropic-default-model", "anthropic:claude-haiku-4-5")

    const { result } = renderHook(() => useStepConfig({
      glossary: { model: "openai:gpt-5.4" },
    }, "glossary", vi.fn()))

    await waitFor(() => {
      expect(result.current.model).toBe("anthropic:claude-haiku-4-5")
    })
  })

  it("uses a configured provider explicitly selected by the user", async () => {
    localStorage.setItem("adt-studio-openai-key", "sk-test")
    localStorage.setItem("adt-studio-anthropic-key", "test-key")
    localStorage.setItem("adt-studio-active-provider", "anthropic")
    localStorage.setItem("adt-studio-anthropic-default-model", "anthropic:claude-haiku-4-5")

    const { result } = renderHook(() => useStepConfig({
      glossary: { model: "openai:gpt-5.4" },
    }, "glossary", vi.fn()))

    await waitFor(() => {
      expect(result.current.model).toBe("anthropic:claude-haiku-4-5")
    })
  })

  it("preserves an explicit step override", async () => {
    localStorage.setItem("adt-studio-anthropic-key", "test-key")

    const { result } = renderHook(() => useStepConfig({
      glossary: {
        model: "anthropic:claude-opus-4-6",
        model_override: true,
      },
    }, "glossary", vi.fn()))

    await waitFor(() => {
      expect(result.current.model).toBe("anthropic:claude-opus-4-6")
    })
  })

  it("updates mounted settings when another hook changes the selected model", async () => {
    localStorage.setItem("adt-studio-anthropic-key", "test-key")
    const merged = { translation: { model: "openai:gpt-5.4" } }
    const settings = renderHook(() => useStepConfig(merged, "translation", vi.fn()))
    const apiSettings = renderHook(() => useApiKey())

    apiSettings.result.current.setProviderDefaultModel(
      "anthropic",
      "anthropic:claude-haiku-4-5",
    )

    await waitFor(() => {
      expect(settings.result.current.model).toBe("anthropic:claude-haiku-4-5")
    })
  })

  it("does not replace a manual selection when merged config refreshes", async () => {
    localStorage.setItem("adt-studio-anthropic-key", "test-key")
    const markDirty = vi.fn()
    const { result, rerender } = renderHook(
      ({ merged }) => useStepConfig(merged, "glossary", markDirty),
      { initialProps: { merged: { glossary: { model: "openai:gpt-5.4" } } } },
    )

    result.current.onModelChange("anthropic:claude-opus-4-6")
    rerender({ merged: { glossary: { model: "openai:gpt-5.4" } } })

    await waitFor(() => {
      expect(result.current.model).toBe("anthropic:claude-opus-4-6")
      expect(result.current.configOverrides.model_override).toBe(true)
    })
  })
})
