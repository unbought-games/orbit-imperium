import { useState } from 'react'
import type { components } from '../../src/contracts'
import { ShipComparison } from '../../src/features/progression/ship-comparison'
import { UnitComparison } from '../../src/features/progression/unit-comparison'
import { Button } from '../../src/ui/button'
import { shipProfile, type ProfileShip } from './ship-profiles'

type S = components['schemas']
const emptyTechnical: S['TechnicalData3'] = {
  facts: [],
  bonuses: [],
  combat: null,
  storage_capacities: null,
}

function comparisonCatalog(kind: 'Ship' | 'Defense'): S['CatalogEntry3'][] {
  if (kind === 'Ship')
    return (
      [
        ['LightFighter', '12500', 'CombustionDrive'],
        ['HeavyFighter', '10000', 'ImpulseDrive'],
      ] as const
    ).map(([id, speed, drive]) => ({
      key: { kind: 'Ship', id },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
      ship_statistics: {
        cost: ['3000', '1000', '0'],
        propulsion: {
          cargo_capacity: '50',
          base_speed: speed,
          fuel_consumption: '20',
          drive,
          drive_coefficient:
            drive === 'CombustionDrive' ? ['1', '10'] : ['1', '5'],
          impulse_upgrade: null,
        },
        combat: {
          attack_ticks: '5000000',
          shield_ticks: '1000000',
          hull_ticks: '40000000',
          technology_bonus: ['1', '10'],
          rapid_fire_against: [],
          rapid_fire_from: [],
        },
      },
    }))
  return (
    [
      ['RocketLauncher', ['2000', '0', '0'], '8000000'],
      ['LightLaser', ['1500', '500', '0'], '10000000'],
      ['SmallShieldDome', ['10000', '10000', '0'], '100000'],
    ] as const
  ).map(([id, cost, attack]) => ({
    key: { kind: 'Defense', id },
    enabled: true,
    mobile: false,
    requirements: [],
    body_kinds: ['Planet', 'Moon'],
    technical_data: {
      ...emptyTechnical,
      cost: [...cost],
      combat: {
        attack_ticks: attack,
        shield_ticks: '2000000',
        hull_ticks: '20000000',
        technology_bonus: ['1', '10'],
        rapid_fire_against: [],
        rapid_fire_from: [
          { unit: { kind: 'Ship', id: 'Bomber' }, factor: '20' },
        ],
      },
      facts: [
        {
          label: 'Recovery after combat',
          value:
            '7 / 10 chance for each destroyed defense to recover independently; not a guaranteed fraction of losses.',
          subject: null,
        },
        ...(id === 'SmallShieldDome'
          ? [
              {
                label: 'Body limit',
                value:
                  'One completed or queued dome of this type per planet or moon. Its shield protects itself, not other units.',
                subject: null,
              },
            ]
          : []),
      ],
    },
  }))
}

/** Prepared props exercise the real comparison's local selection and mode state.
 * External research/catalog changes are explicit, independent of app navigation. */
export function ProgressionComparisonScenario() {
  const params = new URLSearchParams(location.search)
  const profile = params.get('profile') as ProfileShip | null
  const kind = params.get('kind') === 'Defense' ? 'Defense' : 'Ship'
  const [catalog, setCatalog] = useState(() => [
    ...comparisonCatalog(kind),
    ...(profile ? [shipProfile(profile)] : []),
  ])
  const [research, setResearch] = useState<S['Research3'][]>(() =>
    kind === 'Ship'
      ? [
          { research: 'CombustionDrive', level: 2 },
          { research: 'ImpulseDrive', level: 4 },
          ...(profile
            ? [
                {
                  research: 'HyperspaceDrive' as const,
                  level: {
                    Battleship: 4,
                    Battlecruiser: 5,
                    Destroyer: 6,
                    Bomber: 8,
                  }[profile],
                },
              ]
            : []),
        ]
      : [
          { research: 'WeaponsTechnology', level: 3 },
          { research: 'ShieldingTechnology', level: 2 },
          { research: 'ArmourTechnology', level: 1 },
        ],
  )
  return (
    <main style={{ padding: 16 }}>
      <div aria-label="Prepared data controls">
        <Button
          onClick={() =>
            setResearch((current) =>
              current.map((r) =>
                r.research ===
                (kind === 'Ship' ? 'ImpulseDrive' : 'WeaponsTechnology')
                  ? { ...r, level: r.level + 1 }
                  : r,
              ),
            )
          }
        >
          Increase research
        </Button>
        <Button
          onClick={() =>
            setCatalog((current) =>
              current.map((entry) =>
                entry.key.id === 'HeavyFighter'
                  ? { ...entry, enabled: false }
                  : entry.key.id === 'LightFighter'
                    ? {
                        ...entry,
                        ship_statistics: {
                          ...entry.ship_statistics!,
                          propulsion: {
                            ...entry.ship_statistics!.propulsion!,
                            base_speed: '16000',
                          },
                        },
                      }
                    : entry,
              ),
            )
          }
        >
          Replace ship catalog
        </Button>
      </div>
      {kind === 'Ship' ? (
        <ShipComparison catalog={catalog} research={research} />
      ) : (
        <UnitComparison kind="Defense" catalog={catalog} research={research} />
      )}
    </main>
  )
}
