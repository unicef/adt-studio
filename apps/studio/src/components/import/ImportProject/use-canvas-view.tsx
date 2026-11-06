import { Trans, useLingui } from "@lingui/react/macro"
import { RotateCw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FriendlyError } from "@/hooks/use-archive-error"
import { formatBytes } from "@/lib/utils"
import type { CanvasView } from "./ArchiveCanvas"
import { RepairRequest } from "../ImportReview/RepairRequest"
import { ErrorDetails } from "./ErrorDetails"
import { buildUnreadableRepairPrompt, canRepairByEditing } from "./repair-prompt"

type DropOverlay = "idle" | "dragging" | "error" | null | undefined

/** Pick what the select-step canvas shows. Drag feedback wins over everything
 * else, so dropping a new file over an error reads the same as over an empty
 * canvas. */
export function useCanvasView({
  overlay,
  reading,
  file,
  error,
  rawError,
  onBrowse,
  onRetry,
}: {
  overlay: DropOverlay
  reading: boolean
  file: File | null
  error: FriendlyError | null
  rawError: string | null
  onBrowse: () => void
  onRetry: () => void
}): CanvasView {
  const { t } = useLingui()
  const chooseAnother = (label = t`Choose another ZIP`) => (
    <Button type="button" onClick={onBrowse} className="h-9 px-4">
      <Upload aria-hidden="true" className="size-4" />
      {label}
    </Button>
  )

  if (overlay === "dragging") {
    return {
      state: "drag", tone: "drag", icon: "upload", iconTone: "brand",
      title: t`Release to read the archive`,
      message: t`One ZIP, up to 512 MiB`,
      body: null, bodyKey: "none", missingTypes: false,
    }
  }
  if (overlay === "error") {
    return {
      state: "reject", tone: "reject", icon: "reject", iconTone: "danger",
      title: t`Only ZIP files can be imported`,
      message: t`Drop a .zip exported from ADT Studio.`,
      body: null, bodyKey: "none", missingTypes: false,
    }
  }
  if (reading && file) {
    return {
      state: "reading", tone: "idle", icon: "archive", iconTone: "brand",
      title: t`Reading the archive`,
      message: `${file.name} · ${formatBytes(file.size)}`,
      body: (
        <div role="progressbar" aria-label={t`Reading the archive`} className="relative h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-border">
          <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
        </div>
      ),
      bodyKey: "reading", missingTypes: false,
    }
  }
  if (error && file) {
    const details = rawError ? <ErrorDetails message={rawError} className="max-w-[640px]" /> : null
    if (error.kind === "server") {
      return {
        state: "server", tone: "idle", icon: "alert", iconTone: "neutral",
        title: error.title, message: error.hint,
        body: (
          <>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button type="button" onClick={onRetry} className="h-9 px-4">
                <RotateCw aria-hidden="true" className="size-4" />
                <Trans>Try again</Trans>
              </Button>
              <Button type="button" variant="outline" onClick={onBrowse} className="h-9 px-4">
                <Upload aria-hidden="true" className="size-4" />
                <Trans>Choose another ZIP</Trans>
              </Button>
            </div>
            {details}
          </>
        ),
        bodyKey: "server", missingTypes: false,
      }
    }
    if (error.kind === "adt-unreadable") {
      return {
        state: "adt-unreadable", tone: "error", icon: "warning", iconTone: "danger",
        title: t`This ADT export can’t be read`,
        message: t`ADT Studio recognized ${file.name} as an ADT export, but one of its files is broken.`,
        body: (
          <>
            {rawError ? (
              <p className="max-w-[680px] rounded-lg border border-destructive/40 bg-card px-3.5 py-2.5 text-left font-mono text-xs leading-relaxed text-destructive">
                {rawError}
              </p>
            ) : null}
            {rawError && canRepairByEditing(rawError) ? (
              <RepairRequest
                text={buildUnreadableRepairPrompt(file.name, rawError)}
                className="w-full max-w-[720px] rounded-xl border border-border bg-card p-4"
                textClassName="max-h-[240px]"
                actions={(
                  <Button type="button" variant="outline" onClick={onBrowse} className="h-9 px-4">
                    <Upload aria-hidden="true" className="size-4" />
                    {t`Choose repaired ZIP`}
                  </Button>
                )}
              />
            ) : (
              chooseAnother(t`Choose repaired ZIP`)
            )}
          </>
        ),
        bodyKey: "adt-unreadable", missingTypes: false,
      }
    }
    if (error.kind === "not-recognized") {
      return {
        state: "not-recognized", tone: "error", icon: "warning", iconTone: "danger",
        title: t`ADT Studio can’t import this ZIP`,
        message: t`${file.name} doesn’t match any of the archive types below. Choose a ZIP that was exported from ADT Studio.`,
        body: <>{chooseAnother()}{details}</>,
        bodyKey: "not-recognized", missingTypes: true,
      }
    }
    return {
      state: "error", tone: "error", icon: "warning", iconTone: "danger",
      title: error.title, message: error.hint,
      body: <>{chooseAnother()}{details}</>,
      bodyKey: "error", missingTypes: false,
    }
  }
  return {
    state: "idle", tone: "idle", icon: "upload", iconTone: "neutral",
    title: t`Drop a ZIP archive here`,
    message: t`Drag it anywhere in this window, or browse your files.`,
    body: (
      <>
        <Button type="button" variant="outline" onClick={onBrowse} className="h-9 px-4">
          <Upload aria-hidden="true" className="size-4" />
          <Trans>Browse files</Trans>
        </Button>
        <span className="text-xs text-muted-foreground"><Trans>One ZIP, up to 512 MiB</Trans></span>
      </>
    ),
    bodyKey: "idle", missingTypes: false,
  }
}
