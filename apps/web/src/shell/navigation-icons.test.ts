import { expect, it } from 'vitest'
import { pageIcons } from './navigation-icons'
import { buildPages, fleetPages, navigationGroups } from './navigation-model'

it('gives every secondary sidebar and menu destination its own icon', () => {
  const pages = [
    'briefing',
    ...buildPages,
    ...fleetPages,
    ...navigationGroups.flatMap((group) => group.pages),
  ] as const
  for (const page of pages) expect(pageIcons[page], page).toBeDefined()
  expect(new Set(pages.map((page) => pageIcons[page])).size).toBe(pages.length)
})
