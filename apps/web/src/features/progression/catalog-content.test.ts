import { expect, it } from 'vitest'
import rules from '../../../../../rules/mvp-v1-slice-13.json'
import type { components } from '../../contracts'
import { catalogContent } from './catalog-content'

it('gives every catalog item distinct field notes without rules or placeholder copy', () => {
  const entries = rules.catalog as components['schemas']['CatalogEntry3'][]
  const descriptions = entries.map(({ key }) => catalogContent(key).description)
  expect(new Set(descriptions).size).toBe(entries.length)
  for (const description of descriptions) {
    expect(description).not.toMatch(
      /\d|%|prerequisite|requires|rapid fire|cargo capacity|per.level|ruleset|universe catalog/i,
    )
    expect(description.split(/\s+/).length).toBeGreaterThanOrEqual(20)
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(45)
  }
})
