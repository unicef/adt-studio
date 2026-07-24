import { Trans } from "@lingui/react/macro"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react"
import type { ElementType, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { UpdateStatus } from "@/hooks/use-update-status"
import { cn, formatBytes } from "@/lib/utils"
import { formatVersion, getReleaseChannel } from "./release-banner-utils"
import { IndeterminateBar, ProgressBar } from "./UpdateProgress"
import { UpdateWhatsNew } from "./UpdateWhatsNew"

type Tone = "muted" | "info" | "success" | "danger"

interface DialogView {
  tone: Tone
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  body?: ReactNode
  actions?: ReactNode
  loading?: boolean
  footerStart?: ReactNode
}

export interface UpdateStateSurfaceProps {
  status: UpdateStatus
  currentVersion?: string | null
  onCheck?: () => void
  onDownload?: () => void
  onCancel?: () => void
  onInstallNow?: () => void
  onInstallLater?: () => void
  onClose?: () => void
  onShowWhatsNew?: () => void
  TitleTag?: ElementType
}

export function UpdateStateSurface({
  status,
  currentVersion,
  onCheck,
  onDownload,
  onCancel,
  onInstallNow,
  onInstallLater,
  onClose,
  onShowWhatsNew,
  TitleTag = "h2",
}: UpdateStateSurfaceProps) {
  const noop = () => {}
  const view = buildView({
    status,
    currentVersion,
    onCheck: onCheck ?? noop,
    onDownload: onDownload ?? noop,
    onCancel: onCancel ?? noop,
    onInstallNow: onInstallNow ?? noop,
    onInstallLater: onInstallLater ?? noop,
    onClose: onClose ?? noop,
    onShowWhatsNew,
  })

  if (view.loading) {
    return (
      <div className="flex h-[20rem] max-h-[calc(100vh-2rem)] flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-7 text-center">
          <StateIcon tone={view.tone}>{view.icon}</StateIcon>
          <TitleTag className="text-balance text-lg font-semibold">
            {view.title}
          </TitleTag>
          {view.subtitle && (
            <p className="max-w-[42ch] text-pretty text-sm text-muted-foreground">
              {view.subtitle}
            </p>
          )}
          {view.body && <div className="mt-2 w-full">{view.body}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[20rem] max-h-[calc(100vh-2rem)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-5 text-center">
        <StateIcon tone={view.tone}>{view.icon}</StateIcon>
        <TitleTag className="text-balance text-lg font-semibold">
          {view.title}
        </TitleTag>
        {view.subtitle && (
          <p className="max-w-[42ch] text-pretty text-sm text-muted-foreground">
            {view.subtitle}
          </p>
        )}
        {view.body && <div className="mt-2 w-full">{view.body}</div>}
      </div>

      {view.footerStart ? (
        <div className="flex min-h-[4.5rem] shrink-0 flex-col gap-3 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {view.footerStart}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {view.actions}
          </div>
        </div>
      ) : view.actions ? (
        <div className="flex min-h-[4.5rem] shrink-0 flex-col-reverse items-stretch gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-end">
          {view.actions}
        </div>
      ) : null}
    </div>
  )
}

interface BuildViewArgs {
  status: UpdateStatus
  currentVersion: string | null | undefined
  onCheck: () => void
  onDownload: () => void
  onCancel: () => void
  onInstallNow: () => void
  onInstallLater: () => void
  onClose: () => void
  onShowWhatsNew?: () => void
}

function buildView({
  status,
  currentVersion,
  onCheck,
  onDownload,
  onCancel,
  onInstallNow,
  onInstallLater,
  onClose,
  onShowWhatsNew,
}: BuildViewArgs): DialogView {
  const current = currentVersion ?? undefined

  if (status.phase === "checking") {
    return {
      tone: "info",
      loading: true,
      icon: <Loader2 className="size-6 animate-spin" />,
      title: <Trans>Checking for updates…</Trans>,
      subtitle: <Trans>Looking for the latest version…</Trans>,
      body: <IndeterminateBar />,
    }
  }

  if (status.phase === "available") {
    const target = formatVersion(status.version)
    return {
      tone: "info",
      icon: <Sparkles className="size-6" />,
      title: <Trans>Update available</Trans>,
      subtitle: <Trans>{target} is ready to download.</Trans>,
      body: (
        <UpdateWhatsNew
          version={status.version}
          releaseDate={status.releaseDate}
          totalBytes={status.totalBytes}
          currentVersion={current}
          notes={status.releaseNotes}
        />
      ),
      actions: (
        <>
          <Button variant="outline" onClick={onClose}>
            <Trans>Skip for now</Trans>
          </Button>
          <Button onClick={onDownload}>
            <Download />
            <Trans>Download update</Trans>
          </Button>
        </>
      ),
    }
  }

  if (status.phase === "downloading") {
    const percent = clampPercent(status.percent)
    return {
      tone: "info",
      icon: <Download className="size-6" />,
      title: <Trans>Downloading update…</Trans>,
      subtitle: (
        <Trans>
          {Math.round(percent)}% · {formatBytes(status.bytesPerSecond)}/s
        </Trans>
      ),
      body: (
        <div className="space-y-2">
          <ProgressBar percent={percent} />
          <div className="text-center text-xs tabular-nums text-muted-foreground">
            {formatBytes(status.transferred)} / {formatBytes(status.total)}
          </div>
        </div>
      ),
      actions: (
        <>
          <Button variant="ghost" onClick={onClose}>
            <Trans>Hide</Trans>
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X />
            <Trans>Cancel download</Trans>
          </Button>
        </>
      ),
    }
  }

  if (status.phase === "installing") {
    return {
      tone: "info",
      loading: true,
      icon: <Loader2 className="size-6 animate-spin" />,
      title: <Trans>Installing update…</Trans>,
      subtitle: <Trans>ADT Studio will restart to finish installing.</Trans>,
      body: <IndeterminateBar />,
    }
  }

  if (status.phase === "downloaded") {
    const target = formatVersion(status.version)
    return {
      tone: "success",
      icon: <CheckCircle2 className="size-6" />,
      title: <Trans>Update ready to install</Trans>,
      subtitle: <Trans>{target} has been downloaded.</Trans>,
      actions: (
        <>
          <Button variant="outline" onClick={onInstallLater}>
            <Trans>Install on quit</Trans>
          </Button>
          <Button onClick={onInstallNow}>
            <Trans>Restart and install</Trans>
          </Button>
        </>
      ),
    }
  }

  if (status.phase === "error") {
    return {
      tone: "danger",
      icon: <AlertCircle className="size-6" />,
      title: <Trans>Couldn't check for updates</Trans>,
      subtitle: status.message,
      actions: (
        <>
          <Button variant="outline" onClick={onClose}>
            <Trans>Close</Trans>
          </Button>
          <Button onClick={onCheck}>
            <RotateCw />
            <Trans>Try again</Trans>
          </Button>
        </>
      ),
    }
  }

  return {
    tone: "success",
    icon: <CheckCircle2 className="size-6" />,
    title: <Trans>You're all set</Trans>,
    subtitle: <Trans>You're running the latest version of ADT Studio.</Trans>,
    footerStart: current ? (
      <div className="flex items-center gap-2">
        <span>
          <Trans>Version {current}</Trans>
        </span>
        <span aria-hidden>·</span>
        <ChannelBadge beta={getReleaseChannel(current) === "beta"} />
      </div>
    ) : undefined,
    actions: (
      <>
        {onShowWhatsNew && (
          <Button variant="outline" onClick={onShowWhatsNew}>
            <Sparkles />
            <Trans>What's new</Trans>
          </Button>
        )}
        <Button onClick={onClose}>
          <Trans>Done</Trans>
        </Button>
      </>
    ),
  }
}

function StateIcon({ tone, children }: { tone: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    muted: "bg-muted text-foreground",
    info: "bg-blue-500/10 text-blue-500",
    success: "bg-emerald-500/10 text-emerald-500",
    danger: "bg-destructive/10 text-destructive",
  }
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full transition-colors",
        tones[tone],
      )}
    >
      {children}
    </div>
  )
}

function ChannelBadge({ beta }: { beta: boolean }) {
  return (
    <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
      {beta ? <Trans>Beta</Trans> : <Trans>Stable</Trans>}
    </span>
  )
}

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}
