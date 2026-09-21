import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { KeyRound } from "lucide-react"
import type { BookDetail } from "@/api/client"
import { StoryboardSettings } from "@/components/pipeline/stages/storyboard/StoryboardSettings"
import { BookModelSettings } from "@/components/pipeline/stages/book/BookModelSettings"
import { ScreenFallback } from "@/components/app/ui/ScreenFallback"
import { SETTINGS_PATHS } from "@/components/app/screens/settings/nav"
import {
  SettingRow,
  SettingsCard,
  SettingsHeading,
  SettingsLead,
} from "@/components/app/screens/settings/ui"
import { BookInfoSection } from "./BookInfoSection"
import { bookSettingsScope } from "./sections"

export interface BookSettingsBodyProps {
  label: string
  book: BookDetail | undefined
  bookError: Error | null
  section: string
}

export function BookSettingsBody({ label, book, bookError, section }: BookSettingsBodyProps) {
  if (bookSettingsScope(section) === "storyboard") {
    return <StoryboardSettings bookLabel={label} tab={section} />
  }

  if (section === "api-keys") return <ApiKeysSection />

  if (section === "models") {
    return (
      <>
        <SettingsHeading>
          <Trans>Models</Trans>
        </SettingsHeading>
        <SettingsLead>
          <Trans>Pick the models this book uses instead of the app-wide defaults.</Trans>
        </SettingsLead>
        <BookModelSettings bookLabel={label} />
      </>
    )
  }

  if (!book) return <ScreenFallback error={bookError} />

  return <BookInfoSection label={label} book={book} />
}

function ApiKeysSection() {
  return (
    <>
      <SettingsHeading>
        <Trans>API keys</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>The credentials ADT Studio uses when it runs AI steps for this book.</Trans>
      </SettingsLead>
      <SettingsCard>
        <SettingRow
          title={<Trans>Provider credentials</Trans>}
          subtitle={
            <Trans>
              Keys are shared by every book on this machine and are sent only with run requests.
            </Trans>
          }
        >
          <Link
            to={SETTINGS_PATHS.providers}
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            <KeyRound className="size-4" />
            <Trans>Open AI providers</Trans>
          </Link>
        </SettingRow>
      </SettingsCard>
    </>
  )
}
