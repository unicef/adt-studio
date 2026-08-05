import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"

const ERROR_CLASS_LABELS: Record<string, MessageDescriptor> = {
  "connect-timeout": msg`Connection timeout`,
  "request-timeout": msg`Request timeout`,
  "connection-closed": msg`Connection closed`,
  "model-output": msg`Malformed model output`,
  "rate-limit": msg`Rate limit`,
  "server-error": msg`Server error`,
  unknown: msg`Unknown error`,
  "non-retryable": msg`Non-retryable error`,
}

const UNKNOWN_ERROR = msg`Unknown error`

export function getLlmErrorClassLabel(i18n: I18n, errorClass: string): string {
  return i18n._(ERROR_CLASS_LABELS[errorClass] ?? UNKNOWN_ERROR)
}
