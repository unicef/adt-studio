import { Trans } from "@lingui/react/macro"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react"
import type { ElementType, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAppVersion } from "@/hooks/use-app-version"
import { useUpdateStatus, type UpdateStatus } from "@/hooks/use-update-status"
import { formatBytes, cn } from "@/lib/utils"
import { formatVersion, getReleaseChannel } from "./release-banner-utils"

export interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  statusOverride?: UpdateStatus
  modal?: boolean
  onShowWhatsNew?: () => void
}

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

export function UpdateDialog({
  open,
  onOpenChange,
  statusOverride,
  modal,
  onShowWhatsNew,
}: UpdateDialogProps) {
  const currentVersion = useAppVersion()
  const live = useUpdateStatus()
  const status = statusOverride ?? live.status
  const { check, download, cancel, install, installOnQuit } = live

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]">
        <DialogDescription className="sr-only">
          <Trans>Software update status</Trans>
        </DialogDescription>
        <UpdateStateSurface
          status={status}
          currentVersion={currentVersion}
          TitleTag={DialogTitle}
          onCheck={check}
          onDownload={download}
          onCancel={cancel}
          onInstallNow={install}
          onInstallLater={async () => {
            await installOnQuit()
            close()
          }}
          onClose={close}
          onShowWhatsNew={onShowWhatsNew}
        />
      </DialogContent>
    </Dialog>
  )
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
          <TitleTag className="text-lg font-semibold">{view.title}</TitleTag>
          {view.subtitle && (
            <p className="max-w-[42ch] text-sm text-muted-foreground">
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
        <TitleTag className="text-lg font-semibold">{view.title}</TitleTag>
        {view.subtitle && (
          <p className="max-w-[42ch] text-sm text-muted-foreground">
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
        <WhatsNew
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
      subtitle: (
        <Trans>ADT Studio will restart to finish installing.</Trans>
      ),
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
        <span className="tabular-nums">
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
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
        tones[tone],
      )}
    >
      {children}
    </div>
  )
}

function ChannelBadge({ beta }: { beta: boolean }) {
  return (
    <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {beta ? <Trans>Beta</Trans> : <Trans>Stable</Trans>}
    </span>
  )
}

function WhatsNew({
  version,
  releaseDate,
  totalBytes,
  currentVersion,
  notes,
}: {
  version: string
  releaseDate?: string
  totalBytes?: number
  currentVersion?: string
  notes?: string
}) {
  const excerpt = releaseExcerpt(notes)
  return (
    <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3.5 text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <VersionPill>{formatVersion(currentVersion ?? "")}</VersionPill>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <VersionPill highlight>{formatVersion(version)}</VersionPill>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {totalBytes != null && <span>{formatBytes(totalBytes)}</span>}
          {totalBytes != null && releaseDate && <span aria-hidden>·</span>}
          {releaseDate && <span>{formatReleaseDate(releaseDate)}</span>}
        </div>
      </div>
      {excerpt && (
        <p className="line-clamp-1 text-sm leading-relaxed text-muted-foreground">
          {excerpt}
        </p>
      )}
    </div>
  )
}

function releaseExcerpt(notes?: string): string {
  if (!notes) return ""
  return notes
    .replace(/<picture[\s\S]*?<\/picture>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function VersionPill({
  children,
  highlight,
}: {
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
        highlight
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function IndeterminateBar() {
  return (
    <div
      aria-hidden
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}

function formatReleaseDate(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
