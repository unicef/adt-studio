import { Trans } from "@lingui/react/macro"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { SlidersHorizontal } from "lucide-react"

export interface StylesPanelProps {
  editable: boolean
}

export function StylesPanel({ editable }: StylesPanelProps) {
  if (!editable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <span className="grid size-9 place-items-center rounded-[10px] bg-muted">
          <SlidersHorizontal className="size-4" />
        </span>
        <span className="text-[11.5px] leading-relaxed text-pretty">
          <Trans>Open a rendered page to style its elements.</Trans>
        </span>
      </div>
    )
  }

  return <HtmlEditor.Inspector className="min-h-0 flex-1 border-l-0 bg-transparent" />
}
