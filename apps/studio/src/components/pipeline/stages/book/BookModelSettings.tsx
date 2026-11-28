import { Trans } from "@lingui/react/macro"
import { ModelsTable } from "@/components/app/screens/settings/models/ModelsTable"
import { useBookModelSettings } from "./useBookModelSettings"

export function BookModelSettings({ bookLabel }: { bookLabel: string }) {
  const settings = useBookModelSettings(bookLabel)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold tracking-tight">
          <Trans>Model overrides</Trans>
        </h3>
        <p className="text-pretty text-[12.5px] leading-relaxed text-muted-foreground">
          <Trans>
            Override the models and reasoning effort for this book, task by task. Empty fields inherit
            Settings → Models; a value set here wins over it, even when the global setting changes later.
          </Trans>
        </p>
      </div>
      <ModelsTable {...settings} />
    </div>
  )
}
