/** Data that does not match its declared contract. No payload is retained. */
export class ContractDataError extends Error {
  constructor(public readonly schemaName: string) {
    super('Invalid contract data')
    this.name = 'ContractDataError'
  }
}

export const incompatibleResponseMessage =
  'The game returned data this version cannot read. Reload the app. If this continues, please report it.'
