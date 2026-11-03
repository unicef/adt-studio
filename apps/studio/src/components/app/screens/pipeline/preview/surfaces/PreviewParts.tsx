import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ExternalLink, Eye, Loader2, Maximize2, Minimize2, PencilLine, RotateCcw, X } from "lucide-react"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { PreviewStatusPanel } from "../PreviewStatusPanel"
import { PreviewViewport } from "./PreviewViewport"
import { BookLine, BookThumb, useExportBook } from "@/components/app/screens/pipeline/export/surfaces/ExportParts"
import type { PreviewSession } from "./usePreviewSession"

export const PREVIEW_ACCENT = STORYBOARD_HEX

export const toolButton =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,opacity,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100"

const NARROW_QUERY = "(max-width: 1099px)" // eslint-disable-line lingui/no-unlocalized-strings

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return narrow
}

export function PreviewPageLabel({ session, className }: { session: PreviewSession; className?: string }) {
  const { t } = useLingui()
  const text = session.page ? t`Page ${session.page.pageNumber}` : null
  return (
    <span
      className={cn("inline-grid min-w-[4.5rem] text-[12.5px] text-muted-foreground", className)}
      aria-live="polite"
      title={session.page ? t`Storyboard page ${session.page.pageNumber}. The reader counts screens, so its own numbers differ.` : undefined}
    >
      {text && (
        <span key={text} className="truncate animate-in fade-in slide-in-from-bottom-0.5 duration-200 motion-reduce:animate-none">
          {text}
        </span>
      )}
    </span>
  )
}

export function PreviewBookHeader({ label, session, compact }: { label: string; session: PreviewSession; compact?: boolean }) {
  const book = useExportBook(label)
  return (
    <span className="flex min-w-0 items-center gap-2.5" title={book.title}>
      <BookThumb src={book.cover} className="h-9 w-[26px]" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight">
          <Trans>Preview</Trans>
          <span aria-hidden className="font-normal text-muted-foreground/50">·</span>
          <PreviewPageLabel session={session} className="font-medium text-foreground/80" />
        </span>
        <BookLine label={label} className={cn("text-[11.5px] transition-opacity duration-200 max-xl:hidden", compact && "hidden")} />
      </span>
    </span>
  )
}

export function PreviewViewportSwitch({ session }: { session: PreviewSession }) {
  const ready = !!session.frameSrc
  const narrow = useNarrow()
  return (
    <div
      style={NO_DRAG_REGION}
      aria-disabled={!ready || undefined}
      className={cn("flex justify-center transition-opacity duration-300", !ready && "pointer-events-none opacity-40")}
    >
      <PreviewViewportToggle value={session.viewport} onChange={session.setViewport} variant="surface" compact={narrow} />
    </div>
  )
}

export function PreviewStatus({ session }: { session: PreviewSession }) {
  const { t } = useLingui()
  const status = session.source.pkg.status
  return (
    <span
      aria-live="polite"
      title={status === "packaging" ? t`Building the preview` : status === "ready" ? t`The preview matches your latest changes` : undefined}
      className={cn(
        "flex h-7 w-[86px] shrink-0 items-center justify-start gap-1.5 text-[12px] text-muted-foreground transition-colors duration-200",
      )}
    >
      {status === "packaging" ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <Trans>Building…</Trans>
        </>
      ) : status === "ready" ? (
        <>
          <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <Trans>Up to date</Trans>
        </>
      ) : null}
    </span>
  )
}

function LabelledTool({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  const compact = useNarrow()
  return (
    <button
      type="button"
      style={NO_DRAG_REGION}
      onClick={onClick}
      disabled={disabled}
      aria-label={hint}
      title={hint}
      className={cn(toolButton, compact ? "w-8 justify-center px-0" : "px-2.5")}
    >
      {icon}
      {!compact && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}

export function PreviewRebuildButton({ session }: { session: PreviewSession }) {
  const { t } = useLingui()
  return (
    <LabelledTool
      icon={<RotateCcw className="size-3.5" />}
      label={<Trans>Rebuild</Trans>}
      hint={t`Rebuild the preview with your latest changes`}
      onClick={session.source.pkg.repackage}
      disabled={session.source.pkg.status === "packaging"}
    />
  )
}

export function PreviewExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { t } = useLingui()
  return (
    <LabelledTool
      icon={expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      label={expanded ? <Trans>Exit full screen</Trans> : <Trans>Full screen</Trans>}
      hint={expanded ? t`Exit full screen (Esc)` : t`Full screen`}
      onClick={onToggle}
    />
  )
}

export function PreviewBrowserButton({ session }: { session: PreviewSession }) {
  const { t } = useLingui()
  return (
    <LabelledTool
      icon={<ExternalLink className="size-3.5" />}
      label={<Trans>Open in browser</Trans>}
      hint={t`Open the preview in your web browser`}
      onClick={session.openInBrowser}
      disabled={!session.frameSrc}
    />
  )
}

export function PreviewEditButton({ session }: { session: PreviewSession }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      style={{ ...NO_DRAG_REGION, background: PREVIEW_ACCENT }}
      onClick={session.editPage ?? undefined}
      disabled={!session.editPage}
      title={t`Close the preview and open this page in the storyboard`}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] outline-none transition-[filter,opacity,scale] duration-150 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100"
    >
      <PencilLine className="size-3.5" />
      <span className="min-w-[78px] text-left">{session.page ? t`Edit page ${session.page.pageNumber}` : t`Edit page`}</span>
    </button>
  )
}

export function PreviewCloseButton({ onClose, hint, className }: { onClose: () => void; hint?: string; className?: string }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      style={NO_DRAG_REGION}
      onClick={onClose}
      aria-label={t`Close the preview`}
      title={hint ?? t`Close the preview`}
      data-preview-close=""
      className={cn(toolButton, "px-2", className)}
    >
      <X className="size-4" />
    </button>
  )
}

export function PreviewBody({ session }: { session: PreviewSession }) {
  if (session.source.pkg.error) {
    return <PreviewStatusPanel hex={PREVIEW_ACCENT} error={session.source.pkg.error} onRetry={session.source.pkg.repackage} />
  }
  return (
    <PreviewViewport
      src={session.frameSrc}
      viewport={session.viewport}
      onLocation={session.onLocation}
    />
  )
}
