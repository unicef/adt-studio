const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search)

export const IN_LAB_FRAME = !!params?.has("lab-frame")

if (IN_LAB_FRAME && params) {
  const memory = new Map<string, string>([
    ["adt.lab.variants", params.get("lab-v") ?? "{}"],
    ["adt.theme", params.get("lab-theme") ?? "light"],
    ["adt:locale", params.get("lang") ?? "en"],
  ])
  try {
    const scenario = JSON.parse(params.get("lab-scenario") ?? "null") as { sim?: { kind?: string } | null } | null
    if (scenario?.sim?.kind === "slow-load" || scenario?.sim?.kind === "fault") memory.set("adt.lab.sim", JSON.stringify({ ...scenario.sim, startedAt: Date.now() }))
  } catch {
    memory.delete("adt.lab.sim")
  }
  const isolated = (key: string) => key.startsWith("adt.lab.") || key === "adt.theme" || key === "adt:locale"
  const real = window.localStorage
  const { getItem, setItem, removeItem } = Storage.prototype
  Storage.prototype.getItem = function (this: Storage, key: string) {
    if (this === real && isolated(key)) return memory.get(key) ?? null
    return getItem.call(this, key)
  }
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    if (this === real && isolated(key)) {
      memory.set(key, String(value))
      return
    }
    setItem.call(this, key, value)
  }
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    if (this === real && isolated(key)) {
      memory.delete(key)
      return
    }
    removeItem.call(this, key)
  }
  document.documentElement.classList.toggle("dark", memory.get("adt.theme") === "dark")
}
