/**
 * The last PDF dropped in the Add Book lab, kept in this browser's IndexedDB so the stepper can jump
 * past Start after a reload (books can't be bundled with the code). Dev lab only; every call fails
 * soft (private window, blocked storage): the lab then just asks for the PDF again.
 */
const DB = "adt-add-book-lab"
const STORE = "pdf"
const KEY = "last"

type Saved = { name: string; type: string; lastModified: number; blob: Blob }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function loadSavedPdf(): Promise<File | null> {
  try {
    const saved = await tx<Saved | undefined>("readonly", (s) => s.get(KEY))
    return saved ? new File([saved.blob], saved.name, { type: saved.type, lastModified: saved.lastModified }) : null
  } catch {
    return null
  }
}

export async function savePdf(file: File): Promise<void> {
  try {
    const saved: Saved = { name: file.name, type: file.type, lastModified: file.lastModified, blob: file }
    await tx("readwrite", (s) => s.put(saved, KEY))
  } catch {
    /* storage blocked: the PDF only lasts until reload */
  }
}

export async function forgetSavedPdf(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(KEY))
  } catch {
    /* nothing to forget */
  }
}
