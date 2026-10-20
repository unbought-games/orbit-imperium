import { resolveCatalogArt } from '../../ui/artwork'
export const resourceBuildings = [
  {
    id: 'MetalMine',
    art: resolveCatalogArt({ kind: 'Building', id: 'MetalMine' }),
    description:
      'Extracts metal ore for buildings, ships, and defenses. Higher levels increase metal production and energy demand.',
  },
  {
    id: 'CrystalMine',
    art: resolveCatalogArt({ kind: 'Building', id: 'CrystalMine' }),
    description:
      'Extracts and refines crystals for advanced construction and technology. Higher levels increase crystal production and energy demand.',
  },
  {
    id: 'DeuteriumSynthesizer',
    art: resolveCatalogArt({ kind: 'Building', id: 'DeuteriumSynthesizer' }),
    description:
      'Produces deuterium used as fleet fuel and in advanced technology. Production consumes energy.',
  },
  {
    id: 'SolarPlant',
    art: resolveCatalogArt({ kind: 'Building', id: 'SolarPlant' }),
    description:
      'Supplies the energy your mines need to operate. Higher levels increase energy production.',
  },
  {
    id: 'FusionReactor',
    art: resolveCatalogArt({ kind: 'Building', id: 'FusionReactor' }),
    description: 'Generates energy using deuterium fuel.',
  },
  {
    id: 'SolarSatellite',
    art: resolveCatalogArt({ kind: 'Ship', id: 'SolarSatellite' }),
    description: 'Collects solar energy in orbit.',
  },
  {
    id: 'MetalStorage',
    art: resolveCatalogArt({ kind: 'Building', id: 'MetalStorage' }),
    description:
      'Increases metal storage capacity. Metal production stops when storage is full; resources already stored remain available.',
  },
  {
    id: 'CrystalStorage',
    art: resolveCatalogArt({ kind: 'Building', id: 'CrystalStorage' }),
    description:
      'Increases crystal storage capacity. Crystal production stops when storage is full; resources already stored remain available.',
  },
  {
    id: 'DeuteriumTank',
    art: resolveCatalogArt({ kind: 'Building', id: 'DeuteriumTank' }),
    description:
      'Increases deuterium storage capacity. Deuterium production stops when storage is full; resources already stored remain available.',
  },
] as const
export type ResourceBuilding = (typeof resourceBuildings)[number]
