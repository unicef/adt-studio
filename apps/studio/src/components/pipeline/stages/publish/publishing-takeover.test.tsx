// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

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
      i18n: { _: (descriptor: { id?: string }) => descriptor?.id ?? "", locale: "en" },
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

/* The Lingui macro transform rewrites macro imports to `@lingui/react` at build time, so the two
   macro mocks above never intercept the components' real calls — this one does. Messages come
   through as `{id, message, values}` descriptors; interpolation here is the naive `{name}` swap,
   which is all these assertions need. */
vi.mock("@lingui/react", () => {
  const fill = (text: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce(
      (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
      text,
    )
  const resolve = (descriptor: unknown, values?: Record<string, unknown>): string => {
    if (typeof descriptor === "string") return fill(descriptor, values)
    const d = descriptor as { message?: string; id?: string; values?: Record<string, unknown> }
    return fill(d?.message ?? d?.id ?? "", values ?? d?.values)
  }
  return {
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({
      _: resolve,
      t: resolve,
      i18n: { locale: "en", _: resolve, number: (n: number) => String(n) },
    }),
    Trans: ({
      message,
      id,
      values,
      children,
    }: {
      message?: string
      id?: string
      values?: Record<string, unknown>
      children?: React.ReactNode
    }) => {
      const text = (message ?? id ?? "").replace(/<\/?\d+>/g, "")
      return <>{children ?? fill(text, values)}</>
    },
  }
})

/* jsdom has no ResizeObserver, and the takeover's artwork measures its slot with one on its
   optimistic first frame — before the height check drops it for the 0px window jsdom reports. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

/** The failure notice links into Settings, and a bare `Link` outside a router throws. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { PublishingTakeover } = await import("./PublishingTakeover")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PublishingTakeover", () => {
  function run(overrides: Record<string, unknown> = {}) {
    return {
      status: "running",
      kind: "update",
      stepStates: ["done", "running", "pending", "pending"],
      activeStep: 2,
      progress: null,
      failure: null,
      result: null,
      publish: vi.fn(),
      update: vi.fn(),
      retry: vi.fn(),
      reset: vi.fn(),
      ...overrides,
    } as never
  }

  /** The takeover reaches for the book's pages and config; a fresh client per test keeps one
   *  test's fetches out of the next. Nothing resolves in jsdom, which is the degradation the
   *  artwork is specified to survive. */
  function takeover(node: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  }

  /** Four dots, one per step — position without implied proportion — plus the one sentence that
   *  matters to an author mid-update. */
  it("shows all four steps and the reader-safety sentence", () => {
    takeover(
      <PublishingTakeover
        title="Raven"
        fromVersion={7}
        run={run()}
        elapsedMs={12_000}
        bookLabel="raven"
      />,
    )
    expect(screen.getByTestId("publish-step-meter").querySelectorAll("li")).toHaveLength(4)
    expect(document.body.textContent).toContain("readers stay on version 7")
    expect(screen.getByRole("progressbar")).toBeTruthy()
  })

  it("keeps the author's readers out of it when a run fails, and offers a retry", () => {
    const failed = run({
      status: "error",
      stepStates: ["done", "done", "error", "pending"],
      failure: { code: "upload_failed", message: "boom", stepId: "upload", resumeStep: null },
    })
    takeover(
      <PublishingTakeover
        title="Raven"
        fromVersion={7}
        run={failed}
        elapsedMs={4_000}
        bookLabel="raven"
      />,
    )
    expect(document.body.textContent).toContain("Nothing changed for your readers")
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  /** A first publish has no readers to reassure and no version to hold them on; saying either
   *  would be describing somebody else's book. */
  it("speaks to a first publish about the book, not about readers", () => {
    const first = run({ kind: "publish" })
    takeover(
      <PublishingTakeover
        title="Raven"
        fromVersion={null}
        run={first}
        elapsedMs={9_000}
        bookLabel="raven"
      />,
    )
    expect(document.body.textContent).toContain("Putting your book online")
    expect(document.body.textContent).toContain("nothing is shared until this finishes")
    expect(document.body.textContent).not.toContain("readers stay on version")
  })

  /** `update` on a failed first publish would re-run the wrong kind and drop the access code and
   *  end date the author picked; `retry` repeats the run that failed. */
  it("retries a failed first publish as a publish, and can hand the form back", () => {
    const failed = run({
      kind: "publish",
      status: "error",
      stepStates: ["done", "error", "pending", "pending"],
      failure: { code: "package_failed", message: "boom", stepId: "package", resumeStep: null },
    })
    takeover(
      <PublishingTakeover
        title="Raven"
        fromVersion={null}
        run={failed}
        elapsedMs={4_000}
        bookLabel="raven"
      />,
    )
    expect(document.body.textContent).toContain("Nothing has been shared")

    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect((failed as unknown as { retry: () => void }).retry).toHaveBeenCalledTimes(1)
    expect((failed as unknown as { update: () => void }).update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /change how you share/i }))
    expect((failed as unknown as { reset: () => void }).reset).toHaveBeenCalledTimes(1)
  })

  /** The moment between the last step and the status query catching up. Dropping to the form
   *  here would flash the question straight after the answer. */
  it("holds the screen on a finished first publish, link waiting", () => {
    const done = run({
      kind: "publish",
      status: "done",
      stepStates: ["done", "done", "done", "done"],
      activeStep: null,
      result: { publication: null, url: "https://example.workers.dev/p/abc" },
    })
    takeover(
      <PublishingTakeover
        title="Raven"
        fromVersion={null}
        run={done}
        elapsedMs={40_000}
        bookLabel="raven"
      />,
    )
    expect(document.body.textContent).toContain("Your book is online")
    expect(document.body.textContent).toContain("https://example.workers.dev/p/abc")
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull()
  })
})
