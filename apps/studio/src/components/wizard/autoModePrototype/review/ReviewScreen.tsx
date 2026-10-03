import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { AllSettingsDialog } from "./AllSettingsDialog"
import { useBookFacts } from "./parts"
import { ReviewCheckout } from "./ReviewCheckout"
import { useProcessing, useSettings, type AiPicks } from "./setup"
import "../upload/upload.css"
import { ScreenShell } from "../ui"

/**
 * Step 5 — review and create, in one screen. Everything the book needs before it's created: its
 * Project Name and languages (the AI never picks those), the AI's setup under the wizard's own
 * names with inline changes, the Content Processing the preset turned on, and "Create book".
 * "Open all settings" opens a dialog with every option. There is no switch to the manual wizard
 * from here: auto vs manual is decided on the choose step.
 */
export function ReviewScreen({ picks, onBack, onCreate }: { picks: AiPicks; onBack: () => void; onCreate: () => void }) {
  const { t } = useLingui()
  const [allOpen, setAllOpen] = useState(false)
  const { settings, set } = useSettings(picks)
  const processing = useProcessing()
  const facts = useBookFacts()
  const title = facts.title || t`your book`

  return (
    <ScreenShell
      scrollClassName="pb-16"
      overlay={
        <>
          <AllSettingsDialog
            open={allOpen}
            onOpenChange={setAllOpen}
            settings={settings}
            set={set}
            title={title}
            picks={picks}
          />
        </>
      }
    >
      <ReviewCheckout settings={settings} set={set} processing={processing} title={title} numPages={facts.numPages} cover={facts.cover} onBack={onBack} onCreate={onCreate} onAllSettings={() => setAllOpen(true)} />
    </ScreenShell>
  )
}
