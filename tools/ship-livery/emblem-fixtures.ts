import { validate } from '../../apps/web/src/client-model/schema'
import {
  compositionAppearance,
  recipeAccess,
} from '../../apps/web/src/client-model/insignia-composer'
import type {
  InsigniaState,
  InsigniaRecipe,
} from '../../apps/web/src/adapters/insignias'
// Public bundled originals only. These are authored example recipes, not player records.
const centers = [
  'forge-wayfinder',
  'forge-starwing',
  'forge-ascendant',
  'forge-helix',
]
const accents = ['forge-crown', 'forge-moons', 'forge-diagonal-stars']
const stripes = ['alliance-horizon-bands', 'alliance-chevron-bands']
const catalog = [...centers, ...accents, ...stripes].map((id) => ({
  id,
  name: id,
  supporter: false,
  access: 'available' as const,
  group: centers.includes(id)
    ? ('center' as const)
    : accents.includes(id)
      ? ('accents' as const)
      : ('stripes' as const),
  asset_url: `/crates/application/assets/insignias/${id}.svg`,
}))
export const fixtureState = {
  catalog,
  policy: 'unrestricted',
  expires_at: 0,
  library: { permanent_symbols: [] },
  dyes: [],
  treatments: [],
} as unknown as InsigniaState
const make = (
  shape: InsigniaRecipe['shape'],
  bg: string,
  layers: [string, string][],
): InsigniaRecipe => ({
  version: 2,
  symbol: 'compass',
  shape,
  background: bg,
  foreground: layers[0][1],
  layers: layers.map(([symbol, color]) => ({ symbol, color })),
})
export const emblems = [
  {
    id: 'crown',
    name: 'Crowned Wayfinder',
    recipe: make('shield', '#102039', [
      ['forge-wayfinder', '#fff3d2'],
      ['forge-crown', '#ffc765'],
    ]),
  },
  {
    id: 'starwing',
    name: 'Starwing roundel',
    recipe: make('circle', '#f5ebd1', [
      ['forge-starwing', '#1f4ac9'],
      ['forge-moons', '#bd052c'],
    ]),
  },
  {
    id: 'helix',
    name: 'Ringed planet standard',
    recipe: make('hexagon', '#171020', [
      ['forge-helix', '#f4e4c9'],
      ['alliance-horizon-bands', '#69417c'],
      ['forge-diagonal-stars', '#d3b568'],
    ]),
  },
  {
    id: 'ascendant',
    name: 'Ascendant diamond',
    recipe: make('diamond', '#0b1924', [
      ['forge-ascendant', '#f5fcff'],
      ['alliance-chevron-bands', '#2e647d'],
      ['forge-crown', '#9ee4df'],
    ]),
  },
]
for (const item of emblems) {
  validate('InsigniaRecipe', item.recipe)
  if (recipeAccess(fixtureState, item.recipe, 0) !== 'available')
    throw Error('Unavailable recipe')
}
export const appearances = emblems.map((e) =>
  compositionAppearance(fixtureState, e.recipe),
)
