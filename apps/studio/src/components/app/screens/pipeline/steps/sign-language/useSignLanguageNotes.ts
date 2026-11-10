import { useMemo } from "react"
import { TriangleAlert } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { StepNote } from "../shared/notes/NoteRow"
import type { SignLanguageModel } from "./useSignLanguageModel"

export function useSignLanguageNotes(model: SignLanguageModel, onShowUnplaced: () => void): StepNote[] {
  const { t } = useLingui()
  const orphans = model.orphans.length
  return useMemo(
    () =>
      orphans === 0
        ? []
        : [
            {
              id: "orphans",
              icon: TriangleAlert,
              attention: true,
              title: t`${plural(orphans, { one: "# video lost its section", other: "# videos lost their section" })}`,
              body: t`Storyboard no longer has the section these were on, so readers never see them. Choose a new page for each one.`,
              actions: [{ label: t`Show them`, onClick: onShowUnplaced, primary: true }],
            },
          ],
    [orphans, onShowUnplaced, t],
  )
}
