import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DispatchDestinationPreview } from './dispatch-destination-preview'
import type { components } from '../contracts'
type Props = ComponentProps<typeof DispatchDestinationPreview>
const coordinates = { galaxy: 1, system: 2, position: 3 }
const publicState = {
  activity: { type: 'None' as const },
  inactivity: 'Active' as const,
  vacation: false,
  espionage_eligible: true,
}
const body: components['schemas']['BodyV3'] = {
  id: 'home',
  coordinates,
  kind: 'Planet',
  amounts: { metal: '0', crystal: '0', deuterium: '0' },
  capacity: { metal: '0', crystal: '0', deuterium: '0' },
  levels: {},
  fields: 100,
  fields_used: 0,
  fields_reserved: 0,
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  inventories: [],
}
const defaults: Props = {
  coordinates,
  kind: 'planet',
  target: undefined,
  lookup: 'ready',
  player: 'me',
  playerNames: {},
  value: '1:2:3',
  universe: 'andromeda',
  onChange: () => {},
  onSelectBody: () => {},
}
const render = (props: Partial<Props>) =>
  renderToStaticMarkup(
    createElement(DispatchDestinationPreview, { ...defaults, ...props }),
  )
it.each([
  ['loading', 'Looking up destination', 'Checking destination.'],
  [
    'unavailable',
    'Destination unavailable',
    'System lookup failed. Review will check the destination again.',
  ],
  ['ready', 'Empty position', 'No planet at these coordinates.'],
] as const)(
  'distinguishes a %s destination without inventing imagery or identity',
  (lookup, title, detail) => {
    const markup = render({ lookup })
    expect(markup).toContain(title)
    expect(markup).toContain(detail)
    expect(markup).not.toContain('<img')
  },
)
it('marks a retained former colony as historical, rather than current ownership', () => {
  const target = {
    ...publicState,
    id: 'former',
    kind: 'Planet' as const,
    name: 'Haven Colony',
    owner: 'me',
    source: 'observation' as const,
  }
  const markup = render({ target, bodies: [] })
  expect(markup).toContain('Haven Colony')
  expect(markup).toContain('Last known owner: you')
  expect(markup).not.toContain('Last observed')
  expect(markup).not.toContain('Your colony')
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('<img')
  expect(markup).toContain('value="1:2:3"')
})
it('retains known observed identity and imagery while its compatible read refreshes', () => {
  const markup = render({
    lookup: 'loading',
    target: {
      ...publicState,
      id: 'foreign',
      kind: 'Planet',
      name: 'Ember Watch',
      owner: 'other',
      source: 'observation',
    },
  })
  expect(markup).toContain('Ember Watch')
  expect(markup).not.toContain('Last observed')
  expect(markup).toContain('<img')
  expect(markup).not.toContain('Looking up destination')
})
it('distinguishes a live homeworld, live moon, and unobserved moon', () => {
  expect(
    render({
      target: {
        ...body,
        id: 'home',
        coordinates,
        kind: 'Planet',
        owner: 'me',
        source: 'empire',
        homeworld: true,
      },
    }),
  ).toContain('Your Homeworld')
  expect(
    render({
      kind: 'moon',
      target: {
        ...body,
        id: 'moon',
        coordinates,
        kind: 'Moon',
        owner: 'me',
        source: 'empire',
        homeworld: false,
      },
    }),
  ).toContain('Your moon')
  expect(render({ kind: 'moon' })).toContain('Moon unavailable')
})
it('uses debris artwork with honest loading and unavailable salvage labels', () => {
  for (const [lookup, message] of [
    ['loading', 'Checking for salvage'],
    ['unavailable', 'Salvage unknown'],
    ['ready', 'Debris field selected'],
  ] as const) {
    const markup = render({ kind: 'debris', lookup })
    expect(markup).toContain('Debris field')
    expect(markup).toContain('src="/art/debris/debris-medium.webp"')
    expect(markup).toContain(message)
  }
})
it('renders incomplete and empty coordinates without imagery or invented valid coordinates', () => {
  expect(render({ coordinates: null, value: '1:' })).toContain(
    'Complete your destination',
  )
  const empty = render({ coordinates: null, value: '' })
  expect(empty).toContain('Where are we heading?')
  expect(empty).not.toContain('<img')
})
