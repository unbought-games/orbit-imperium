import { resolveCatalogArt } from '../../ui/artwork'
export const resourceBuildings = [
  {
    id: 'MetalMine',
    art: resolveCatalogArt({ kind: 'Building', id: 'MetalMine' }),
    description:
      'Deep excavations draw the bones of an empire from the rock. Every hull, fortress, and rising city begins with the steady work of the metal mines.',
  },
  {
    id: 'CrystalMine',
    art: resolveCatalogArt({ kind: 'Building', id: 'CrystalMine' }),
    description:
      'Beneath the surface lie the crystals that make advanced engineering possible. Refined into precision components, their brilliance becomes the instruments, shields, and technologies that carry your empire forward.',
  },
  {
    id: 'DeuteriumSynthesizer',
    art: resolveCatalogArt({ kind: 'Building', id: 'DeuteriumSynthesizer' }),
    description:
      'Vast separation plants draw precious deuterium from the world around them. Their output fuels voyages between the stars and the ambitious technologies that make those journeys possible.',
  },
  {
    id: 'SolarPlant',
    art: resolveCatalogArt({ kind: 'Building', id: 'SolarPlant' }),
    description:
      'Broad collector arrays turn sunlight into the power of a growing world. Beneath their steady supply, mines dig deeper and the foundations of an empire take shape.',
  },
  {
    id: 'FusionReactor',
    art: resolveCatalogArt({ kind: 'Building', id: 'FusionReactor' }),
    description:
      'A controlled fusion core brings the fire of a star into the heart of your industry. It supplies the power to sustain ambitious mining operations far from generous sunlight.',
  },
  {
    id: 'MetalStorage',
    art: resolveCatalogArt({ kind: 'Building', id: 'MetalStorage' }),
    description:
      'Vast industrial stockyards gather the material for your next great undertaking. Here, the output of countless mining shifts waits to become new settlements, fortified worlds, and fleets.',
  },
  {
    id: 'CrystalStorage',
    art: resolveCatalogArt({ kind: 'Building', id: 'CrystalStorage' }),
    description:
      'Dedicated storehouses gather the crystals behind your most demanding engineering projects. These reserves turn the patient work of the mines into the promise of a new technological frontier.',
  },
  {
    id: 'DeuteriumTank',
    art: resolveCatalogArt({ kind: 'Building', id: 'DeuteriumTank' }),
    description:
      'Reservoirs of refined deuterium hold the promise of journeys still to come. A well-supplied fuel reserve gives a commander the freedom to prepare distant operations and sustain an expanding fleet.',
  },
] as const
export type ResourceBuilding = (typeof resourceBuildings)[number]
