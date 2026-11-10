import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, Loader2, Pencil, TriangleAlert } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { ProblemNotice } from "./problems/ProblemNotice"
import { HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "./headerButton"
import { StepRailList } from "./rail/StepRailList"

export type StepBodyWidth = "full" | "reading" | "wide" | "fluid"

const BODY_WIDTH: Record<StepBodyWidth, string> = {
  full: "container",
  reading: "w-full max-w-[920px]",
  wide: "w-full max-w-[1240px]",
  fluid: "w-full max-w-[2000px] px-6",
}

export function StepBody({
  title,
  meta,
  titleExtra,
  actions,
  width = "full",
  fill = false,
  children,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  titleExtra?: React.ReactNode
  actions?: React.ReactNode
  width?: StepBodyWidth
  fill?: boolean
  children: React.ReactNode
}) {
  const heading = (
    <div className="flex min-h-9 shrink-0 items-center gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 data-step-heading="" tabIndex={-1} className="text-[19px] font-bold tracking-[-0.01em] outline-none">{title}</h1>
        {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
        {titleExtra}
      </div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  )
  if (fill)
    return (
      <div className={cn("mx-auto flex h-full min-h-0 flex-col gap-4 px-4 pt-7 pb-24 transition-[padding] duration-300 ease-out in-data-save-bar:pb-40 motion-reduce:transition-none", BODY_WIDTH[width])}>
        {heading}
        {children}
      </div>
    )
  return (
    <ScrollArea className="h-full w-full" viewportClassName="[&>div]:block!">
      <div className={cn("mx-auto flex flex-col gap-4 px-4 pt-7 pb-24 transition-[padding] duration-300 ease-out in-data-save-bar:pb-40 motion-reduce:transition-none", BODY_WIDTH[width])}>
        {heading}
        {children}
      </div>
    </ScrollArea>
  )
}

/**
 * `StepBody` for a step that owns its own scrolling — a virtualized list needs a
 * scroll container it can measure, and a heading that stays put while the list
 * moves under it. The step must also stop the workspace's outer viewport from
 * scrolling (`bodyViewportClassName={STEP_FILL_VIEWPORT_CLASSNAME}`), otherwise this fills
 * to a height that never overflows and no scrollbar ever appears.
 */
export const STEP_FILL_VIEWPORT_CLASSNAME = "[&>div]:h-full [&>div]:min-h-0"

export function StepScrollBody({
  title,
  meta,
  actions,
  toolbar,
  viewportRef,
  width = "full",
  children,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  width?: StepBodyWidth
  toolbar?: React.ReactNode
  /** Handed to TanStack Virtual's `getScrollElement`. */
  viewportRef: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  return (
    <div className={cn("mx-auto flex h-full min-h-0 w-full flex-col gap-3 px-4 py-7", BODY_WIDTH[width])}>
      <div className="flex min-h-9 items-center gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h1>
          {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {toolbar}
      <ScrollArea className="-mx-1 min-h-0 flex-1" viewportRef={viewportRef} viewportClassName="px-1">
        {children}
      </ScrollArea>
    </div>
  )
}

export function StepCard({
  children,
  muted = false,
  mutedLabel,
  accent,
  className,
}: {
  children: React.ReactNode
  muted?: boolean
  mutedLabel?: string
  accent?: string
  className?: string
}) {
  return (
    <div
      data-muted={muted || undefined}
      aria-description={muted ? mutedLabel : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3.5 transition-colors duration-200 motion-reduce:transition-none",
        muted ? MUTED_CONTAINER : "bg-card",
        className,
      )}
      style={accent && !muted ? { borderColor: tint(accent, 0.3) } : undefined}
    >
      {children}
    </div>
  )
}

export const MUTED_CONTAINER = "border-dashed bg-card"
export const MUTED_PRIMARY = "text-muted-foreground line-through decoration-muted-foreground/50 decoration-1"
export const MUTED_MEDIA = "opacity-50 grayscale"
export const QUIET_CHIP = "inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 text-[10.5px] text-muted-foreground"

export interface EditableTextProps {
  value: string
  onCommit: (next: string) => void
  isSaving?: boolean
  edited?: boolean
  accent?: string
  disabled?: boolean
  startEditing?: boolean
  onCancel?: () => void
  placeholder?: string
  multiline?: boolean
  ariaLabel: string
  className?: string
}

export function EditableText({
  value,
  onCommit,
  isSaving,
  edited = false,
  accent,
  disabled = false,
  startEditing = false,
  onCancel,
  placeholder,
  multiline = true,
  ariaLabel,
  className,
}: EditableTextProps) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const displayRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const selectOnFocus = useRef(startEditing)

  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    displayRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (!editing) return
    ref.current?.focus()
    if (selectOnFocus.current) {
      ref.current?.select()
      selectOnFocus.current = false
    }
  }, [editing])

  const commit = (returnFocus = false) => {
    const next = draft.trim()
    if (next !== value.trim()) onCommit(next)
    refocus.current = returnFocus
    setEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    refocus.current = true
    setEditing(false)
  }

  if (!editing || disabled) {
    return (
      <button
        ref={displayRef}
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        aria-label={t`Edit ${ariaLabel}`}
        aria-description={edited ? t`edited` : undefined}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent",
          className,
        )}
      >
        <span className={cn("flex-1", !value && "text-muted-foreground")}>{value || placeholder}</span>
        {edited && (
          <span
            aria-hidden
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500 animate-in fade-in zoom-in-50 duration-200 motion-reduce:animate-none"
            style={accent ? { background: accent } : undefined}
          />
        )}
        {isSaving ? (
          <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          !disabled && (
            <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          )
        )}
      </button>
    )
  }

  const shared = {
    ref: ref as never,
    value: draft,
    "aria-label": ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => commit(false),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel?.()
        cancel()
      }
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        commit(true)
      }
    },
    className: cn(
      "w-full resize-y rounded-md border bg-background px-1.5 py-1 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_55%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex,var(--ring))_18%,transparent)]",
      className,
    ),
  }

  return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />
}

