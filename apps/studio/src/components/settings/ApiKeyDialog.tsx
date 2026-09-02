import { useEffect, useMemo, useState } from "react"
import { Check, ExternalLink, Eye, EyeOff } from "lucide-react"
import type { CredentialFieldManifest, ProviderDescriptor } from "@adt/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/sonner"
import { Trans, useLingui } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { isProviderAvailable, type ProviderCredentialValues } from "@/api/provider-credentials"
import type { AppLocale } from "@/i18n/locales"
import { ProviderConnectionStatus } from "./ProviderConnectionStatus"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  embedded?: boolean
}

function localized(
  text: Record<AppLocale, string> | undefined,
  locale: AppLocale,
): string | undefined {
  return text?.[locale] ?? text?.en
}

function fieldValue(
  values: ProviderCredentialValues,
  providerId: string,
  fieldKey: string,
): string {
  return values[providerId]?.[fieldKey] ?? ""
}

function valuesEqual(
  providers: readonly ProviderDescriptor[],
  left: ProviderCredentialValues,
  right: ProviderCredentialValues,
): boolean {
  return providers.every(({ manifest }) =>
    manifest.credentialFields.every(
      (field) =>
        fieldValue(left, manifest.id, field.key).trim() ===
        fieldValue(right, manifest.id, field.key).trim(),
    ),
  )
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  embedded = false,
}: ApiKeyDialogProps) {
  const { t } = useLingui()
  const {
    providers,
    credentials,
    setCredential,
    isLoading,
    error,
  } = useProviderCredentials()
  const locale = i18n.locale as AppLocale
  const [activeProvider, setActiveProvider] = useState("")
  const [drafts, setDrafts] = useState<ProviderCredentialValues>({})
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    setDrafts(structuredClone(credentials))
    setVisibleSecrets({})
  }, [open, credentials])

  useEffect(() => {
    if (providers.length === 0) return
    if (!providers.some(({ manifest }) => manifest.id === activeProvider)) {
      setActiveProvider(providers[0].manifest.id)
    }
  }, [providers, activeProvider])

  const fieldErrors = useMemo(() => {
    const errors = new Map<string, string>()
    for (const { manifest } of providers) {
      for (const field of manifest.credentialFields) {
        const value = fieldValue(drafts, manifest.id, field.key).trim()
        if (!value) continue
        const errorKey = `${manifest.id}:${field.key}`
        if (field.maxLength && value.length > field.maxLength) {
          errors.set(errorKey, t`Maximum length is ${field.maxLength} characters.`)
          continue
        }
        if (field.kind === "url") {
          try {
            const url = new URL(value)
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
              errors.set(errorKey, t`Enter a valid HTTP or HTTPS URL.`)
              continue
            }
          } catch {
            errors.set(errorKey, t`Enter a valid HTTP or HTTPS URL.`)
            continue
          }
        }
        if (field.pattern) {
          try {
            if (!new RegExp(field.pattern).test(value)) {
              errors.set(errorKey, t`Invalid value.`)
            }
          } catch {
            // The manifest was already server-validated. Ignore an unsupported
            // client RegExp feature and let the server schema remain authoritative.
          }
        }
      }
    }
    return errors
  }, [drafts, providers, t])

  const hasChanges = !valuesEqual(providers, drafts, credentials)
  const canSave = hasChanges && fieldErrors.size === 0

  const updateDraft = (providerId: string, fieldKey: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [providerId]: { ...current[providerId], [fieldKey]: value },
    }))
  }

  const handleSave = () => {
    for (const { manifest } of providers) {
      for (const field of manifest.credentialFields) {
        setCredential(
          manifest.id,
          field.key,
          fieldValue(drafts, manifest.id, field.key),
        )
      }
    }
    if (embedded) toast.success(t`Provider credentials saved.`)
    else onOpenChange(false)
  }

  const renderField = (provider: ProviderDescriptor, field: CredentialFieldManifest) => {
    const providerId = provider.manifest.id
    const id = `provider-${providerId}-${field.key}`
    const secretKey = `${providerId}:${field.key}`
    const value = fieldValue(drafts, providerId, field.key)
    const fieldError = fieldErrors.get(secretKey)
    const fieldStatus = provider.fieldStatus.find((status) => status.key === field.key)
    const isSecretVisible = visibleSecrets[secretKey] === true
    const help = localized(field.help, locale)

    return (
      <div key={field.key} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id}>{localized(field.label, locale)}</Label>
          <Badge variant="outline">
            {field.required ? <Trans>Required</Trans> : <Trans>Optional</Trans>}
          </Badge>
          {fieldStatus?.configuredOnServer && (
            <Badge variant="secondary"><Trans>Configured on server</Trans></Badge>
          )}
        </div>

        {field.kind === "select" ? (
          <Select value={value} onValueChange={(next) => updateDraft(providerId, field.key, next)}>
            <SelectTrigger id={id} aria-invalid={Boolean(fieldError)}>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(field.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {localized(option.label, locale)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <div className="relative">
            <Input
              id={id}
              type={field.kind === "secret" && !isSecretVisible ? "password" : "text"}
              inputMode={field.kind === "url" ? "url" : "text"}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              value={value}
              aria-invalid={Boolean(fieldError)}
              onChange={(event) => updateDraft(providerId, field.key, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSave) handleSave()
              }}
              className={field.kind === "secret" ? "pr-10" : undefined}
            />
            {field.kind === "secret" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() =>
                  setVisibleSecrets((current) => ({
                    ...current,
                    [secretKey]: !isSecretVisible,
                  }))
                }
                aria-label={isSecretVisible ? t`Hide credential` : t`Show credential`}
                title={isSecretVisible ? t`Hide credential` : t`Show credential`}
              >
                {isSecretVisible ? <EyeOff /> : <Eye />}
              </Button>
            )}
          </div>
        )}

        {fieldError ? (
          <p className="text-sm text-destructive">{fieldError}</p>
        ) : help ? (
          <p className="text-xs text-muted-foreground">{help}</p>
        ) : null}
      </div>
    )
  }

  const content = (
    <>
      {!embedded && (
        <DialogHeader>
          <DialogTitle><Trans>AI provider credentials</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Configure the credentials used by AI features on this device.</Trans>
          </DialogDescription>
        </DialogHeader>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Trans>Loading AI providers…</Trans>
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle><Trans>Providers unavailable</Trans></AlertTitle>
          <AlertDescription>
            <Trans>Could not load the AI provider catalogue.</Trans>
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={activeProvider} onValueChange={setActiveProvider}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            {providers.map((provider) => {
              const available = isProviderAvailable(provider, drafts)
              return (
                <TabsTrigger key={provider.manifest.id} value={provider.manifest.id}>
                  {provider.manifest.displayName}
                  {available && <Check data-icon="inline-end" />}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {providers.map((provider) => {
            const help = localized(provider.manifest.localizedHelp, locale)
            return (
              <TabsContent
                key={provider.manifest.id}
                value={provider.manifest.id}
                className="flex flex-col gap-4 pt-3"
              >
                <ProviderConnectionStatus
                  providerId={provider.manifest.id}
                  draftCredentials={drafts[provider.manifest.id]}
                />
                {provider.manifest.credentialFields.length > 0 ? (
                  provider.manifest.credentialFields.map((field) => renderField(provider, field))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <Trans>This provider does not require local credentials.</Trans>
                  </p>
                )}
                {help && <p className="text-xs text-muted-foreground">{help}</p>}
                {provider.manifest.docsUrl && (
                  <Button asChild variant="link" className="h-auto w-fit p-0">
                    <a href={provider.manifest.docsUrl} target="_blank" rel="noreferrer">
                      <ExternalLink data-icon="inline-start" />
                      <Trans>Provider documentation</Trans>
                    </a>
                  </Button>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      )}

      <DialogFooter>
        {!embedded && (
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
        )}
        <Button onClick={handleSave} disabled={!canSave}>
          <Trans>Save</Trans>
        </Button>
      </DialogFooter>
    </>
  )

  if (embedded) return <div className="rounded-xl border bg-card p-5">{content}</div>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-fit">{content}</DialogContent>
    </Dialog>
  )
}
