import type { components } from '../contracts'

export type Artwork = Readonly<{
  key: string
  src: string
  srcSet: string
  thumbnail: string
  width: number
  height: number
}>

export type BodyArtIdentity = Readonly<{
  id: string
  kind: 'Planet' | 'Moon'
  coordinates: Readonly<{ position: number }>
}>

const root = '/art/atlas'
const bodySizes = [96, 320, 640, 1200] as const
const objectSizes = [96, 320, 640] as const

function artwork(key: string, sizes: readonly number[]): Artwork {
  const width = sizes[sizes.length - 1]!
  return {
    key,
    src: `${root}/${key}-${width}.webp`,
    srcSet: sizes
      .map((size) => `${root}/${key}-${size}.webp ${size}w`)
      .join(', '),
    thumbnail: `${root}/${key}-${sizes[0]}.webp`,
    width,
    height: width,
  }
}

/** Slot is presentation input only; art never supplies climate or game rules. */
export function resolvePlanetArt(position: number): Artwork {
  const slot =
    Number.isInteger(position) && position >= 1 && position <= 15 ? position : 4
  return artwork(`planet-${String(slot).padStart(2, '0')}`, bodySizes)
}

function moonVariant(id: string): number {
  // FNV-1a over the complete stable ID. Never names, roster order or randomness.
  let hash = 2166136261
  for (const character of id.toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return ((hash >>> 0) % 3) + 1
}

/** Pure derivation; do not persist this result in the game store. */
export function resolveBodyArt(body: BodyArtIdentity): Artwork {
  return body.kind === 'Moon'
    ? artwork(`moon-0${moonVariant(body.id)}`, bodySizes)
    : resolvePlanetArt(body.coordinates.position)
}

export function resolveCatalogArt(
  key: components['schemas']['CatalogKey3'],
): Artwork {
  return artwork(
    `objects/${key.id.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)}`,
    key.kind === 'Ship' ||
      key.kind === 'Defense' ||
      key.id === 'RoboticsFactory'
      ? bodySizes
      : objectSizes,
  )
}

export const atmosphereArt = {
  src: `${root}/atmosphere-1600.webp`,
  srcSet: `${root}/atmosphere-800.webp 800w, ${root}/atmosphere-1600.webp 1600w`,
  width: 1600,
  height: 1000,
} as const
