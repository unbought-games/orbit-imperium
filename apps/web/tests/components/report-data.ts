export const deliveredReport = {
  kind: 'Delivered',
  origin: { galaxy: 1, system: 2, position: 8 },
  target: { galaxy: 1, system: 1, position: 3 },
  origin_name: 'Nova Roma Historical Homeworld',
  target_name: 'Very Long Destination Colony Name',
  cargo: {
    metal: '1000000000',
    crystal: '2000000000',
    deuterium: '3000000000',
  },
}

export const harvestReport = {
  kind: 'Harvested',
  origin_coordinates: { galaxy: 1, system: 1, position: 8 },
  destination_coordinates: { galaxy: 1, system: 4, position: 6 },
  harvested: {
    metal: '713000000',
    crystal: '238000000',
    deuterium: '608000000',
  },
  cargo: {
    metal: '10713000000',
    crystal: '8238000000',
    deuterium: '2608000000',
  },
  ships: [
    { ship_type: 'Recycler', count: '1' },
    { ship_type: 'LargeCargo', count: '4' },
  ],
}

export const sharedCombatLocations = [
  {
    name: 'Luna Outpost',
    kind: 'Moon',
    coordinates: { galaxy: 2, system: 24, position: 5 },
  },
  {
    name: 'Outer Colony',
    kind: 'Planet',
    coordinates: { galaxy: 3, system: 100, position: 8 },
  },
  {
    name: 'Nova Roma',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 372, position: 10 },
  },
]
export function sharedCombatReport(visible: boolean) {
  const participants = sharedCombatLocations.map((location, index) => ({
    owner: index === 2 ? 'defender' : 'attacker',
    side: index === 2 ? 'Defender' : 'Attacker',
    origin: index === 2 ? { Stationed: 'target' } : { Fleet: `fleet-${index}` },
    location: visible
      ? location
      : { kind: location.kind, coordinates_hidden: true },
    technology: [1, 2, 3],
    units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '5' }],
  }))
  return {
    kind: 'Combat',
    outcome: 'Draw',
    ...(visible
      ? {
          target: sharedCombatLocations[2].coordinates,
          target_name: sharedCombatLocations[2].name,
          target_kind: 'Planet',
        }
      : {}),
    participants,
    survivors: participants,
    recovered: [],
    rounds: [],
  }
}
