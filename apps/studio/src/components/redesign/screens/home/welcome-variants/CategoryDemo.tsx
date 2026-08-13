import { useLingui } from "@lingui/react/macro"
import { Play, Image as ImageIcon, Hand, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Equalizer } from "./parts"
import type { Category } from "./categories"

export function CategoryDemo({ category }: { category: Category }) {
  const { t } = useLingui()
  const { demo, accentText, accentBg } = category

  return (
    <div aria-hidden className="grid h-full w-full place-items-center rounded-xl border bg-card p-4">
      {demo === "audio" && (
        <div className="w-full max-w-[240px] space-y-2.5">
          <div className="h-2 w-3/4 rounded-full bg-muted" />
          <div className="h-2 w-[88%] rounded-full bg-muted" />
          <div className="mt-1 flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5">
            <span className={cn("grid size-7 place-items-center rounded-full text-white", accentBg)}>
              <Play className="size-3.5" />
            </span>
            <span className={accentText}>
              <Equalizer />
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">0:42</span>
          </div>
        </div>
      )}

      {demo === "caption" && (
        <div className="relative w-full max-w-[240px]">
          <div className="grid h-28 place-items-center rounded-xl bg-muted text-muted-foreground">
            <ImageIcon className="size-7" />
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-xl border bg-card px-2.5 py-2 shadow-sm motion-safe:animate-float-y">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", category.tint)}>
              <ImageIcon className="size-3" />
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">{t`Figura 3.1 — Membrana celular, con núcleo y organelos`}</span>
          </div>
          <span className="absolute -right-2 -top-2 inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1 text-[10px] font-semibold shadow-md">
            <Hand className="size-3 text-stage-sign" />
            {t`Sign`}
          </span>
        </div>
      )}

      {demo === "language" && (
        <div className="w-full max-w-[240px] space-y-3">
          <div className="flex gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold text-white", accentBg)}>{t`Español`}</span>
            <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t`Français`}</span>
            <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t`English`}</span>
          </div>
          <div className="space-y-2 rounded-xl bg-muted/60 p-3">
            <div className="h-2 w-full rounded-full bg-muted" />
            <div className="h-2 w-[82%] rounded-full bg-muted" />
            <div className="h-2 w-[90%] rounded-full bg-muted" />
          </div>
        </div>
      )}

      {demo === "quiz" && (
        <div className="w-full max-w-[240px] space-y-2 rounded-xl bg-muted/60 p-3">
          <div className="mb-1 h-2 w-[86%] rounded-full bg-muted" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2",
                i === 1 && "border-stage-quizzes/40 bg-stage-quizzes/5",
              )}
            >
              <span className={cn("grid size-4 place-items-center rounded-full border", i === 1 ? `${accentBg} border-transparent text-white` : "")}>
                {i === 1 && <Check className="size-2.5" />}
              </span>
              <span className="h-1.5 flex-1 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
