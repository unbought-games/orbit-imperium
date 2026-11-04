import Ajv from 'ajv/dist/2020'
import { completeProduction, gameViewFromContract } from './game-view-contract'
import addFormats from 'ajv-formats'
import schema from '../../../../contracts/openapi.json'
import { ContractDataError } from './contract-error'
export {
  ContractDataError,
  incompatibleResponseMessage,
} from './contract-error'
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
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
