import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Bell } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { useNotificationPrefs, type ToastPosition } from "@/hooks/use-notification-prefs"
import { cn } from "@/lib/utils"
import { CARD, HEADING, LEAD, SettingRow } from "./ui"

const POSITIONS: { key: ToastPosition; label: MessageDescriptor }[] = [
  { key: "top-left", label: msg`Top left` },
  { key: "top-center", label: msg`Top center` },
  { key: "top-right", label: msg`Top right` },
  { key: "bottom-left", label: msg`Bottom left` },
  { key: "bottom-center", label: msg`Bottom center` },
  { key: "bottom-right", label: msg`Bottom right` },
]

/* eslint-disable lingui/no-unlocalized-strings -- Tailwind position utilities, not user-visible text */
const POS_CLASS: Record<ToastPosition, string> = {
  "top-left": "top-[22px] left-1.5",
  "top-center": "top-[22px] left-1/2 -translate-x-[38%]",
  "top-right": "top-[22px] right-1.5",
  "bottom-left": "bottom-1.5 left-1.5",
  "bottom-center": "bottom-1.5 left-1/2 -translate-x-[38%]",
  "bottom-right": "bottom-1.5 right-1.5",
}
/* eslint-enable lingui/no-unlocalized-strings */

export function NotificationsSection() {
  const { i18n, t } = useLingui()
  const [prefs, setPrefs] = useNotificationPrefs()

  const posLabel = i18n._(POSITIONS.find((p) => p.key === prefs.position)?.label ?? msg`Top center`)

  const sendTestToast = () => {
    toast.success(t`Test notification`, {
      description: t`This is how notifications will look and sound.`,
    })
  }

  return (
    <>
      <div className={HEADING}>
        <Trans>Notifications</Trans>
      </div>
      <div className={LEAD}>
        <Trans>Toasts appear when a stage finishes, an export is ready, or something needs attention.</Trans>
      </div>
      <div className={CARD}>
        <SettingRow
          alignStart
          title={<Trans>Position</Trans>}
          subtitle={
            <Trans>
              Click a corner to move toasts — currently <b className="text-foreground">{posLabel}</b>.
            </Trans>
          }
        >
          <div className="relative h-[140px] w-[230px] shrink-0 overflow-hidden rounded-xl border bg-muted">
            <div className="flex h-4 items-center gap-[3px] bg-neutral-700 px-1.5">
              <span className="size-[5px] rounded-full bg-[#ff5f57]" />
              <span className="size-[5px] rounded-full bg-[#febc2e]" />
              <span className="size-[5px] rounded-full bg-[#28c840]" />
            </div>
            {POSITIONS.map((p) => {
              const sel = prefs.position === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPrefs({ position: p.key })}
                  title={i18n._(p.label)}
                  className={cn(
                    "absolute flex h-[17px] w-[52px] items-center gap-[3px] rounded-[5px] border px-1",
                    POS_CLASS[p.key],
                    sel ? "border-brand-400 bg-card" : "border-transparent",
                  )}
                >
                  <span className={cn("size-[7px] shrink-0 rounded-full", sel ? "bg-brand-600" : "bg-neutral-400")} />
                  <span className="h-1 flex-1 rounded-full bg-neutral-300" />
                </button>
              )
            })}
          </div>
        </SettingRow>
        <SettingRow title={<Trans>Play a sound</Trans>} subtitle={<Trans>A soft chime when a long task completes.</Trans>}>
          <Switch checked={prefs.sound} onCheckedChange={(sound) => setPrefs({ sound })} />
        </SettingRow>
        <SettingRow title={<Trans>Auto-dismiss</Trans>} subtitle={<Trans>Hide toasts automatically after a delay.</Trans>}>
          <div className="flex items-center gap-3">
            <Select
              value={String(prefs.autoDelay)}
              onValueChange={(value) => setPrefs({ autoDelay: Number(value) })}
              disabled={!prefs.autoDismiss}
            >
              <SelectTrigger className="h-9 w-[124px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="4">
                  <Trans>after 4s</Trans>
                </SelectItem>
                <SelectItem value="6">
                  <Trans>after 6s</Trans>
                </SelectItem>
                <SelectItem value="10">
                  <Trans>after 10s</Trans>
                </SelectItem>
              </SelectContent>
            </Select>
            <Switch checked={prefs.autoDismiss} onCheckedChange={(autoDismiss) => setPrefs({ autoDismiss })} />
          </div>
        </SettingRow>
        <SettingRow title={<Trans>Try it out</Trans>} subtitle={<Trans>Send a sample notification using these settings.</Trans>}>
          <Button variant="outline" size="sm" onClick={sendTestToast}>
            <Bell className="size-3.5" />
            <Trans>Send test</Trans>
          </Button>
        </SettingRow>
      </div>
    </>
  )
}
