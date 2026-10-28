import { Trans } from "@lingui/react/macro"
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
  const otherChrome = useChromeRoot(EXPORT_HEX)
  return (
    <ExportWatcherProvider value={exportWatcher}>
    <div {...otherChrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground animate-in fade-in duration-300">
      <TopBar
        tone={{ hex: EXPORT_HEX, stage: true }}
        location={{ icon: FileDown, hex: EXPORT_HEX, area: <Trans>Export</Trans> }}
      />
      <div data-chrome="row" className="flex min-h-0 flex-1">
      <ScrollArea data-chrome="center" className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[1080px] px-6 pt-8 pb-28">
          <ExportLandingPage bookLabel={label} />
        </div>
      </ScrollArea>
      </div>
    </div>
    </ExportWatcherProvider>
  )
}
