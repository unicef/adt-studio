import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import type { ProviderDescriptor } from "@adt/types"
import { cn } from "@/lib/utils"
import { useProviderHealth } from "@/hooks/use-provider-health"
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
  localize,
  useDraft,
} from "./shared"
import type { Providers } from "./useProviders"
import { CliLoginControls } from "./CliLogin"

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
        to="/settings/models"
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
function ApiKeyPanel({ descriptor, store, active }: { descriptor: ProviderDescriptor; store: Providers; active: boolean }) {
  const draft = useDraft(descriptor, store)
  const health = useProviderHealth(descriptor.manifest.id, draft.values, active)
  return (
    <div className="flex flex-col gap-4">
      <HealthLine health={health.data ?? null} isFetching={health.isFetching} onRefresh={() => void health.refetch()} />
      <Handles descriptor={descriptor} />
      <CredentialFields draft={draft} onSubmit={draft.canSave ? draft.save : undefined} />
      <SaveRow draft={draft} />
      <HelpText descriptor={descriptor} />
      <CardFooter descriptor={descriptor} />
    </div>
  )
}

/**
 * CLI/SDK backend: login is detected, not entered — status, an in-app sign-in
 * when the backend offers one, and terminal guidance otherwise. No key field.
 */
function CliPanel({ descriptor, store, active }: { descriptor: ProviderDescriptor; store: Providers; active: boolean }) {
  const health = useProviderHealth(descriptor.manifest.id, store.credentials[descriptor.manifest.id], active)
  const code = health.data?.code
  const canSignInHere = descriptor.supportsCliLogin === true
  // The in-app sign-in replaces the "run this in a terminal" guidance for a
  // missing login; a missing CLI still needs the install instructions.
  const showGuidance = code === "cli-not-found" || (code === "not-logged-in" && !canSignInHere)
  return (
    <div className="flex flex-col gap-4">
      <HealthLine health={health.data ?? null} isFetching={health.isFetching} onRefresh={() => void health.refetch()} />
      <Handles descriptor={descriptor} />
      {showGuidance && code && <CliGuidance providerId={descriptor.manifest.id} code={code} />}
      {active && <CliLoginControls descriptor={descriptor} health={health.data ?? null} />}
      <HelpText descriptor={descriptor} />
      <CardFooter descriptor={descriptor} />
    </div>
  )
}

function Panel({ descriptor, store, active }: { descriptor: ProviderDescriptor; store: Providers; active: boolean }) {
  return authKind(descriptor) === "cli" ? (
    <CliPanel descriptor={descriptor} store={store} active={active} />
  ) : (
    <ApiKeyPanel descriptor={descriptor} store={store} active={active} />
  )
}

/**
 * A vendor. Vendors offering both an API and a local CLI (OpenAI→Codex, Anthropic→Claude
 * Agent) show a CLI ↔ API-key toggle that swaps which backend you configure; each mode keeps
 * its own modalities and connection state. Single-backend vendors render one panel. A backend
 * the server does not register is left out of the toggle entirely.
 */
export function ProviderCard({ cardKey, store, active }: { cardKey: string; store: Providers; active: boolean }) {
  const card = PROVIDER_CARDS[cardKey]
  const apiDesc = card.apiKeyProviderId ? store.descriptorById(card.apiKeyProviderId) : undefined
  const cliDesc = card.cliProviderId ? store.descriptorById(card.cliProviderId) : undefined
  const localDesc = card.localProviderId ? store.descriptorById(card.localProviderId) : undefined
  const [mode, setMode] = useState<"api-key" | "cli">(() => defaultCardMode(cardKey, store))

  if (apiDesc && cliDesc) {
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

  const only = apiDesc ?? localDesc ?? cliDesc
  if (!only) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        <Trans>This provider is not registered on the server, so it cannot be configured here.</Trans>
      </p>
    )
  }
  return <Panel descriptor={only} store={store} active={active} />
}
