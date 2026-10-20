// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useConnectProvider } from "./use-connect-provider"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))

describe("useConnectProvider", () => {
  it("opens the providers settings on the OpenAI card's API-key field", () => {
    renderHook(() => useConnectProvider()).result.current()
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key" },
      hash: "settings-provider-openai",
    })
  })
})
