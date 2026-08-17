import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Bell, CheckCircle2, Volume2, Timer, X } from "lucide-react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { useNotificationPrefs, type ToastPosition } from "@/hooks/use-notification-prefs"
import { usePlatform, type DesktopOS } from "@/hooks/use-platform"
import { cn } from "@/lib/utils"
import { SettingsHeading, SettingsLead } from "./ui"
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
  "top-left": "top-9 left-4",
  "top-center": "top-9 left-1/2 -translate-x-1/2",
  "top-right": "top-9 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-4 right-4",
}
/* eslint-enable lingui/no-unlocalized-strings */

const isTop = (p: ToastPosition) => p.startsWith("top")

/** Titlebar that mirrors the host OS so the preview reads as native. */
function WindowChrome({ os }: { os: DesktopOS }) {
  if (os === "windows") {
    return (
      <div className="flex h-7 items-center border-b bg-muted/60 pl-3">
        <span className="size-3 rounded-[3px] bg-brand-600/70" />
        <div className="ml-auto flex h-full items-stretch text-muted-foreground/70">
          <span className="flex w-9 items-center justify-center">
            <span className="h-px w-2.5 bg-current" />
          </span>
          <span className="flex w-9 items-center justify-center">
            <span className="size-2 rounded-[1px] border border-current" />
          </span>
          <span className="flex w-9 items-center justify-center">
            <X className="size-2.5" />
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-7 items-center gap-1.5 border-b bg-muted/60 px-3">
      <span className="size-2 rounded-full bg-[#ff5f57]" />
      <span className="size-2 rounded-full bg-[#febc2e]" />
      <span className="size-2 rounded-full bg-[#28c840]" />
    </div>
  )
}

function PreviewToast({ position, sound, autoDismiss, autoDelay }: { position: ToastPosition; sound: boolean; autoDismiss: boolean; autoDelay: number }) {
  return (
    <div
      key={position}
      className={cn(
        "pointer-events-none absolute z-10 w-[210px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg shadow-black/10 transition-[opacity,transform] duration-300 motion-reduce:transition-none starting:opacity-0",
        EASE,
        POS_CLASS[position],
        isTop(position) ? "starting:-translate-y-2" : "starting:translate-y-2",
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <div className="h-[6px] w-[58%] rounded-full bg-foreground/70" />
          <div className="mt-1.5 h-[5px] w-[85%] rounded-full bg-muted-foreground/40" />
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

function ControlTile({
  icon: Icon,
  title,
  description,
  anchorId,
  children,
}: {
  icon: typeof Bell
  title: ReactNode
  description: ReactNode
  anchorId: string
  children: ReactNode
}) {
  return (
    <div id={anchorId} className="flex scroll-mt-24 flex-col rounded-2xl border bg-card p-[18px] shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand-50 text-brand-600">
          <Icon className="size-[18px]" />
        </span>
        <div className="text-[13.5px] font-semibold">{title}</div>
      </div>
      <p className="mt-2 flex-1 text-[12px] leading-normal text-muted-foreground">{description}</p>
      <div className="mt-3.5">{children}</div>
    </div>
  )
}

export function NotificationsSection() {
  const { i18n, t } = useLingui()
  const os = usePlatform()
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

      <section id={SETTINGS_ANCHORS.notificationPosition} className="scroll-mt-24">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="text-sm font-semibold">
            <Trans>Position</Trans>
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            <Trans>
              Pick a corner — toasts appear <b className="font-semibold text-foreground">{posLabel}</b>
            </Trans>
          </div>
        </div>

        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border bg-muted/40 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-500/[0.07] to-transparent" />

          <div className="absolute inset-6 overflow-hidden rounded-xl border bg-background shadow-md ring-1 ring-black/5">
            <WindowChrome os={os} />
            <div className="flex h-[calc(100%-1.75rem)]">
              <div className="flex w-[26%] max-w-[180px] flex-col gap-2.5 border-r bg-muted/30 px-3 py-3.5">
                <div className="size-5 rounded-md bg-brand-600/80" />
                <div className="h-2 w-[78%] rounded-full bg-muted-foreground/25" />
                <div className="h-2 w-[62%] rounded-full bg-muted-foreground/15" />
                <div className="h-2 w-[70%] rounded-full bg-muted-foreground/15" />
                <div className="h-2 w-[55%] rounded-full bg-muted-foreground/15" />
              </div>
              <div className="flex-1 space-y-2.5 px-4 py-4">
                <div className="h-2.5 w-[40%] rounded-full bg-muted-foreground/25" />
                <div className="h-2 w-[82%] rounded-full bg-muted-foreground/15" />
                <div className="h-2 w-[68%] rounded-full bg-muted-foreground/15" />
                <div className="h-2 w-[74%] rounded-full bg-muted-foreground/15" />
              </div>
            </div>

            {POSITIONS.map((p) => {
              const selected = prefs.position === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-label={i18n._(p.label)}
                  aria-pressed={selected}
                  onClick={() => setPrefs({ position: p.key })}
                  className={cn(
                    "absolute z-[5] flex h-[46px] w-[210px] items-center justify-center rounded-xl transition-all duration-200 motion-reduce:transition-none",
                    EASE,
                    POS_CLASS[p.key],
                    selected
                      ? "pointer-events-none opacity-0"
                      : "border border-dashed border-muted-foreground/30 bg-muted/10 text-[10.5px] font-medium text-muted-foreground/70 hover:border-brand-400 hover:bg-brand-500/[0.07] hover:text-brand-600 motion-safe:active:scale-[0.97]",
                  )}
                >
                  {!selected && <Trans>Place here</Trans>}
                </button>
              )
            })}

            <PreviewToast position={prefs.position} sound={prefs.sound} autoDismiss={prefs.autoDismiss} autoDelay={prefs.autoDelay} />
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ControlTile
          icon={Volume2}
          anchorId={SETTINGS_ANCHORS.notificationSound}
          title={<Trans>Play a sound</Trans>}
          description={<Trans>A soft chime when a long task completes.</Trans>}
        >
          <SegmentedControl
            className="w-full"
            options={[
              { value: "off", label: t`Off` },
              { value: "on", label: t`On` },
            ]}
            value={prefs.sound ? "on" : "off"}
            onValueChange={(v) => setPrefs({ sound: v === "on" })}
          />
        </ControlTile>

        <ControlTile
          icon={Timer}
          anchorId={SETTINGS_ANCHORS.notificationAutoDismiss}
          title={<Trans>Auto-dismiss</Trans>}
          description={<Trans>Hide toasts automatically, or keep them until dismissed.</Trans>}
        >
          <SegmentedControl
            className="w-full"
            options={[
              { value: "off", label: t`Off` },
              { value: "4", label: t`4s` },
              { value: "6", label: t`6s` },
              { value: "10", label: t`10s` },
            ]}
            value={prefs.autoDismiss ? String(prefs.autoDelay) : "off"}
            onValueChange={(v) => (v === "off" ? setPrefs({ autoDismiss: false }) : setPrefs({ autoDismiss: true, autoDelay: Number(v) }))}
          />
        </ControlTile>

        <ControlTile
          icon={Bell}
          anchorId={SETTINGS_ANCHORS.notificationTest}
          title={<Trans>Try it out</Trans>}
          description={<Trans>Fire a real notification with these settings.</Trans>}
        >
          <Button
            size="sm"
            onClick={sendTestToast}
            className={cn("w-full transition-transform duration-150 motion-safe:active:scale-[0.97]", EASE)}
          >
            <Bell className="size-3.5" />
            <Trans>Send test</Trans>
          </Button>
        </ControlTile>
      </div>
    </>
  )
}
