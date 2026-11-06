import { useLingui } from "@lingui/react/macro"
import { BookOpen, Database, Scissors, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The three archive types ADT Studio imports. With `missing`, each card also
 * says which files detection looked for, so someone who zipped the wrong
 * folder can see what to fix. The lines grow out of the existing cards rather
 * than replacing them.
 */
export function ArchiveTypeCards({ missing }: { missing: boolean }) {
  const { t } = useLingui()
  const types: Array<{ icon: LucideIcon; name: string; description: string; lookedFor: string }> = [
    {
      icon: Database,
      name: t`Project backup`,
      description: t`A whole project saved from ADT Studio, with its database and PDF.`,
      lookedFor: t`Not found: a .db file and the PDF at the top level`,
    },
    {
      icon: Scissors,
      name: t`Completed book part`,
      description: t`A page range that was split off, finished, and exported to merge back.`,
      lookedFor: t`Not found: part.json, config.yaml and the PDF`,
    },
    {
      icon: BookOpen,
      name: t`ADT Web export`,
      description: t`The published web book, including one edited outside ADT Studio.`,
      lookedFor: t`Not found: manifest.json from an ADT Web export`,
    },
  ]

  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-3 2xl:gap-5 2xl:p-6">
      {types.map(({ icon: Icon, name, description, lookedFor }) => (
        <li key={name} className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 2xl:p-5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg transition-colors duration-300 2xl:size-11",
              missing ? "bg-muted text-muted-foreground" : "bg-brand-500/10 text-brand-600 dark:text-brand-400",
            )}
          >
            <Icon aria-hidden="true" className="size-[18px] 2xl:size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground 2xl:text-[15px]">{name}</span>
            <span className="block text-[12.5px] leading-relaxed text-muted-foreground 2xl:text-sm">{description}</span>
            <span
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
                missing ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
              aria-hidden={!missing}
            >
              <span className="overflow-hidden">
                <span className="flex items-start gap-1.5 pt-2 text-xs text-destructive">
                  <X aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                  {lookedFor}
                </span>
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
