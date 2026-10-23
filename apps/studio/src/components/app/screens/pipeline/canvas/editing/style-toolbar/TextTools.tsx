import { useLingui } from "@lingui/react/macro"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Italic,
  Minus,
  Plus,
  Trash2,
  Underline,
  UnfoldVertical,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  fontSizeClassMap,
  fontWeightClassMap,
  lineHeightClassMap,
  marginClassMap,
  textAlignClassMap,
  textColorClassMap,
  textDecorationClassMap,
} from "@/components/pipeline/stages/storyboard/components/style-editor/class-maps"
import { cn } from "@/lib/utils"
import { edit, readValue, withoutZeroSides, type ClassEdit } from "./classEdits"
import { Choice, ColorSwatches, toHex } from "./fields"
import {
  ColorBar,
  ICON_WIDTH,
  IconTool,
  PopoverSection,
  PopoverTool,
  ToolButton,
  ToolTip,
  popoverClass,
  useToolbarSide,
  type StyleTarget,
  type ToolbarItem,
} from "./parts"
import {
  LINE_SPACING,
  SPACE_BELOW_PX,
  TEXT_SIZES_PX,
  isBold,
  keyFor,
  stepTextSize,
  toggleToken,
  type LineSpacing,
  type Step,
} from "./toolbarModel"
import { usePagePalette } from "./usePagePalette"

const NO_BOX = { t: 0, r: 0, b: 0, l: 0 }
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify } as const
type Align = keyof typeof ALIGN_ICONS

