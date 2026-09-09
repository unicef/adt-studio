// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { useGlobalRunNotifications } from "./use-global-run-notifications"
import { setNotificationPrefs } from "./use-notification-prefs"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: { value: "/library" },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: mocks.pathname.value } }),
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) text += String(values[index])
    }
    return { id: text }
  },
}))

vi.mock("@lingui/core", () => ({
  i18n: {
    _(descriptor: { id?: string } | string) {
      return typeof descriptor === "string" ? descriptor : (descriptor.id ?? "")
    },
  },
}))

const { navigate, toastSuccess, toastError } = mocks

class FakeEventSource {
  static instances: FakeEventSource[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  readyState = FakeEventSource.CONNECTING
  closed = false
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }

  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  failFatally() {
    this.readyState = FakeEventSource.CLOSED
    this.emit("error", {})
  }

  dropTransiently() {
    this.readyState = FakeEventSource.CONNECTING
    this.emit("error", {})
  }
}

const showNotification = vi.fn(() => Promise.resolve(true))
const isWindowFocused = vi.fn(() => Promise.resolve(false))
const unsubscribeActivated = vi.fn()
let activate: ((target: { label: string; stage: string }) => void) | undefined
const onActivated = vi.fn((cb: (target: { label: string; stage: string }) => void) => {
  activate = cb
  return unsubscribeActivated
})

async function flush() {
  await vi.waitFor(() => expect(isWindowFocused).toHaveBeenCalled())
  await Promise.resolve()
  await Promise.resolve()
}

function stageEvent(type: "stage-complete" | "stage-error", stage = "sectioning") {
  return { data: JSON.stringify({ type, label: "my-book", stage }) }
}

const runSettled = { data: JSON.stringify({ label: "my-book" }) }

/** The events a single multi-stage Run produces: one per stage, then one run. */
function emitRun(source: FakeEventSource, stages: string[]) {
  for (const stage of stages) source.emit("progress", stageEvent("stage-complete", stage))
  source.emit("complete", runSettled)
}

function Harness() {
  useGlobalRunNotifications()
  return <div>root</div>
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  FakeEventSource.instances = []
  navigate.mockClear()
  toastSuccess.mockClear()
  toastError.mockClear()
  showNotification.mockClear()
  showNotification.mockImplementation(() => Promise.resolve(true))
  isWindowFocused.mockClear()
  isWindowFocused.mockImplementation(() => Promise.resolve(false))
  onActivated.mockClear()
  unsubscribeActivated.mockClear()
  activate = undefined
  mocks.pathname.value = "/library"
  localStorage.clear()

  vi.stubGlobal("EventSource", FakeEventSource)
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 adt-studio/1.0 Electron/30.0.0",
  })
  ;(window as unknown as { api: unknown }).api = {
    notifications: { show: showNotification, isWindowFocused, onActivated },
  }

  setNotificationPrefs({ osNotifications: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as unknown as { api?: unknown }).api
})

