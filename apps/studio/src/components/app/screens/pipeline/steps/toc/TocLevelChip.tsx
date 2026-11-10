import { useLingui } from "@lingui/react/macro"
import { tint } from "@/components/app/screens/pipeline/shared/tint"

export function TocLevelChip({ level, hex }: { level: number; hex: string }) {
  const { t } = useLingui()
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold transition-colors duration-200 motion-reduce:transition-none"
      style={{ background: tint(hex, 0.12), color: hex }}
      aria-label={t`Level ${level}`}
      title={t`Level ${level}`}
    >
      {t`L${level}`}
    </span>
  )
}
