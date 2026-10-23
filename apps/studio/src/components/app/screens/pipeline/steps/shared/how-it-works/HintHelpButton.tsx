import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function HintHelpButton({ title, body }: { title: ReactNode; body: ReactNode }) {
  const { t } = useLingui()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t`How this step works`}
          className="grid size-6 place-items-center self-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[340px] p-4">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      </PopoverContent>
    </Popover>
  )
}
