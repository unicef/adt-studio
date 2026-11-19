import { Trans } from "@lingui/react/macro"
import { SettingsHeading, SettingsLead } from "./ui"
import { useDefaultLlmSetting, useSpecializedDefaults } from "./modelDefaults"
import { useTaskModelDrafts } from "./taskModels/useTaskModelDrafts"
import { ModelsTable } from "./models/ModelsTable"

export function ModelsSection() {
  const llm = useDefaultLlmSetting()
  const specialized = useSpecializedDefaults()
  const tasks = useTaskModelDrafts(llm.draft)

  return (
    <>
      <SettingsHeading>
        <Trans>Models</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Each kind of pipeline task uses a compatible model. Image generation and speech use their own task-specific defaults.</Trans>
      </SettingsLead>
      <ModelsTable llm={llm} specialized={specialized} tasks={tasks} />
    </>
  )
}
