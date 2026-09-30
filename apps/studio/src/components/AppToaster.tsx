import { useEffect, useRef } from "react"
import { useSonner } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { useNotificationPrefs } from "@/hooks/use-notification-prefs"
import { playNotificationChime } from "@/lib/notification-chime"

const CHIME_TYPES = new Set(["success", "error", "warning"])

function ToastChime({ enabled }: { enabled: boolean }) {
  const { toasts } = useSonner()
  const heard = useRef(new Set<number | string>())

  useEffect(() => {
    const live = new Set(toasts.map((entry) => entry.id))
    for (const id of heard.current) {
      if (!live.has(id)) heard.current.delete(id)
    }
    for (const entry of toasts) {
      if (heard.current.has(entry.id)) continue
      heard.current.add(entry.id)
      if (enabled && entry.type && CHIME_TYPES.has(entry.type)) playNotificationChime()
    }
  }, [toasts, enabled])

  return null
}

export function AppToaster() {
  const [prefs] = useNotificationPrefs()

  return (
    <>
      <ToastChime enabled={prefs.sound} />
      <Toaster
        position={prefs.position}
        duration={prefs.autoDismiss ? prefs.autoDelay * 1000 : Infinity}
        richColors
        closeButton
      />
    </>
  )
}
