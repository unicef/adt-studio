import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProviderDescriptor } from "./contract"
import { PROVIDER_CARDS } from "./data"
import {
  AuthModeToggle,
  CliGuidance,
  CredentialFields,
  DocsLink,
  EASE,
  HealthLine,
  ModalityBadges,
  SaveRow,
  authKind,
  defaultCardMode,
  descriptorById,
  localize,
  useDraft,
} from "./shared"
import { useProviderHealthMock, type ProvidersV2 } from "./useProvidersV2"

function Handles({ descriptor }: { descriptor: ProviderDescriptor }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">
        <Trans>Handles</Trans>
      </span>
      <ModalityBadges modalities={descriptor.manifest.modalities} />
    </div>
  )
}

function CardFooter({ descriptor }: { descriptor: ProviderDescriptor }) {
  return (
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
  )
}

function HelpText({ descriptor }: { descriptor: ProviderDescriptor }) {
  const { i18n } = useLingui()
  if (!descriptor.manifest.localizedHelp) return null
  return <p className="text-[11.5px] leading-normal text-muted-foreground">{localize(descriptor.manifest.localizedHelp, i18n.locale)}</p>
}

/** API-key (and local base-URL) backend: editable credential form + status. */
function ApiKeyPanel({ descriptor, store, active }: { descriptor: ProviderDescriptor; store: ProvidersV2; active: boolean }) {
  const draft = useDraft(descriptor, store)
  const health = useProviderHealthMock(descriptor.manifest.id, draft.values, active)
  return (
    <div className="flex flex-col gap-4">
      <HealthLine health={health.data} isFetching={health.isFetching} onRefresh={health.refetch} />
      <Handles descriptor={descriptor} />
      <CredentialFields draft={draft} onSubmit={draft.canSave ? draft.save : undefined} />
      <SaveRow draft={draft} />
      <HelpText descriptor={descriptor} />
      <CardFooter descriptor={descriptor} />
    </div>
  )
}

/** CLI/SDK backend: login is detected, not entered — status + guidance, no key field. */
function CliPanel({ descriptor, store, active }: { descriptor: ProviderDescriptor; store: ProvidersV2; active: boolean }) {
  const health = useProviderHealthMock(descriptor.manifest.id, store.credentials[descriptor.manifest.id] ?? {}, active)
  const deadEnd = health.data && (health.data.code === "not-logged-in" || health.data.code === "cli-not-found")
  return (
    <div className="flex flex-col gap-4">
      <HealthLine health={health.data} isFetching={health.isFetching} onRefresh={health.refetch} />
      <Handles descriptor={descriptor} />
      {deadEnd && <CliGuidance providerId={descriptor.manifest.id} code={health.data!.code} />}
      <HelpText descriptor={descriptor} />
      <CardFooter descriptor={descriptor} />
    </div>
  )
}

/**
 * A vendor. Vendors offering both an API and a local CLI (OpenAI→Codex, Anthropic→Claude
 * Agent) show a CLI ↔ API-key toggle that swaps which backend you configure; each mode keeps
 * its own modalities and connection state. Single-backend vendors render one panel.
 */
export function ProviderCard({ cardKey, store, active }: { cardKey: string; store: ProvidersV2; active: boolean }) {
  const card = PROVIDER_CARDS[cardKey]
  const dual = Boolean(card.apiKeyProviderId && card.cliProviderId)
  const [mode, setMode] = useState<"api-key" | "cli">(() => defaultCardMode(cardKey, store))

  if (dual) {
    const apiDesc = descriptorById(card.apiKeyProviderId!)
    const cliDesc = descriptorById(card.cliProviderId!)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            <Trans>Authentication</Trans>
          </div>
          <AuthModeToggle mode={mode} onChange={setMode} cliLabel={card.cliLabel} />
        </div>
        {mode === "api-key" ? (
          <ApiKeyPanel descriptor={apiDesc} store={store} active={active} />
        ) : (
          <CliPanel descriptor={cliDesc} store={store} active={active} />
        )}
      </div>
    )
  }

  const only = descriptorById(card.apiKeyProviderId ?? card.localProviderId!)
  return authKind(only) === "cli" ? (
    <CliPanel descriptor={only} store={store} active={active} />
  ) : (
    <ApiKeyPanel descriptor={only} store={store} active={active} />
  )
}
