// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { PUBLICATION_ACCESS_CODE_ALPHABET } from "@adt/types"
import type { DashboardData, DashLink, DashThread } from "./dashboard-data"

/* The Lingui macro transform rewrites macro imports to `@lingui/react` at build time, so this is
   the module the components really call. Messages arrive as `{id, message, values}` descriptors;
   the naive `{name}` swap is all these assertions need. */
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

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Plural: ({ value }: { value: number }) => <>{value}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""), ""),
    i18n: { _: (descriptor: { id?: string }) => descriptor?.id ?? "", locale: "en" },
  }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce((acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""), ""),
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="#" className={className}>
      {children}
    </a>
  ),
}))

const { SharingHandout } = await import("./SharingHandout")
const { SharingHero } = await import("./SharingHero")
const { LinkSettingsPanel } = await import("./LinkSettingsPanel")
const { SharingOverview } = await import("./SharingOverview")
const { expiryState } = await import("./LinkAccessWidget")
const { useHeldResolve, UNDO_WINDOW_MS } = await import("./use-held-resolve")

const URL = "https://adt-publish.example.workers.dev/p/abcdefghijklmnopqrstuvwxyz012345/"

function link(overrides: Partial<DashLink> = {}): DashLink {
  return {
    bookLabel: "raven",
    title: "Raven and the Sun",
    url: URL,
    liveVersion: 3,
    updatedAt: "2026-08-04T10:00:00.000Z",
    accessCode: "3MAKEX",
    expiresAt: null,
    changesWaiting: false,
    workerReachable: true,
    workerRejected: false,
    isUpdating: false,
    update: vi.fn(),
    hasAccessCode: true,
    setAccessCode: vi.fn(),
    accessBusy: false,
    setExpiry: vi.fn(),
    expiryBusy: false,
    changeFailed: false,
    revoke: vi.fn(),
    revoking: false,
    revokeError: null,
    clearFailures: vi.fn(),
    ...overrides,
  }
}

