// @vitest-environment jsdom
import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  BookApiKeyDialogProvider,
  useBookApiKeyDialog,
} from "./BookApiKeyDialogProvider"

vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({
    apiKey: "",
    setApiKey: vi.fn(),
    anthropicKey: "",
    setAnthropicKey: vi.fn(),
    googleKey: "",
    setGoogleKey: vi.fn(),
    customBaseUrl: "",
    setCustomBaseUrl: vi.fn(),
    customApiKey: "",
    setCustomApiKey: vi.fn(),
    azureKey: "",
    setAzureKey: vi.fn(),
    azureRegion: "",
    setAzureRegion: vi.fn(),
    setGeminiKey: vi.fn(),
  }),
}))

vi.mock("./ApiKeyDialog", () => ({
  ApiKeyDialog: ({ open }: { open: boolean }) => (
    open ? <div role="dialog">api-key-dialog</div> : null
  ),
}))

function DialogTrigger() {
  const { openApiKeyDialog } = useBookApiKeyDialog()
  return <button onClick={openApiKeyDialog}>open-dialog</button>
}

describe("BookApiKeyDialogProvider", () => {
  it("opens the API key dialog for descendants of the book layout", () => {
    render(
      <BookApiKeyDialogProvider>
        <DialogTrigger />
      </BookApiKeyDialogProvider>,
    )

    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByText("open-dialog"))
    expect(screen.getByRole("dialog").textContent).toBe("api-key-dialog")
  })
})
