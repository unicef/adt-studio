import { Trans } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { ArrowRight, ScrollText } from "lucide-react"
import { SETTINGS_PATHS, SETTINGS_TABS, sectionAnchor } from "../nav"
import { SECTION_COMPONENTS } from "../sectionComponents"
import { SettingsCard, SettingsHeading, SettingsLead } from "../ui"

function PromptsSectionLink() {
  return (
    <>
      <SettingsHeading>
        <Trans>Prompts</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Edit the fallback prompts used by every book.</Trans>
      </SettingsLead>
      <SettingsCard>
        <Link
          to={SETTINGS_PATHS.prompts}
          className="flex items-center gap-3.5 py-4 text-left transition-colors hover:text-brand-700"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-brand-50 text-brand-600">
            <ScrollText className="size-[19px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              <Trans>Open the global prompt editor</Trans>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              <Trans>The full editor opens on its own page for more room to work.</Trans>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </SettingsCard>
    </>
  )
}

export function SettingsAllSections() {
  return (
    <div className="flex flex-col gap-14">
      {SETTINGS_TABS.map((tab) => {
        const Section = SECTION_COMPONENTS[tab.key]
        return (
          <section key={tab.key} id={sectionAnchor(tab.key)} className="scroll-mt-24">
            {tab.key === "prompts" ? <PromptsSectionLink /> : <Section />}
          </section>
        )
      })}
    </div>
  )
}
