import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { api } from "@/api/client"
import { cloudflareConnectionKey } from "./use-cloudflare-connection"

const POLL_MS = 2000

/** How many setup screens are mounted. The run is worth announcing only when nobody is
 *  watching it happen. */
let watchers = 0

export function useProvisionScreenPresence(): void {
  useEffect(() => {
    watchers += 1
    return () => {
      watchers -= 1
    }
  }, [])
}

function unattended(): boolean {
  return watchers === 0 || document.hidden
}

/** Lets the watcher sleep until there is something to watch. The terminal snapshot outlives
 *  the run it describes, so polling on a timer would mean either re-reading a settled run
 *  forever or missing one that starts later. */
const listeners = new Set<() => void>()

export function notifyProvisionRunStarted(): void {
  for (const listen of listeners) listen()
}

const DONE = msg`Sharing is ready`
const DONE_DETAIL = msg`Your Cloudflare account is set up. You can start sharing books.`
const STOPPED = msg`Setup stopped`
const STOPPED_DETAIL = msg`Nothing after the failed step ran. Open Sharing to try again.`

/**
 * Follows a provisioning run to its end even when the wizard is closed, and says how it went.
 *
 * Setup takes a minute or two and keeps going on the server after the browser stops watching,
 * so somebody who starts it and walks off to another screen would otherwise never learn the
 * outcome. Only a run this session actually saw running is announced: the server keeps the
 * last snapshot around, and a finished run must not greet every future page load with a toast.
 */
export function useProvisionRunNotice(): void {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let polling = false
    let sawRunning = false

    const poll = async () => {
      if (cancelled) return
      polling = true
      try {
        const { run } = await api.getCloudflareProvisionRun()
        if (cancelled || !run) {
          polling = false
          return
        }

        if (run.status === "running") {
          sawRunning = true
          timer = window.setTimeout(() => void poll(), POLL_MS)
          return
        }

        polling = false
        if (!sawRunning) return
        sawRunning = false
        if (!unattended()) return

        if (run.status === "done") {
          queryClient.invalidateQueries({ queryKey: cloudflareConnectionKey })
          toast.success(i18n._(DONE), { description: i18n._(DONE_DETAIL) })
        } else {
          toast.error(i18n._(STOPPED), { description: i18n._(STOPPED_DETAIL) })
        }
      } catch {
        polling = false
        /* a missed read just means no toast; the screen itself still tells the story */
      }
    }

    /** One read on mount catches a run already going when the app opened. */
    void poll()

    const wake = () => {
      if (!polling) void poll()
    }
    listeners.add(wake)
    return () => {
      cancelled = true
      listeners.delete(wake)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [i18n, queryClient])
}
