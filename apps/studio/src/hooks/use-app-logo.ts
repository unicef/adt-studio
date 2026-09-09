import { useMemo } from "react"
import betaLogoSrc from "@/assets/update-icons/beta-512x512.png?url"
import { getReleaseChannel } from "@/components/updates/release-banner-utils"
import { useAppVersion } from "./use-app-version"

export function useAppLogo(): string {
  const version = useAppVersion()
  return useMemo(
    () => (version && getReleaseChannel(version) === "beta" ? betaLogoSrc : "/logo.png"),
    [version],
  )
}
