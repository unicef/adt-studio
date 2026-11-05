import { useLingui } from "@lingui/react/macro"
import { Check, Database, FileText, History, Layers } from "lucide-react"

export function ProjectTiles() {
  const { t } = useLingui()
  const items = [
    { icon: Database, label: t`The project database`, hint: t`Every step's results, in one place` },
    { icon: FileText, label: t`The source PDF`, hint: t`The file the book was made from` },
    { icon: Layers, label: t`Every step's output`, hint: t`Pages, images, audio, quizzes, translations` },
    { icon: History, label: t`Every version`, hint: t`So nothing is lost when you open it again` },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--accent)/12 text-(--accent-solid) dark:text-(--accent)">
            <item.icon className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-semibold">{item.label}</span>
            <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{item.hint}</span>
          </span>
          <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
        </div>
      ))}
    </div>
  )
}