function thread(id: string, overrides: Partial<DashThread> = {}): DashThread {
  return {
    id,
    pageSectionId: "pg001_sec001",
    pageId: "pg001",
    pageNumber: 1,
    sectionNumber: 1,
    pageLabel: "Page 1 · Section 1",
    authorName: `Reader ${id}`,
    authorColor: "#e11d48",
    createdAt: "2026-08-04T10:00:00.000Z",
    lastActivityAt: "2026-08-04T10:00:00.000Z",
    body: `Comment ${id}`,
    replyCount: 0,
    lastReply: null,
    replies: [],
    resolved: false,
    resolvedAt: null,
    version: 3,
    anchor: null,
    ...overrides,
  }
}

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  const threads = overrides.allThreads ?? []
  return {
    status: "ready",
    readersStatus: "ready",
    link: link(),
    threads: threads.filter((each) => !each.resolved),
    allThreads: threads,
    readers: [],
    versions: [{ version: 3, publishedAt: "2026-08-04T10:00:00.000Z", pageCount: 24 }],
    resolve: vi.fn(() => Promise.resolve()),
    reply: vi.fn(() => Promise.resolve()),
    replying: false,
    ...overrides,
  }
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("SharingHandout", () => {
  it("copies a message with the title, the link, the code and the end date", async () => {
    render(<SharingHandout link={link({ expiresAt: "2026-09-12T00:00:00.000Z" })} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy message/i }))
    })
    const message = writeText.mock.calls[0][0] as string
    expect(message).toContain("Raven and the Sun is ready to read.")
    expect(message).toContain(`Open: ${URL}`)
    expect(message).toContain("Access code: 3MAKEX")
    expect(message).toContain("stops working on")
  })

  /** Promising a code in a message that has none would send a class to a door they cannot open. */
  it("leaves the code out of the message when the link needs none", async () => {
    render(<SharingHandout link={link({ hasAccessCode: false, accessCode: null })} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy message/i }))
    })
    expect(writeText.mock.calls[0][0]).not.toContain("Access code")
    expect(document.body.textContent).toContain("anyone with the link can open it")
  })

  /** A code set on another machine is still a lock; calling the link open would be a lie, and
   *  "Add a code" would silently replace the real one. */
  it("keeps a code it can't see locked, and never offers to add one", () => {
    render(<SharingHandout link={link({ hasAccessCode: true, accessCode: null })} />)
    expect(document.body.textContent).toContain("A code is set, but not on this computer")
    expect(screen.queryByRole("button", { name: /add a code/i })).toBeNull()
    expect(screen.getByRole("button", { name: /new code/i })).toBeTruthy()
  })

  it("asks before a new code, sends one from the safe alphabet, and says so only once it lands", () => {
    const setAccessCode = vi.fn()
    render(<SharingHandout link={link({ setAccessCode })} />)
    fireEvent.click(screen.getByRole("button", { name: /new code/i }))
    expect(setAccessCode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /generate new code/i }))

    const [code, onDone] = setAccessCode.mock.calls[0] as [string, () => void]
    expect(code).toHaveLength(6)
    for (const char of code) expect(PUBLICATION_ACCESS_CODE_ALPHABET).toContain(char)
    expect(document.body.textContent).not.toContain("New code set")
    act(() => onDone())
    expect(document.body.textContent).toContain("New code set")
  })

  it("keeps the code as it is when the author backs out", () => {
    const setAccessCode = vi.fn()
    render(<SharingHandout link={link({ setAccessCode })} />)
    fireEvent.click(screen.getByRole("button", { name: /new code/i }))
    fireEvent.click(screen.getByRole("button", { name: /keep this one/i }))
    expect(setAccessCode).not.toHaveBeenCalled()
    expect(screen.getByText("3MAKEX")).toBeTruthy()
  })

  it("holds code changes while the service is down, and says the code still works", () => {
    render(<SharingHandout link={link({ workerReachable: false })} />)
    expect((screen.getByRole("button", { name: /new code/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toContain("This code still works")
  })

  it("says the change failed rather than pretending it landed", () => {
    render(<SharingHandout link={link({ changeFailed: true })} />)
    expect(screen.getByRole("alert").textContent).toContain("didn't go through")
  })
})

describe("SharingHero", () => {
  it("says readers are current when nothing has changed since the share", () => {
    render(<SharingHero link={link()} onOpenSettings={vi.fn()} />)
    expect(document.body.textContent).toContain("Up to date")
  })

  it("raises edits waiting with an update right there", () => {
    const update = vi.fn()
    render(<SharingHero link={link({ changesWaiting: true, update })} onOpenSettings={vi.fn()} />)
    expect(document.body.textContent).toContain("Readers don't see your latest edits")
    fireEvent.click(screen.getByRole("button", { name: /update link/i }))
    expect(update).toHaveBeenCalled()
  })

  it("admits it cannot tell rather than claiming the link is current", () => {
    render(<SharingHero link={link({ changesWaiting: null })} onOpenSettings={vi.fn()} />)
    expect(document.body.textContent).not.toContain("Up to date")
    expect(document.body.textContent).not.toContain("don't see your latest edits")
  })

  /** Another Studio on the account replaced the secret: say so, and where to take it back. */
  it("says another Studio took over, not that the service is down", () => {
    render(<SharingHero link={link({ workerReachable: false, workerRejected: true })} onOpenSettings={vi.fn()} />)
    expect(document.body.textContent).toContain("Another ADT Studio took over sharing")
    expect(document.body.textContent).not.toContain("isn't answering")
  })

  /** The outage band wins the bottom edge, but the edits it hides are still worth knowing about. */
  it("keeps unsent edits in view while the service is down", () => {
    render(<SharingHero link={link({ workerReachable: false, changesWaiting: true })} onOpenSettings={vi.fn()} />)
    expect(document.body.textContent).toContain("The sharing service isn't answering.")
    expect(document.body.textContent).toContain("You've edited since this version")
  })
})

describe("LinkSettingsPanel", () => {
  it("removes the code with a null update, after asking", () => {
    const setAccessCode = vi.fn()
    render(<LinkSettingsPanel link={link({ setAccessCode })} />)
    fireEvent.click(screen.getByRole("button", { name: /remove code/i }))
    fireEvent.click(screen.getByRole("button", { name: /remove the code/i }))
    expect(setAccessCode).toHaveBeenCalledWith(null)
  })

  it("offers to add a code to an open link", () => {
    const setAccessCode = vi.fn()
    render(<LinkSettingsPanel link={link({ hasAccessCode: false, accessCode: null, setAccessCode })} />)
    fireEvent.click(screen.getByRole("button", { name: /add a code/i }))
    expect(setAccessCode.mock.calls[0][0]).toHaveLength(6)
  })

  /** A choice counts from today, so re-picking the one shown must still renew the date. */
  it("renews the end date on Save, even with the same choice", () => {
    const setExpiry = vi.fn()
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString()
    render(<LinkSettingsPanel link={link({ expiresAt: inThreeDays, setExpiry })} editEndDate />)
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(setExpiry).toHaveBeenCalledTimes(1)
    expect(Date.parse(setExpiry.mock.calls[0][0] as string)).toBeGreaterThan(Date.parse(inThreeDays))
  })

  it("can always send the latest edits", () => {
    const update = vi.fn()
    render(<LinkSettingsPanel link={link({ changesWaiting: null, update })} />)
    fireEvent.click(screen.getByRole("button", { name: /update link/i }))
    expect(update).toHaveBeenCalled()
  })

  it("changes nothing while an update is going out", () => {
    render(<LinkSettingsPanel link={link({ isUpdating: true })} />)
    for (const name of [/generate new code/i, /remove code/i, /change|add an end date/i, /stop sharing/i]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("asks before the link stops working, then revokes", () => {
    const revoke = vi.fn()
    render(<LinkSettingsPanel link={link({ revoke })} />)
    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))
    expect(revoke).not.toHaveBeenCalled()
    const confirm = screen.getAllByRole("button", { name: /stop sharing/i }).at(-1)!
    fireEvent.click(confirm)
    expect(revoke).toHaveBeenCalled()
  })

  it("shows why stopping failed", () => {
    render(<LinkSettingsPanel link={link({ revokeError: "The link is still up." })} />)
    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))
    expect(document.body.textContent).toContain("The link is still up.")
  })
})

describe("SharingOverview — waiting on you", () => {
  it("lists every waiting thread", () => {
    const threads = ["a", "b", "c", "d", "e"].map((id) => thread(id))
    render(<SharingOverview data={data({ allThreads: threads })} startedAt={null} onExtend={vi.fn()} />)
    for (const each of threads) expect(screen.getByText(each.body)).toBeTruthy()
  })

  it("resolves after the undo window, and not at all when undone", async () => {
    vi.useFakeTimers()
    const resolve = vi.fn(() => Promise.resolve())
    const threads = [thread("a"), thread("b")]
    render(<SharingOverview data={data({ allThreads: threads, resolve })} startedAt={null} onExtend={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /resolve reader a/i }))
    fireEvent.click(screen.getByRole("button", { name: /resolve reader b/i }))
    fireEvent.click(screen.getAllByRole("button", { name: /undo/i })[1])
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith("a", true)
  })

  it("says the readers can't be reached instead of that nobody came", () => {
    render(<SharingOverview data={data({ readersStatus: "error" })} startedAt={null} onExtend={vi.fn()} />)
    expect(document.body.textContent).toContain("Can't reach the readers")
    expect(document.body.textContent).not.toContain("Nobody has joined yet")
  })
})

