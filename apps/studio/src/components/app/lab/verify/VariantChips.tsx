import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { VARIANT_GROUPS, setVariantValue, useVariants, type VariantKey, type VariantState } from "../variants"

export function VariantChips({ variantKey, showLabel = true }: { variantKey: VariantKey; showLabel?: boolean }) {
  const { i18n } = useLingui()
  const variants = useVariants()
  const group = VARIANT_GROUPS.find((candidate) => candidate.key === variantKey)
  if (!group) return null
  return (
    <span className="flex flex-col gap-1">
      {showLabel && <span className="text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">{i18n._(group.label)}</span>}
      <span className="flex flex-wrap gap-1">
        {group.options.map((option) => {
          const on = variants[variantKey] === option.value
          return (
            <button
              key={option.value}
              type="button"
              title={i18n._(option.hint)}
              aria-pressed={on}
              onClick={() => setVariantValue(variantKey, option.value)}
              className={cn(
                "h-7 rounded-full px-2.5 text-[12px] font-semibold transition-[background-color,color] duration-150",
                on ? "bg-white text-zinc-900" : "bg-white/5 text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              {i18n._(option.label)}
            </button>
          )
        })}
      </span>
    </span>
  )
}

export function selectedVariantText(keys: VariantKey[], values: VariantState, translate: (descriptor: MessageDescriptor) => string): string[] {
  return keys
    .map((variantKey) => {
      const group = VARIANT_GROUPS.find((candidate) => candidate.key === variantKey)
      const option = group?.options.find((candidate) => candidate.value === values[variantKey])
      return group && option ? `${translate(group.label)}: **${translate(option.label)}**` : null
    })
    .filter((line): line is string => line !== null)
}
