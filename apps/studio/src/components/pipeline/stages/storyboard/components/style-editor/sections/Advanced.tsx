import { useCallback, useEffect, useId, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Section } from "../controls/Section"
import { useElementContext } from "../element-context"

/**
 * "Advanced" accordion item — a raw textarea showing the element's full
 * Tailwind class string. Edits commit on blur. Sits at the bottom of the
 * panel's main Accordion alongside the property sections.
 */
export function AdvancedSection() {
  const { dataId, classes, onClassesChange } = useElementContext()
  const [draft, setDraft] = useState(classes.join(" "))
  const fieldId = useId()

  useEffect(() => {
    setDraft(classes.join(" "))
  }, [classes])

  const commit = useCallback(() => {
    const parsed = draft.split(/\s+/).filter(Boolean)
    if (
      parsed.length === classes.length &&
      parsed.every((c, i) => c === classes[i])
    ) {
      return
    }
    onClassesChange(dataId, parsed)
  }, [draft, classes, dataId, onClassesChange])

  return (
    <Section title={<Trans>Advanced</Trans>}>
      <label htmlFor={fieldId} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Trans>Tailwind classes</Trans>
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        rows={4}
        className="w-full bg-muted/30 border border-input rounded-md px-2 py-1.5 text-[11px] font-mono leading-relaxed resize-y outline-none focus:ring-2 focus:ring-ring focus:border-ring"
      />
      <p className="text-[10px] text-muted-foreground/70">
        <Trans>Space-separated. Saves on blur.</Trans>
      </p>
    </Section>
  )
}
