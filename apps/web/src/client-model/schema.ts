import Ajv from 'ajv/dist/2020'
import { completeProduction, gameViewFromContract } from './game-view-contract'
import addFormats from 'ajv-formats'
import schema from '../../../../contracts/openapi.json'
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
/** Data that does not match its declared contract. No payload is retained. */
export class ContractDataError extends Error {
  constructor(public readonly schemaName: string) {
    super('Invalid contract data')
    this.name = 'ContractDataError'
  }
}
export const incompatibleResponseMessage =
  'The game returned data this version cannot read. Reload the app. If this continues, please report it.'
export function validate<T>(name: string, value: unknown): T {
  let validator = validators.get(name)
  if (!validator) {
    validator = ajv.compile({
      components: schema.components,
      $ref: `#/components/schemas/${name}`,
    })
    validators.set(name, validator)
  }
  if (!validator(value)) throw new ContractDataError(name)
  const view = gameViewFromContract(name, value)
  if (view && !completeProduction(view)) throw new ContractDataError(name)
  return value as T
}
