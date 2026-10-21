import { expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/react-router'
import { universeSlug } from './universe-name'
import { resolveNamedDestination } from '../shell/routes'
import { routeTarget } from '../shell/route-target'
import { createAppRouter } from '../router'
import type { BoundView } from './commands'

it.each([
  ['Andromeda', 'andromeda'],
  ['Milky Way', 'milky-way'],
  ['My / Universe? #1', 'my-~2f~-universe~3f~-~23~1'],
  ['宇宙 🌌', '~5b87~~5b99~-~1f30c~'],
  ['..', '~2e~~2e~'],
  ['~2f~', '~7e~2f~7e~'],
])('keeps %s in one unambiguous URL segment', async (name, slug) => {
  expect(universeSlug(name)).toBe(slug)
  const router = createAppRouter({ history: createMemoryHistory() })
  const href = router.buildLocation(routeTarget(name, 'research', 'earth')).href
  expect(href).toBe(`/u/${slug}/research?body=earth`)
  const loaded = createAppRouter({
    history: createMemoryHistory({ initialEntries: [href] }),
  })
  await loaded.load()
  expect(loaded.state.matches.at(-1)!.params).toMatchObject({ universe: slug })
})

it('accepts only the current name, never an internal UUID or a previous name', () => {
  const view = {
    binding: { universe: '00000000-0000-4000-8000-000000000001' },
    bodies: [{ id: 'earth' }],
    capabilities: [],
    protocol: 3,
  } as unknown as BoundView
  const destination = { page: 'overview' as const, body: 'earth' }
  expect(
    resolveNamedDestination(
      { ...destination, universe: 'my-world' },
      view,
      'My World',
    ).available,
  ).toBe(true)
  for (const universe of ['andromeda', view.binding.universe, 'My World']) {
    expect(
      resolveNamedDestination({ ...destination, universe }, view, 'My World')
        .available,
    ).toBe(false)
  }
  expect(
    resolveNamedDestination(
      { ...destination, universe: 'my-world', body: 'foreign' },
      view,
      'My World',
    ).available,
  ).toBe(false)
})
