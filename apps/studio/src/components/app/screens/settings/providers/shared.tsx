import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  KeyRound,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/sonner"
import type {
  AiModality,
  LocalizedText,
  ProviderDescriptor,
  ProviderHealthCode,
  ProviderHealthResponse,
} from "@adt/types"
import { useProviderHealth } from "@/hooks/use-provider-health"
import { PROVIDER_CARDS } from "./data"
import { PROVIDER_BRAND } from "./providerLogos"
import { authKind, requiredFieldsFilled, type Providers } from "./useProviders"

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

/** Resolve server-localized manifest text for the active locale (falls back to English). */
export function localize(text: LocalizedText, locale: string): string {
  return text[locale as keyof LocalizedText] ?? text.en
}

type Tone = "ok" | "warn" | "error" | "muted"

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
  muted: "text-muted-foreground",
}
const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-destructive",
  muted: "bg-muted-foreground/40",
}

function toneOf(code: ProviderHealthCode): Tone {
  switch (code) {
    case "ok":
    case "local-login":
      return "ok"
    case "not-logged-in":
    case "cli-not-found":
      return "warn"
    case "invalid-credential":
    case "unreachable":
    case "invalid-response":
      return "error"
    default:
      return "muted"
  }
}

function LongMessage({ health }: { health: ProviderHealthResponse }) {
  switch (health.code) {
    case "ok":
      return health.modelCount !== undefined ? (
        <Trans>Connected — {health.modelCount} models available.</Trans>
      ) : (
        <Trans>Connected successfully.</Trans>
      )
    case "local-login":
      return <Trans>Connected through the login already present on this machine.</Trans>
    case "configured":
      return <Trans>Credentials are set, but this provider offers no automatic check.</Trans>
    case "missing-credential":
      return <Trans>A required credential is missing.</Trans>
    case "invalid-credential":
      return <Trans>The provider rejected these credentials.</Trans>
    case "cli-not-found":
      return <Trans>The command-line tool this provider needs was not found on this machine.</Trans>
    case "not-logged-in":
      return <Trans>No login found on this machine. Sign in with the provider&apos;s CLI or set an API key.</Trans>
    case "unreachable":
      return <Trans>The provider could not be reached.</Trans>
    case "invalid-response":
      return <Trans>The provider answered with an unexpected response.</Trans>
    default:
      return <Trans>This provider has no automatic connection check.</Trans>
  }
}

/** Full status line with icon, message, detail, and a Refresh button. */
export function HealthLine({
  health,
  isFetching,
  onRefresh,
}: {
  health: ProviderHealthResponse | null
  isFetching: boolean
  onRefresh: () => void
}) {
  const StatusIcon = !health
    ? HelpCircle
    : isFetching
      ? Loader2
      : toneOf(health.code) === "ok"
        ? CheckCircle2
        : toneOf(health.code) === "muted"
          ? HelpCircle
          : AlertCircle
  const tone: Tone = health ? toneOf(health.code) : "muted"
  return (
    <div className="flex items-start gap-2.5">
      <StatusIcon className={cn("mt-px size-4 shrink-0", isFetching && "animate-spin motion-reduce:animate-none", TONE_TEXT[tone])} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12.5px] font-medium leading-snug", TONE_TEXT[tone])}>
          {isFetching ? <Trans>Checking the connection…</Trans> : health ? <LongMessage health={health} /> : <Trans>Connection not checked yet.</Trans>}
        </p>
        {health?.detail && !isFetching && (
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{health.detail}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={isFetching}
        className="h-7 shrink-0 gap-1.5 px-2 text-[12px]"
      >
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin motion-reduce:animate-none")} />
        <Trans>Refresh</Trans>
      </Button>
    </div>
  )
}

export function ProviderTile({ id, className }: { id: string; className?: string }) {
  const brand = PROVIDER_BRAND[id] ?? PROVIDER_BRAND.custom
  const Icon = brand.icon
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl", brand.tile, brand.glyph, className)}>
      {brand.logoSvg ? (
        <span
          aria-hidden
          className="grid size-[56%] place-items-center [&>svg]:size-full [&>svg]:fill-current"
          dangerouslySetInnerHTML={{ __html: brand.logoSvg }}
        />
      ) : Icon ? (
        <Icon className="size-[52%]" />
      ) : null}
    </span>
  )
}

// ---- inline credential editing ----

