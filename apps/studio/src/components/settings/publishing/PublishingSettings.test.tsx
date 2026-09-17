// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  CloudflareConnectionStatus,
  ProvisionOptions,
  ProvisionProgressEvent,
} from "@/api/client"

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

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const getCloudflareConnection = vi.fn()
const getPublications = vi.fn()
const getBookCoverUrl = vi.fn((label: string) => `/api/books/${label}/cover`)
const provisionCloudflare = vi.fn()
const disconnectCloudflare = vi.fn()
const startCloudflareOAuth = vi.fn()
const getCloudflareOAuthStatus = vi.fn()
const pickCloudflareOAuthAccount = vi.fn()

class MockApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

vi.mock("@/api/client", () => ({
  api: {
    getCloudflareConnection,
    getPublications,
    provisionCloudflare,
    disconnectCloudflare,
    startCloudflareOAuth,
    getCloudflareOAuthStatus,
    pickCloudflareOAuthAccount,
  },
  getBookCoverUrl,
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) =>
    error instanceof MockApiError ? error.code : null,
}))

const { PublishingSettings } = await import("./PublishingSettings")

const TOKEN_KEY = "adt-studio-cloudflare-token"
const ACCOUNT_KEY = "adt-studio-cloudflare-account-id"
const AUTH_METHOD_KEY = "adt-studio-cloudflare-auth-method"

function connectionStatus(
  overrides: Partial<CloudflareConnectionStatus> = {},
): CloudflareConnectionStatus {
  return {
    connected: true,
    auth_method: "token",
    worker_url: "https://adt-publish.escola-azul.workers.dev",
    worker_version: "0.1.0",
    latest_version: "0.1.0",
    upgrade_available: false,
    worker_reachable: true,
    resources: {
      account_id: "acct-123",
      account_name: "Escola Azul",
      worker_name: "adt-publish",
      workers_dev_subdomain: "escola-azul",
      d1_database_name: "adt-publish",
      d1_database_uuid: "d1-uuid",
      r2_bucket_name: "adt-publish-snapshots",
    },
    provisioned_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  }
}

