import { Trans, useLingui } from "@lingui/react/macro"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { ListTree } from "lucide-react"
import { RailPlaceholder } from "./RailPlaceholder"

export interface LayersRailProps {
  editable: boolean
}

export function LayersRail({ editable }: LayersRailProps) {
  const { t } = useLingui()

  if (!editable) {
    return (
      <RailPlaceholder icon={<ListTree />}>
        <Trans>Open a rendered page to work on its elements.</Trans>
      </RailPlaceholder>
    )
  }

  return (
    <HtmlEditor.Layers className="min-h-0 flex-1 border-r-0 bg-transparent">
      <HtmlEditor.Layers.Search placeholder={t`Search elements…`} aria-label={t`Search elements`} />
      <HtmlEditor.Layers.Tree />
    </HtmlEditor.Layers>
  )
}
