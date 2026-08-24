export class AdtImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtImportError"
  }
}

