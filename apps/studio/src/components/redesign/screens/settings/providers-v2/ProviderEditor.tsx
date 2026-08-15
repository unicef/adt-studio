import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProviderDescriptor } from "./contract"
import {
  AuthModeToggle,
  CliGuidance,
  CredentialFields,
  DocsLink,
  EASE,
  HealthLine,
  SaveRow,
  authKind,
  localize,
  useDraft,
} from "./shared"
import { useProviderHealthMock, type ProvidersV2 } from "./useProvidersV2"

export function ProviderEditor({
  descriptor,
  store,
  active,
  onSaved,
}: {
  descriptor: ProviderDescriptor
  store: ProvidersV2
  active: boolean
  onSaved?: () => void
}) {
  const { i18n } = useLingui()
  const id = descriptor.manifest.id
  const kind = authKind(descriptor)
  const draft = useDraft(descriptor, store, onSaved)
  const [authMode, setAuthMode] = useState<"cli" | "api-key">(() =>
    (draft.values.apiKey ?? "").length > 0 ? "api-key" : "cli",
  )
  const health = useProviderHealthMock(id, draft.values, active)

  const showApiKeyForm = kind !== "cli" || authMode === "api-key"
  const cliDeadEnd = health.data && (health.data.code === "not-logged-in" || health.data.code === "cli-not-found")

  return (
    <div className="flex flex-col gap-4">
      {kind === "cli" && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            <Trans>Authentication</Trans>
          </div>
          <AuthModeToggle mode={authMode} onChange={setAuthMode} />
        </div>
      )}

      <HealthLine health={health.data} isFetching={health.isFetching} onRefresh={health.refetch} />

      {kind === "cli" && authMode === "cli" && cliDeadEnd && (
        <CliGuidance providerId={id} code={health.data!.code} />
      )}

      {showApiKeyForm && (
        <>
          <CredentialFields draft={draft} onSubmit={draft.canSave ? draft.save : undefined} />
          <SaveRow draft={draft} />
        </>
      )}

      {descriptor.manifest.localizedHelp && (
        <p className="text-[11.5px] leading-normal text-muted-foreground">{localize(descriptor.manifest.localizedHelp, i18n.locale)}</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        {descriptor.manifest.docsUrl ? <DocsLink url={descriptor.manifest.docsUrl} /> : <span />}
        <Link
          to="/redesign/settings/models"
          className={cn(
            "inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline",
            EASE,
          )}
        >
          <Trans>Assign models</Trans>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
