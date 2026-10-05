import { useEffect, useRef } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { toast } from "@/components/ui/sonner"
import { BASE_URL } from "@/api/client"
import { isElectron } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { getNotificationPrefs } from "@/hooks/use-notification-prefs"

interface StageTerminalEvent {
  type: "stage-complete" | "stage-error"
  label?: string
  stage?: string
  error?: string
}

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000

/**
 * Always-on notification listener for pipeline runs.
 *
 * The per-book hook (`use-book-run`) already plays sounds, announces for screen
 * readers, and shows error toasts while the user is inside the book that is
 * running. This hook covers the two cases it cannot:
 *
 * 1. The Electron window is not focused → OS-level notification.
 * 2. The window is focused, but the user is in another book/section → toast.
 *
 * It depends on the global `/books/events` SSE stream, which emits
 * `stage-complete` / `stage-error` events for every book.
 */
export function useGlobalRunNotifications(): void {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  // Refs so the always-on EventSource never re-subscribes on navigation.
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleStageFinished = async (
      label: string,
      stage: string,
      failed: boolean,
    ): Promise<void> => {
      const stageLabel = getStageLabelI18n(stage)
      const current = parseBookRoute(pathnameRef.current)

      const notifications = isElectron() ? window.api?.notifications : undefined
      const focused = notifications
        ? await notifications.isWindowFocused().catch(() => document.hasFocus())
        : document.hasFocus()

      if (!focused) {
        if (notifications && !getNotificationPrefs().osNotifications) return

        // `supported` only tells us the platform has a notification service at
        // all — the web build has no bridge, a Linux box without a daemon says
        // false. It cannot tell us the user granted this app permission, which
        // Electron does not expose; the Desktop alert test button in Settings
        // is how that gets discovered.
        const supported = notifications
          ? await notifications
              .show({
                title: failed
                  ? i18n._(msg`${stageLabel} failed`)
                  : i18n._(msg`${stageLabel} completed`),
                body: label,
                label,
                stage,
              })
              .catch(() => false)
          : false

        if (supported) return
      }

      // Same book + same section: the existing per-book hook already gives
      // feedback (chime/announce on success, toast + error sound on failure).
      if (current.label === label && current.step && current.step === stage) {
        return
      }

      // Same book but elsewhere in the app: success gets a toast here because
      // the per-book hook only chimes. Errors are already toasted by the
      // per-book hook, so don't duplicate them.
      if (current.label === label && failed) {
        return
      }

      const message = failed
        ? i18n._(msg`${stageLabel} failed in ${label}`)
        : i18n._(msg`${stageLabel} completed in ${label}`)

      // Pipeline stage names and routable UI slugs are not the same set:
      // "package" runs in the API but has no view, so it gets no View action
      // instead of a route that renders "Unknown step".
      const viewAction = STAGES.some((s) => s.slug === stage)
        ? {
            label: i18n._(msg`View`),
            onClick: () =>
              navigateRef.current({
                to: "/books/$label/$step",
                params: { label, step: stage },
              }),
          }
        : undefined

      if (failed) {
        toast.error(message, {
          id: `stage-notification:${label}:${stage}:error`,
          action: viewAction,
        })
      } else {
        toast.success(message, {
          id: `stage-notification:${label}:${stage}:completed`,
          action: viewAction,
        })
      }
    }

    // A single Run can span several stages (Storyboard on a fresh book queues
    // extract→storyboard), and each one emits its own stage-complete. Only the
    // run-level "complete" event means the user's action is done, so the last
    // stage seen is remembered and announced then — one notification per run.
    const lastStageByLabel = new Map<string, string>()

    const handleProgress = (e: MessageEvent) => {
      let data: StageTerminalEvent
      try {
        data = JSON.parse(e.data) as StageTerminalEvent
      } catch {
        return
      }

      if (data.type !== "stage-complete" && data.type !== "stage-error") return

      const label = typeof data.label === "string" ? data.label : ""
      const stage = typeof data.stage === "string" ? data.stage : ""
      if (!label || !stage) return

      if (data.type === "stage-complete") {
        lastStageByLabel.set(label, stage)
        return
      }

      // A failure ends the run, so it is already terminal and names the stage.
      lastStageByLabel.delete(label)
      void handleStageFinished(label, stage, true)
    }

    const handleRunSettled = (e: MessageEvent) => {
      let label = ""
      try {
        label = (JSON.parse(e.data) as { label?: string }).label ?? ""
      } catch {
        return
      }

      const stage = lastStageByLabel.get(label)
      lastStageByLabel.delete(label)
      if (!label || !stage) return

      void handleStageFinished(label, stage, false)
    }

    const handleRunCancelled = (e: MessageEvent) => {
      try {
        lastStageByLabel.delete((JSON.parse(e.data) as { label?: string }).label ?? "")
      } catch {
        /* a malformed cancel event leaves the entry for the next terminal event */
      }
    }

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectAttempt = 0
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return

      const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt++)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, delay)
    }

    // A fatal response (502/503, a non-SSE body) parks an EventSource at CLOSED
    // for good; only those need our own retry, transient drops keep using the
    // browser's.
    const connect = () => {
      if (disposed) return

      const source = new EventSource(`${BASE_URL}/books/events`)
      eventSource = source

      source.addEventListener("open", () => {
        reconnectAttempt = 0
      })

      source.addEventListener("progress", handleProgress)
      source.addEventListener("complete", handleRunSettled)
      source.addEventListener("cancelled", handleRunCancelled)

      source.addEventListener("error", () => {
        if (disposed || eventSource !== source || source.readyState !== EventSource.CLOSED) {
          return
        }
        scheduleReconnect()
      })
    }

    connect()

    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      eventSource?.close()
      eventSource = null
    }
  }, [])

  useEffect(() => {
    const notifications = isElectron() ? window.api?.notifications : undefined
    if (!notifications?.onActivated) return

    return notifications.onActivated(({ label, stage }) => {
      if (!STAGES.some((s) => s.slug === stage)) return
      navigateRef.current({
        to: "/books/$label/$step",
        params: { label, step: stage },
      })
    })
  }, [])
}

function parseBookRoute(pathname: string): { label?: string; step?: string } {
  const match = pathname.match(/^\/books\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return {}
  return {
    label: decodeURIComponent(match[1]),
    step: match[2] ? decodeURIComponent(match[2]) : undefined,
  }
}
