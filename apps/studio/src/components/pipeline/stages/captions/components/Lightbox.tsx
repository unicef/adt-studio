import { useEffect } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
} from "lucide-react"
import { BASE_URL } from "@/api/client"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { LightboxEntry } from "../lib/types"
import { NoticeStrip } from "@/components/ui/notice-strip"
import { Switch } from "@/components/ui/switch"

export function Lightbox({
  bookLabel,
  entries,
  index,
  dirty,
  saving,
  onClose,
  onNavigate,
  onCaptionChange,
  onToggleDecorative,
  onSave,
  onDiscard,
  readOnly = false,
  accent,
}: {
  bookLabel: string
  entries: LightboxEntry[]
  index: number
  dirty: boolean
  saving: boolean
  onClose: () => void
  onNavigate: (next: number) => void
  onCaptionChange: (entry: LightboxEntry, newCaption: string) => void
  onToggleDecorative: (entry: LightboxEntry) => void
  onSave: () => void
  onDiscard: () => void
  readOnly?: boolean
  accent?: string
}) {
  const { t } = useLingui()
  const entry = entries[index]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1)
      else if (e.key === "ArrowRight" && index < entries.length - 1) onNavigate(index + 1)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [index, entries.length, onNavigate])

  if (!entry) return null
  const { cap, pageNumber } = entry
  const isDecorative = cap.decorative === true
  const hasPrev = index > 0
  const hasNext = index < entries.length - 1
  if (accent) {
    return (
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0" style={{ ["--accent-hex" as string]: accent }}>
          <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-3 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-[var(--accent-hex)]" />
              <Trans>Edit description</Trans>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-[11px]">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground">{cap.imageId}</span>
              <span>{t`Page ${String(pageNumber)}`}</span>
              {entries.length > 1 && (
                <span className="ml-auto tabular-nums">
                  {index + 1} / {entries.length}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:flex-row">
            <div className="relative flex h-[58vh] flex-1 items-center justify-center rounded-xl border bg-muted/30 p-2">
              <img
                src={`${BASE_URL}/books/${bookLabel}/images/${cap.imageId}`}
                alt={isDecorative ? "" : cap.caption}
                draggable={false}
                className={`max-h-full max-w-full rounded object-contain transition-opacity duration-300 motion-reduce:transition-none ${isDecorative ? "opacity-80" : "opacity-100"}`}
              />
              {hasPrev && (
                <button
                  type="button"
                  onClick={() => onNavigate(index - 1)}
                  aria-label={t`Previous image`}
                  className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}
              {hasNext && (
                <button
                  type="button"
                  onClick={() => onNavigate(index + 1)}
                  aria-label={t`Next image`}
                  className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-3 sm:w-64">
              {isDecorative ? (
                <NoticeStrip
                  tone="attention"
                  hex={accent}
                  icon={EyeOff}
                  title={<Trans>Decorative</Trans>}
                  body={<Trans>Screen readers skip this image, so it needs no description.</Trans>}
                />
              ) : (
                <>
                  <label htmlFor={`lightbox-${cap.imageId}`} className="text-[12px] font-medium text-muted-foreground">
                    <Trans>Description</Trans>
                  </label>
                  <textarea
                    id={`lightbox-${cap.imageId}`}
                    value={cap.caption}
                    onChange={(e) => onCaptionChange(entry, e.target.value)}
                    readOnly={readOnly}
                    aria-label={t`Description of ${cap.imageId}`}
                    placeholder={t`Describe this image…`}
                    className="min-h-[160px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 read-only:bg-muted/40 read-only:text-muted-foreground focus:border-[var(--accent-hex)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-hex)_30%,transparent)] focus:outline-none"
                  />
                </>
              )}
            </aside>
          </div>

          <DialogFooter className="shrink-0 items-center border-t px-5 py-3 sm:justify-between">
            <label className={`flex shrink-0 items-center gap-2 text-[12.5px] font-medium ${readOnly ? "text-muted-foreground" : "cursor-pointer text-foreground"}`}>
              <Switch
                checked={isDecorative}
                disabled={readOnly}
                onCheckedChange={() => onToggleDecorative(entry)}
                className="h-5 w-9 data-[state=checked]:bg-[var(--accent-hex)] [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
              />
              <Trans>Decorative</Trans>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onDiscard}
                disabled={!dirty || saving}
                className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                {t`Discard`}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!dirty || saving || readOnly}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-[color-mix(in_oklab,var(--accent-hex)_85%,black)] px-3 text-[12.5px] font-semibold text-white transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--accent-hex)_75%,black)] disabled:pointer-events-none disabled:opacity-40"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Check className="size-3.5" />}
                {t`Save changes`}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <Trans>Edit caption</Trans>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-[11px]">
            <span className="font-mono font-medium text-foreground bg-muted rounded px-1.5 py-0.5">
              {cap.imageId}
            </span>
            <span>{t`Page ${String(pageNumber)}`}</span>
            {entries.length > 1 && (
              <span className="ml-auto tabular-nums">
                {index + 1} / {entries.length}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:flex-row">
          <div className="relative flex h-[58vh] flex-1 items-center justify-center rounded-lg border bg-muted/30 p-2">
            <img
              src={`${BASE_URL}/books/${bookLabel}/images/${cap.imageId}`}
              alt={isDecorative ? "" : cap.caption}
              draggable={false}
              className={`max-h-full max-w-full rounded object-contain transition-opacity duration-300 ${
                isDecorative ? "opacity-80" : "opacity-100"
              }`}
            />
            {hasPrev && (
              <button
                type="button"
                onClick={() => onNavigate(index - 1)}
                aria-label={t`Previous image`}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-muted transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={() => onNavigate(index + 1)}
                aria-label={t`Next image`}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-muted transition-colors cursor-pointer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-3 sm:w-64">
            {isDecorative ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-relaxed text-amber-700 animate-in fade-in duration-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                <Trans>
                  This image is decorative. Screen readers will skip it and no caption is needed.
                </Trans>
              </p>
            ) : (
              <>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Trans>Caption</Trans>
                </label>
                <textarea
                  value={cap.caption}
                  onChange={(e) => onCaptionChange(entry, e.target.value)}
                  readOnly={readOnly}
                  aria-label={t`Caption for ${cap.imageId}`}
                  placeholder={t`Describe this image…`}
                  className="min-h-[160px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-colors read-only:bg-muted/40 read-only:text-muted-foreground dark:focus:ring-teal-400/30"
                />
              </>
            )}
          </aside>
        </div>

        <DialogFooter className="shrink-0 items-center border-t px-5 py-3 sm:justify-between">
          <button
            type="button"
            onClick={() => onToggleDecorative(entry)}
            aria-pressed={isDecorative}
            disabled={readOnly}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition-colors cursor-pointer ${
              isDecorative
                ? "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
                : "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isDecorative ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isDecorative ? t`Decorative` : t`Mark as decorative`}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDiscard}
              disabled={!dirty || saving}
              className="text-[11px] font-medium rounded-md px-2.5 py-1.5 bg-muted hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted disabled:hover:text-foreground"
            >
              {t`Discard`}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving || readOnly}
              className="flex items-center gap-1 text-[11px] font-medium rounded-md px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white cursor-pointer transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-teal-600"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {t`Save changes`}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