function disconnectedStatus(): CloudflareConnectionStatus {
  return {
    connected: false,
    auth_method: null,
    worker_url: null,
    worker_version: null,
    latest_version: "0.1.0",
    upgrade_available: false,
    worker_reachable: false,
    resources: null,
    provisioned_at: null,
    updated_at: null,
  }
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PublishingSettings />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  getCloudflareConnection.mockResolvedValue(disconnectedStatus())
  getPublications.mockResolvedValue({
    worker_reachable: true,
    publications: [],
    totals: {
      published_count: 0,
      active_count: 0,
      total_snapshot_bytes: 0,
      snapshot_bytes_complete: true,
      total_unresolved: 0,
    },
  })
  vi.stubGlobal("open", vi.fn())
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe("PublishingSettings — connect wizard", () => {
  it("resumes OAuth provisioning after a refresh without asking the user to sign in again", async () => {
    localStorage.setItem(AUTH_METHOD_KEY, "oauth")
    getCloudflareConnection.mockResolvedValue({
      ...disconnectedStatus(),
      auth_method: "oauth",
    })

    renderSettings()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^set up publishing$/i })).toBeTruthy(),
    )
    expect(screen.queryByRole("button", { name: /connect with cloudflare/i })).toBeNull()
    expect(startCloudflareOAuth).not.toHaveBeenCalled()
  })

  it("walks from the intro to a finished setup", async () => {
    startCloudflareOAuth.mockResolvedValue({
      auth_url: "https://dash.cloudflare.com/oauth2/auth?client_id=test",
      state: "state-walk",
    })
    getCloudflareOAuthStatus.mockResolvedValue({
      status: "complete",
      account_choice_required: false,
      account_id: "acct-123",
    })

    let emit: ((event: ProvisionProgressEvent) => void) | null = null
    let finishStream: (() => void) | null = null
    provisionCloudflare.mockImplementation((_credentials: unknown, options: ProvisionOptions) => {
      emit = options.onEvent
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    renderSettings()

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Connect your Cloudflare account",
    )

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        "Set up publishing",
      ),
    )
    expect(localStorage.getItem(AUTH_METHOD_KEY)).toBe("oauth")

    fireEvent.click(screen.getByRole("button", { name: /set up publishing/i }))

    expect(provisionCloudflare).toHaveBeenCalledTimes(1)

    act(() => {
      emit?.({ type: "step", id: "verify-token", number: 1, label: "Verify", status: "running" })
    })
    expect(screen.getByTestId("provision-step-1").getAttribute("data-state")).toBe("running")
    expect(screen.getByTestId("provision-step-7").getAttribute("data-state")).toBe("pending")

    act(() => {
      emit?.({ type: "step", id: "verify-token", number: 1, label: "Verify", status: "done" })
      emit?.({
        type: "step",
        id: "find-or-create-d1",
        number: 2,
        label: "D1",
        status: "running",
      })
    })
    expect(screen.getByTestId("provision-step-1").getAttribute("data-state")).toBe("done")
    expect(screen.getByTestId("provision-step-2").getAttribute("data-state")).toBe("running")

    getCloudflareConnection.mockResolvedValue(connectionStatus())

    await act(async () => {
      emit?.({ type: "complete", connection: connectionStatus() })
      finishStream?.()
    })

    await waitFor(() => expect(document.body.textContent).toContain("Publishing is ready"))
  })

  it("maps a failed step to human guidance and resumes from it on retry", async () => {
    startCloudflareOAuth.mockResolvedValue({
      auth_url: "https://dash.cloudflare.com/oauth2/auth?client_id=test",
      state: "state-fail",
    })
    getCloudflareOAuthStatus.mockResolvedValue({
      status: "complete",
      account_choice_required: false,
      account_id: "acct-123",
    })

    let emit: ((event: ProvisionProgressEvent) => void) | null = null
    provisionCloudflare.mockImplementation((_credentials: unknown, options: ProvisionOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderSettings()

    expect(screen.getByRole("button", { name: /connect with cloudflare/i })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /set up publishing/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole("button", { name: /set up publishing/i }))

    act(() => {
      emit?.({
        type: "step",
        id: "enable-workers-dev",
        number: 6,
        label: "Enable workers.dev",
        status: "error",
      })
      emit?.({
        type: "error",
        code: "no_workers_subdomain",
        message: "Account has no workers.dev subdomain",
        step_id: "enable-workers-dev",
        resume_from_step: 6,
      })
    })

    expect(screen.getByTestId("provision-error-no_workers_subdomain")).toBeTruthy()
    expect(screen.queryByTestId("provision-step-7")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /try again/i }))

    expect(provisionCloudflare).toHaveBeenCalledTimes(2)
    expect(provisionCloudflare.mock.calls[1][1].resumeFromStep).toBe(6)
  })

  /** A stopped setup is exactly when someone wants to back out and connect a different
   *  account. Sign out was enabled only while idle, so a failure left a retry that could not
   *  work and no way off the screen. */
  it("lets the author sign out after setup stops", async () => {
    startCloudflareOAuth.mockResolvedValue({
      auth_url: "https://dash.cloudflare.com/oauth2/auth?client_id=test",
      state: "state-signout",
    })
    getCloudflareOAuthStatus.mockResolvedValue({
      status: "complete",
      account_choice_required: false,
      account_id: "acct-123",
    })

    let emit: ((event: ProvisionProgressEvent) => void) | null = null
    provisionCloudflare.mockImplementation((_credentials: unknown, options: ProvisionOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /set up publishing/i })).toBeTruthy(),
    )

    const signOut = () => screen.getByRole("button", { name: /sign out/i }) as HTMLButtonElement
    expect(signOut().disabled).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: /set up publishing/i }))
    /** While the run is in flight it stays blocked — half-provisioned is the one state where
     *  walking away really does leave a mess. */
    expect(signOut().disabled).toBe(true)

    act(() => {
      emit?.({
        type: "step",
        id: "verify-token",
        number: 1,
        label: "Verify token",
        status: "error",
      })
      emit?.({
        type: "error",
        code: "no_workers_subdomain",
        message: "Account has no workers.dev subdomain",
        step_id: "verify-token",
        resume_from_step: 1,
      })
    })

    expect(screen.getByTestId("provision-error-no_workers_subdomain")).toBeTruthy()
    expect(signOut().disabled).toBe(false)
  })

  /** The headline and the line under it are rendered by the same block, so a failure used to
   * keep the running step's detail and announce "Setup stopped — The address every share link
   * will start with." */
  it("does not describe the step that failed as though it had happened", async () => {
    startCloudflareOAuth.mockResolvedValue({
      auth_url: "https://dash.cloudflare.com/oauth2/auth?client_id=test",
      state: "state-detail",
    })
    getCloudflareOAuthStatus.mockResolvedValue({
      status: "complete",
      account_choice_required: false,
      account_id: "acct-123",
    })

    let emit: ((event: ProvisionProgressEvent) => void) | null = null
    provisionCloudflare.mockImplementation((_credentials: unknown, options: ProvisionOptions) => {
      emit = options.onEvent
      return new Promise<void>(() => {})
    })

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /set up publishing/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole("button", { name: /set up publishing/i }))

    act(() => {
      emit?.({
        type: "step",
        id: "enable-workers-dev",
        number: 6,
        label: "Enable workers.dev",
        status: "error",
      })
      emit?.({
        type: "error",
        code: "no_workers_subdomain",
        message: "Account has no workers.dev subdomain",
        step_id: "enable-workers-dev",
        resume_from_step: 6,
      })
    })

    expect(screen.getByText("Setup stopped")).toBeTruthy()
    expect(screen.queryByText(/the address every share link will start with/i)).toBeNull()
    expect(screen.getByText(/picks up where it left off/i)).toBeTruthy()
  })
})

