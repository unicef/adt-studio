import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { PageThumb, ScopeField } from "../../../../core/fields/ScopeField"
import { useWizardForm } from "../../../../core/wizardForm"

/**
 * Screen · Pages to import: the user's pick (every page until they choose), with the wizard's own
 * page picker. The assistant's line above asks a first-time user whether they're trying it out,
 * and suggests a few pages for a large book.
 */
export function PagesScreen({ pageCount }: { pageCount: number }) {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  const first = scope === "range" ? start : 1
  const last = scope === "range" ? end : pageCount
  const chosen = scope === "range" ? end - start + 1 : pageCount
  return (
    <div className="lc-surface flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <span className="qd18-pv flex h-[150px] w-full shrink-0 items-center justify-center gap-3 rounded-[12px] sm:h-[170px] sm:w-[270px] lg:h-[clamp(220px,32vh,360px)] lg:w-[clamp(340px,50vh,560px)]">
          <PageThumb file={file} page={first} />
          <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
          <PageThumb file={file} page={last} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] text-muted-foreground">
            <Trans>This PDF has {pageCount} pages.</Trans>
          </span>
          <span className="text-[20px] font-semibold leading-tight tracking-[-0.01em]">
            {scope === "split" ? <Trans>Split into parts</Trans> : scope === "range" && chosen < pageCount ? <Trans>Pages {start}–{end}</Trans> : <Trans>All {pageCount} pages</Trans>}
          </span>
        </div>
      </div>
      <ScopeField className="text-[14.5px]" />
    </div>
  )
}
