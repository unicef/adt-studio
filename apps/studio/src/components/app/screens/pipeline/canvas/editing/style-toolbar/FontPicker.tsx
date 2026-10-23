import { useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import { bookFontFamilyChain } from "@adt/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FontPreviewAssets } from "@/components/pipeline/stages/storyboard/components/style-editor/sections/FontFamilyControl"
import { useBookFonts } from "@/hooks/use-book-fonts"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { ToolButton, ToolTip, popoverClass, useToolbarSide, type StyleTarget, type ToolbarItem } from "./parts"
import { dedupeFontChain, fontFamiliesInHtml } from "./toolbarModel"

export const FONT_PICKER_WIDTH = 132

type FontCategory = Parameters<typeof bookFontFamilyChain>[0]["category"]

interface FontOption {
  key: string
  family: string
  chain: string
}

function FontRow({ option, selected, onSelect }: { option: { family: string; label: string }; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"
    >
      <span className="w-3.5 shrink-0">{selected ? <Check aria-hidden className="size-3.5" /> : null}</span>
      <span className="truncate" style={{ fontFamily: `'${option.family}', sans-serif` }}>
        {option.label}
      </span>
    </button>
  )
}

function FontPicker({ target }: { target: StyleTarget }) {
  const { t } = useLingui()
  const side = useToolbarSide()
  const [open, setOpen] = useState(false)
  const { data } = useBookFonts(target.label)
  const page = usePage(target.label, target.pageId ?? "")
  const fonts = useMemo(() => data?.fonts ?? [], [data])
  const inline = target.typography?.inlineFontFamily ?? null
  const shown = inline ?? target.typography?.fontFamily ?? null

  const groups = useMemo(() => {
    const book: FontOption[] = fonts.map((font) => ({ key: font.id, family: font.family, chain: bookFontFamilyChain(font) }))
    const body = data?.current.font
    if (body && !book.some((option) => option.family === body.family)) {
      book.unshift({ key: `body:${body.id}`, family: body.family, chain: bookFontFamilyChain({ family: body.family, category: body.category as FontCategory }) })
    }
    const known = new Set(book.map((option) => option.family))
    const onPage: FontOption[] = fontFamiliesInHtml((page.data?.rendering?.sections ?? []).map((section) => section.html))
      .filter((family) => !known.has(family))
      .map((family) => ({ key: `page:${family}`, family, chain: bookFontFamilyChain({ family }) }))
    return { book, onPage }
  }, [fonts, data, page.data])

  const choose = (chain: string) => {
    target.setStyle("font-family", dedupeFontChain(chain))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {open ? <FontPreviewAssets label={target.label} fonts={fonts} includePopular={false} /> : null}
      <ToolTip label={t`Font`}>
        <PopoverTrigger asChild>
          <ToolButton
            label={shown ? t`Font: ${shown}` : t`Font`}
            aria-haspopup="listbox"
            className="flex justify-start gap-1 px-2 text-[12px] font-medium"
            style={{ width: FONT_PICKER_WIDTH }}
          >
            <span className="min-w-0 flex-1 truncate text-left" style={shown ? { fontFamily: `'${shown}', sans-serif` } : undefined}>
              {shown ?? t`Book font`}
            </span>
            <ChevronDown aria-hidden className="size-3 shrink-0 opacity-60" />
          </ToolButton>
        </PopoverTrigger>
      </ToolTip>
      <PopoverContent side={side} align="start" sideOffset={8} collisionPadding={12} className={cn(popoverClass, "w-60 p-1.5")}>
        <div role="listbox" aria-label={t`Font`} className="flex max-h-72 flex-col overflow-y-auto">
          <FontRow
            option={{ family: target.typography?.fontFamily ?? "inherit", label: t`Book default` }}
            selected={!inline}
            onSelect={() => choose("")}
          />
          {groups.book.length > 0 ? (
            <span className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{t`This book's fonts`}</span>
          ) : null}
          {groups.book.map((option) => (
            <FontRow key={option.key} option={{ family: option.family, label: option.family }} selected={inline === option.family} onSelect={() => choose(option.chain)} />
          ))}
          {groups.onPage.length > 0 ? (
            <span className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{t`Used on this page`}</span>
          ) : null}
          {groups.onPage.map((option) => (
            <FontRow key={option.key} option={{ family: option.family, label: option.family }} selected={inline === option.family} onSelect={() => choose(option.chain)} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function fontItem(label: string, target: StyleTarget): ToolbarItem {
  return { key: "font", label, width: FONT_PICKER_WIDTH, group: "font", priority: 4, node: <FontPicker target={target} /> }
}
