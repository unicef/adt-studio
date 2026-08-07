import { RotateCcw, RotateCw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { StyleLabel } from "../controls/StyleLabel"
import { Section } from "../controls/Section"
import { Select, type SelectOption } from "../controls/Select"
import { BoxInput, type BoxValue } from "../controls/BoxInput"
import { NumericInput } from "../controls/NumericInput"
import {
  positionClassMap,
  insetClassMap,
  rotateClassMap,
  translateXClassMap,
  translateYClassMap,
  scaleClassMap,
} from "../class-maps"
import { useElementStyles } from "../use-element-styles"

// CSS position keywords double as their own labels — technical identifiers,
// not translatable copy (mirrors the display options in the Layout section).
const POSITION_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
].map((v) => ({ value: v, label: v }))

// Axis abbreviations for the translate fields — technical identifiers, not copy.
const AXIS = { x: "X", y: "Y" } as const

const ZERO_BOX: BoxValue = { t: 0, r: 0, b: 0, l: 0 }

const iconButtonClass = cn(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2.5 text-muted-foreground outline-none",
  "hover:bg-muted hover:text-foreground transition-colors cursor-pointer",
  "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500"
)

export function PositionSection() {
  const { t } = useLingui()
  const position = useElementStyles(positionClassMap, "static")
  const inset = useElementStyles(insetClassMap, ZERO_BOX)
  const rotate = useElementStyles(rotateClassMap, 0)
  const translateX = useElementStyles(translateXClassMap, 0)
  const translateY = useElementStyles(translateYClassMap, 0)
  const scale = useElementStyles(scaleClassMap, 100)

  return (
    <Section title={<Trans>Position</Trans>}>
      <StyleLabel label={<Trans>Position</Trans>} override={position.override}>
        <Select
          value={position.value}
          onChange={position.setValue}
          options={POSITION_OPTIONS}
        />
      </StyleLabel>

      <StyleLabel label={<Trans>Offset</Trans>} override={inset.override}>
        <BoxInput value={inset.value} onChange={inset.setValue} />
      </StyleLabel>

      <StyleLabel label={<Trans>Rotate</Trans>} override={rotate.override}>
        <div className="flex w-full items-center gap-1.5">
          <button
            type="button"
            title={t`Rotate 90° counter-clockwise`}
            aria-label={t`Rotate 90° counter-clockwise`}
            onClick={() => rotate.setValue(rotate.value - 90)}
            className={iconButtonClass}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t`Rotate 90° clockwise`}
            aria-label={t`Rotate 90° clockwise`}
            onClick={() => rotate.setValue(rotate.value + 90)}
            className={cn(iconButtonClass, "flex-1")}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="tabular-nums text-[12px] text-foreground">
              {rotate.value}&deg;
            </span>
          </button>
        </div>
      </StyleLabel>

      <StyleLabel
        label={<Trans context="CSS transform">Translate</Trans>}
        override={translateX.override ?? translateY.override}
      >
        <div className="grid w-full grid-cols-2 gap-1.5">
          <NumericInput
            value={translateX.value}
            onCommit={translateX.setValue}
            inputMode="numeric"
            suffix={AXIS.x}
          />
          <NumericInput
            value={translateY.value}
            onCommit={translateY.setValue}
            inputMode="numeric"
            suffix={AXIS.y}
          />
        </div>
      </StyleLabel>

      <StyleLabel label={<Trans>Scale</Trans>} override={scale.override}>
        <NumericInput
          value={scale.value}
          // Clearing the field commits 0; treat 0 (and negatives) as "no
          // scaling" (100%) rather than `scale-0`, which would make the
          // element vanish.
          onCommit={(n) => scale.setValue(n <= 0 ? 100 : n)}
          inputMode="numeric"
          suffix="%"
        />
      </StyleLabel>
    </Section>
  )
}
