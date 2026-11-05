import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { ArrowUpRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { stageLook, useOptionText } from "./optionMeta"
import type { ExportOptions } from "./useExportOptions"

function ReadyRing({ done, total }: { done: number; total: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const gap = 7
  const seg = c / total - gap
  return (
    <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <circle
          key={index}
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${seg} ${c - seg}`}
          strokeDashoffset={-index * (seg + gap)}
          className={cn("transition-colors duration-300", index < done ? "stroke-emerald-500" : "stroke-muted")}
        />
      ))}
    </svg>
  )
}

export function AccessMeter({ options, label, onNavigate }: { options: ExportOptions; label: string; onNavigate: () => void }) {
  const { t } = useLingui()
  const text = useOptionText()
  const navigate = useNavigate()
  const id = useId()
  const done = options.readiness.filter((item) => item.done).length
  const total = options.readiness.length
  return (
    <div className="flex flex-col gap-3" aria-labelledby={id}>
      <div className="flex items-center gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center">
          <ReadyRing done={done} total={total} />
          <span className="absolute text-[12px] font-semibold tabular-nums">
            {done}/{total}
          </span>
        </span>
        <span className="flex flex-col">
          <span id={id} className="text-[13px] font-semibold">
            <Trans>Accessibility</Trans>
          </span>
          <span className="text-[12px] text-muted-foreground">
            {done === total ? t`Every step is ready` : t`${done} of ${total} ready. The others help readers with disabilities.`}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.readiness.map((item) => {
          const look = stageLook(item.slug)
          const Icon = look.icon
          return item.done ? (
            <span key={item.slug} className="flex h-10 items-center gap-2.5 rounded-xl bg-muted/40 px-3 text-[12.5px]">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
              {text.name[item.slug]}
            </span>
          ) : (
            <button
              key={item.slug}
              type="button"
              onClick={() => {
                onNavigate()
                void navigate({ to: "/pipeline/$label/$step", params: { label, step: item.slug } })
              }}
              aria-label={t`${text.name[item.slug]} has not run yet. Opens that step and closes Export.`}
              className="group flex h-10 items-center gap-2.5 rounded-xl border border-dashed px-3 text-left text-[12.5px] transition-colors hover:border-solid hover:bg-muted/50"
            >
              <span className="grid size-5 place-items-center rounded-md" style={{ backgroundColor: tint(look.hex, 0.16), color: look.hex }}>
                <Icon className="size-3" aria-hidden />
              </span>
              <span className="flex-1 truncate font-medium">{text.name[item.slug]}</span>
              <span className="flex items-center gap-0.5 text-[11.5px] text-muted-foreground">
                <Trans>Not run</Trans>
                <ArrowUpRight className="size-3 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
              </span>
            </button>
          )
        })}
      </div>
      {done < total && (
        <p className="text-[11px] text-muted-foreground">
          <Trans>Opening a step closes Export. Your choices are kept.</Trans>
        </p>
      )}
    </div>
  )
}
