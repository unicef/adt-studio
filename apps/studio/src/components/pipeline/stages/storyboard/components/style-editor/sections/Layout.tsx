import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  StretchHorizontal,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { StyleLabel } from "../controls/StyleLabel"
import { Section } from "../controls/Section"
import { Select, type SelectOption } from "../controls/Select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  displayClassMap,
  flexDirectionClassMap,
  justifyContentClassMap,
  alignItemsClassMap,
  gapClassMap,
} from "../class-maps"
import { useElementStyles } from "../use-element-styles"

const DISPLAY_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  "block",
  "inline-block",
  "inline",
  "flex",
  "grid",
  "hidden",
].map((v) => ({ value: v, label: v }))

export function LayoutSection() {
  const { t } = useLingui()
  const display = useElementStyles(displayClassMap, "block")
  const flexDir = useElementStyles(flexDirectionClassMap, "row")
  const justify = useElementStyles(justifyContentClassMap, "start")
  const align = useElementStyles(alignItemsClassMap, "start")
  const gap = useElementStyles(gapClassMap, 0)

  const isFlex = display.value === "flex" || display.value === "grid"

  const directionItems = [
    { value: "row", icon: ArrowRight, label: t`Row` },
    { value: "row-reverse", icon: ArrowLeft, label: t`Row reverse` },
    { value: "col", icon: ArrowDown, label: t`Column` },
    { value: "col-reverse", icon: ArrowUp, label: t`Column reverse` },
  ]

  const isColumn = flexDir.value === "col" || flexDir.value === "col-reverse"

  const justifyItems = isColumn
    ? [
        { value: "start", icon: AlignVerticalJustifyStart, label: t`Start` },
        { value: "center", icon: AlignVerticalJustifyCenter, label: t`Center` },
        { value: "end", icon: AlignVerticalJustifyEnd, label: t`End` },
        { value: "between", icon: AlignHorizontalSpaceBetween, label: t`Space between` },
        { value: "around", icon: AlignHorizontalSpaceAround, label: t`Space around` },
      ]
    : [
        { value: "start", icon: AlignHorizontalJustifyStart, label: t`Start` },
        { value: "center", icon: AlignHorizontalJustifyCenter, label: t`Center` },
        { value: "end", icon: AlignHorizontalJustifyEnd, label: t`End` },
        { value: "between", icon: AlignHorizontalSpaceBetween, label: t`Space between` },
        { value: "around", icon: AlignHorizontalSpaceAround, label: t`Space around` },
      ]

  const alignItems = isColumn
    ? [
        { value: "start", icon: AlignHorizontalJustifyStart, label: t`Start` },
        { value: "center", icon: AlignHorizontalJustifyCenter, label: t`Center` },
        { value: "end", icon: AlignHorizontalJustifyEnd, label: t`End` },
        { value: "stretch", icon: StretchHorizontal, label: t`Stretch` },
      ]
    : [
        { value: "start", icon: AlignVerticalJustifyStart, label: t`Start` },
        { value: "center", icon: AlignVerticalJustifyCenter, label: t`Center` },
        { value: "end", icon: AlignVerticalJustifyEnd, label: t`End` },
        { value: "stretch", icon: StretchHorizontal, label: t`Stretch` },
      ]

  return (
    <Section title={<Trans>Layout</Trans>}>
      <StyleLabel label={<Trans>Display</Trans>} override={display.override}>
        <Select value={display.value} onChange={display.setValue} options={DISPLAY_OPTIONS} />
      </StyleLabel>
      {isFlex && (
        <>
          <StyleLabel label={<Trans>Direction</Trans>} override={flexDir.override}>
            <ToggleGroup
              type="single"
              size="xs"
              sliding
              value={flexDir.value}
              onValueChange={(v) => v && flexDir.setValue(v)}
            >
              {directionItems.map(({ value, icon: Icon, label }) => (
                <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
                  <Icon className="h-3.5 w-3.5" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </StyleLabel>
          <StyleLabel label={<Trans>Justify</Trans>} override={justify.override}>
            <ToggleGroup
              type="single"
              size="xs"
              sliding
              value={justify.value}
              onValueChange={(v) => v && justify.setValue(v)}
            >
              {justifyItems.map(({ value, icon: Icon, label }) => (
                <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
                  <Icon className="h-3.5 w-3.5" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </StyleLabel>
          <StyleLabel label={<Trans>Align</Trans>} override={align.override}>
            <ToggleGroup
              type="single"
              size="xs"
              sliding
              value={align.value}
              onValueChange={(v) => v && align.setValue(v)}
            >
              {alignItems.map(({ value, icon: Icon, label }) => (
                <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
                  <Icon className="h-3.5 w-3.5" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </StyleLabel>
          <StyleLabel label={<Trans>Gap</Trans>} override={gap.override}>
            <input
              type="number"
              aria-label={t`Gap`}
              value={gap.value}
              onChange={(e) => gap.setValue(Number(e.target.value) || 0)}
              min={0}
              className={cn(
                "h-8 w-full bg-muted/60 rounded-md px-2 text-[12px] tabular-nums outline-none",
                "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              )}
            />
          </StyleLabel>
        </>
      )}
    </Section>
  )
}
