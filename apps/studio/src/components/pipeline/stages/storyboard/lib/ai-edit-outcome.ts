export interface AiEditOutcomeNotice {
  kind: "unsupported" | "unverified"
  reason: string
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === "string" ? value.trim() : ""
}

export function aiEditNoticeFor(result: unknown): AiEditOutcomeNotice | undefined {
  if (!result || typeof result !== "object") return undefined
  const record = result as Record<string, unknown>

  if (record.status === "unsupported") {
    return { kind: "unsupported", reason: textField(record, "reason") }
  }

  const verification = record.verification
  if (record.status === "applied" && verification && typeof verification === "object") {
    const verificationRecord = verification as Record<string, unknown>
    if (verificationRecord.applied === false) {
      return { kind: "unverified", reason: textField(verificationRecord, "reason") }
    }
  }

  return undefined
}
