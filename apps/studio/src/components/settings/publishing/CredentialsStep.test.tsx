// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { CloudflareVerifyResponse } from "@/api/client"

vi.mock("@lingui/react/macro", () => {
  function templateToString(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  }
  return {
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({
      t: templateToString,
      i18n: { _: (descriptor: { id?: string }) => descriptor?.id ?? "" },
    }),
  }
})

vi.mock("@lingui/core/macro", () => {
  function templateToString(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    )
  }
  return {
    msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      id: templateToString(strings, ...values),
    }),
  }
})

const { CredentialsStep } = await import("./CredentialsStep")

function renderStep(overrides: Partial<React.ComponentProps<typeof CredentialsStep>> = {}) {
  return render(
    <CredentialsStep
      stepNumber={3}
      stepCount={4}
      token="cf-token"
      accountId="acct-123"
      onTokenChange={() => {}}
      onAccountIdChange={() => {}}
      onVerify={() => {}}
      isVerifying={false}
      result={null}
      errorMessage={null}
      onBack={() => {}}
      onContinue={() => {}}
      {...overrides}
    />,
  )
}

function verifyResult(overrides: Partial<CloudflareVerifyResponse> = {}): CloudflareVerifyResponse {
  return {
    ok: true,
    account_name: "Escola Azul",
    missing_scopes: [],
    workers_dev_subdomain: "escola-azul",
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("CredentialsStep", () => {
  it("labels both credential inputs and hides the token by default", () => {
    renderStep()

    const token = screen.getByLabelText("Cloudflare API token") as HTMLInputElement
    const accountId = screen.getByLabelText("Account ID") as HTMLInputElement

    expect(token.type).toBe("password")
    expect(token.value).toBe("cf-token")
    expect(accountId.value).toBe("acct-123")
  })

  it("only offers to check the token once both fields are filled", () => {
    renderStep({ token: "", accountId: "" })

    const check = screen.getByRole("button", { name: /check my token/i }) as HTMLButtonElement
    expect(check.disabled).toBe(true)
  })

  it("names the exact permissions to add when scopes are missing", () => {
    renderStep({
      result: verifyResult({
        ok: false,
        account_name: null,
        missing_scopes: ["D1:Edit", "R2:Edit"],
      }),
    })

    expect(screen.getByTestId("verify-missing-scopes")).toBeTruthy()
    expect(screen.getByTestId("token-permission-d1")).toBeTruthy()
    expect(screen.getByTestId("token-permission-r2")).toBeTruthy()
    expect(screen.queryByTestId("token-permission-workers-scripts")).toBeNull()
    expect(screen.queryByTestId("token-permission-account-settings")).toBeNull()
    expect(screen.queryByTestId("verify-success")).toBeNull()
  })

  it("still resolves a scope spelled the way Cloudflare's API writes it", () => {
    renderStep({
      result: verifyResult({
        ok: false,
        missing_scopes: ["com.cloudflare.api.account.worker.script.write" as "Workers Scripts:Edit"],
      }),
    })

    expect(screen.getByTestId("token-permission-workers-scripts")).toBeTruthy()
    expect(screen.queryByTestId("token-permission-d1")).toBeNull()
  })

  it("reports unrecognised scopes verbatim instead of dropping them", () => {
    renderStep({
      result: verifyResult({ ok: false, missing_scopes: ["something.brand.new" as "D1:Edit"] }),
    })

    expect(screen.getByTestId("verify-rejected")).toBeTruthy()
    expect(screen.queryByTestId("verify-missing-scopes")).toBeNull()
  })

  it("blocks continuing and points at Workers & Pages when the account has no subdomain", () => {
    renderStep({ result: verifyResult({ workers_dev_subdomain: null }) })

    const notice = screen.getByTestId("verify-no-subdomain")
    expect(notice).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^continue$/i })).toBeNull()
    expect(screen.getByRole("button", { name: /check again/i })).toBeTruthy()

    const link = notice.querySelector("a") as HTMLAnchorElement
    expect(link.href).toContain("dash.cloudflare.com")
  })

  it("shows the account name and unlocks continuing when verification passes", () => {
    const onContinue = vi.fn()
    renderStep({ result: verifyResult(), onContinue })

    const success = screen.getByTestId("verify-success")
    expect(success.textContent).toContain("Escola Azul")
    expect(success.textContent).toContain("https://adt-publish.escola-azul.workers.dev")

    const button = screen.getByRole("button", { name: /^continue$/i })
    button.click()
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("explains a failed request separately from a rejected token", () => {
    renderStep({ errorMessage: "Failed to fetch" })

    const error = screen.getByTestId("verify-request-error")
    expect(error.textContent).toContain("Failed to fetch")
    expect(screen.queryByTestId("verify-rejected")).toBeNull()
  })
})
