import { Trans } from "@lingui/react/macro"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { Blocks } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RailPlaceholder } from "./RailPlaceholder"

export interface PaletteRailProps {
  editable: boolean
}

export function PaletteRail({ editable }: PaletteRailProps) {
  if (!editable) {
    return (
      <RailPlaceholder icon={<Blocks />}>
        <Trans>Open a rendered page to drag blocks into it.</Trans>
      </RailPlaceholder>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="px-3 pb-3">
      <p className="pb-2 text-[11px] leading-relaxed text-muted-foreground">
        <Trans>Drag a block onto the page to insert it.</Trans>
      </p>
      <HtmlEditor.Palette className="gap-0 border-b-0 bg-transparent p-0">
        <HtmlEditor.Palette.Grid />
      </HtmlEditor.Palette>
    </ScrollArea>
  )
}