describe("PublishingSettings — connect with Cloudflare (OAuth)", () => {
  const AUTH_URL =
    "https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7"

  function deferredStatus() {
    let resolveStatus: ((value: unknown) => void) | null = null
    getCloudflareOAuthStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve
        }),
    )
    return {
      resolve: (value: unknown) => {
        resolveStatus?.(value)
      },
    }
  }

  it("waits in the browser, then jumps straight to provisioning", async () => {
    startCloudflareOAuth.mockResolvedValue({ auth_url: AUTH_URL, state: "state-1" })
    const status = deferredStatus()
    provisionCloudflare.mockImplementation(() => new Promise<void>(() => {}))

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))

    await waitFor(() => expect(screen.getByTestId("oauth-waiting")).toBeTruthy())
    expect(screen.getByTestId("oauth-waiting").textContent).toContain(
      "Waiting for your approval in the browser",
    )
    expect(window.open).toHaveBeenCalledWith(AUTH_URL, "_blank", "noopener,noreferrer")
    expect(getCloudflareOAuthStatus).toHaveBeenCalledWith("state-1")
    expect(screen.queryByTestId("token-permission-d1")).toBeNull()

    await act(async () => {
      status.resolve({
        status: "complete",
        account_choice_required: false,
        account_id: "acct-123",
        accounts: [{ id: "acct-123", name: "Escola Azul" }],
      })
    })

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        "Set up publishing",
      ),
    )
    expect(localStorage.getItem(AUTH_METHOD_KEY)).toBe("oauth")
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /^set up publishing$/i }))
    expect(provisionCloudflare).toHaveBeenCalledTimes(1)
    expect(provisionCloudflare.mock.calls[0][0]).toEqual({})
  })

  it("signs out from setup without deleting Cloudflare resources", async () => {
    startCloudflareOAuth.mockResolvedValue({ auth_url: AUTH_URL, state: "state-sign-out" })
    getCloudflareOAuthStatus.mockResolvedValue({
      status: "complete",
      account_choice_required: false,
      account_id: "acct-123",
    })
    disconnectCloudflare.mockResolvedValue({
      forgotten: false,
      deleted_resources: false,
      oauth_cleared: true,
      connection: disconnectedStatus(),
    })

    renderSettings()
    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^sign out$/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }))

    await waitFor(() => expect(screen.getByRole("button", { name: /connect with cloudflare/i })).toBeTruthy())
    expect(disconnectCloudflare).toHaveBeenCalledWith({}, { deleteResources: false })
    expect(localStorage.getItem(AUTH_METHOD_KEY)).toBeNull()
  })

  it("asks which account to use when the login covers several", async () => {
    startCloudflareOAuth.mockResolvedValue({ auth_url: AUTH_URL, state: "state-2" })
    const status = deferredStatus()
    pickCloudflareOAuthAccount.mockResolvedValue({
      account_id: "acct-2",
      account_name: "Escola Verde",
    })

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))
    await waitFor(() => expect(screen.getByTestId("oauth-waiting")).toBeTruthy())

    await act(async () => {
      status.resolve({
        status: "complete",
        account_choice_required: true,
        account_id: null,
        accounts: [
          { id: "acct-1", name: "Escola Azul" },
          { id: "acct-2", name: "Escola Verde" },
        ],
      })
    })

    await waitFor(() => expect(screen.getByTestId("oauth-account-picker")).toBeTruthy())
    expect(document.body.textContent).toContain("Escola Verde")

    fireEvent.click(screen.getByRole("radio", { name: /escola verde/i }))
    fireEvent.click(screen.getByRole("button", { name: /use this account/i }))

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        "Set up publishing",
      ),
    )
    expect(pickCloudflareOAuthAccount).toHaveBeenCalledWith("state-2", "acct-2")
  })

  it("explains a denied consent", async () => {
    startCloudflareOAuth.mockResolvedValue({ auth_url: AUTH_URL, state: "state-3" })
    const status = deferredStatus()

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))
    await waitFor(() => expect(screen.getByTestId("oauth-waiting")).toBeTruthy())

    await act(async () => {
      status.resolve({
        status: "error",
        error: "oauth_denied",
        error_message: "Cloudflare access was not granted.",
        account_choice_required: false,
        account_id: null,
      })
    })

    await waitFor(() => expect(screen.getByTestId("oauth-error-oauth_denied")).toBeTruthy())
    expect(screen.getByTestId("oauth-error-oauth_denied").textContent).toContain(
      "Access was not granted",
    )
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  it("names the busy callback port and explains the same-computer limit", async () => {
    startCloudflareOAuth.mockRejectedValue(
      new MockApiError("Port 8976 on this computer is already in use.", 409, "oauth_port_busy"),
    )

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: /connect with cloudflare/i }))

    await waitFor(() => expect(screen.getByTestId("oauth-error-oauth_port_busy")).toBeTruthy())
    const notice = screen.getByTestId("oauth-error-oauth_port_busy")
    expect(notice.textContent).toContain("already signing in to Cloudflare")
    expect(notice.textContent).toContain("same computer")
    expect(notice.textContent).toContain("Port 8976")
  })

  it("labels the connection method on the connected card", async () => {
    localStorage.setItem(AUTH_METHOD_KEY, "oauth")
    getCloudflareConnection.mockResolvedValue(connectionStatus({ auth_method: "oauth" }))

    renderSettings()

    await waitFor(() => expect(screen.getByTestId("connection-method-oauth")).toBeTruthy())
    expect(screen.getByTestId("connection-method-oauth").textContent).toContain(
      "Connected via Cloudflare login",
    )
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})

