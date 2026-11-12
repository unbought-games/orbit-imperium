import { describe, expect, it } from 'vitest'
import {
  namedNewRecipe,
  layeredRecipe,
  recipeAccess,
  compositionAppearance,
  shuffleRecipe,
} from './insignia-composer'
import { defaultInsignia, symbolAccess } from './insignias'
import type { InsigniaState } from '../adapters/insignias'
import { treatmentPatterns, treatmentStyle } from './cosmetic-treatment'
const id = '00000000-0000-4000-8000-000000000001'
function library(): InsigniaState {
  return {
    binding: { account: id, player: id, universe: id, epoch: id },
    request_id: id,
    library: { designs: [], equipped: null, permanent_symbols: [] },
    catalog: [
      {
        id: 'compass',
        name: 'Compass',
        group: 'legacy',
        asset_url: '/free.svg',
        supporter: false,
        access: 'available',
      },
      {
        id: 'forge-wayfinder',
        name: 'Wayfinder',
        group: 'center',
        asset_url: '/free.svg',
        supporter: false,
        access: 'available',
      },
      {
        id: 'sample-earned',
        name: 'Sample earned',
        group: 'stripes',
        asset_url: '/earned.svg',
        supporter: false,
        requirement: 'earned',
        access: 'supporter_required',
      },
    ],
    policy: 'supporter',
    appearance: null,
    expires_at: 100,
    composition_access: 'supporter_required',
    dyes: [
      {
        id: 'sample-blue',
        name: 'Sample blue',
        color: '#152b40',
        tier: 'standard',
        scope: 'account',
        access: 'free',
        availability: 'available',
      },
      {
        id: 'sample-gold',
        name: 'Sample gold',
        color: '#cbb68d',
        tier: 'standard',
        scope: 'account',
        access: 'free',
        availability: 'available',
      },
    ],
    treatments: [],
  }
}
describe('named cosmetic recipes', () => {
  it('creates and shuffles only accessible individual dyes without mutating a legacy recipe', () => {
    const state = library(),
      legacy = layeredRecipe(defaultInsignia),
      created = namedNewRecipe(state, legacy)
    expect(created.version).toBe(3)
    expect(created.foreground).toBe('dye:sample-gold')
    expect(created.background).toBe('dye:sample-blue')
    expect(legacy.foreground).toBe('#cbb68d')
    const shuffled = shuffleRecipe(state, created, 0, () => 0)
    expect(shuffled.layers?.every((l) => l.color === 'dye:sample-blue')).toBe(
      true,
    )
    expect(shuffled.layers?.some((l) => l.symbol === 'sample-earned')).toBe(
      false,
    )
  })
  it('renders resolved colors and keeps earned access distinct from free symbols', () => {
    const state = library(),
      recipe = namedNewRecipe(state, layeredRecipe(defaultInsignia))
    expect(compositionAppearance(state, recipe).rendering?.foreground).toBe(
      '#cbb68d',
    )
    expect(recipeAccess(state, recipe, 0)).toBe('available')
    expect(symbolAccess(state, 'sample-earned', 0)).toBe('supporter_required')
    state.library.permanent_symbols.push('sample-earned')
    expect(symbolAccess(state, 'sample-earned', 1000000)).toBe('available')
  })
  it('retains unavailable references while denying a new equip', () => {
    const state = library(),
      recipe = namedNewRecipe(state, layeredRecipe(defaultInsignia))
    recipe.foreground = 'dye:removed'
    expect(recipeAccess(state, recipe, 0)).toBe('not_installed')
    expect(recipe.foreground).toBe('dye:removed')
  })
  it('renders the closed pattern registry and never accepts content-supplied styles', () => {
    expect(Object.keys(treatmentPatterns)).toHaveLength(59)
    for (const pattern of Object.keys(treatmentPatterns))
      expect(
        treatmentStyle({
          renderer: 'surface',
          family: 'finish',
          parameters: { pattern, strength: 0.5, scale: 4, angle: 30 },
        }),
      ).toHaveProperty('--pattern', treatmentPatterns[pattern])
    const style = treatmentStyle({
      renderer: 'surface',
      family: 'finish',
      parameters: {
        pattern: 'url(evil)',
        strength: 100,
        scale: 100,
        angle: 1000,
      },
    })
    expect(style).toHaveProperty('--pattern', 'none')
    expect(style).toHaveProperty('--strength', 1)
  })
  it('keeps tiled textures square instead of stretching them into vertical bands', () => {
    expect(
      treatmentStyle({
        renderer: 'surface',
        family: 'finish',
        parameters: { pattern: 'carbon', strength: 0.5, scale: 4, angle: 0 },
      }),
    ).toHaveProperty('--pattern-size', '8px 8px')
  })
})
