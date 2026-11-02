import type {
  InsigniaRecipe,
  InsigniaState,
  InsigniaAppearance,
} from '../adapters/insignias'
import { symbolAccess } from './insignias'
export type ElementGroup = 'center' | 'stripes' | 'accents'
export const elementGroups: ElementGroup[] = ['center', 'stripes', 'accents']
export const backgroundShapes = [
  { id: 'shield', name: 'Shield' },
  { id: 'circle', name: 'Circle' },
  { id: 'rounded_square', name: 'Rounded square' },
  { id: 'diamond', name: 'Diamond' },
  { id: 'hexagon', name: 'Hexagon' },
] as const
export const groupColor = (
  s: InsigniaState,
  r: InsigniaRecipe,
  group: ElementGroup,
) => r.layers?.find((layer) => groupOf(s, layer.symbol) === group)?.color
export const compositionAvailable = (s: InsigniaState, now: number) =>
  s.policy === 'unrestricted' ||
  (s.expires_at * 1000 > now && s.composition_access === 'available')
export const groupOf = (s: InsigniaState, id: string) =>
  s.catalog.find((e) => e.id === id)?.group ?? 'legacy'
export function recipeAccess(s: InsigniaState, r: InsigniaRecipe, now: number) {
  if (r.version === 1) return symbolAccess(s, r.symbol, now)
  const layers = r.layers ?? []
  for (const l of layers) {
    const access = symbolAccess(s, l.symbol, now)
    if (access !== 'available') return access
  }
  const advanced = layers.some(
    (l) => groupOf(s, l.symbol) === 'stripes' || l.color !== r.foreground,
  )
  return advanced && !compositionAvailable(s, now)
    ? s.expires_at * 1000 <= now
      ? 'unavailable'
      : (s.composition_access ?? 'unavailable')
    : 'available'
}
export function layeredRecipe(r: InsigniaRecipe): InsigniaRecipe {
  return {
    ...r,
    version: 2,
    symbol: 'compass',
    layers: [{ symbol: 'forge-wayfinder', color: r.foreground }],
  }
}
export function selectElement(
  s: InsigniaState,
  r: InsigniaRecipe,
  id: string,
): InsigniaRecipe {
  const group = groupOf(s, id),
    layers = [...(r.layers ?? [])]
  if (layers.some((l) => l.symbol === id))
    return { ...r, layers: layers.filter((l) => l.symbol !== id) }
  const same = layers.filter((l) => groupOf(s, l.symbol) === group),
    limit = group === 'stripes' ? 2 : 1
  const color = same[0]?.color ?? r.foreground
  const next =
    same.length >= limit
      ? layers.filter((l) => l.symbol !== same[0].symbol)
      : layers
  return { ...r, layers: [...next, { symbol: id, color }] }
}
export function setElementColor(
  s: InsigniaState,
  r: InsigniaRecipe,
  group: ElementGroup | null,
  color: string,
): InsigniaRecipe {
  return {
    ...r,
    foreground: group ? r.foreground : color,
    layers: r.layers?.map((l) =>
      !group || groupOf(s, l.symbol) === group ? { ...l, color } : l,
    ),
  }
}
export function freeRecipe(
  s: InsigniaState,
  r: InsigniaRecipe,
  now: number,
): InsigniaRecipe {
  return {
    ...r,
    layers: r.layers
      ?.filter(
        (l) =>
          groupOf(s, l.symbol) !== 'stripes' &&
          symbolAccess(s, l.symbol, now) === 'available',
      )
      .map((l) => ({ ...l, color: r.foreground })),
  }
}
export function compositionAppearance(
  s: InsigniaState,
  r: InsigniaRecipe,
): InsigniaAppearance {
  const asset_url =
    s.catalog.find((e) => e.id === r.symbol)?.asset_url ??
    s.catalog[0].asset_url
  return {
    recipe: r,
    asset_url,
    ...(r.version === 2
      ? {
          layers: elementGroups
            .flatMap((group) =>
              (r.layers ?? [])
                .filter((l) => groupOf(s, l.symbol) === group)
                .map((l) => ({
                  ...l,
                  asset_url: s.catalog.find((e) => e.id === l.symbol)!
                    .asset_url,
                })),
            )
            .sort(
              (a, b) =>
                ['stripes', 'center', 'accents'].indexOf(groupOf(s, a.symbol)) -
                ['stripes', 'center', 'accents'].indexOf(groupOf(s, b.symbol)),
            ),
        }
      : {}),
  }
}

