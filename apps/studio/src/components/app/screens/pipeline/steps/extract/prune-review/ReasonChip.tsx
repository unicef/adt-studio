import { useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { cn } from "@/lib/utils"
import type { HumanReason } from "../page-detail/humanReason"
import { REASON_ICON } from "../page-detail/reasonIcon"

export function reasonLabel(translate: (descriptor: MessageDescriptor) => string, reason: HumanReason): string {
  return typeof reason.label === "string" ? reason.label : translate(reason.label)
}

export function ReasonChip({ reason, className, size = "sm" }: { reason: HumanReason; className?: string; size?: "sm" | "md" }) {
  const { i18n } = useLingui()
  const Icon = REASON_ICON[reason.kind]
  const pageElements = reason.kind === "page-elements"
  const explain = reason.explain ? i18n._(reason.explain) : null
  return (
    <span
      title={[explain, reason.detail].filter(Boolean).join("\n") || undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium",
        size === "sm" ? "h-5 px-1.5 text-[10.5px]" : "h-6 px-2 text-[11.5px]",
        pageElements ? "bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[var(--chrome-hex)]" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3 shrink-0" : "size-3.5 shrink-0"} aria-hidden />
      <span className="truncate">{reasonLabel((descriptor) => i18n._(descriptor), reason)}</span>
    </span>
  )
}
