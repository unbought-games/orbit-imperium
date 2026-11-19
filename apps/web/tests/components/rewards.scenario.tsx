import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { CommunityRewardsController } from '../../src/client-model/community-rewards'
import { InsigniaController } from '../../src/client-model/insignias'
import { useCommands } from '../../src/client-model/use-commands'
import { automaticTitlesFixture } from '../../src/test-support/automatic-titles'
import { readyFixture } from '../../src/test-support/bootstrap'
import { RewardsScreen } from '../../src/features/rewards/rewards-screen'
import { InvitationManagement } from '../../src/features/rewards/invitation-management'
import { RewardsContext } from '../../src/shell/community-rewards-context'
import { InsigniaContext } from '../../src/shell/insignia-context'
import { ScreenContext } from '../../src/shell/screen-context'
import { ShellAccountLink } from './shell.story'
import { createEmpireScene } from './empire-runtime'
import type { CommunityActionRequest } from '../../src/adapters/community-rewards'

const { model, view } = await createEmpireScene()
const { session } = readyFixture(4)
const owner = automaticTitlesFixture()
const code = 'inv_fixture-A_9'
const mode = new URLSearchParams(location.search).get('mode')
const issued = structuredClone(owner.invitations[0])
owner.invitations = []
if (mode === 'inactive') {
  owner.program.status = 'inactive'
  owner.program.start_at = null
}
const scene = { submitted: [] as CommunityActionRequest[] }
declare global {
  interface Window {
    rewardsScene: typeof scene
  }
}
const unexpected = async (): Promise<never> => {
  throw Error('Unexpected rewards scene operation')
}
const rewards = new CommunityRewardsController({
  owner: async () => {
    if (mode === 'offline') throw Error('Rewards unavailable')
    return structuredClone(owner)
  },
  act: async (request) => {
    if (request.action.type !== 'create_invitation') return unexpected()
    scene.submitted.push(request)
    owner.invitations = [
      {
        ...issued,
        code,
        url: new URL(`/invite/${code}`, location.origin).href,
        destination: {
          ...issued.destination!,
          universe_id: request.action.universe_id,
        },
      },
    ]
    return {
      contract_version: 1,
      result: { code },
      owner: structuredClone(owner),
    }
  },
  invitation: unexpected,
  invitationPreview: unexpected,
  marks: unexpected,
  allianceHonors: unexpected,
})
const insignias = new InsigniaController(
  async (action) => {
    if (action.type !== 'Load') return unexpected()
    return {
      binding: view.binding,
      request_id: 'read',
      library: { designs: [], equipped: null, permanent_symbols: [] },
      catalog: [],
      policy: 'supporter',
      appearance: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
  },
  () => {},
)
const memberships = [
  { universe: view.binding.universe, universe_name: 'Andromeda' },
  { universe: 'second-universe', universe_name: 'Orion Reach' },
]
function Surface() {
  const [runtime] = useState(() => ({
    status: 'authenticated' as const,
    source: 'document' as const,
    game: { status: 'ready' as const, model },
    signupEnabled: true,
    session,
  }))
  const commands = useCommands(runtime)
  const body = view.bodies[0]
  useEffect(() => {
    window.rewardsScene = scene
    void rewards.load()
    return rewards.stop
  }, [])
  return (
    <RewardsContext.Provider value={rewards}>
      <InsigniaContext.Provider value={insignias}>
        <ScreenContext.Provider
          value={{
            model,
            view,
            commands,
            body,
            universeName: 'andromeda',
            logout: unexpected,
            prepareDispatch: () => {
              throw Error('Unexpected dispatch')
            },
            route: {
              page: 'rewards',
              body: body.id,
              item: null,
              available: true,
              reason: '',
            },
          }}
        >
          {new URLSearchParams(location.search).get('surface') ===
          'management' ? (
            <InvitationManagement memberships={memberships} />
          ) : (
            <RewardsScreen />
          )}
        </ScreenContext.Provider>
      </InsigniaContext.Provider>
    </RewardsContext.Provider>
  )
}
export function RewardsScenario() {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: Surface }),
      history: createMemoryHistory(),
    }),
  )
  return <RouterProvider router={router} />
}

export function RewardsSidebar() {
  useEffect(() => {
    void rewards.load()
    return rewards.stop
  }, [])
  return (
    <RewardsContext.Provider value={rewards}>
      <ShellAccountLink />
    </RewardsContext.Provider>
  )
}
