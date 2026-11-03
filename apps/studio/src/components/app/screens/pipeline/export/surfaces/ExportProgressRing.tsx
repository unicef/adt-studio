import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { STAGES } from "@/components/pipeline/stage-config"
import { buildExportFormatConfig, type ExportFormat } from "@/components/pipeline/stages/export/export-formats"
import { Ring, RingButton, type RingModel } from "@/components/app/screens/pipeline/chrome/bar/StatusRing"
import { useExportWatcher } from "@/hooks/use-export-watcher"
import { usePartInfo } from "@/hooks/use-parts"

const EXPORT_HEX = STAGES.find((stage) => stage.slug === "export")?.hex ?? "#4338ca"

export function ExportProgressRing({ label }: { label: string }) {
  const { t } = useLingui()
  const { data: partInfo } = usePartInfo(label)
  const formats = buildExportFormatConfig(t, { isPart: !!partInfo })
  const { isPreparing, preparingFormat, error, retry } = useExportWatcher()
  const [finished, setFinished] = useState<ExportFormat | null>(null)
  const running = useRef<ExportFormat | null>(null)

  useEffect(() => {
    if (isPreparing) {
      running.current = preparingFormat
      setFinished(null)
      return
    }
    const last = running.current
    running.current = null
    if (!last || error) return
    setFinished(last)
  }, [isPreparing, preparingFormat, error])

  useEffect(() => {
    if (error) setFinished(null)
  }, [error])

  useEffect(() => {
    if (!finished) return
    const timer = window.setTimeout(() => setFinished(null), 3000)
    return () => window.clearTimeout(timer)
  }, [finished])

  const format = (isPreparing ? preparingFormat : null) ?? finished ?? error?.format ?? null
  if (!format) return null
  const config = formats[format]
  const model: RingModel = {
    tone: isPreparing ? "run" : finished ? "done" : "critical",
    icon: config.icon,
    hex: EXPORT_HEX,
    name: config.label,
    text: config.label,
    fraction: null,
    waiting: 0,
  }

  if (isPreparing || finished) {
    const text = isPreparing ? t`Preparing ${config.label}. The download starts when it's ready.` : t`${config.label} ready`
    return (
      <span role="status" aria-live="polite" aria-label={text} title={text} className="flex shrink-0 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
        <Ring model={model} />
      </span>
    )
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <RingButton label={t`${config.label} failed`}>
          <Ring model={model} />
        </RingButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="flex w-80 flex-col gap-3 p-3.5">
        <div role="alert" className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">
            <Trans>{config.label} failed</Trans>
          </span>
          <span className="text-[12px] leading-snug text-muted-foreground">{error?.message}</span>
        </div>
        <button
          type="button"
          onClick={retry}
          className="flex h-8 items-center gap-1.5 self-end rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted"
        >
          <RotateCcw className="size-3.5" />
          <Trans>Try again</Trans>
        </button>
      </PopoverContent>
    </Popover>
  )
}
