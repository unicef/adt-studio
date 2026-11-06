import { useRef, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { AlertCircle, FileArchive, FileUp, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ArchiveTypeCards } from "./ArchiveTypeCards"
import { useFlip } from "./use-flip"

export type CanvasTone = "idle" | "drag" | "reject" | "error"
export type CanvasIcon = "upload" | "archive" | "reject" | "warning" | "alert"

/** One state of the select step. The canvas keeps the same parts in every
 * state; only the parts whose content differs re-render (keyed on content), and
 * parts pushed to a new position glide there. */
export interface CanvasView {
  state: string
  tone: CanvasTone
  icon: CanvasIcon
  iconTone: "neutral" | "brand" | "danger"
  title: string
  message: string
  body: ReactNode
  bodyKey: string
  missingTypes: boolean
}

const ICONS = { upload: FileUp, archive: FileArchive, reject: X, warning: TriangleAlert, alert: AlertCircle }

const TONES: Record<CanvasTone, string> = {
  idle: "border-dashed border-muted-foreground/40 bg-muted/50",
  drag: "border-primary bg-brand-500/10 shadow-[0_0_0_6px] shadow-brand-500/15",
  reject: "border-dashed border-destructive bg-destructive/10",
  error: "border-destructive/40 bg-destructive/[0.06]",
}

const ICON_TONES = {
  neutral: "border-border bg-card text-brand-600 dark:text-brand-400",
  brand: "border-brand-300 bg-brand-500/15 text-brand-600 dark:border-brand-700 dark:text-brand-400",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
}

const ENTER = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"

export function ArchiveCanvas({ view, onBrowse }: { view: CanvasView; onBrowse: () => void }) {
  const { t } = useLingui()
  const center = useRef<HTMLDivElement>(null)
  useFlip(center, view.state)
  const Icon = ICONS[view.icon]
  const dots = view.tone === "idle" || view.tone === "error"

  return (
    <section
      aria-label={t`Archive`}
      aria-live="polite"
      onClick={view.tone === "idle" ? onBrowse : undefined}
      className={cn(
        "grid min-h-[420px] flex-1 grid-rows-[1fr_auto] rounded-[18px] border-[1.5px] transition-[border-color,background-color,box-shadow] duration-300",
        view.tone === "idle" && "cursor-pointer",
        dots && "bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--muted-foreground)_22%,transparent)_1px,transparent_0)] bg-[length:22px_22px]",
        TONES[view.tone],
      )}
    >
      <div ref={center} className="flex flex-col items-center justify-center gap-3.5 px-6 py-8 text-center">
        <span
          data-flip="icon"
          className={cn(
            "grid size-16 place-items-center rounded-full border transition-colors duration-300 2xl:size-24",
            ICON_TONES[view.iconTone],
          )}
        >
          <Icon
            key={view.icon}
            aria-hidden="true"
            className="size-7 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-200 2xl:size-10"
          />
        </span>
        <h2
          data-flip="title"
          key={`title:${view.title}`}
          className={cn("text-xl font-semibold tracking-[-0.4px] text-foreground text-balance 2xl:text-[28px]", ENTER)}
        >
          {view.title}
        </h2>
        <p
          data-flip="message"
          key={`message:${view.message}`}
          className={cn("max-w-[60ch] text-sm text-muted-foreground text-pretty 2xl:text-base", ENTER)}
        >
          {view.message}
        </p>
        {view.body ? (
          <div
            data-flip="body"
            key={`body:${view.bodyKey}`}
            onClick={(event) => event.stopPropagation()}
            className={cn("flex w-full flex-col items-center gap-3", ENTER)}
          >
            {view.body}
          </div>
        ) : null}
      </div>
      <ArchiveTypeCards missing={view.missingTypes} />
    </section>
  )
}
