import type { components } from '../../src/contracts'
import rules from '../../../../rules/mvp-v1-slice-9.json' with { type: 'json' }
import cruiser from '../../../../rules/content/cruiser.json' with { type: 'json' }
import largeCargo from '../../../../rules/content/large-cargo.json' with { type: 'json' }
import satellite from '../../../../rules/content/solar-satellite.json' with { type: 'json' }
import battleship from '../../../../rules/content/battleship.json' with { type: 'json' }
import battlecruiser from '../../../../rules/content/battlecruiser.json' with { type: 'json' }
import bomber from '../../../../rules/content/bomber.json' with { type: 'json' }
import destroyer from '../../../../rules/content/destroyer.json' with { type: 'json' }

type Entry = components['schemas']['CatalogEntry3']
const combat = { attack_ticks: '5000000', shield_ticks: '1000000', hull_ticks: '40000000', rapid_fire_against: [], rapid_fire_from: [] }
// Populate the real catalog's supported ships/costs for visual density and ordering.
// Battle behavior is supplied independently by each test's response fixture.
export const simulationCatalog: Entry[] = rules.catalog.map(raw => {
  const entry = raw as Entry
  const unit = rules.world.combat.units.find(unit => unit.item.kind === entry.key.kind && unit.item.id === entry.key.id)
  const extensions: Record<string, { cost: { metal: number; crystal: number; deuterium: number } }> = { Cruiser: cruiser, LargeCargo: largeCargo, SolarSatellite: satellite, Battleship: battleship, Battlecruiser: battlecruiser, Bomber: bomber, Destroyer: destroyer }
  const extension = extensions[entry.key.id]
  const cost = extension ? [extension.cost.metal, extension.cost.crystal, extension.cost.deuterium] : unit?.cost
  if (!cost) return entry
  return { ...entry, technical_data: { combat, facts: [], bonuses: [], storage_capacities: null }, ...(entry.key.kind === 'Ship' ? { ship_statistics: { propulsion: null, combat, cost: cost.map(String) } } : {}) }
})
