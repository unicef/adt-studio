interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<{ success: boolean; meta: { changes: number } }> }
interface D1Database { prepare(query: string): D1PreparedStatement }
interface R2ObjectBody { body: ReadableStream }
interface R2Bucket { put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<unknown>; get(key: string): Promise<R2ObjectBody | null> }
interface Env { DB: D1Database; MATERIALS: R2Bucket }
interface ExportedHandler<E = unknown> { fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response> }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
