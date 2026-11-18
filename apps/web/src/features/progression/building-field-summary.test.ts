import { expect, it } from 'vitest'
import { buildingFieldSummary } from './building-field-summary'

it('keeps a field reserved for construction separate from occupied fields', () => {
  expect(
    buildingFieldSummary({ fields_used: 17, fields: 218, fields_reserved: 1 }),
  ).toBe('17 of 218 fields used · 1 reserved')
  expect(
    buildingFieldSummary({ fields_used: 18, fields: 218, fields_reserved: 0 }),
  ).toBe('18 of 218 fields used')
})
