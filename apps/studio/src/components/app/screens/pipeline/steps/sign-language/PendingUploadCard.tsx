import { useEffect, useRef } from "react"
import { RotateCw, TriangleAlert, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"
import { RowAction, StepCard } from "../shared/ui"
import { formatSize } from "./formatSize"
import type { PendingUpload } from "./useVideoUploads"

function ProgressRing({ hex, state }: { hex: string; state: PendingUpload["state"] }) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  return (
    <svg viewBox="0 0 36 36" className="size-10" aria-hidden>
      <circle cx="18" cy="18" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/15" strokeDasharray={state === "queued" ? "3 4" : undefined} />
      {state === "uploading" && (
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={hex}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.3} ${circumference}`}
          className="origin-center animate-spin [animation-duration:1.1s] motion-reduce:animate-none"
        />
      )}
    </svg>
  )
}

export function PendingUploadCard({
  item,
  hex,
  target,
  onRetry,
  onDismiss,
}: {
  item: PendingUpload
  hex: string
  target: SectionEntry | null
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const { t, i18n } = useLingui()
  const ref = useRef<HTMLDivElement>(null)
  const failed = item.state === "failed"

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [])

  return (
    <div ref={ref} className="animate-in fade-in zoom-in-[0.98] duration-300 motion-reduce:animate-none">
      <StepCard accent={failed ? undefined : hex} className={cn("h-full", failed && "border-destructive/40")}>
        <div
          role={failed ? "alert" : "status"}
          className={cn(
            "relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border",
            failed ? "bg-destructive/5" : "bg-neutral-900 text-white",
          )}
        >
          {failed ? (
            <div className="flex max-w-[85%] flex-col items-center gap-1.5 text-center">
              <TriangleAlert className="size-5 text-destructive" />
              <p className="text-[12.5px] font-semibold text-foreground">
                {item.videoId ? <Trans>Uploaded, but not placed on its page</Trans> : <Trans>Couldn't upload the video</Trans>}
              </p>
              <p className="line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">{item.error}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ProgressRing hex={hex} state={item.state} />
              <span className="text-[12px] font-medium text-white/85">
                {item.state === "queued" ? <Trans>Waiting to upload…</Trans> : <Trans>Uploading…</Trans>}
              </span>
            </div>
          )}
        </div>

        <div className="flex h-6 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{formatSize(item.sizeBytes, i18n.locale)}</span>
          {failed && item.retryable && <RowAction icon={RotateCw} label={t`Try again`} onClick={() => onRetry(item.id)} />}
          {failed && <RowAction icon={X} label={t`Dismiss`} onClick={() => onDismiss(item.id)} />}
        </div>

        <p className="flex h-9 items-center rounded-[10px] border border-dashed px-2.5 text-[12px] text-muted-foreground">
          <span className="truncate">
            {failed && !item.videoId ? (
              <Trans>Not added to the book</Trans>
            ) : target ? (
              <Trans>Goes on {target.sectionLabel}</Trans>
            ) : (
              <Trans>Choose its page once it's uploaded</Trans>
            )}
          </span>
        </p>
      </StepCard>
    </div>
  )
}
