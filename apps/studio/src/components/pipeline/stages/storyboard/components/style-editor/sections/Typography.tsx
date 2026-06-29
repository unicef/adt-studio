/* eslint-disable lingui/no-unlocalized-strings -- "Aa" typographic samples + tailwind size/weight tokens, not UI copy */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { StyleLabel } from "../controls/StyleLabel"
import { Section } from "../controls/Section"
import { Select, type SelectOption } from "../controls/Select"
import { ColorInput } from "../controls/ColorInput"
import { NumericInput } from "../controls/NumericInput"
import { TokenInput } from "../controls/TokenInput"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  FONT_SIZE_TOKEN_LIST,
  fontSizeClassMap,
  fontWeightClassMap,
  textAlignClassMap,
  lineHeightClassMap,
  textDecorationClassMap,
  textColorClassMap,
} from "../class-maps"
import { useElementStyles } from "../use-element-styles"
import { useElementContext } from "../element-context"
import { FontFamilyControl } from "./FontFamilyControl"

const WEIGHT_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: "thin", label: "thin", preview: <span className="font-thin">Aa</span> },
  { value: "extralight", label: "extralight", preview: <span className="font-extralight">Aa</span> },
  { value: "light", label: "light", preview: <span className="font-light">Aa</span> },
  { value: "normal", label: "normal", preview: <span className="font-normal">Aa</span> },
  { value: "medium", label: "medium", preview: <span className="font-medium">Aa</span> },
  { value: "semibold", label: "semibold", preview: <span className="font-semibold">Aa</span> },
  { value: "bold", label: "bold", preview: <span className="font-bold">Aa</span> },
  { value: "extrabold", label: "extrabold", preview: <span className="font-extrabold">Aa</span> },
  { value: "black", label: "black", preview: <span className="font-black">Aa</span> },
]

const EMPTY_DECOR: string[] = []

export function TypographySection() {
  const { t } = useLingui()
  const { computedStyles, bookLabel } = useElementContext()
  const elementFontFamily = computedStyles?.fontFamily ?? null
  const inheritedFontSize = computedStyles?.fontSize ?? null
  const inheritedWeight = computedStyles?.fontWeight ?? null
  const inheritedAlign = computedStyles?.textAlign ?? null
  const inheritedLeading = computedStyles?.lineHeight ?? null
  const inheritedColor = computedStyles?.color ?? null
  const fontSize = useElementStyles(fontSizeClassMap, inheritedFontSize ?? 16)
  const weight = useElementStyles(fontWeightClassMap, inheritedWeight ?? "normal")
  const decor = useElementStyles(textDecorationClassMap, EMPTY_DECOR)
  const align = useElementStyles(textAlignClassMap, inheritedAlign ?? "left")
  const leading = useElementStyles(lineHeightClassMap, inheritedLeading ?? 1.5)
  const textColor = useElementStyles(textColorClassMap, inheritedColor ?? "")

  const decorItems = [
    { value: "italic", icon: Italic, label: t`Italic` },
    { value: "underline", icon: Underline, label: t`Underline` },
    { value: "strike", icon: Strikethrough, label: t`Strikethrough` },
  ]

  const alignItems = [
    { value: "left", icon: AlignLeft, label: t`Align left` },
    { value: "center", icon: AlignCenter, label: t`Align center` },
    { value: "right", icon: AlignRight, label: t`Align right` },
    { value: "justify", icon: AlignJustify, label: t`Justify` },
  ]

  return (
    <Section title={<Trans>Typography</Trans>}>
      {bookLabel ? (
        <FontFamilyControl bookLabel={bookLabel} />
      ) : elementFontFamily ? (
        <StyleLabel label={<Trans>Font</Trans>}>
          <span
            className="text-[11px] text-foreground truncate"
            title={elementFontFamily}
          >
            {elementFontFamily}
          </span>
        </StyleLabel>
      ) : null}
      <StyleLabel
        label={<Trans>Size</Trans>}
        override={fontSize.override}
        inherited={!fontSize.isExplicit && inheritedFontSize != null}
      >
        <TokenInput
          value={fontSize.value}
          onChange={fontSize.setValue}
          tokens={FONT_SIZE_TOKEN_LIST}
          suffix="px"
          renderPreview={(tok) => (
            <span style={{ fontSize: Math.min(tok.value, 22) }}>Aa</span>
          )}
        />
      </StyleLabel>
      <StyleLabel
        label={<Trans>Weight</Trans>}
        override={weight.override}
        inherited={!weight.isExplicit && inheritedWeight != null}
      >
        <Select value={weight.value} onChange={weight.setValue} options={WEIGHT_OPTIONS} />
      </StyleLabel>
      <StyleLabel label={<Trans>Style</Trans>} override={decor.override}>
        <ToggleGroup
          type="multiple"
          size="xs"
          value={decor.value}
          onValueChange={decor.setValue}
        >
          {decorItems.map(({ value, icon: Icon, label }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
              <Icon className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </StyleLabel>
      <StyleLabel
        label={<Trans>Align</Trans>}
        override={align.override}
        inherited={!align.isExplicit && inheritedAlign != null}
      >
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
      <StyleLabel
        label={<Trans>Leading</Trans>}
        override={leading.override}
        inherited={!leading.isExplicit && inheritedLeading != null}
      >
        <NumericInput
          value={leading.value}
          onCommit={leading.setValue}
          suffix="×"
        />
      </StyleLabel>
      <StyleLabel
        label={<Trans>Text color</Trans>}
        override={textColor.override}
        inherited={!textColor.isExplicit && !!inheritedColor}
      >
        <ColorInput value={textColor.value} onChange={textColor.setValue} />
      </StyleLabel>
    </Section>
  )
}
