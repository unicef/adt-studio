const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function getExternalUrlProtocol(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/** Only web URLs may be handed to the operating system's external handler. */
export function isAllowedExternalUrl(url: string): boolean {
  const protocol = getExternalUrlProtocol(url);
  return protocol !== null && ALLOWED_EXTERNAL_PROTOCOLS.has(protocol);
}
