import { Trans, useLingui } from "@lingui/react/macro"
import { LayoutGrid } from "lucide-react"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { TopBar } from "./PipelineChrome"

export interface PipelineTopBarProps {
  pageLabel?: string
  version?: number | null
  versionPicker?: React.ReactNode
  onOpenSettings?: () => void
  stale?: React.ReactNode
}

export function PipelineTopBar({ pageLabel, version, versionPicker, onOpenSettings, stale }: PipelineTopBarProps) {
  const { t } = useLingui()
  const versionNode =
    versionPicker ??
    (version != null ? (
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">v{version}</span>
    ) : undefined)

  return (
    <TopBar
      tone={{ hex: STORYBOARD_HEX }}
      location={{
        icon: LayoutGrid,
        hex: STORYBOARD_HEX,
        area: <Trans>Storyboard</Trans>,
        item: pageLabel,
        version: versionNode,
        note: pageLabel ? stale : <Trans>no sections yet</Trans>,
      }}
      settings={onOpenSettings ? { label: t`Storyboard settings`, onOpen: onOpenSettings } : undefined}
    />
  )
}