describe("useGlobalRunNotifications", () => {
  it("reconnects with capped backoff after a fatal close", () => {
    const view = render(<Harness />)
    expect(FakeEventSource.instances).toHaveLength(1)

    FakeEventSource.instances[0].failFatally()
    expect(FakeEventSource.instances).toHaveLength(1)

    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(2)

    FakeEventSource.instances[1].failFatally()
    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(3)

    view.unmount()
  })

  it("caps the backoff at 30s", () => {
    const view = render(<Harness />)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      FakeEventSource.instances.at(-1)!.failFatally()
      vi.advanceTimersByTime(30_000)
    }

    expect(FakeEventSource.instances).toHaveLength(11)

    view.unmount()
  })

  it("resets the backoff once a reconnect succeeds", () => {
    const view = render(<Harness />)

    FakeEventSource.instances[0].failFatally()
    vi.advanceTimersByTime(1_000)
    FakeEventSource.instances[1].emit("open")

    FakeEventSource.instances[1].failFatally()
    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.instances).toHaveLength(3)

    view.unmount()
  })

  it("leaves transient drops to the browser's own retry", () => {
    const view = render(<Harness />)

    FakeEventSource.instances[0].dropTransiently()
    vi.advanceTimersByTime(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)

    view.unmount()
  })

  it("stops reconnecting after unmount", () => {
    const view = render(<Harness />)
    const source = FakeEventSource.instances[0]

    source.failFatally()
    view.unmount()
    vi.advanceTimersByTime(60_000)

    expect(source.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it("fires an OS notification when the window is unfocused", async () => {
    const view = render(<Harness />)
    emitRun(FakeEventSource.instances[0], ["sectioning"])
    await flush()

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: "my-book", label: "my-book", stage: "sectioning" }),
    )
    expect(toastSuccess).not.toHaveBeenCalled()

    view.unmount()
  })

  it("stays silent while unfocused when the preference is off", async () => {
    setNotificationPrefs({ osNotifications: false })

    const view = render(<Harness />)
    emitRun(FakeEventSource.instances[0], ["sectioning"])
    await flush()

    expect(showNotification).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()

    view.unmount()
  })

  it("falls back to a toast when the OS cannot raise notifications", async () => {
    showNotification.mockImplementation(() => Promise.resolve(false))

    const view = render(<Harness />)
    emitRun(FakeEventSource.instances[0], ["sectioning"])
    await flush()

    expect(showNotification).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())

    view.unmount()
  })

  it("toasts while unfocused in the web build, which has no bridge", async () => {
    delete (window as unknown as { api?: unknown }).api
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 Chrome" })

    const view = render(<Harness />)
    emitRun(FakeEventSource.instances[0], ["sectioning"])

    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(showNotification).not.toHaveBeenCalled()

    view.unmount()
  })

  it("still subscribes and toasts with the OS preference off", async () => {
    setNotificationPrefs({ osNotifications: false })
    isWindowFocused.mockImplementation(() => Promise.resolve(true))

    const view = render(<Harness />)
    expect(FakeEventSource.instances).toHaveLength(1)

    emitRun(FakeEventSource.instances[0], ["sectioning"])
    await flush()

    expect(showNotification).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())

    view.unmount()
  })

  it("notifies once for a run that spans several stages", async () => {
    const view = render(<Harness />)

    emitRun(FakeEventSource.instances[0], ["extract", "sectioning", "storyboard"])
    await flush()

    expect(showNotification).toHaveBeenCalledOnce()
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "storyboard" }),
    )

    view.unmount()
  })

  it("says nothing when a run is cancelled", async () => {
    const view = render(<Harness />)
    const es = FakeEventSource.instances[0]

    es.emit("progress", stageEvent("stage-complete", "extract"))
    es.emit("cancelled", runSettled)
    es.emit("complete", runSettled)
    await Promise.resolve()

    expect(showNotification).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()

    view.unmount()
  })

  it("reports a failure as soon as the stage errors", async () => {
    const view = render(<Harness />)

    FakeEventSource.instances[0].emit("progress", stageEvent("stage-error"))
    await flush()

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "sectioning" }),
    )

    view.unmount()
  })

  it("offers no View action for a stage with no view", async () => {
    isWindowFocused.mockImplementation(() => Promise.resolve(true))
    const view = render(<Harness />)

    emitRun(FakeEventSource.instances[0], ["package"])
    await flush()

    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][1]).toMatchObject({ action: undefined })

    view.unmount()
  })

  it("ignores an activation for a stage with no view", () => {
    const view = render(<Harness />)

    activate?.({ label: "my-book", stage: "package" })

    expect(navigate).not.toHaveBeenCalled()

    view.unmount()
  })

  it("navigates to the stage when the OS notification is clicked", () => {
    const view = render(<Harness />)

    activate?.({ label: "my-book", stage: "sectioning" })

    expect(navigate).toHaveBeenCalledWith({
      to: "/books/$label/$step",
      params: { label: "my-book", step: "sectioning" },
    })

    view.unmount()
    expect(unsubscribeActivated).toHaveBeenCalled()
  })

  it("does not duplicate feedback for the stage the user is already watching", async () => {
    mocks.pathname.value = "/books/my-book/sectioning"
    isWindowFocused.mockImplementation(() => Promise.resolve(true))

    const view = render(<Harness />)
    emitRun(FakeEventSource.instances[0], ["sectioning"])
    await flush()

    expect(toastSuccess).not.toHaveBeenCalled()
    expect(showNotification).not.toHaveBeenCalled()

    view.unmount()
  })
})
