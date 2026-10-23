import type { ComponentType, SVGProps } from "react"
import { BookOpen, Check, Layers, Library } from "lucide-react"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { ACCENT_VAR, ACCENT_VAR_SOFT } from "@/components/pipeline/lib/accent-var"
import { cn } from "@/lib/utils"
import type { AmountKey } from "./GlossaryPreview"

export type AmountOption = {
  value: AmountKey
  label: MessageDescriptor
  description: MessageDescriptor
  Icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
}

export const AMOUNT_OPTIONS: AmountOption[] = [
  {
    value: "concise",
    label: msg`Concise`,
    description: msg`Only the most central vocabulary.`,
    Icon: BookOpen,
  },
  {
    value: "standard",
    label: msg`Standard`,
    description: msg`A balanced glossary for most books.`,
    Icon: Layers,
  },
  {
    value: "comprehensive",
    label: msg`Comprehensive`,
    description: msg`Every notable concept and named entity.`,
    Icon: Library,
  },
]

export function AmountRow({
  option,
  checked,
  onSelect,
}: {
  option: AmountOption
  checked: boolean
  onSelect: () => void
}) {
  const Icon = option.Icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      style={
        checked
          ? { borderColor: ACCENT_VAR, background: ACCENT_VAR_SOFT }
          : undefined
      }
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring/40",
        checked
          ? ""
          : "border-[#e5e5e5] bg-white hover:border-[#d4d4d4] hover:bg-[#fafafa] dark:border-border dark:bg-card dark:hover:border-border dark:hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
          checked ? "text-white" : "bg-[#f5f5f5] text-[#737373] dark:bg-muted dark:text-muted-foreground",
        )}
        style={checked ? { background: ACCENT_VAR } : undefined}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-[13.5px] font-semibold leading-tight",
            checked ? "" : "text-[#0a0a0a] dark:text-foreground",
          )}
          style={checked ? { color: ACCENT_VAR } : undefined}
        >
          {linguiI18n._(option.label)}
        </span>
        <p className="text-[12px] leading-snug text-[#737373] dark:text-muted-foreground">
          {linguiI18n._(option.description)}
        </p>
      </div>
      <span
        className={cn(
          "ml-2 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked ? "text-white" : "border-[#d4d4d4] bg-white dark:border-border dark:bg-background",
        )}
        style={
          checked
            ? { background: ACCENT_VAR, borderColor: ACCENT_VAR }
            : undefined
        }
        aria-hidden
      >
        {checked && <Check className="h-3 w-3" strokeWidth={2.5} />}
      </span>
    </button>
  )
}
