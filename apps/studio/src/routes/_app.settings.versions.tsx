import { createFileRoute, redirect } from "@tanstack/react-router"
import { VersionsSection } from "@/components/app/screens/settings/VersionsSection"
import { SETTINGS_PATHS, isSettingsSectionAvailable } from "@/components/app/screens/settings/nav"

export const Route = createFileRoute("/_app/settings/versions")({
  beforeLoad: () => {
    if (!isSettingsSectionAvailable("versions")) {
      throw redirect({ to: SETTINGS_PATHS.about, replace: true })
    }
  },
  component: VersionsSection,
})
