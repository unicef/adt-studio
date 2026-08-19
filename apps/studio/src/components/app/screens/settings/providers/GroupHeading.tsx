import { useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"

export function GroupHeading({ label, hint }: { label: MessageDescriptor; hint?: MessageDescriptor }) {
  const { i18n } = useLingui()
  return (
    <div className="mb-2.5">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{i18n._(label)}</div>
      {hint && <div className="mt-0.5 text-[12.5px] text-muted-foreground/80">{i18n._(hint)}</div>}
    </div>
  )
}
