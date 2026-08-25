import { createFileRoute, redirect } from "@tanstack/react-router"
import { BookSettingsScreen } from "@/components/app/screens/pipeline/book-settings/BookSettingsScreen"
import {
  DEFAULT_BOOK_SETTINGS_SECTION,
  isBookSettingsSection,
} from "@/components/app/screens/pipeline/book-settings/sections"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"

export const Route = createFileRoute("/_app/pipeline/$label/settings/$section")({
  beforeLoad: ({ params }) => {
    if (!isBookSettingsSection(params.section)) {
      throw redirect({
        to: "/pipeline/$label/settings/$section",
        params: { label: params.label, section: DEFAULT_BOOK_SETTINGS_SECTION },
        replace: true,
      })
    }
  },
  component: BookSettingsRoute,
})

function BookSettingsRoute() {
  const { label, section } = Route.useParams()
  const nav = usePipelineNavigation(label)

  return (
    <BookSettingsScreen
      label={label}
      section={section}
      onSelectSection={nav.openBookSettings}
      onBack={nav.openWorkspace}
    />
  )
}