describe("PublishingSettings — already connected", () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_KEY, "cf-token")
    localStorage.setItem(ACCOUNT_KEY, "acct-123")
  })

  it("shows the connected card instead of the wizard", async () => {
    getCloudflareConnection.mockResolvedValue(connectionStatus())

    renderSettings()

    await waitFor(() => expect(document.body.textContent).toContain("Publishing is ready"))
    await waitFor(() => expect(document.body.textContent).toContain("Nothing published yet"))
    expect(document.body.textContent).toContain("Hosted books")
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /connect with cloudflare/i })).toBeNull()
  })


  it("shows account usage and hosted books", async () => {
    getCloudflareConnection.mockResolvedValue(connectionStatus())
    getPublications.mockResolvedValue({
      worker_reachable: true,
      publications: [
        {
        token: "TokenRavenTokenRavenTokenRaven12",
        title: "A book for readers",
        book_label: "reader-book",
        book_exists: true,
        url: "https://adt-book-example.workers.dev/p/TokenRavenTokenRavenTokenRaven12",
        current_version: 2,
        version_count: 2,
        created_at: "2026-08-03T10:00:00.000Z",
        last_published_at: "2026-08-04T10:00:00.000Z",
        expires_at: null,
        revoked_at: null,
        has_access_code: false,
        access_code: null,
        comment_count: 3,
        unresolved_count: 1,
        snapshot_bytes: 2048,
          source: "worker",
        },
      ],
      totals: {
        published_count: 1,
        active_count: 1,
        total_snapshot_bytes: 2048,
        snapshot_bytes_complete: true,
        total_unresolved: 1,
      },
    })

    renderSettings()

    await waitFor(() => expect(screen.getByText("A book for readers")).toBeTruthy())
    expect(screen.getByText("Published books")).toBeTruthy()
    expect(screen.getByText("Room for 98 more")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /copy the link to a book for readers/i }),
    ).toBeTruthy()
  })

  it("offers the upgrade when a newer service version is available", async () => {
    getCloudflareConnection.mockResolvedValue(
      connectionStatus({ upgrade_available: true, latest_version: "0.2.0" }),
    )

    renderSettings()

    await waitFor(() => expect(document.body.textContent).toContain("Update available"))
    expect(screen.getByRole("button", { name: /install the update/i })).toBeTruthy()
  })

  it("keeps the saved token and explains itself when the status check fails", async () => {
    getCloudflareConnection.mockRejectedValue(new Error("Request failed: 404"))

    renderSettings()

    await waitFor(() => expect(screen.getByTestId("connection-check-error")).toBeTruthy())
    expect(screen.getByTestId("connection-check-error").textContent).toContain(
      "Request failed: 404",
    )
    expect(localStorage.getItem(TOKEN_KEY)).toBe("cf-token")
    expect(screen.getByRole("button", { name: /connect with cloudflare/i })).toBeTruthy()
  })
})
