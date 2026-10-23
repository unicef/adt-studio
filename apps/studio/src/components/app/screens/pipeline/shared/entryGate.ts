let bypass = false

export function skipEntryGateOnce() {
  bypass = true
}

export function consumeEntryGateSkip(): boolean {
  const skip = bypass
  bypass = false
  return skip
}
