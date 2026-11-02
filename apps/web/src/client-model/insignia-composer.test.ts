import { describe, expect, it } from 'vitest'
import type { InsigniaState } from '../adapters/insignias'
import {
  groupColor,
  compositionAppearance,
  freeRecipe,
  layeredRecipe,
  recipeAccess,
  selectElement,
  setElementColor,
  shuffleRecipe,
} from './insignia-composer'
import { defaultInsignia } from './insignias'
const state: InsigniaState = {
  binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
  request_id: 'r',
  library: { designs: [], equipped: null, permanent_symbols: [] },
  catalog: [
    ...['one', 'two', 'three'].map((id) => ({
      id,
      name: id,
      group: 'stripes' as const,
      supporter: true,
      access: 'available' as const,
      asset_url: `/api/${id}`,
    })),
    {
      id: 'forge-wayfinder',
      name: 'Center',
      group: 'center',
      supporter: false,
      access: 'available',
      asset_url: '/api/center',
    },
    {
      id: 'circle',
      name: 'Circle',
      group: 'center',
      supporter: false,
      access: 'available',
      asset_url: '/api/circle',
    },
    {
      id: 'accent',
      name: 'Accent',
      group: 'accents',
      supporter: false,
      access: 'available',
      asset_url: '/api/accent',
    },
  ],
  policy: 'supporter',
  composition_access: 'available',
  appearance: null,
  expires_at: 100,
}
describe('layered insignias', () => {
  it('replaces centers and accents, keeps two distinct stripes, removes a selected element', () => {
    let r = layeredRecipe(defaultInsignia)
    for (const id of ['accent', 'one', 'two', 'three', 'circle'])
      r = selectElement(state, r, id)
    expect(r.layers?.map((l) => l.symbol)).toEqual([
      'accent',
      'two',
      'three',
      'circle',
    ])
    expect(selectElement(state, r, 'two').layers?.map((l) => l.symbol)).toEqual(
      ['accent', 'three', 'circle'],
    )
  })
  it('renders fixed stripe/center/accent order independent of click order', () => {
    let r = layeredRecipe(defaultInsignia)
    for (const id of ['accent', 'one']) r = selectElement(state, r, id)
    expect(
      compositionAppearance(state, r).layers?.map((l) => l.symbol),
    ).toEqual(['one', 'forge-wayfinder', 'accent'])
  })
  it('gates colors and stripes on fresh composition access, preserves saved recipes on expiry', () => {
    const base = layeredRecipe(defaultInsignia),
      colored = setElementColor(state, base, 'center', '#aabbcc')
    expect(recipeAccess(state, colored, 1)).toBe('available')
    expect(recipeAccess(state, colored, 100_000)).toBe('unavailable')
    expect(colored.layers?.[0].color).toBe('#aabbcc')
    const free = { ...state, composition_access: 'supporter_required' as const }
    expect(recipeAccess(free, colored, 1)).toBe('supporter_required')
    expect(recipeAccess(free, freeRecipe(free, colored, 1), 1)).toBe(
      'available',
    )
  })
  it('reports missing elements without deleting selections', () => {
    const r = {
      ...layeredRecipe(defaultInsignia),
      layers: [{ symbol: 'missing', color: '#123456' }],
    }
    expect(recipeAccess(state, r, 1)).toBe('not_installed')
    expect(r.layers).toHaveLength(1)
  })
  it('shuffle uses a coordinated palette and only eligible free elements', () => {
    const free = {
      ...state,
      composition_access: 'supporter_required' as const,
      catalog: state.catalog.map((e) => ({
        ...e,
        access: e.supporter ? ('supporter_required' as const) : e.access,
      })),
    }
    for (const n of [0, 0.2, 0.5, 0.99]) {
      const r = shuffleRecipe(free, layeredRecipe(defaultInsignia), 1, () => n)
      expect(r.layers).toHaveLength(2)
      expect(r.layers?.every((l) => l.color === r.foreground)).toBe(true)
      expect(recipeAccess(free, r, 1)).toBe('available')
    }
  })
})

it('retains group colors on replacement and synchronizes both stripe slots', () => {
  let r = layeredRecipe(defaultInsignia)
  expect(groupColor(state, r, 'accents')).toBeUndefined()
  r = selectElement(state, r, 'accent')
  r = setElementColor(state, r, 'accents', '#22cc88')
  expect(groupColor(state, r, 'accents')).toBe('#22cc88')
  r = setElementColor(state, r, 'center', '#112233')
  r = selectElement(state, r, 'circle')
  expect(groupColor(state, r, 'center')).toBe('#112233')
  r = selectElement(state, r, 'one')
  r = setElementColor(state, r, 'stripes', '#abcdef')
  for (const id of ['two', 'three']) r = selectElement(state, r, id)
  expect(
    r.layers
      ?.filter((l) => ['two', 'three'].includes(l.symbol))
      .map((l) => l.color),
  ).toEqual(['#abcdef', '#abcdef'])
  r = setElementColor(state, r, 'stripes', '#123456')
  r = selectElement(state, r, 'two')
  expect(groupColor(state, r, 'stripes')).toBe('#123456')
  r = selectElement(state, r, 'three')
  expect(groupColor(state, r, 'stripes')).toBeUndefined()
  r = selectElement(state, r, 'one')
  expect(groupColor(state, r, 'stripes')).toBe(r.foreground)
})
it('preserves background choices through free conversion, shuffle and previews', () => {
  const r = { ...layeredRecipe(defaultInsignia), shape: 'diamond' as const }
  expect(freeRecipe(state, r, 1).shape).toBe('diamond')
  expect(shuffleRecipe(state, r, 1, () => 0).shape).toBe('diamond')
  expect(compositionAppearance(state, r).recipe.shape).toBe('diamond')
})