describe("useHeldResolve", () => {
  it("keeps a thread marked until the service answers, and flags a refusal", async () => {
    vi.useFakeTimers()
    let reject: (error: Error) => void = () => undefined
    const resolve = vi.fn(() => new Promise<void>((_, fail) => (reject = fail)))
    const { result } = renderHook(() => useHeldResolve(resolve))

    act(() => result.current.hold("a"))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })
    expect(resolve).toHaveBeenCalledWith("a", true)
    expect(result.current.held.has("a")).toBe(true)

    await act(async () => {
      reject(new Error("offline"))
    })
    expect(result.current.held.has("a")).toBe(false)
    expect(result.current.failed.has("a")).toBe(true)
  })
})

describe("useHeldResolve — undo while it is being sent", () => {
  /** Once the resolve is on its way it can't be recalled, so Undo reopens it as soon as it lands. */
  it("reopens the thread after the resolve lands", async () => {
    vi.useFakeTimers()
    let land: () => void = () => undefined
    const resolve = vi.fn((_id: string, resolved: boolean) =>
      resolved ? new Promise<void>((done) => (land = done)) : Promise.resolve(),
    )
    const { result } = renderHook(() => useHeldResolve(resolve))
    act(() => result.current.hold("a"))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })
    act(() => result.current.undo("a"))
    expect(result.current.held.has("a")).toBe(false)
    await act(async () => {
      land()
    })
    expect(resolve).toHaveBeenLastCalledWith("a", false)
  })
})

describe("expiryState", () => {
  const withEnd = (expiresAt: string | null) => link({ expiresAt })
  const now = Date.parse("2026-08-10T12:00:00.000Z")

  it("counts whole days, then hours on the last day", () => {
    expect(expiryState(withEnd("2026-08-13T12:00:00.000Z"), now)).toMatchObject({ tone: "soon", days: 3 })
    expect(expiryState(withEnd("2026-08-10T17:00:00.000Z"), now)).toMatchObject({ tone: "urgent", hours: 5 })
    expect(expiryState(withEnd("2026-10-10T12:00:00.000Z"), now).tone).toBe("far")
  })

  /** Picking "30 days" sets the end exactly 30 days out; the count must say 30, not 31. */
  it("counts a link just set to 30 days as 30 days", () => {
    const end = new Date(now + 30 * 24 * 60 * 60_000).toISOString()
    expect(expiryState(withEnd(end), now + 250)).toMatchObject({ tone: "far", days: 30 })
  })

  it("says a past date has ended instead of counting an hour that isn't there", () => {
    expect(expiryState(withEnd("2026-08-09T12:00:00.000Z"), now).tone).toBe("ended")
  })

  it("treats a date it can't read as no end date", () => {
    expect(expiryState(withEnd("not a date"), now).tone).toBe("none")
    expect(expiryState(withEnd(null), now).tone).toBe("none")
  })
})