export function DetailNavButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  children,
}: {
  icon: typeof Check
  label: string
  onClick: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(HEADER_BUTTON, children ? HEADER_BUTTON_LABELLED : HEADER_BUTTON_ICON)}
    >
      {children ? <HeaderButtonTile icon={Icon} /> : <Icon className="size-4" />}
      {children}
    </button>
  )
}

export function RowAction({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  tone = "default",
}: {
  icon: typeof Check
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  tone?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md border transition-colors",
        "disabled:pointer-events-none disabled:opacity-30",
        active && "border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_40%,transparent)] bg-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_10%,transparent)] text-[var(--chrome-hex,var(--ring))]",
        !active && tone === "danger" && "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        !active && tone === "default" && "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
    </button>
  )
}

export interface RailEntry {
  key: string | null
  title: string
  count: number
  thumb?: React.ReactNode
  subtitle?: string
  failed?: boolean
  pageNumber?: number
  searchText?: string
  meta?: React.ReactNode
  emptySubtitle?: string | null
}

export function StepRail({
  heading,
  hex,
  entries,
  activeKey,
  onSelect,
  footer,
  hoverPreview = false,
  searchPlaceholder,
}: {
  heading: React.ReactNode
  hex: string
  entries: RailEntry[]
  activeKey?: string | null
  onSelect?: (key: string | null) => void
  footer?: React.ReactNode
  hoverPreview?: boolean
  searchPlaceholder?: string
}) {
  return (
    <StepRailList
      heading={heading}
      hex={hex}
      entries={entries}
      activeKey={activeKey}
      onSelect={onSelect}
      footer={footer}
      hoverPreview={hoverPreview}
      searchPlaceholder={searchPlaceholder}
    />
  )
}

export function StepEmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-12 text-[12.5px] text-muted-foreground">
      {children}
    </div>
  )
}

export function SaveError({ error }: { error: Error | string | null }) {
  const { t } = useLingui()
  if (!error) return null
  const message = typeof error === "string" ? error : error.message
  return <ProblemNotice level="blocked" icon={TriangleAlert} title={t`Could not save your change`} body={message} />
}
