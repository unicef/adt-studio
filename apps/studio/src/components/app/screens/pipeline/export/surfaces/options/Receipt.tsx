import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { Globe, PackageCheck } from "lucide-react"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { stageLook } from "./optionMeta"
import { getDisplayName } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { useFormatMeta } from "../ExportParts"
import { useOptionText } from "./optionMeta"
import type { ExportOptions } from "./useExportOptions"
import type { ExportFlow } from "../useExportFlow"

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-h-8 items-center gap-2.5 text-[12.5px]">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background/70 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </li>
  )
}

export function Receipt({ flow, options }: { flow: ExportFlow; options: ExportOptions }) {
  const { t } = useLingui()
  const text = useOptionText()
  const meta = useFormatMeta(flow, flow.format)
  const on = options.features.filter((feature) => feature.on)
  const { included, opensIn, all } = options.languages
  return (
    <ul className="flex w-full flex-col gap-0.5 rounded-xl bg-background/55 p-2 ring-1 ring-foreground/5 backdrop-blur-sm">
      <li className="flex min-h-9 items-center gap-2.5 text-[12.5px]">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border", meta.bgLight, meta.borderColor, "dark:border-white/10 dark:bg-white/[0.06]")}>
          <meta.icon className={cn("size-3.5", meta.textColor)} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{meta.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{meta.ext}</span>
      </li>
      {options.isProject ? (
        <Line icon={<PackageCheck className="size-3.5" />}>{t`Everything in the project`}</Line>
      ) : (
        <>
          <li className="flex min-h-8 items-center gap-2.5 text-[12.5px]">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background/70 text-muted-foreground">
              <PackageCheck className="size-3.5" />
            </span>
            {on.length > 0 ? (
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {on.map((feature) => {
                  const look = stageLook(feature.slug)
                  return (
                    <span
                      key={feature.key}
                      className="flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
                      style={{ backgroundColor: tint(look.hex, 0.13), color: look.hex }}
                    >
                      <look.icon className="size-3" aria-hidden />
                      {text.name[feature.slug]}
                    </span>
                  )
                })}
              </span>
            ) : (
              <span className="text-muted-foreground">{t`Text and images`}</span>
            )}
          </li>
          {all.length > 1 && opensIn && (
            <Line icon={<Globe className="size-3.5" />}>
              {included.length > 1
                ? t`Opens in ${getDisplayName(opensIn)} · ${included.length} languages`
                : t`Only ${getDisplayName(opensIn)}`}
            </Line>
          )}
        </>
      )}
    </ul>
  )
}
