import { useState, type ReactNode } from "react"
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  Image as ImageIcon,
  Languages,
  List,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import type { VersionEntry } from "@/api/client"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useFloatingSave, PendingChip } from "./floating-save"

export type VersionedStep =
  | "toc-generation"
  | "glossary"
  | "quiz-generation"
  | "text-catalog-translation"
  | "image-filtering"
  | "image-captioning"
  | "page-sectioning"
  | "web-rendering"

type Variant = "header" | "muted"

interface StepStyling {
  variant: Variant
  triggerClass: string
}

const HEADER_TRIGGER = "bg-white/20 text-white hover:bg-white/30"
const MUTED_TRIGGER = "bg-muted hover:bg-muted/80"

const STEP_STYLING: Record<VersionedStep, StepStyling> = {
  "toc-generation": { variant: "header", triggerClass: HEADER_TRIGGER },
  glossary: { variant: "header", triggerClass: HEADER_TRIGGER },
  "quiz-generation": { variant: "header", triggerClass: HEADER_TRIGGER },
  "text-catalog-translation": { variant: "header", triggerClass: HEADER_TRIGGER },
  "web-rendering": { variant: "header", triggerClass: HEADER_TRIGGER },
  "image-filtering": { variant: "muted", triggerClass: MUTED_TRIGGER },
  "image-captioning": { variant: "muted", triggerClass: MUTED_TRIGGER },
  "page-sectioning": { variant: "muted", triggerClass: MUTED_TRIGGER },
}

/** Default pending-change descriptor shown in the floating save bar per step. */
const STEP_PENDING: Partial<
  Record<VersionedStep, { icon: LucideIcon; label: MessageDescriptor }>
> = {
  "toc-generation": { icon: List, label: msg`Table of contents` },
  glossary: { icon: BookOpen, label: msg`Glossary` },
  "quiz-generation": { icon: HelpCircle, label: msg`Quizzes` },
  "text-catalog-translation": { icon: Languages, label: msg`Translation` },
  "image-filtering": { icon: ImageIcon, label: msg`Image selection` },
  "image-captioning": { icon: ImageIcon, label: msg`Captions` },
}

interface VersionPickerProps {
  step: VersionedStep
  itemId: string
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  onPreview: (data: unknown) => void
  onSave?: () => void
  onDiscard: () => void
  saveDisabledReason?: string
  /**
   * Whether this picker contributes its dirty state to the shared
   * FloatingSaveBar (via the floating-save registry). Defaults to true. Set
   * false for views that register their own combined entry (e.g. the storyboard
   * section editor, which tracks multiple pending states under one bar). The
   * picker never falls back to inline Save/Discard buttons — Save/Discard
   * always live in the floating bar.
   */
  renderSaveBar?: boolean
  /**
   * Detail shown in the floating save bar (a PendingChip or chips). Overrides
   * the default per-step chip — use it to add context like a page number.
   */
  pendingLabel?: ReactNode
  /** Primitive that changes when pendingLabel content changes. */
  pendingLabelKey?: string
}

export function VersionPicker({
  step,
  itemId,
  currentVersion,
  saving,
  dirty,
  bookLabel,
  onPreview,
  onSave,
  onDiscard,
  saveDisabledReason,
  renderSaveBar = true,
  pendingLabel,
  pendingLabelKey,
}: VersionPickerProps) {
  const { t, i18n } = useLingui()
  const styling = STEP_STYLING[step]
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)

  const stepPending = STEP_PENDING[step]
  const defaultLabel = stepPending ? (
    <PendingChip icon={stepPending.icon}>{i18n._(stepPending.label)}</PendingChip>
  ) : undefined

  useFloatingSave({
    id: `${step}:${itemId}`,
    dirty: dirty && renderSaveBar && currentVersion != null,
    saving,
    label: pendingLabel ?? defaultLabel,
    labelKey: pendingLabelKey ?? step,
    onSave,
    onDiscard,
    saveDisabledReason,
  })

  if (saving) {
    return (
      <Loader2
        className={`h-3 w-3 animate-spin ${styling.variant === "header" ? "text-white/60" : ""}`}
      />
    )
  }

  if (currentVersion == null) return null

  const handleOpenChange = async (next: boolean) => {
    setOpen(next)
    if (next) {
      if (versions == null) setLoadingVersions(true)
      const res = await api.getVersionHistory(bookLabel, step, itemId, true)
      setVersions(res.versions)
      setLoadingVersions(false)
    }
  }

  const handlePick = (v: VersionEntry) => {
    setOpen(false)
    if (v.version === currentVersion) return
    onPreview(v.data)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal rounded px-1.5 py-0.5 transition-colors ${styling.triggerClass}`}
        >
          v{currentVersion}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto min-w-[80px] p-1">
        {loadingVersions ? (
          <div className="flex items-center justify-center py-2 px-3">
            <Loader2 className="h-3 w-3 animate-spin" />
          </div>
        ) : versions && versions.length > 0 ? (
          versions.map((v) => (
            <button
              key={v.version}
              type="button"
              onClick={() => handlePick(v)}
              className={`block w-full text-left px-3 py-1 text-xs rounded hover:bg-accent transition-colors ${
                v.version === currentVersion
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              v{v.version}
            </button>
          ))
        ) : (
          <div className="px-3 py-1 text-xs text-muted-foreground">
            {t`No versions`}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
