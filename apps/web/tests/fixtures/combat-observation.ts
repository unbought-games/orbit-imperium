import { id } from '../../src/test-support/bootstrap'

// Recorded force sizes for the small navigation example and six-round layout stress case.
export function combatObservation(large: boolean, deuteriumOnly = false) {
  const ship = (id: string, count: number) => ({
    item: { kind: 'Ship', id },
    count: String(count),
  })
  const defense = (id: string, count: number) => ({
    item: { kind: 'Defense', id },
    count: String(count),
  })
  const attackers = [
    ship('LightFighter', large ? 500000 : 12),
    ship('SmallCargo', 2),
    ...(large
      ? [
          ship('HeavyFighter', 100000),
          ship('Cruiser', 50000),
          ship('Battleship', 20000),
          ship('Battlecruiser', 10000),
          ship('Bomber', 5000),
          ship('Destroyer', 3000),
          ship('Dreadnought', 100),
          ship('LargeCargo', 5000),
        ]
      : []),
  ]
  const defenders = [
    ship('LightFighter', large ? 200000 : 4),
    defense('RocketLauncher', large ? 100000 : 6),
    ...(large
      ? [
          ship('Cruiser', 30000),
          ship('Dreadnought', 50),
          defense('LightLaser', 60000),
          defense('HeavyLaser', 20000),
          defense('GaussCannon', 10000),
          defense('IonCannon', 5000),
          defense('PlasmaTurret', 2000),
        ]
      : []),
  ]
  const target = { galaxy: 1, system: 372, position: 10 }
  const targetName = large
    ? 'VeryLongUnbrokenPlanetNameForMobileWrapping'
    : 'Nova Roma'
  const participants = [
    {
      owner: id(2),
      side: 'Attacker',
      origin: { Fleet: id(40) },
      units: attackers,
      location: {
        kind: 'Moon',
        name: large
          ? 'VeryLongUnbrokenLaunchColonyNameForMobileWrapping'
          : 'Luna Outpost',
        coordinates: { galaxy: 2, system: 24, position: 5 },
      },
      technology: [3, 2, 3],
    },
    {
      owner: id(9),
      side: 'Defender',
      origin: { Stationed: id(41) },
      units: defenders,
      location: { kind: 'Planet', name: targetName, coordinates: target },
      technology: [3, 2, 3],
    },
  ]
  const rounds = large ? 6 : 2
  const remaining = (round: number) =>
    participants.map(({ owner, side, origin, units }) => ({
      owner,
      side,
      origin,
      units: units
        .map((unit) => ({
          ...unit,
          count: String(
            Math.floor(
              Number(unit.count) *
                (1 - (round / rounds) * (side === 'Attacker' ? 0.17 : 1)),
            ),
          ),
        }))
        .filter((unit) => unit.count !== '0'),
    }))
  const survivors = remaining(rounds)
  const loss = (afterRecovery: boolean) =>
    participants.map(({ owner, origin, side, units }, index) => ({
      owner,
      origin,
      side,
      units: units
        .map((unit) => {
          const recovered =
            afterRecovery && unit.item.kind === 'Defense'
              ? Math.floor(Number(unit.count) * 0.7)
              : 0
          const survivor = survivors[index].units.find(
            (survivor) => survivor.item.id === unit.item.id,
          )
          return {
            ...unit,
            count: String(
              Number(unit.count) - Number(survivor?.count ?? 0) - recovered,
            ),
          }
        })
        .filter((unit) => unit.count !== '0'),
    }))
  const at = Date.parse('2026-10-22T17:45:00Z')
  return {
    kind: 'Combat',
    at,
    target,
    target_name: targetName,
    target_kind: 'Planet',
    outcome: 'AttackerVictory',
    mission: 'Attack',
    return_at: at + 5400000,
    participants,
    survivors,
    gross_losses: loss(false),
    permanent_losses: loss(true),
    recovered: [
      {
        owner: participants[1].owner,
        side: participants[1].side,
        origin: participants[1].origin,
        units: defenders
          .filter((unit) => unit.item.kind === 'Defense')
          .map((unit) => ({
            ...unit,
            count: String(Math.floor(Number(unit.count) * 0.7)),
          })),
      },
    ],
    debris: deuteriumOnly
      ? { metal: '0', crystal: '0', deuterium: '60000000000' }
      : {
          metal: '1248000000000000',
          crystal: '672000000000000',
          deuterium: '0',
        },
    loot: {
      metal: '42000000000',
      crystal: '21000000000',
      deuterium: '8500000000',
    },
    own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
    rounds: Array.from({ length: rounds }, (_, index) => ({
      number: index + 1,
      start: remaining(index),
      end: remaining(index + 1),
      fire: remaining(index).map(({ owner, origin, side, units }) => ({
        owner,
        origin,
        side,
        shots: String(units.reduce((n, unit) => n + Number(unit.count), 0)),
        raw_attack_ticks: '120000000',
        shield_removed_ticks: '9000000',
        hull_removed_ticks: '38000000',
        explosions: '0',
      })),
    })),
  }
}
