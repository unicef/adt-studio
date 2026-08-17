import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Bell, CheckCircle2, Volume2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { useNotificationPrefs, type ToastPosition } from "@/hooks/use-notification-prefs"
import { cn } from "@/lib/utils"
import { SettingsCard, SettingsHeading, SettingsLead, SettingRow } from "./ui"
import { SETTINGS_ANCHORS } from "./nav"

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

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
  "top-left": "top-8 left-2.5",
  "top-center": "top-8 left-1/2 -translate-x-1/2",
  "top-right": "top-8 right-2.5",
  "bottom-left": "bottom-2.5 left-2.5",
  "bottom-center": "bottom-2.5 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-2.5 right-2.5",
}
/* eslint-enable lingui/no-unlocalized-strings */

const isTop = (p: ToastPosition) => p.startsWith("top")

function PreviewToast({ position, sound, autoDismiss, autoDelay }: { position: ToastPosition; sound: boolean; autoDismiss: boolean; autoDelay: number }) {
  return (
    <div
      key={position}
      className={cn(
        "pointer-events-none absolute z-10 w-[46%] max-w-[188px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg shadow-black/10 transition-[opacity,transform] duration-300 motion-reduce:transition-none starting:opacity-0",
        EASE,
        POS_CLASS[position],
        isTop(position) ? "starting:-translate-y-2" : "starting:translate-y-2",
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <div className="h-[6px] w-[62%] rounded-full bg-foreground/70" />
          <div className="mt-1 h-[5px] w-[86%] rounded-full bg-muted-foreground/45" />
        </div>
        {sound && <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />}
      </div>
      {autoDismiss && (
        <div
          className="h-[3px] origin-left scale-x-0 bg-brand-500 transition-transform ease-linear motion-reduce:hidden starting:scale-x-100"
          style={{ transitionDuration: `${autoDelay * 1000}ms` }}
        />
      )}
    </div>
  )
}

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
      <SettingsHeading>
        <Trans>Notifications</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Toasts appear when a stage finishes, an export is ready, or something needs attention.</Trans>
      </SettingsLead>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section id={SETTINGS_ANCHORS.notificationPosition} className="scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold">
              <Trans>Position</Trans>
            </div>
            <div className="text-[12px] text-muted-foreground">
              <Trans>
                Currently <b className="font-semibold text-foreground">{posLabel}</b>
              </Trans>
            </div>
          </div>

          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border bg-gradient-to-br from-muted to-muted/40">
            <div className="absolute inset-3 overflow-hidden rounded-lg border bg-background shadow-sm">
              <div className="flex h-6 items-center gap-1.5 border-b bg-muted/60 px-2.5">
                <span className="size-[7px] rounded-full bg-[#ff5f57]" />
                <span className="size-[7px] rounded-full bg-[#febc2e]" />
                <span className="size-[7px] rounded-full bg-[#28c840]" />
              </div>
              <div className="flex h-[calc(100%-1.5rem)]">
                <div className="flex w-[30%] flex-col gap-2 border-r bg-muted/30 px-2.5 py-3">
                  <div className="size-4 rounded bg-brand-600/80" />
                  <div className="h-1.5 w-[80%] rounded-full bg-muted-foreground/25" />
                  <div className="h-1.5 w-[65%] rounded-full bg-muted-foreground/15" />
                  <div className="h-1.5 w-[72%] rounded-full bg-muted-foreground/15" />
                </div>
                <div className="flex-1 space-y-2 px-3 py-3">
                  <div className="h-2 w-[45%] rounded-full bg-muted-foreground/25" />
                  <div className="h-1.5 w-[85%] rounded-full bg-muted-foreground/15" />
                  <div className="h-1.5 w-[70%] rounded-full bg-muted-foreground/15" />
                </div>
              </div>
            </div>

            {POSITIONS.filter((p) => p.key !== prefs.position).map((p) => (
              <button
                key={p.key}
                type="button"
                aria-label={i18n._(p.label)}
                onClick={() => setPrefs({ position: p.key })}
                className={cn(
                  "group absolute z-[5] flex h-[34px] w-[46%] max-w-[188px] items-center rounded-lg border border-dashed border-transparent px-2.5 transition-all duration-200 motion-reduce:transition-none",
                  EASE,
                  "hover:border-brand-300 hover:bg-brand-50/40 motion-safe:active:scale-[0.97]",
                  POS_CLASS[p.key],
                )}
              >
                <span className="size-2 rounded-full bg-muted-foreground/25 transition-colors group-hover:bg-brand-500" />
                <span className="ml-2 h-1.5 flex-1 rounded-full bg-muted-foreground/15 transition-colors group-hover:bg-brand-400/40" />
              </button>
            ))}

            <PreviewToast position={prefs.position} sound={prefs.sound} autoDismiss={prefs.autoDismiss} autoDelay={prefs.autoDelay} />
          </div>

          <p className="mt-2.5 text-center text-[11.5px] text-muted-foreground">
            <Trans>Click any corner to move where toasts appear.</Trans>
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <SettingsCard className="py-0.5">
            <SettingRow
              anchorId={SETTINGS_ANCHORS.notificationSound}
              title={<Trans>Play a sound</Trans>}
              subtitle={<Trans>A soft chime when a long task completes.</Trans>}
            >
              <Switch checked={prefs.sound} onCheckedChange={(sound) => setPrefs({ sound })} />
            </SettingRow>
            <SettingRow
              alignStart
              anchorId={SETTINGS_ANCHORS.notificationAutoDismiss}
              title={<Trans>Auto-dismiss</Trans>}
              subtitle={<Trans>Hide toasts automatically after a delay.</Trans>}
            >
              <div className="flex items-center gap-3">
                <Select
                  value={String(prefs.autoDelay)}
                  onValueChange={(value) => setPrefs({ autoDelay: Number(value) })}
                  disabled={!prefs.autoDismiss}
                >
                  <SelectTrigger className="h-9 w-[116px]">
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
          </SettingsCard>

          <div
            id={SETTINGS_ANCHORS.notificationTest}
            className="flex scroll-mt-24 flex-col items-start gap-3 rounded-2xl border bg-card p-[18px] shadow-sm"
          >
            <div>
              <div className="text-sm font-semibold">
                <Trans>Try it out</Trans>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">
                <Trans>Fire a real notification with these settings to see and hear it.</Trans>
              </p>
            </div>
            <Button
              size="sm"
              onClick={sendTestToast}
              className={cn("transition-transform duration-150 motion-safe:active:scale-[0.97]", EASE)}
            >
              <Bell className="size-3.5" />
              <Trans>Send test notification</Trans>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
