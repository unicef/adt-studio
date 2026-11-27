import { useState } from "react"
import type { PublisherDocument } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColorField } from "./StyleFields"

export function LearningDesign({ document, disabled, onApply, onChange }: { document: PublisherDocument; disabled: boolean; onApply: (accent: string) => void; onChange: (document: PublisherDocument) => void }) {
  const { t } = useLingui()
  // Weather-inspired starting color. Once a design is applied, its book accent is authoritative.
  const [accent, setAccent] = useState("#007f5b")
  return <section aria-label={t`Learning design`} className="rounded-xl border bg-background p-4">
    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-700" /><h2 className="text-sm font-semibold"><Trans>Learning design</Trans></h2></div>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><Trans>Friendly chapter banners, question cards, vocabulary boxes, and room to read. Inspired by the weather book.</Trans></p>
    <fieldset disabled={disabled} className="mt-4 space-y-3 disabled:opacity-50">
      <ColorField label={t`Book accent`} value={document.theme?.accent ?? accent} onChange={(value) => { setAccent(value); if (document.theme) onChange({ ...document, theme: { accent: value } }) }} />
      <Button size="sm" variant="outline" className="w-full" onClick={() => onApply(document.theme?.accent ?? accent)}><Trans>Apply learning design</Trans></Button>
    </fieldset>
    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground"><Trans>Applies shared typography and box treatments. Keeps content and page layouts. Review the draft before saving.</Trans></p>
    {document.theme && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-950"><Trans>Book accent linked. Cards use automatic contrasting text, flexible heights, and mobile stacking. Customize each treatment in Objects.</Trans></p>}
  </section>
}
