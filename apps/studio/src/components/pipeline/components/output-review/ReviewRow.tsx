import { useId, useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronDown, ChevronRight } from "lucide-react"
import { OUTPUT_KIND_TO_STAGE, type OutputStatus } from "@adt/types"
import { getStageLabelI18n } from "../../pipeline-i18n"
import { reviewStatus } from "./review-status"

export function ReviewRow({ output, category, language, children }: { output: OutputStatus; category: string; language?: string; children: ReactNode }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const id = useId()
  const kind = output.identity.kind
  const label = kind === "translation" ? t`Translation` : kind === "preparation" ? t`Speech text` : kind === "audio" ? t`Audio` : kind === "caption" ? t`Caption` : kind === "easy-read" ? t`Easy Read` : kind === "timestamps" ? t`Timestamps` : t`Image translation`
  const sourceStages = [...new Set(output.warnings.flatMap((warning) => warning.source ? [OUTPUT_KIND_TO_STAGE[warning.source.kind]] : []))]
  const sources = sourceStages.map(getStageLabelI18n).join(", ")
  const issue = reviewStatus(output)
  const status = issue === "missing" ? t`Missing` : issue === "update" ? t`Out of sync` : issue === "review" ? t`Needs review` : t`Warning`
  const text = output.sourceText || output.text || output.identity.id
  return <div>
    <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
      {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        {/* One line in the list; the full text is on hover and in the details. */}
        <span className="block truncate text-sm" title={text}>{text}</span>
        <span className="block text-xs text-muted-foreground">
          <span className="font-medium">{category}</span> · <code className="break-all font-mono text-[11px]">{output.identity.id}</code> · {label}
          {language && ` · ${language}`}{output.identity.voiceSlot && ` · ${output.identity.voiceSlot}`}{sources && <> · {t`Source needs review: ${sources}`}</>}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{status}</span>
    </button>
    {open && <div id={id} className="min-w-0 space-y-2 border-t border-dashed px-9 py-3 wrap-anywhere">
      {children}
    </div>}
  </div>
}
