import fixtures from '../../../../contracts/fixtures/tutorial-opening.json' with { type: 'json' }
import encounters from '../../../../contracts/fixtures/site-encounter-http.json' with { type: 'json' }
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import schema from '../../../../contracts/openapi.json' with { type: 'json' }
const ajv = new Ajv({ strict: false })
addFormats(ajv)
export function validateTutorialFixture<T>(name: string, value: unknown): T {
  const check = ajv.compile({
    components: schema.components,
    $ref: `#/components/schemas/${name}`,
  })
  if (!check(value)) throw Error(JSON.stringify(check.errors))
  return value as T
}
const validate = validateTutorialFixture
import type { components } from '../contracts'
type S = components['schemas']
export function tutorialFixture(completed = false) {
  return structuredClone(
    validate<S['TutorialView4']>(
      'TutorialView4',
      completed ? fixtures.completed : fixtures.initial,
    ),
  )
}
export function siteReportFixture() {
  return structuredClone(
    validate<S['BoundReport4']>('BoundReport4', encounters.detail),
  )
}
