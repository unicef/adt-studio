import { Settings as SettingsIcon } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type ExampleBookSettings,
  getPresetRecommendationEntries,
} from "@/components/wizard/constants"
import { cn } from "@/lib/utils"

interface ExampleSettingsProps {
  settings?: ExampleBookSettings
}

export function ExampleSettings({ settings }: ExampleSettingsProps) {
  const { i18n } = useLingui()
  const entries = getPresetRecommendationEntries(settings ?? {})

  if (entries.length === 0) {
    return null
  }

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[#2b7fff] px-3 text-xs text-[#2b7fff] hover:bg-[#2b7fff]/5 hover:text-[#2b7fff]"
        >
          <SettingsIcon className="h-4 w-4" />
          <Trans>Settings</Trans>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden border-[#e5e5e5] p-0"
      >
        <dl>
          {entries.map((entry, index) => (
            <div
              key={i18n._(entry.label)}
              className={cn(
                "flex items-center justify-between gap-4 px-4 py-3",
                index > 0 && "border-t border-[#e5e5e5]",
              )}
            >
              <dt className="text-xs text-[#737373]">
                {i18n._(entry.label)}
              </dt>
              <dd className="text-right text-xs font-semibold text-[#0a0a0a]">
                {typeof entry.value === "string"
                  ? entry.value
                  : i18n._(entry.value)}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