export const insigniaPalettes = [
  {
    name: 'Starforge',
    backdrop: '#10151c',
    colors: { center: '#ffe2a2', stripes: '#923c2f', accents: '#e8af55' },
  },
  {
    name: 'Deep fleet',
    backdrop: '#071824',
    colors: { center: '#f3eee3', stripes: '#245d83', accents: '#e6b859' },
  },
  {
    name: 'Verdant empire',
    backdrop: '#0c1b16',
    colors: { center: '#f0deb4', stripes: '#2d6653', accents: '#b7d5bc' },
  },
  {
    name: 'Imperial violet',
    backdrop: '#171020',
    colors: { center: '#f4e4c9', stripes: '#69417c', accents: '#d3b568' },
  },
  {
    name: 'Crimson standard',
    backdrop: '#210f15',
    colors: { center: '#fff1da', stripes: '#96394b', accents: '#eab77b' },
  },
  {
    name: 'Glacial',
    backdrop: '#0b1924',
    colors: { center: '#f5fcff', stripes: '#2e647d', accents: '#9ee4df' },
  },
  {
    name: 'Solar navy',
    backdrop: '#102039',
    colors: { center: '#fff3d2', stripes: '#9b4e21', accents: '#ffc765' },
  },
  {
    name: 'Obsidian silver',
    backdrop: '#12151b',
    colors: { center: '#f5f1e8', stripes: '#515c70', accents: '#becade' },
  },
  {
    name: 'Terracotta dusk',
    backdrop: '#c64739',
    colors: { center: '#f6f8ec', stripes: '#1c032b', accents: '#e49356' },
  },
  {
    name: 'Sage and saffron',
    backdrop: '#f5ebd1',
    colors: { center: '#96b39a', stripes: '#fed97b', accents: '#bd052c' },
  },
  {
    name: 'Plum rose',
    backdrop: '#1e022d',
    colors: { center: '#ce7f98', stripes: '#725a7e', accents: '#f5ebd1' },
  },
  {
    name: 'Golden aubergine',
    backdrop: '#fed97b',
    colors: { center: '#ee8f44', stripes: '#f5ebd1', accents: '#58004f' },
  },
  {
    name: 'Rose cream',
    backdrop: '#ce7f98',
    colors: { center: '#f4c7b7', stripes: '#f5ebd1', accents: '#58004f' },
  },
  {
    name: 'Garden pop',
    backdrop: '#96b39a',
    colors: { center: '#feda79', stripes: '#f4c7b7', accents: '#d63b2b' },
  },
  {
    name: 'Mauve slate',
    backdrop: '#585364',
    colors: { center: '#c17296', stripes: '#f5ebd1', accents: '#e69998' },
  },
  {
    name: 'Burnished amber',
    backdrop: '#ac4b01',
    colors: { center: '#fed97b', stripes: '#6c0006', accents: '#ee8f44' },
  },
  {
    name: 'Soft sage',
    backdrop: '#96b39a',
    colors: { center: '#e69998', stripes: '#f6f8ec', accents: '#585364' },
  },
  {
    name: 'Electric twilight',
    backdrop: '#1f4ac9',
    colors: { center: '#8c5dd6', stripes: '#0d0147', accents: '#fcd1cd' },
  },
  {
    name: 'Coral lagoon',
    backdrop: '#34afbc',
    colors: { center: '#de7b83', stripes: '#edf8f9', accents: '#af3157' },
  },
  {
    name: 'Rose ruby',
    backdrop: '#e69998',
    colors: { center: '#bd052c', stripes: '#f6f8ec', accents: '#9c6590' },
  },
  {
    name: 'Lilac meadow',
    backdrop: '#fcd1cd',
    colors: { center: '#80b377', stripes: '#8c5dd8', accents: '#310f6f' },
  },
  {
    name: 'Cobalt blush',
    backdrop: '#dd7b86',
    colors: { center: '#1f4ac9', stripes: '#240481', accents: '#fcd1cd' },
  },
  {
    name: 'Molten gold',
    backdrop: '#f45a00',
    colors: { center: '#822c0c', stripes: '#ffc700', accents: '#490004' },
  },
  {
    name: 'Autumn ember',
    backdrop: '#a88f3a',
    colors: { center: '#faaf78', stripes: '#df0000', accents: '#61000c' },
  },
  {
    name: 'Patina burgundy',
    backdrop: '#978d85',
    colors: { center: '#2b727f', stripes: '#72212a', accents: '#e1cdab' },
  },
  {
    name: 'Orchid candy',
    backdrop: '#fe4787',
    colors: { center: '#9b15c6', stripes: '#ffc2cd', accents: '#580040' },
  },
]
export function shuffleRecipe(
  s: InsigniaState,
  r: InsigniaRecipe,
  now: number,
  random = Math.random,
): InsigniaRecipe {
  const palette =
      insigniaPalettes[Math.floor(random() * insigniaPalettes.length)],
    advanced = compositionAvailable(s, now)
  const layers: NonNullable<InsigniaRecipe['layers']> = []
  for (const group of elementGroups) {
    const pool = s.catalog.filter(
      (e) =>
        e.group === group &&
        symbolAccess(s, e.id, now) === 'available' &&
        (group !== 'stripes' || advanced),
    )
    const count =
      group === 'stripes' ? (advanced ? 1 + Math.floor(random() * 2) : 0) : 1
    for (let i = 0; i < count && pool.length; i++) {
      const index = Math.floor(random() * pool.length),
        item = pool.splice(index, 1)[0]
      layers.push({
        symbol: item.id,
        color: advanced ? palette.colors[group] : palette.colors.center,
      })
    }
  }
  return {
    ...r,
    version: 2,
    symbol: 'compass',
    foreground: palette.colors.center,
    background: palette.backdrop,
    layers,
  }
}
