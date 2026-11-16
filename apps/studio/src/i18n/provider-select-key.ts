/**
 * A provider id as an ICU `select` key, so translations can vary a message by
 * provider — Portuguese picks the article from the name's grammatical gender
 * ("da OpenAI", "do Google"). ICU select keys cannot contain "-", and a
 * translation with an invalid key renders as raw ICU, so `claude-agent`
 * becomes `claude_agent`.
 */
export function providerSelectKey(providerId: string): string {
  return providerId.replace(/[^A-Za-z0-9_]/g, "_")
}
