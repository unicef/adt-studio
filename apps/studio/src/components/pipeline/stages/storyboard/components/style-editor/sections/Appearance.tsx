import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { StyleLabel } from "../controls/StyleLabel"
import { Section } from "../controls/Section"
import { Select, type SelectOption } from "../controls/Select"
import { ColorInput } from "../controls/ColorInput"
import {
  backgroundColorClassMap,
  opacityClassMap,
  shadowClassMap,
} from "../class-maps"
import { useElementStyles } from "../use-element-styles"

const SHADOW_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: "none", label: "None" },
  { value: "sm", label: "sm" },
  { value: "DEFAULT", label: "Default" },
  { value: "md", label: "md" },
  { value: "lg", label: "lg" },
  { value: "xl", label: "xl" },
  { value: "2xl", label: "2xl" },
]

export function AppearanceSection() {
  const { t } = useLingui()
  const bgColor = useElementStyles(backgroundColorClassMap, "")
  const opacity = useElementStyles(opacityClassMap, 100)
  // Local draft so dragging the slider doesn't fire a class update / refreshCss
  // per tick. Commits 200ms after the user stops moving (or on release).
  const [opacityDraft, setOpacityDraft] = useState(opacity.value)
  useEffect(() => setOpacityDraft(opacity.value), [opacity.value])
  const opacityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (opacityTimerRef.current) clearTimeout(opacityTimerRef.current)
    },
    []
  )
  const handleOpacityChange = (next: number) => {
    setOpacityDraft(next)
    if (opacityTimerRef.current) clearTimeout(opacityTimerRef.current)
    opacityTimerRef.current = setTimeout(() => {
      opacityTimerRef.current = null
      opacity.setValue(next)
    }, 200)
  }
  const flushOpacity = () => {
    if (opacityTimerRef.current) {
      clearTimeout(opacityTimerRef.current)
      opacityTimerRef.current = null
      if (opacityDraft !== opacity.value) opacity.setValue(opacityDraft)
    }
  }
  const shadow = useElementStyles(shadowClassMap, "none")

  return (
    <Section title={<Trans>Appearance</Trans>}>
      <StyleLabel label={<Trans>Background</Trans>} override={bgColor.override}>
        <ColorInput value={bgColor.value} onChange={bgColor.setValue} />
      </StyleLabel>
      <StyleLabel label={<Trans>Opacity</Trans>} override={opacity.override}>
        <input
          type="range"
          aria-label={t`Opacity`}
          min={0}
          max={100}
          step={5}
          value={opacityDraft}
          onChange={(e) => handleOpacityChange(Number(e.target.value))}
          onMouseUp={flushOpacity}
          onKeyUp={flushOpacity}
          className="flex-1 accent-violet-500"
        />
        <span className="text-[11px] tabular-nums w-8 text-right text-muted-foreground">
          {opacityDraft}%
        </span>
      </StyleLabel>
      <StyleLabel label={<Trans>Shadow</Trans>} override={shadow.override}>
        <Select value={shadow.value} onChange={shadow.setValue} options={SHADOW_OPTIONS} />
      </StyleLabel>
    </Section>
  )
}
