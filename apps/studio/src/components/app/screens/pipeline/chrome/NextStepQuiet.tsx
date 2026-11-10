import type { ReactNode } from "react"
import { ArrowRight, CheckCircle2, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { createPersistentStore, type PersistentStore } from "@/hooks/create-persistent-store"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import type { NextStep } from "@/components/app/screens/pipeline/shared/useNextStep"

const NEXT_KEY_PREFIX = "adt.step-next."
const stores = new Map<string, PersistentStore<boolean>>()

function dismissStore(slug: string): PersistentStore<boolean> {
  let store = stores.get(slug)
  if (!store) {
    store = createPersistentStore<boolean>(NEXT_KEY_PREFIX + slug, false, (value): value is boolean => typeof value === "boolean")
    stores.set(slug, store)
  }
  return store
}

export function NextStepQuiet({ slug, next, why, aside }: { slug: string; next: NextStep; why: string | null; aside?: ReactNode }) {
  const { t } = useLingui()
  const [dismissed, setDismissed] = dismissStore(slug).use()
  if (dismissed && !aside) return null
  const stage = getStageLabelI18n(slug)
  if (aside)
    return (
      <section className="overflow-hidden rounded-xl border bg-card animate-in fade-in duration-300 motion-reduce:animate-none">
        <div className="flex h-12 items-center gap-3 px-4">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
            <span className="text-[13px] font-medium text-foreground">
              <Trans>{stage} is almost ready.</Trans>
            </span>{" "}
            {why}
          </p>
          <button
            type="button"
            onClick={next.open}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Trans>Go to {next.name}</Trans>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="border-t [&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none">{aside}</div>
      </section>
    )
  return (
    <section className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4 animate-in fade-in duration-300 motion-reduce:animate-none">
      <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
        <span className="text-[13px] font-medium text-foreground">
          <Trans>{stage} finished.</Trans>
        </span>{" "}
        {why}
      </p>
      <button
        type="button"
        onClick={next.open}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Trans>Go to {next.name}</Trans>
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t`Hide this`}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </section>
  )
}
