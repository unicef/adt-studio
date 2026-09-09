import { useEffect, useRef } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { toast } from "@/components/ui/sonner"
import { BASE_URL } from "@/api/client"
import { isElectron } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
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
        // Native OS notifications are opt-out in Settings → Notifications; the
        // SSE subscription and the in-app toasts below are unaffected.
        if (notifications && getNotificationPrefs().osNotifications) {
          await notifications.show({
            title: failed
              ? i18n._(msg`${stageLabel} failed`)
              : i18n._(msg`${stageLabel} completed`),
            body: label,
          })
        }
        return
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

      const viewAction = {
        label: i18n._(msg`View`),
        onClick: () =>
          navigateRef.current({
            to: "/books/$label/$step",
            params: { label, step: stage },
          }),
      }

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

      void handleStageFinished(label, stage, data.type === "stage-error")
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

    // A fatal response (502/503, a non-SSE content type) moves an EventSource to
    // CLOSED for good, so without this the session would silently lose all
    // cross-book notifications. Transient drops keep using the browser's own
    // retry, which never reaches CLOSED.
    const connect = () => {
      if (disposed) return

      const source = new EventSource(`${BASE_URL}/books/events`)
      eventSource = source

      source.addEventListener("open", () => {
        reconnectAttempt = 0
      })

      source.addEventListener("progress", handleProgress)

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
}

function parseBookRoute(pathname: string): { label?: string; step?: string } {
  const match = pathname.match(/^\/books\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return {}
  return {
    label: decodeURIComponent(match[1]),
    step: match[2] ? decodeURIComponent(match[2]) : undefined,
  }
}
