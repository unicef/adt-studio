/**
 * kidsTranslate — Kids Mode translator with per-call English fallbacks.
 *
 * Books carry frozen interface catalogs, so every Kids lookup must provide a
 * fallback template that survives missing or empty dictionary entries.
 */
export function kidsTranslate(
  dict: Record<string, string>,
  key: string,
  fallback: string,
  vars: Record<string, string> = {},
): string {
  const template = dict[key] || fallback
  return template.replace(/\$\{(.*?)\}/g, (_, name) => vars[name] ?? "")
}