export interface Draft {
  descriptor: ProviderDescriptor
  values: Record<string, string>
  setField: (key: string, value: string) => void
  revealed: boolean
  toggleReveal: () => void
  dirty: boolean
  canSave: boolean
  hasStored: boolean
  errors: Map<string, string>
  save: () => void
  remove: () => void
}

/**
 * Client-side echo of the provider's Zod schema, so a malformed endpoint or an
 * over-long region is caught before it reaches a request header. The server
 * schema stays the authority.
 */
function useFieldErrors(
  descriptor: ProviderDescriptor,
  values: Record<string, string>,
): Map<string, string> {
  const { t } = useLingui()
  return useMemo(() => {
    const errors = new Map<string, string>()
    for (const field of descriptor.manifest.credentialFields) {
      const value = (values[field.key] ?? "").trim()
      if (!value) continue
      if (field.maxLength && value.length > field.maxLength) {
        errors.set(field.key, t`Maximum length is ${field.maxLength} characters.`)
        continue
      }
      if (field.kind === "url") {
        try {
          const url = new URL(value)
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
            errors.set(field.key, t`Enter a valid HTTP or HTTPS URL.`)
            continue
          }
        } catch {
          errors.set(field.key, t`Enter a valid HTTP or HTTPS URL.`)
          continue
        }
      }
      if (field.pattern) {
        try {
          if (!new RegExp(field.pattern).test(value)) errors.set(field.key, t`Invalid value.`)
        } catch {
          // The manifest was already server-validated; ignore an unsupported
          // client RegExp feature and let the server schema decide.
        }
      }
    }
    return errors
  }, [descriptor, values, t])
}

export function useDraft(descriptor: ProviderDescriptor, store: Providers, onSaved?: () => void): Draft {
  const { t } = useLingui()
  const id = descriptor.manifest.id
  const stored = useMemo(
    () =>
      Object.fromEntries(
        descriptor.manifest.credentialFields.map((f) => [f.key, store.credentialValue(id, f.key)]),
      ),
    [descriptor, store, id],
  )
  const [values, setValues] = useState<Record<string, string>>(stored)
  const [revealed, setRevealed] = useState(false)

  // `stored` starts empty while /providers is pending and fills in once the
  // manifests arrive, so an untouched draft has to follow it.
  const dirtyRef = useRef(false)
  const storedSignature = JSON.stringify(stored)
  useEffect(() => {
    if (dirtyRef.current) return
    setValues(JSON.parse(storedSignature) as Record<string, string>)
  }, [storedSignature])

  const errors = useFieldErrors(descriptor, values)
  const dirty = descriptor.manifest.credentialFields.some(
    (f) => (values[f.key] ?? "").trim() !== (stored[f.key] ?? "").trim(),
  )
  dirtyRef.current = dirty
  const hasStored = Object.values(stored).some((v) => v.length > 0)

  return {
    descriptor,
    values,
    setField: (key, value) => setValues((prev) => ({ ...prev, [key]: value })),
    revealed,
    toggleReveal: () => setRevealed((p) => !p),
    dirty,
    canSave: dirty && errors.size === 0,
    hasStored,
    errors,
    save: () => {
      for (const field of descriptor.manifest.credentialFields) store.setCredential(id, field.key, (values[field.key] ?? "").trim())
      toast.success(t`Provider credentials saved.`)
      onSaved?.()
    },
    remove: () => {
      for (const field of descriptor.manifest.credentialFields) store.setCredential(id, field.key, "")
      setValues(Object.fromEntries(descriptor.manifest.credentialFields.map((f) => [f.key, ""])))
    },
  }
}

