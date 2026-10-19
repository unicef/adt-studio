import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Columns2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function LayoutMenu({ actions, canFloat }: {
  actions: { label: string; disabled: boolean; run: () => void }[]; canFloat: boolean
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t`Component layout`} title={t`Component layout`}><Columns2 className="size-4" />{t`Layout`}</button>
    </PopoverTrigger>
    <PopoverContent className="max-h-[min(720px,80vh)] w-80 overflow-y-auto p-2" align="start" onPointerDown={event => event.stopPropagation()}>
      <p className="px-2 py-1 text-xs font-semibold">{t`Component layout`}</p>
      {actions.map(action => <button key={action.label} type="button" disabled={action.disabled}
        className="block w-full rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-35"
        onClick={() => { action.run(); setOpen(false) }}>{action.label}</button>)}
      {!canFloat && <p className="px-2 pb-2 text-[11px] text-muted-foreground">{t`To wrap text, select an object beside paragraphs, or a container with paragraphs and one object. Separate cards and activities keep their own layout.`}</p>}
      <p className="border-t px-2 pt-2 text-[11px] text-muted-foreground">{t`Wrap text lets paragraphs continue beside the object and fill the width below it. Side by side keeps separate columns. Both stack on small screens. Undo restores the original layout.`}</p>
      <p className="px-2 pt-2 text-[11px] text-muted-foreground">{t`Shift-click neighbouring items to select a group.`}</p>
    </PopoverContent>
  </Popover>
}
