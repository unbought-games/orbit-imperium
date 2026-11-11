import { expect, type Page } from '@playwright/test'
import { installGameFixture, binding, id, body } from './game'
import type { components } from '../../src/contracts'
type S = components['schemas']
export const alliance = id(910),
  token = id(911),
  invitationPath = `/invite/${binding.universe}/${token}`
const summary: S['AllianceSummary'] = {
  id: alliance,
  universe: binding.universe,
  name: 'Starlight Assembly',
  tag: 'STAR',
  recruitment: 'Application',
  member_count: 8,
  recruitment_profile: {
    listed: true,
    languages: ['en', 'fr'],
    beginners: 'Welcome',
    activity: 'Weekly',
  },
}
const publicData: S['PublicAlliance'] = {
  summary,
  public_text:
    '**A home among the stars.**\n\nWe welcome new commanders, share what we learn, and plan our next adventure together.',
  universe_name: 'Andromeda',
  enrollment_open: true,
}
export const pathMatches =
  (suffix: string) => (response: import('@playwright/test').Response) =>
    new URL(response.url()).pathname.endsWith(suffix)
export async function recruitmentFixture(
  page: Page,
  {
    authenticated = true,
    enrolled = true,
    mode = 'Application' as S['AllianceRecruitment'],
    manager = false,
    customization = false,
    arrivalPending = undefined as (() => boolean) | undefined,
  } = {},
) {
  await installGameFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
    ...(arrivalPending
      ? {
          arrivalPending,
          homeworldId: body.id,
          bodies: [{ ...body, name: 'Terra' }],
        }
      : {}),
  })
  let signedIn = authenticated,
    hasEmpire = enrolled
  const data = structuredClone(publicData)
  data.summary.recruitment = mode
  let detail: S['AllianceDetail'] | null = manager
    ? {
        summary: data.summary,
        public_text: data.public_text,
        revision: 1,
        leader: binding.player,
        permissions: ['ManageRecruitment', 'EditProfile'],
        grantable_permissions: [],
        invitation: null,
      }
    : null
  if (customization && detail) {
    const identity: S['AllianceVisualIdentity'] = {
      motto: '',
      primary: '#cbb68d',
      secondary: '#a4dbef',
      banner: null,
      crest: {
        kind: 'composition',
        recipe: {
          version: 2,
          symbol: 'compass',
          foreground: '#cbb68d',
          background: '#152b40',
          layers: [],
        },
      },
    }
    const presentation: S['AlliancePresentation'] = {
      schema_version: 1,
      identity,
      hall: { welcome_markdown: '', community_markdown: '', background: null },
      active_template: 'flagship',
      templates: {},
    }
    detail.presentation = {
      public: {
        schema_version: 1,
        identity,
        template_id: 'flagship',
        document: { schema_version: 1, content: {} },
      },
      hall: presentation.hall,
      editor: presentation,
    }
    data.presentation = detail.presentation.public
    data.summary.visual_identity = identity
    await page.route('**/api/alliance-presentation/catalog', (route) =>
      route.fulfill({
        json: {
          templates: [
            {
              id: 'flagship',
              name: 'Flagship',
              description: 'Cinematic',
              schema_version: 1,
              fields: [
                {
                  key: 'hero_markdown',
                  label: 'Hero introduction',
                  kind: 'markdown',
                  max_length: 1200,
                },
              ],
            },
          ],
          symbols: [
            {
              id: 'compass',
              name: 'Wayfinder',
              supporter: false,
              group: 'legacy',
              access: 'available',
              asset_url: `/api/media/insignias/compass/${'0'.repeat(64)}.svg`,
            },
          ],
          max_file_bytes: 20971520,
          max_total_bytes: 209715200,
          max_count: 50,
        },
      }),
    )
    await page.route('**/alliances/media', (route) =>
      route.fulfill({
        json: {
          media: [],
          max_file_bytes: 20971520,
          max_total_bytes: 209715200,
          max_count: 50,
        },
      }),
    )
  }
  let applications: S['AllianceApplication'][] = []
  const commands: S['AllianceCommandRequest'][] = [],
    enrollments: unknown[] = []
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      json: {
        mode: 'oidc',
        universes: [{ universe: binding.universe, name: 'Andromeda' }],
      },
    }),
  )
  await page.route('**/api/v1/bootstrap', (route) => {
    if (signedIn && hasEmpire) return route.fallback()
    return route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: signedIn
          ? {
              status: 'authenticated',
              session: {
                account: binding.account,
                csrf: 'fixture',
                expires_at: Date.now() + 1000000,
                memberships: [],
              },
              game: { status: 'no_membership' },
            }
          : { status: 'anonymous' },
      },
    })
  })
  await page.route('**/api/auth/login?*', (route) => {
    signedIn = true
    const target = new URL(route.request().url()).searchParams.get('return_to')!
    expect(target).toBe(
      `/join/${binding.universe}?alliance=${alliance}&invitation=${token}`,
    )
    return route.fulfill({
      contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(target)})</script>`,
    })
  })
  await page.route('**/api/auth/enroll', (route) => {
    enrollments.push(route.request().postDataJSON())
    hasEmpire = true
    return route.fulfill({ status: 204 })
  })
  await page.route(`**/invitations/${token}`, (route) =>
    route.fulfill({ json: data }),
  )
  await page.route(`**/alliances/${alliance}`, (route) =>
    route.fulfill({ json: data }),
  )
  await page.route(/\/recruitment(?:\?|$)/, (route) => {
    const q = new URL(route.request().url()).searchParams
    const found =
      !q.get('language') ||
      q.get('language') === 'en' ||
      q.get('language') === 'fr'
    return route.fulfill({
      json: { alliances: found ? [data] : [], total: found ? 1 : 0 },
    })
  })
  await page.route('**/alliances/query', (route) => {
    const { context, query } = route
      .request()
      .postDataJSON() as S['AllianceQueryRequest']
    return route.fulfill({
      json: {
        ...context,
        sampled_at: 1700000000000,
        directory: query.type === 'Directory' ? [data.summary] : [],
        directory_count: query.type === 'Directory' ? 1 : 0,
        alliance: query.type === 'Directory' ? null : detail,
        applications,
      },
    })
  })
  await page.route('**/alliances/commands', (route) => {
    const command = route
      .request()
      .postDataJSON() as S['AllianceCommandRequest']
    commands.push(command)
    const action = command.action
    if (action.type === 'Apply')
      applications = [
        {
          id: id(912),
          alliance,
          alliance_tag: 'STAR',
          player: binding.player,
          username: 'Commander',
          text: action.text,
          created_at: 1700000000000,
        },
      ]
    if (action.type === 'Join')
      detail = {
        summary: data.summary,
        public_text: data.public_text,
        revision: 1,
        leader: id(913),
        permissions: [],
        grantable_permissions: [],
      }
    if (action.type === 'SavePresentation' && detail?.presentation?.editor) {
      const p = detail.presentation.editor
      for (const edit of action.edits) {
        if (edit.type === 'SetIdentity') p.identity = edit.value
        if (edit.type === 'SetHall') p.hall = edit.value
        if (edit.type === 'SetTemplateDocument')
          p.templates[edit.template_id] = edit.document
        if (edit.type === 'SelectTemplate') p.active_template = edit.template_id
      }
      data.summary.visual_identity = p.identity
      data.presentation = {
        schema_version: 1,
        identity: p.identity,
        template_id: p.active_template,
        document: p.templates[p.active_template] ?? {
          schema_version: 1,
          content: {},
        },
      }
      detail.presentation = {
        editor: p,
        public: data.presentation,
        hall: p.hall,
      }
    }
    if (action.type === 'SetRecruitmentProfile')
      detail!.summary.recruitment_profile = action.profile
    if (action.type === 'SetInvitation')
      detail!.invitation = action.enabled ? token : null
    if (detail) detail.revision++
    return route.fulfill({
      json: {
        command_id: command.command_id,
        alliance,
        revision: detail?.revision ?? null,
      },
    })
  })
  return { data, commands, enrollments }
}
