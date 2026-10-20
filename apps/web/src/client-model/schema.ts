import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '../../../../contracts/openapi.json'
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
function exactQuantities(value: unknown): boolean {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value))
    return BigInt(value) <= 9223372036854775807n
  if (Array.isArray(value)) return value.every(exactQuantities)
  return (
    !value ||
    typeof value !== 'object' ||
    Object.values(value).every(exactQuantities)
  )
}
export function validate<T>(name: string, value: unknown): T {
  let validator = validators.get(name)
  if (!validator) {
    validator = ajv.compile({
      components: schema.components,
      $ref: `#/components/schemas/${name}`,
    })
    validators.set(name, validator)
  }
  if (!validator(value) || !exactQuantities(value))
    throw Error('Invalid contract data')
  return value as T
}
