import { REFLOWABLE_FONTS } from "@adt/types"
import { Type } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { useApplyBookFont, useBookFonts } from "@/hooks/use-book-fonts"

export function BookFontSelector({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data, isPending } = useBookFonts(bookLabel)
  const apply = useApplyBookFont(bookLabel)
  const current = data?.current
  const value = current?.bodyRole
    ? `registry:${current.font.id}`
    : current?.setting && current.setting !== "auto"
      ? `reflowable:${current.setting}`
      : "auto"

  async function changeFont(next: string) {
    try {
      if (next === "auto") await apply.mutateAsync({ scope: "whole", reset: true })
      else {
        const [kind, id] = next.split(":") as ["registry" | "reflowable", string]
        await apply.mutateAsync({ scope: "whole", font: { kind, id } })
      }
      toast.success(t`Book font updated.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Unable to update the book font.`)
    }
  }

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-foreground">
      <span className="inline-flex items-center gap-1.5 font-medium">
      <Type className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t`Output font family`}
      </span>
      <select
        aria-label={t`Output font family`}
        value={value}
        disabled={isPending || apply.isPending || current?.fixedLayout}
        onChange={(event) => void changeFont(event.target.value)}
        title={current?.fixedLayout ? t`Fixed-layout pages preserve the original book fonts.` : t`Change the font across generated book pages.`}
        className="h-9 min-w-64 rounded border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="auto">{t`Automatic — match book`}</option>
        {REFLOWABLE_FONTS.map((font) => <option key={font.id} value={`reflowable:${font.id}`}>{font.family}</option>)}
        {data?.fonts.map((font) => <option key={font.id} value={`registry:${font.id}`}>{font.family}</option>)}
      </select>
    </label>
  )
}
