/**
 * pdfjs-dist 5.5+ uses Map/WeakMap.prototype.getOrInsert* (ES2026-era collection methods).
 * Electron and some browsers may not ship these yet; patch before loading pdf.js.
 */
export function installCollectionMethodPolyfills() {
    const mapProto = Map.prototype as unknown as {
        getOrInsert?: (key: unknown, value: unknown) => unknown
        getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown
    }

    if (typeof mapProto.getOrInsert !== "function") {
        mapProto.getOrInsert = function getOrInsertPolyfill(this: Map<unknown, unknown>, key, value) {
            if (this.has(key)) return this.get(key) as unknown
            this.set(key, value)
            return value
        }
    }

    if (typeof mapProto.getOrInsertComputed !== "function") {
        mapProto.getOrInsertComputed = function getOrInsertComputedPolyfill(
            this: Map<unknown, unknown>,
            key,
            callback,
        ) {
            if (this.has(key)) return this.get(key) as unknown
            const created = callback(key)
            this.set(key, created)
            return created
        }
    }

    const weakProto = WeakMap.prototype as unknown as {
        getOrInsert?: (key: object, value: unknown) => unknown
        getOrInsertComputed?: (key: object, callback: (key: object) => unknown) => unknown
    }

    if (typeof weakProto.getOrInsert !== "function") {
        weakProto.getOrInsert = function weakGetOrInsertPolyfill(
            this: WeakMap<object, unknown>,
            key,
            value,
        ) {
            if (this.has(key)) return this.get(key) as unknown
            this.set(key, value)
            return value
        }
    }

    if (typeof weakProto.getOrInsertComputed !== "function") {
        weakProto.getOrInsertComputed = function weakGetOrInsertComputedPolyfill(
            this: WeakMap<object, unknown>,
            key,
            callback,
        ) {
            if (this.has(key)) return this.get(key) as unknown
            const created = callback(key)
            this.set(key, created)
            return created
        }
    }
}
