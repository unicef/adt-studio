import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function VariationsMark({ variations }: { variations: readonly string[] }) {
  const { t } = useLingui()
  const count = variations.length
  if (count === 0) return null
  const list = variations.join(", ")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={t`Also matches: ${list}`}
          className="rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t`+${plural(count, { one: "# form", other: "# forms" })}`}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">
        <Trans>Also matches: {list}</Trans>
      </TooltipContent>
    </Tooltip>
  )
}