function SizeStepper({ target }: { target: StyleTarget }) {
  const { t } = useLingui()
  const side = useToolbarSide()
  const { classes, device, typography, apply } = target
  const current = readValue(classes, device, fontSizeClassMap) ?? typography?.fontSize ?? 16
  const leading = readValue(classes, device, lineHeightClassMap)
  const setSize = (px: number) => {
    const edits: ClassEdit[] = [edit(fontSizeClassMap, px)]
    if (leading !== null) edits.push(edit(lineHeightClassMap, leading))
    apply(edits)
  }
  const smaller = stepTextSize(current, -1)
  const larger = stepTextSize(current, 1)
  const rounded = Math.round(current)
  return (
    <div role="group" aria-label={t`Text size`} className="flex h-7 items-center">
      <IconTool label={t`Smaller text`} disabled={smaller === null} onClick={() => smaller !== null && setSize(smaller)}>
        <Minus aria-hidden className="size-3.5" />
      </IconTool>
      <Popover>
        <ToolTip label={t`Text size`}>
          <PopoverTrigger asChild>
            <ToolButton label={t`Text size, ${rounded} pixels`} className="w-9 px-0 font-mono text-[12px] tabular-nums">
              {rounded}
            </ToolButton>
          </PopoverTrigger>
        </ToolTip>
        <PopoverContent side={side} align="center" sideOffset={8} collisionPadding={12} className={cn(popoverClass, "w-28 p-1")}>
          <div role="listbox" aria-label={t`Text size`} className="flex max-h-64 flex-col overflow-y-auto">
            {TEXT_SIZES_PX.slice(0, 10).map((px) => (
              <button
                key={px}
                type="button"
                role="option"
                aria-selected={Math.abs(px - current) < 0.5}
                onClick={() => setSize(px)}
                className="rounded-md px-2.5 py-1 text-left font-mono text-[12px] tabular-nums outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted aria-selected:bg-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_15%,transparent)] aria-selected:font-semibold"
              >
                {px}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <IconTool label={t`Larger text`} disabled={larger === null} onClick={() => larger !== null && setSize(larger)}>
        <Plus aria-hidden className="size-3.5" />
      </IconTool>
    </div>
  )
}

function SpacingPanel({ target }: { target: StyleTarget }) {
  const { t } = useLingui()
  const { classes, device, typography, apply } = target
  const leading = readValue(classes, device, lineHeightClassMap) ?? typography?.lineHeight ?? null
  const margin = readValue(classes, device, marginClassMap) ?? NO_BOX
  return (
    <div className="flex w-64 flex-col gap-3">
      <PopoverSection title={t`Line spacing`}>
        <Choice<LineSpacing>
          label={t`Line spacing`}
          value={keyFor(LINE_SPACING, leading, 0.06)}
          onChange={(key) => apply([edit(lineHeightClassMap, LINE_SPACING[key])])}
          options={[
            { value: "tight", label: t`Tight` },
            { value: "normal", label: t`Normal` },
            { value: "relaxed", label: t`Relaxed` },
            { value: "loose", label: t`Loose` },
          ]}
        />
      </PopoverSection>
      <PopoverSection title={t`Space below`}>
        <Choice<Step>
          label={t`Space below`}
          value={keyFor(SPACE_BELOW_PX, margin.b)}
          onChange={(key) => apply([withoutZeroSides(edit(marginClassMap, { ...margin, b: SPACE_BELOW_PX[key] }))])}
          options={[
            { value: "none", label: t`None` },
            { value: "small", label: t`S` },
            { value: "medium", label: t`M` },
            { value: "large", label: t`L` },
          ]}
        />
      </PopoverSection>
    </div>
  )
}

export function useTextTools(target: StyleTarget): ToolbarItem[] {
  const { t } = useLingui()
  const palette = usePagePalette(target.label, target.pageId)
  const { classes, device, typography, apply } = target
  const weight = readValue(classes, device, fontWeightClassMap) ?? typography?.fontWeight ?? "normal"
  const decor = readValue(classes, device, textDecorationClassMap) ?? []
  const color = readValue(classes, device, textColorClassMap) ?? ""
  const align = (readValue(classes, device, textAlignClassMap) ?? typography?.textAlign ?? "left") as Align
  const AlignIcon = ALIGN_ICONS[align] ?? AlignLeft
  const bold = isBold(weight)
  const toggleDecor = (token: string) => apply([edit(textDecorationClassMap, toggleToken(decor, token))])

  return [
    {
      key: "size",
      label: t`Text size`,
      width: ICON_WIDTH * 2 + 36,
      group: "type",
      priority: 1,
      node: <SizeStepper target={target} />,
    },
    {
      key: "bold",
      label: t`Bold`,
      width: ICON_WIDTH,
      group: "type",
      priority: 2,
      node: (
        <IconTool label={t`Bold`} pressed={bold} onClick={() => apply([edit(fontWeightClassMap, bold ? "normal" : "bold")])}>
          <Bold aria-hidden className="size-3.5" />
        </IconTool>
      ),
    },
    {
      key: "italic",
      label: t`Italic`,
      width: ICON_WIDTH,
      group: "type",
      priority: 6,
      node: (
        <IconTool label={t`Italic`} pressed={decor.includes("italic")} onClick={() => toggleDecor("italic")}>
          <Italic aria-hidden className="size-3.5" />
        </IconTool>
      ),
    },
    {
      key: "underline",
      label: t`Underline`,
      width: ICON_WIDTH,
      group: "type",
      priority: 7,
      node: (
        <IconTool label={t`Underline`} pressed={decor.includes("underline")} onClick={() => toggleDecor("underline")}>
          <Underline aria-hidden className="size-3.5" />
        </IconTool>
      ),
    },
    {
      key: "color",
      label: t`Text colour`,
      width: ICON_WIDTH,
      group: "type",
      priority: 3,
      node: (
        <PopoverTool
          label={t`Text colour`}
          trigger={<ColorBar icon={<Baseline aria-hidden className="size-3.5" />} color={toHex(color) ?? typography?.color ?? null} />}
          contentClassName="w-64"
        >
          <ColorSwatches label={t`Text colour`} value={color} palette={palette} onChange={(value) => apply([edit(textColorClassMap, value)])} />
        </PopoverTool>
      ),
    },
    {
      key: "align",
      label: t`Alignment`,
      width: ICON_WIDTH,
      group: "layout",
      priority: 5,
      node: (
        <PopoverTool label={t`Alignment`} trigger={<AlignIcon aria-hidden className="size-3.5" />} contentClassName="p-1.5">
          <Choice<Align>
            label={t`Alignment`}
            value={align}
            onChange={(value) => apply([edit(textAlignClassMap, value)])}
            className="w-40"
            options={[
              { value: "left", label: <AlignLeft aria-hidden className="size-3.5" />, title: t`Left` },
              { value: "center", label: <AlignCenter aria-hidden className="size-3.5" />, title: t`Centre` },
              { value: "right", label: <AlignRight aria-hidden className="size-3.5" />, title: t`Right` },
              { value: "justify", label: <AlignJustify aria-hidden className="size-3.5" />, title: t`Justify` },
            ]}
          />
        </PopoverTool>
      ),
    },
    {
      key: "spacing",
      label: t`Spacing`,
      width: ICON_WIDTH,
      group: "layout",
      priority: 8,
      node: (
        <PopoverTool label={t`Spacing`} trigger={<UnfoldVertical aria-hidden className="size-3.5" />}>
          <SpacingPanel target={target} />
        </PopoverTool>
      ),
    },
    deleteItem(t`Delete text`, target.remove),
  ]
}

export function deleteItem(label: string, onDelete: () => void): ToolbarItem {
  return {
    key: "delete",
    label,
    width: ICON_WIDTH,
    group: "delete",
    priority: 9,
    node: (
      <IconTool label={label} onClick={onDelete} className="hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400">
        <Trash2 aria-hidden className="size-3.5" />
      </IconTool>
    ),
  }
}
