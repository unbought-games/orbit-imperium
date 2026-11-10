import type { SettingsDestination } from '../../src/features/alliances/settings'
import { allianceSections } from '../../src/features/alliances/sections'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  AlliancesController,
  permissionLabels,
  type AllianceDetail,
  type AllianceRequest,
} from '../../src/client-model/alliances'
import { Board } from '../../src/features/alliances/board'
import { Roles } from '../../src/features/alliances/roles'
import {
  Roster,
  Audit,
  Applications,
  Settings,
} from '../../src/features/alliances/administration'
import { Recruit } from '../../src/features/alliances/recruit'
import {
  AllianceDraftContext,
  AllianceDrafts,
} from '../../src/features/alliances/drafts'
import { Button } from '../../src/ui/button'
import type { components } from '../../src/contracts'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
type S = components['schemas']
const self = 'commander',
  member = 'nova'
export const summary: S['AllianceSummary'] = {
  id: 'alliance',
  universe: 'universe',
  name: 'Starlight Assembly',
  tag: 'STAR',
  recruitment: 'Application',
  member_count: 2,
  recruitment_profile: {
    listed: true,
    languages: ['en'],
    beginners: 'Welcome',
    activity: 'Weekly',
  },
}
export function allianceDetail(): AllianceDetail {
  const permissions = Object.keys(permissionLabels) as S['AlliancePermission'][]
  return {
    summary: structuredClone(summary),
    public_text: 'Together among the stars.',
    revision: 1,
    leader: self,
    permissions,
    grantable_permissions: permissions,
    roles: [
      {
        id: 'member',
        name: 'Member',
        is_default: true,
        permissions: ['ViewMembers', 'PublishPosts'],
        grantable_permissions: [],
      },
      {
        id: 'scout',
        name: 'Scout',
        is_default: false,
        permissions: ['ViewMembers'],
        grantable_permissions: [],
      },
    ],
    members: [
      {
        player: self,
        username: 'Commander',
        joined_at: 1700000000000,
        roles: ['member'],
      },
      {
        player: member,
        username: 'Nova',
        joined_at: 1700000000000,
        roles: ['member'],
      },
    ],
    applications: [
      {
        id: 'application',
        alliance: 'alliance',
        alliance_tag: 'STAR',
        player: 'recruit',
        username: 'New Pilot',
        text: 'Ready to explore.',
        created_at: 1700000000000,
      },
    ],
    posts: [
      {
        id: 'welcome',
        author: member,
        author_name: 'Nova',
        title: 'Welcome aboard',
        body: 'Our **first** chapter.',
        created_at: 1700000000000,
        updated_at: 1700000000000,
        pinned: false,
      },
    ],
    next_post_before: 'older',
  }
}
function setup() {
  let detail = allianceDetail(),
    denied = false,
    reject = false,
    cursorExpired = false
  const drafts = new AllianceDrafts(),
    commands: AllianceRequest[] = []
  const controller = new AlliancesController({
    newId: () => `command-${commands.length}`,
    onAccessLost: drafts.clear,
    read: async (q) => {
      if (denied) throw Object.assign(Error('Forbidden'), { status: 403 })
      if (q.type === 'Detail' && q.post_before && cursorExpired) {
        cursorExpired = false
        throw Object.assign(Error('Conflict'), { status: 409 })
      }
      const projected = structuredClone(detail)
      if (q.type === 'Detail' && q.post_before) {
        projected.posts = [
          {
            ...projected.posts![0],
            id: 'older',
            title: 'Older chapter',
            created_at: 1699999999000,
            pinned: false,
          },
        ]
        projected.next_post_before = null
      }
      return {
        binding: {
          universe: 'universe',
          epoch: 'epoch',
          account: 'account',
          player: self,
        },
        request_id: 'prepared',
        sampled_at: 1700000000000,
        alliance: projected,
        directory: [],
        directory_count: 0,
        applications: [],
      }
    },
    command: async (request) => {
      commands.push(request)
      if (reject) {
        reject = false
        throw Object.assign(Error('Conflict'), { status: 409 })
      }
      const a = request.action
      if (a.type === 'CreatePost')
        detail.posts = [
          {
            id: 'new',
            author: self,
            author_name: 'Commander',
            title: a.title ?? '',
            body: a.body ?? '',
            pinned: false,
            created_at: 1700000000001,
            updated_at: 1700000000001,
          },
          ...detail.posts!,
        ]
      if (a.type === 'Kick') {
        detail.members = detail.members!.filter((m) => m.player !== a.player)
        detail.summary.member_count = detail.members!.length
      }
      if (a.type === 'DeletePost')
        detail.posts = detail.posts!.filter((p) => p.id !== a.post)
      if (a.type === 'EditPost')
        Object.assign(detail.posts!.find((p) => p.id === a.post)!, {
          title: a.title ?? '',
          body: a.body ?? '',
        })
      if (a.type === 'PinPost')
        detail.posts!.find((p) => p.id === a.post)!.pinned = a.pinned
      if (a.type === 'SaveRole')
        detail.roles = [
          ...detail.roles!.filter((r) => r.id !== a.role),
          {
            id: a.role ?? 'custom',
            name: a.name,
            permissions: a.permissions,
            grantable_permissions: a.grantable_permissions,
            is_default: false,
          },
        ]
      if (a.type === 'AssignRoles')
        detail.members!.find((m) => m.player === a.player)!.roles = a.roles
      if (a.type === 'Update') {
        detail.summary.name = a.name
        detail.summary.tag = a.tag
        detail.summary.recruitment = a.recruitment
        detail.public_text = a.public_text
      }
      if (a.type === 'Accept') detail.applications = []
      if (a.type === 'SetRecruitmentProfile')
        detail.summary.recruitment_profile = a.profile
      if (a.type === 'SetInvitation')
        detail.invitation = a.enabled ? 'invitation-token' : null
      if (a.type === 'Transfer') {
        detail.leader = member
        detail.permissions = ['ViewMembers', 'PublishPosts']
        detail.grantable_permissions = []
      }
      detail.revision++
      return {
        command_id: request.command_id,
        alliance: 'alliance',
        revision: detail.revision,
      }
    },
  })
  const profiles = new PlayerProfilesController(async () => {
    throw Error('Profiles must be prepared')
  })
  return {
    controller,
    drafts,
    commands,
    profiles,
    reject: () => {
      reject = true
    },
    deny: async () => {
      denied = true
      await controller.refresh()
    },
    refresh: () => controller.refresh(),
    prepare: async (
      kind:
        | 'locked'
        | 'long'
        | 'departed'
        | 'expired'
        | 'roster'
        | 'viewer'
        | 'audit'
        | 'audit-empty',
    ) => {
      if (kind === 'audit' || kind === 'audit-empty') {
        detail.audit =
          kind === 'audit-empty'
            ? []
            : [
                {
                  id: 'event-1',
                  actor: self,
                  actor_name: 'Commander',
                  action: 'AssignRoles',
                  at: 1700000005000,
                  target: member,
                  subject: { kind: 'Player', label: 'Nova', player: member },
                },
                {
                  id: 'event-2',
                  actor: self,
                  actor_name: 'Commander',
                  action: 'DeleteRole',
                  at: 1700000004000,
                  target: 'deleted-role',
                  subject: { kind: 'Role', label: 'Expedition coordinator' },
                },
                {
                  id: 'event-3',
                  actor: member,
                  actor_name: 'Nova',
                  action: 'DeletePost',
                  at: 1700000003000,
                  target: 'deleted-post',
                  subject: {
                    kind: 'Notice',
                    label:
                      'Launch instructions for the distant outer systems and our next expedition',
                  },
                },
                {
                  id: 'event-4',
                  actor: self,
                  actor_name: 'Commander',
                  action: 'Accept',
                  at: 1700000002000,
                  target: 'old-application',
                  subject: { kind: 'Player', label: 'Former applicant' },
                },
                {
                  id: 'event-5',
                  actor: self,
                  actor_name: 'Commander',
                  action: 'DisableInvitation',
                  at: 1700000001000,
                  target: null,
                },
                {
                  id: 'event-6',
                  actor: self,
                  actor_name: 'Commander',
                  action: 'PinNotice',
                  at: 1700000000000,
                  target: 'post',
                  subject: { kind: 'Notice', label: 'Untitled notice' },
                },
              ]
      }
      if (kind === 'roster' || kind === 'viewer') {
        detail.roles!.push({
          id: 'diplomat',
          name: 'Diplomat',
          is_default: false,
          permissions: ['ViewMembers', 'ViewApplications'],
          grantable_permissions: [],
        })
        detail.members = [
          { ...detail.members![0], activity: 'Recent' },
          {
            ...detail.members![1],
            activity: 'Away',
            roles: ['member', 'scout'],
          },
          ...[
            'Atlas',
            'Ember',
            'Kaia',
            'Lyra',
            'Orion',
            'Vesper of the distant outer systems',
          ].map((username, index) => ({
            player: `sample-${index}`,
            username,
            joined_at: 1700000000000 - index * 86400000,
            roles:
              index === 3
                ? ['member', 'scout', 'diplomat']
                : index === 2
                  ? ['member', 'diplomat']
                  : ['member'],
            activity: (['Recent', 'Away', 'Inactive'] as const)[index % 3],
          })),
        ]
        detail.summary.member_count = detail.members!.length
        if (kind === 'viewer') {
          detail.permissions = ['ViewMembers']
          detail.grantable_permissions = []
        }
      }
      if (kind === 'locked') {
        detail.leader = 'leader'
        detail.permissions = ['ViewMembers', 'AssignRoles']
        detail.grantable_permissions = ['ViewMembers']
        detail.roles!.push({
          id: 'intelligence',
          name: 'Intelligence',
          is_default: false,
          permissions: ['ViewMembers', 'ViewActivity'],
          grantable_permissions: [],
        })
        detail.members![1].roles.push('intelligence')
      }
      if (kind === 'long') {
        detail.posts![0].pinned = true
        detail.posts![0].body =
          '```\n' +
          Array.from(
            { length: 60 },
            (_, i) => `| Standing order ${i + 1} |`,
          ).join('\n') +
          '\n```\n\nRead these standing orders together.\n\n[Read recruitment](/alliances/universe/alliance)'
      }
      if (kind === 'expired') {
        cursorExpired = true
        detail.posts![0].title = 'Fresh standing orders'
      }
      if (kind === 'departed') {
        detail.posts![0].author = 'departed'
        detail.posts![0].author_name = 'Departed Pilot'
        profiles.store.setState({
          players: Object.fromEntries(
            ['departed', self, member].map((player) => [
              player,
              {
                player,
                username:
                  player === 'departed'
                    ? 'Departed Pilot'
                    : player === member
                      ? 'Nova'
                      : 'Commander',
                observed_at: Date.now() / 1000,
                expires_at: Date.now() / 1000 + 300,
                alliance: {
                  id: 'other',
                  universe: 'universe',
                  name: 'Other Alliance',
                  tag: 'AWAY',
                },
              },
            ]),
          ),
        })
      }
      await controller.refresh()
    },
  }
}
declare global {
  interface Window {
    allianceScenario: ReturnType<typeof setup>
  }
}
export function AllianceStory() {
  const [scenario] = useState(setup),
    [tab, setTab] = useState('Board'),
    [settingsSection, setSettingsSection] =
      useState<SettingsDestination>('Profile')
  const state = useStore(scenario.controller.store)
  useEffect(() => {
    window.allianceScenario = scenario
    void scenario.controller.refresh()
    return () => scenario.controller.clear()
  }, [scenario])
  const detail = state.view?.alliance,
    run = scenario.controller.run.bind(scenario.controller),
    busy = state.busy || state.loading || !!state.pending
  return (
    <PlayerProfilesContext.Provider value={scenario.profiles}>
      <AllianceDraftContext.Provider value={scenario.drafts}>
        <main style={{ padding: 16 }}>
          <nav aria-label="Prepared alliance panels">
            {allianceSections(detail ?? null).map((name) => (
              <Button key={name} onClick={() => setTab(name)}>
                {name}
              </Button>
            ))}
          </nav>
          {state.error && <p role="alert">{state.error}</p>}
          {state.notice && <p role="status">{state.notice}</p>}
          {detail && (
            <>
              {tab === 'Board' && (
                <Board
                  detail={detail}
                  player={self}
                  run={run}
                  busy={busy}
                  load={(cursor) => {
                    void scenario.controller.loadOlder(cursor)
                  }}
                />
              )}
              {tab === 'Members' && (
                <Roster detail={detail} player={self} run={run} busy={busy} />
              )}
              {tab === 'Roles' && (
                <Roles detail={detail} run={run} busy={busy} />
              )}
              {tab === 'Applications' && (
                <Applications detail={detail} run={run} busy={busy} />
              )}
              {tab === 'Audit' && <Audit detail={detail} />}
              {tab === 'Settings' && (
                <Settings
                  detail={detail}
                  player={self}
                  run={run}
                  busy={busy}
                  section={settingsSection}
                  onSectionChange={setSettingsSection}
                />
              )}
            </>
          )}
        </main>
      </AllianceDraftContext.Provider>
    </PlayerProfilesContext.Provider>
  )
}
export function RecruitStory() {
  const [mode, setMode] = useState<S['AllianceRecruitment']>('Application')
  const [sent, setSent] = useState(''),
    [reject, setReject] = useState(true)
  const [drafts] = useState(() => new AllianceDrafts())
  return (
    <AllianceDraftContext.Provider value={drafts}>
      <main style={{ padding: 16 }}>
        <label>
          Recruitment mode
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as S['AllianceRecruitment'])
            }
          >
            {['Application', 'Open', 'Closed'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <Recruit
          summary={{ ...summary, recruitment: mode }}
          view={{
            binding: { universe: 'u', epoch: 'e', account: 'a', player: self },
            request_id: 'r',
            sampled_at: 0,
            alliance: null,
            applications: [],
            directory: [],
            directory_count: 0,
          }}
          busy={false}
          run={async (a) => {
            if (reject) {
              setReject(false)
              setSent('Conflict')
              return false
            }
            setSent(JSON.stringify(a))
            return true
          }}
        />
        <output
          aria-label="Recruitment result"
          style={{ overflowWrap: 'anywhere' }}
        >
          {sent}
        </output>
      </main>
    </AllianceDraftContext.Provider>
  )
}
