import observed from '../../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }

export const expandedEspionage = {
  ...observed,
  target: { ...observed.target, name: 'Nova Roma' },
  resources: {
    visibility: 'Known',
    value: {
      metal: '18763000000',
      crystal: '10441000000',
      deuterium: '560000000',
    },
  },
  research: {
    visibility: 'Known',
    value: {
      ...observed.research.value,
      WeaponsTechnology: 8,
      EspionageTechnology: 5,
      HyperspaceDrive: 0,
      PlasmaTechnology: 2,
    },
  },
  buildings: {
    visibility: 'Known',
    value: {
      ...observed.buildings.value,
      MetalMine: 7,
      CrystalMine: 6,
      SolarPlant: 9,
      ResearchLab: 2,
      FusionReactor: 3,
      NaniteFactory: 1,
      LunarBase: 0,
      SensorPhalanx: 0,
      JumpGate: 0,
    },
  },
}

export const longEspionage = {
  ...observed,
  buildings: {
    visibility: 'Known',
    value: { ...observed.buildings.value, MetalMine: 0, ResearchLab: 12 },
  },
  research: {
    visibility: 'Known',
    value: {
      ...observed.research.value,
      WeaponsTechnology: 0,
      IntergalacticResearchNetwork: 123,
    },
  },
  defenses: { visibility: 'Unknown' },
}
