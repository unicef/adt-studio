import { Trans } from "@lingui/react/macro"
import { useVariant } from "@/components/app/lab/variants"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { FileDown } from "lucide-react"
import { TopBar } from "@/components/app/screens/pipeline/chrome/PipelineChrome"
import { ExportLandingPage } from "@/components/pipeline/stages/export/ExportLandingPage"
import { STAGES } from "@/components/pipeline/stage-config"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExportWatcherProvider, useExportWatcherSetup } from "@/hooks/use-export-watcher"

const EXPORT_HEX = STAGES.find((stage) => stage.slug === "export")?.hex ?? "#4338ca"

export interface ExportScreenProps {
  label: string
  onBack: () => void
}

export function ExportScreen({ label }: ExportScreenProps) {
  const exportWatcher = useExportWatcherSetup(label)
  const otherArc = useVariant("topother") === "arc"
  const otherChrome = useChromeRoot(EXPORT_HEX, otherArc ? "arc" : "current")
  return (
    <ExportWatcherProvider value={exportWatcher}>
    <div {...otherChrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground animate-in fade-in duration-300">
      <TopBar
        tone={{ hex: EXPORT_HEX, stage: true }}
        left={
          <>
            <span data-stage-icon="" className="grid size-6.5 place-items-center rounded-full bg-white/20">
              <FileDown className="size-3.5" strokeWidth={2.4} />
            </span>
            <span className="text-sm font-semibold">
              <Trans>Export</Trans>
            </span>
          </>
        }
      />
      <div data-chrome="row" className="flex min-h-0 flex-1">
      <ScrollArea data-chrome="center" className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
          <ExportLandingPage bookLabel={label} />
        </div>
      </ScrollArea>
      </div>
    </div>
    </ExportWatcherProvider>
  )
}
