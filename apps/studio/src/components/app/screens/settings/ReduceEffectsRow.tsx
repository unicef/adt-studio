import { useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Gauge } from "lucide-react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { lowEndReasons, readEffectsMode, readHardware, setEffectsMode, systemPrefersReducedMotion, useReducedEffects, type EffectsMode, type LowEndReason } from "@/lib/effects"
import { EFFECTS_OPTIONS } from "./options"
import { SETTINGS_ANCHORS } from "./nav"
import { SettingRow } from "./ui"

function Reason({ reason, cores, memoryGb }: { reason: LowEndReason; cores?: number; memoryGb?: number }) {
  if (reason === "software-rendering") return <Trans>graphics drawn without the GPU</Trans>
  if (reason === "cores") return <Plural value={cores ?? 0} one="# processor core" other="# processor cores" />
  return <Trans>{memoryGb} GB of memory</Trans>
}

function Status({ mode }: { mode: EffectsMode }) {
  const reduced = useReducedEffects()
  const hw = readHardware()
  const reasons = lowEndReasons(hw)
  const osMotion = systemPrefersReducedMotion()

  let text
  if (mode === "auto" && reasons.length > 0) {
    text = (
      <Trans>
        Auto turned this on for this computer:{" "}
        {reasons.map((r, i) => (
          <span key={r}>
            {i > 0 && ", "}
            <Reason reason={r} cores={hw.cores} memoryGb={hw.memoryGb} />
          </span>
        ))}
        .
      </Trans>
    )
  } else if (mode === "auto" && osMotion) {
    text = <Trans>Auto turned this on because your system asks for less motion.</Trans>
  } else if (mode === "auto") {
    text = <Trans>Auto is off: this computer can run full effects.</Trans>
  } else if (mode === "on") {
    text = <Trans>Effects are reduced everywhere in Studio.</Trans>
  } else if (osMotion) {
    text = <Trans>Your system asks for less motion, so animations stay reduced.</Trans>
  } else {
    text = <Trans>Full effects are always used on this computer.</Trans>
  }

  return (
    <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Gauge className={reduced ? "size-3.5 text-brand-600" : "size-3.5"} />
      <span>{text}</span>
    </span>
  )
}

export function ReduceEffectsRow() {
  const { i18n } = useLingui()
  const [mode, setMode] = useState<EffectsMode>(readEffectsMode)

  return (
    <SettingRow
      anchorId={SETTINGS_ANCHORS.reduceEffects}
      title={<Trans>Reduce effects</Trans>}
      subtitle={
        <>
          <Trans>Simpler animations and no blur or 3D, so Studio stays smooth on slower computers.</Trans>
          <Status mode={mode} />
        </>
      }
    >
      <SegmentedControl
        options={EFFECTS_OPTIONS.map((o) => ({ value: o.key, label: i18n._(o.label) }))}
        value={mode}
        onValueChange={(next) => {
          setMode(next)
          setEffectsMode(next)
        }}
        className="h-9 w-[204px] shrink-0"
      />
    </SettingRow>
  )
}
