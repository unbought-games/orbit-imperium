// Original word lists, shipped under the repository license.
const first = [
  'Vesper',
  'Halcyon',
  'Corvane',
  'Ashfall',
  'Meridian',
  'Tessaly',
  'Ardent',
  'Solace',
  'Kestrel',
  'Varrow',
  'Lumen',
  'Orrin',
  'Calder',
  'Nadir',
  'Thessa',
  'Embergate',
  'Sable',
  'Quillon',
  'Ostra',
  'Veyra',
  'Harrow',
  'Celest',
  'Duskmere',
  'Ilyra',
  'Marrow',
  'Pellucid',
  'Rhosk',
  'Tamsin',
  'Wyndal',
  'Zephra',
]
const second = [
  'Reach',
  'Prime',
  'Haven',
  'Hollow',
  'Crown',
  'Rest',
  'Landing',
  'Deep',
  'Vale',
  'Spire',
  'Hold',
  'Drift',
  'Station',
  'Expanse',
  'Bastion',
  'Verge',
  'Harbor',
  'Sanctum',
]

/** A two-part homeworld name; every result satisfies planetNameError. */
export function randomPlanetName(random: () => number = Math.random) {
  const pick = (words: readonly string[]) =>
    words[Math.min(words.length - 1, Math.floor(random() * words.length))]
  return `${pick(first)} ${pick(second)}`
}

export const planetNameWords = { first, second } as const
