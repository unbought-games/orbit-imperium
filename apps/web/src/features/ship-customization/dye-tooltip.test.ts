import { expect, it } from 'vitest'
import fixture from '../../../../../contracts/fixtures/community-owner.json'
import type { CommunityOwner } from '../../adapters/community-rewards'
import type { ShipDye } from '../../client-model/ship-appearance-types'
import { dyeUnlockHint } from './dye-tooltip'

it('names an open offer for this dye and stops advertising it once the choice is spent', () => {
  const owner = structuredClone(fixture) as CommunityOwner
  const dye: ShipDye = {
    id: 'sample-ochre',
    name: 'Ochre',
    color: '#aa7733',
    access: 'earned',
    availability: 'locked',
  }
  expect(dyeUnlockHint(dye, owner)).toContain('under “2 Renown”')
  owner.milestones[0].remaining = 0
  expect(dyeUnlockHint(dye, owner)).toContain('when it appears')
})