export function CredentialFields({ draft, onSubmit }: { draft: Draft; onSubmit?: () => void }) {
  const { i18n, t } = useLingui()
  return (
    <div className="flex flex-col gap-3.5">
      {draft.descriptor.manifest.credentialFields.map((field) => {
        const secret = field.kind === "secret"
        return (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor={`v2-${draft.descriptor.manifest.id}-${field.key}`} className="text-[12.5px]">
                {localize(field.label, i18n.locale)}
              </Label>
              <span className="text-[10.5px] font-medium text-muted-foreground">
                {field.required ? <Trans>Required</Trans> : <Trans>Optional</Trans>}
              </span>
            </div>
            <div className="relative">
              <Input
                id={`v2-${draft.descriptor.manifest.id}-${field.key}`}
                type={secret && !draft.revealed ? "password" : "text"}
                inputMode={field.kind === "url" ? "url" : undefined}
                placeholder={field.placeholder}
                value={draft.values[field.key] ?? ""}
                onChange={(e) => draft.setField(field.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onSubmit && draft.canSave) {
                    e.preventDefault()
                    onSubmit()
                  }
                }}
                className={cn("font-mono text-[13px]", secret && "pr-10")}
              />
              {secret && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 size-9"
                  onClick={draft.toggleReveal}
                  aria-label={draft.revealed ? t`Hide credential` : t`Show credential`}
                  title={draft.revealed ? t`Hide credential` : t`Show credential`}
                >
                  {draft.revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
            </div>
            {draft.errors.has(field.key) ? (
              <p role="alert" className="text-[11.5px] leading-normal text-destructive">
                {draft.errors.get(field.key)}
              </p>
            ) : (
              field.help && (
                <p className="text-[11.5px] leading-normal text-muted-foreground">
                  {localize(field.help, i18n.locale)}
                </p>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

/** CLI / API key segmented control (the Conductor "Authentication" pattern). */
export function AuthModeToggle({
  mode,
  onChange,
  cliLabel,
}: {
  mode: "cli" | "api-key"
  onChange: (mode: "cli" | "api-key") => void
  cliLabel?: ReactNode
}) {
  const options = [
    { id: "cli" as const, label: cliLabel ?? <Trans>CLI</Trans>, Icon: Terminal },
    { id: "api-key" as const, label: <Trans>API key</Trans>, Icon: KeyRound },
  ]
  const activeIndex = mode === "cli" ? 0 : 1
  return (
    <div className="relative grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1">
      <span
        aria-hidden
        className={cn("absolute inset-y-1 w-[calc(50%-2px)] rounded-lg bg-card ring-1 ring-border shadow-sm transition-transform duration-300 motion-reduce:transition-none dark:bg-accent", EASE)}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "relative z-10 flex flex-col items-center gap-1.5 rounded-lg py-3 text-[12.5px] font-medium transition-colors duration-150",
            EASE,
            mode === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          <span className="flex items-center gap-1.5">{label}</span>
        </button>
      ))}
    </div>
  )
}

function CopyCommand({ command }: { command: string }) {
  const { t } = useLingui()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <code className="truncate font-mono text-[12.5px]">{command}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-[12px]"
        onClick={() => {
          try {
            void navigator.clipboard?.writeText(command)
          } catch {
            /* ignore */
          }
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        }}
        aria-label={t`Copy command`}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        {copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
      </Button>
    </div>
  )
}

/** Actionable guidance for CLI dead-ends (not-logged-in / cli-not-found). */
export function CliGuidance({ providerId, code }: { providerId: string; code: ProviderHealthCode }) {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- literal shell command, not translatable UI copy
  const command = providerId === "codex" ? "codex login" : "claude /login"
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-normal text-muted-foreground">
        {code === "cli-not-found" ? (
          <Trans>This provider&apos;s command-line tool isn&apos;t installed on this machine. Install it, then run its login:</Trans>
        ) : (
          <Trans>Sign in outside the app, then Refresh — this screen detects the login automatically:</Trans>
        )}
      </p>
      <CopyCommand command={command} />
    </div>
  )
}

export function DocsLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 underline-offset-4 transition-colors duration-150 hover:text-brand-800 hover:underline",
        EASE,
      )}
    >
      <ExternalLink className="size-3.5" />
      <Trans>Provider documentation</Trans>
    </a>
  )
}

export function SaveRow({ draft }: { draft: Draft }) {
  return (
    <div className="flex items-center gap-2">
      {draft.hasStored && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={draft.remove}
          className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          <Trans>Remove</Trans>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        className="ml-auto"
        disabled={!draft.canSave}
        onClick={draft.save}
      >
        <Trans>Save</Trans>
      </Button>
    </div>
  )
}



function ModalityLabel({ modality }: { modality: AiModality }) {
  switch (modality) {
    case "structured-text":
      return <Trans>Text</Trans>
    case "agent":
      return <Trans>Agent</Trans>
    case "image":
      return <Trans>Image</Trans>
    case "tts":
      return <Trans>Speech</Trans>
    default:
      return <Trans>Transcription</Trans>
  }
}

/** What a given backend can actually do — makes the CLI mode's reduced reach visible. */
export function ModalityBadges({ modalities }: { modalities: AiModality[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {modalities.map((modality) => (
        <span
          key={modality}
          className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
        >
          <ModalityLabel modality={modality} />
        </span>
      ))}
    </div>
  )
}

/** Which mode a vendor card opens on: its API-key backend if that's configured, else CLI. */
export function defaultCardMode(cardKey: string, store: Providers): "api-key" | "cli" {
  const card = PROVIDER_CARDS[cardKey]
  if (!card.apiKeyProviderId || !card.cliProviderId) return "api-key"
  if (!store.isRegistered(card.cliProviderId)) return "api-key"
  const apiDesc = store.descriptorById(card.apiKeyProviderId)
  if (!apiDesc) return "cli"
  return requiredFieldsFilled(apiDesc, store.credentials[card.apiKeyProviderId] ?? {}) ? "api-key" : "cli"
}

interface CardHealth {
  data: ProviderHealthResponse | null
  isFetching: boolean
  fallbackConfigured: boolean
}

/**
 * Resolve a vendor card to a single connection status: prefer the configured API key (cheap
 * local badge, no probe); if the vendor has no key but a CLI/local backend, probe that so a
 * live login still reads "Connected". Backs both the rail dot and the auth line from one probe.
 */
export function useCardHealth(cardKey: string, store: Providers): CardHealth {
  const card = PROVIDER_CARDS[cardKey]
  const apiDesc = card.apiKeyProviderId ? store.descriptorById(card.apiKeyProviderId) : undefined
  const apiConfigured = apiDesc ? requiredFieldsFilled(apiDesc, store.credentials[apiDesc.manifest.id] ?? {}) : false

  let probeId = card.apiKeyProviderId ?? card.cliProviderId ?? card.localProviderId!
  let enabled = false
  let fallbackConfigured = false
  if (card.localProviderId) {
    probeId = card.localProviderId
    enabled = store.isRegistered(card.localProviderId)
  } else if (apiConfigured) {
    fallbackConfigured = true
  } else if (card.cliProviderId && store.isRegistered(card.cliProviderId)) {
    probeId = card.cliProviderId
    enabled = true
  }

  const health = useProviderHealth(probeId, store.credentials[probeId], enabled)
  return {
    data: enabled ? (health.data ?? null) : null,
    isFetching: enabled && health.isFetching,
    fallbackConfigured,
  }
}

/** Dot-only status mark, sized to sit on a provider icon (T3-Code style). */
export function HealthDotMark({ data, isFetching, fallbackConfigured }: CardHealth) {
  const tone: Tone = data ? toneOf(data.code) : fallbackConfigured ? "ok" : "muted"
  return (
    <span
      className={cn(
        "size-2.5 rounded-full ring-2 ring-card",
        isFetching && !data ? "bg-muted-foreground/40" : TONE_DOT[tone],
      )}
    />
  )
}

/** Pure auth-line text from a resolved CardHealth (no probe of its own). */
export function AuthLineFromHealth({ data, isFetching, fallbackConfigured }: CardHealth) {
  if (isFetching) return <Trans>Checking connection…</Trans>
  if (fallbackConfigured) return <Trans>Authenticated · API key</Trans>
  if (!data) return <Trans>Not configured</Trans>
  switch (data.code) {
    case "ok":
      return data.detail ? <Trans>Authenticated · {data.detail}</Trans> : <Trans>Authenticated</Trans>
    case "local-login":
      return data.detail ? <Trans>Authenticated · {data.detail}</Trans> : <Trans>Authenticated · local login</Trans>
    case "configured":
      return <Trans>Credentials set</Trans>
    case "not-logged-in":
      return <Trans>Not signed in</Trans>
    case "cli-not-found":
      return <Trans>CLI not found</Trans>
    case "missing-credential":
      return <Trans>API key required</Trans>
    case "invalid-credential":
      return <Trans>Credentials rejected</Trans>
    case "unreachable":
      return <Trans>Unreachable</Trans>
    default:
      return <Trans>Not checked</Trans>
  }
}

/** A card is usable when its primary (API-key or local) backend is registered on the server. */
export function isCardRegistered(cardKey: string, store: Providers): boolean {
  const card = PROVIDER_CARDS[cardKey]
  const primary = card.apiKeyProviderId ?? card.localProviderId
  return primary ? store.isRegistered(primary) : false
}

export { authKind }
