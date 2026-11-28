import type { components } from '../../src/contracts'

export function personalInvitation(
  code: string,
  universe: string,
  epoch: string,
  asset: string,
): components['schemas']['GameInvitationPresentation'] {
  return {
    code,
    status: 'ready',
    kind: 'personal',
    alliance: null,
    inviter: {
      name: 'Aurelia',
      empire_name: 'The Aurora Accord',
      tagline: 'A wider horizon.',
      title: {
        id: 'commander',
        label: 'Commander',
        address: 'Commander',
        expires_at: null,
      },
      insignia: {
        recipe: {
          version: 1,
          symbol: 'compass',
          foreground: '#dfc698',
          background: '#173c4c',
          shape: 'hexagon',
        },
        asset_url: asset,
      },
    },
    universe: {
      id: universe,
      epoch_id: epoch,
      name: 'Andromeda',
      speed: 5,
      galaxies: 2,
      systems_per_galaxy: 100,
      players: 27,
      max_players: 500,
      signup_enabled: true,
      art_slot: 4,
    },
  }
}
