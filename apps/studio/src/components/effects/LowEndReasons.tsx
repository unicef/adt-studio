import { Plural, Trans } from "@lingui/react/macro"
import type { HardwareProfile, LowEndReason } from "@/lib/effects"

function Reason({ reason, hw }: { reason: LowEndReason; hw: HardwareProfile }) {
  if (reason === "software-rendering") return <Trans>graphics drawn without the GPU</Trans>
  if (reason === "cores") return <Plural value={hw.cores ?? 0} one="# processor core" other="# processor cores" />
  return <Trans>{hw.memoryGb} GB of memory</Trans>
}

/** Why a machine counts as low-end, in words: "graphics drawn without the GPU, 4 processor cores". */
export function LowEndReasons({ reasons, hw }: { reasons: LowEndReason[]; hw: HardwareProfile }) {
  return (
    <>
      {reasons.map((r, i) => (
        <span key={r}>
          {i > 0 && ", "}
          <Reason reason={r} hw={hw} />
        </span>
      ))}
    </>
  )
}
