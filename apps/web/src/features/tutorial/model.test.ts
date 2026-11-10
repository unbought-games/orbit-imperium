import { expect, it } from 'vitest'
import { tutorialFixture, siteReportFixture } from '../../test-support/tutorial'
import { readyFixture } from '../../test-support/bootstrap'
import {
  recommendation,
  objectiveTitle,
  objectiveDestination,
  objectiveDescription,
  tutorialPages,
  briefingEntryAvailable,
  briefingProgress,
  tutorialMorePages,
  objectiveStatus,
  accomplishmentTitle,
} from './model'
import { siteBattleSummary } from './site-report-model'
import {
  draftFromSearch,
  dispatchSearch,
  validateDispatchSearch,
} from '../../shell/dispatch-location'
import { siteEndpoint } from '../command-hud/fleet-summary'
import { reportPreview } from '../report-preview'
function fixture() {
  const { snapshot } = readyFixture(4)
  if (snapshot.view.protocol !== 4) throw Error('fixture')
  const data = tutorialFixture()
  snapshot.view.bodies = [
    {
      id: data.homeworld!,
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: {
        metal: '999999999999',
        crystal: '999999999999',
        deuterium: '999999999999',
      },
      capacity: {
        metal: '999999999999',
        crystal: '999999999999',
        deuterium: '999999999999',
      },
      levels: {},
      fields: 163,
      fields_used: 0,
      fields_reserved: 0,
      energy: { supply: '0', demand: '0', utilization: '1000000' },
      inventories: [],
    },
  ]
  return { data, view: snapshot.view }
}
it('offers ready research across chapters while the authored construction priority is busy', () => {
  const { data, view } = fixture()
  const all = data.chapters.flatMap((c) => c.objectives)
  const building = all.find((o) => o.id === data.recommended_objectives[0])!
  const research = all.find((o) => o.id === 'energy-1')!
  building.inspection!.blockers = [
    {
      code: 'ActiveConstruction',
      actual: null,
      required: null,
      requirement: null,
      resource: null,
      unit: null,
    },
  ]
  research.inspection!.blockers = []
  // Retain real priced material: only the controlled queue/prerequisite facts change.
  expect(research.inspection!.terms).not.toBeNull()
  data.recommended_objectives = [building.id, research.id]
  expect(recommendation(data, view)?.id).toBe('energy-1')
  expect(tutorialPages(data, view)?.has('research')).toBe(true)
})
it('does not pay or complete reinvestment from a ready quote before actual haul evidence', () => {
  const { data, view } = fixture()
  const o = data.chapters
    .flatMap((c) => c.objectives)
    .find((o) => o.id === 'reinvest')!
  expect(objectiveStatus(o, data, view)).toMatchObject({ ready: false })
  const before = JSON.stringify(data.receipts)
  data.beginner = false
  expect(tutorialPages(data, view)).toBeNull()
  expect(JSON.stringify(data.receipts)).toBe(before)
})
it('keeps the opening focused while preserving optional destinations in More', () => {
  const { data, view } = fixture()
  const pages = tutorialPages(data, view)
  for (const page of ['briefing', 'resources', 'settings'] as const)
    expect(pages?.has(page)).toBe(true)
  expect(tutorialMorePages(pages)).toEqual([
    'messages',
    'reports',
    'fleets',
    'dispatch',
    'facilities',
  ])
  for (const page of tutorialMorePages(pages))
    expect(pages?.has(page)).toBe(false)
  expect(tutorialPages(tutorialFixture(true), view)).toBeNull()
  expect(tutorialMorePages(null)).toEqual([])
})
it('introduces Facilities at the authored construction priority and keeps existing facilities visible', () => {
  const { data, view } = fixture()
  data.recommended_objectives = ['robotics-2']
  expect(tutorialPages(data, view)?.has('facilities')).toBe(true)
  data.recommended_objectives = ['metal-1']
  view.bodies[0].levels.RoboticsFactory = 1
  expect(tutorialPages(data, view)?.has('facilities')).toBe(true)
})
it('promotes Facilities after the first deuterium directive while mine upgrades remain', () => {
  const { data, view } = fixture()
  data.recommended_objectives = ['deuterium-2']
  const directive = data.chapters
    .flatMap((chapter) => chapter.objectives)
    .find((o) => o.id === 'deuterium-1')!
  expect(tutorialPages(data, view)?.has('facilities')).toBe(false)
  directive.completed = true
  const pages = tutorialPages(data, view)
  expect(pages?.has('facilities')).toBe(true)
  expect(tutorialMorePages(pages)).not.toContain('facilities')
})
it('introduces fleet navigation for ships and reports for operations without promoting Messages', () => {
  const { data, view } = fixture()
  view.bodies[0].levels.Shipyard = 1
  expect(tutorialPages(data, view)?.has('fleets')).toBe(true)
  expect(tutorialPages(data, view)?.has('dispatch')).toBe(true)
  expect(tutorialPages(data, view)?.has('reports')).toBe(false)
  data.sites = tutorialFixture(true).sites
  const pages = tutorialPages(data, view)
  expect(pages?.has('reports')).toBe(true)
  expect(tutorialMorePages(pages)).toEqual(['messages'])
})
it('preserves two different private selections at the same anchor through URL reload', () => {
  const data = tutorialFixture(true)
  expect(data.sites).toHaveLength(2)
  for (const site of data.sites) {
    const draft = {
      mission: 'Attack' as const,
      coordinates: site.site.destination.coordinates,
      target: {
        type: 'Site' as const,
        selection: site.site.destination.selection,
      },
    }
    const restored = draftFromSearch(
      validateDispatchSearch(dispatchSearch(draft)),
    )
    expect(restored?.target).toEqual(draft.target)
    expect(siteEndpoint(data, draft.target.selection.id).name).toBe(site.title)
  }
  expect(data.sites[0].site.destination.coordinates).toEqual(
    data.sites[1].site.destination.coordinates,
  )
})
it('keeps NPC loss, stockpile loot and unavailable debris separate in details and previews', () => {
  const report = siteReportFixture(),
    payload = report.data.payload
  if (payload.kind !== 'SiteEncounter') throw Error('fixture')
  const result = siteBattleSummary(payload, report.binding.player)
  expect(result.ownLosses).toEqual([])
  expect(result.npcLosses.some((u) => u.item.id === 'SolarSatellite')).toBe(
    true,
  )
  expect(reportPreview(report.data.header.preview).facts).toContainEqual({
    resources: payload.loot,
    label: 'Loot aboard',
  })
  expect(reportPreview(report.data.header.preview).facts).toContainEqual({
    resources: payload.debris,
    label: 'Debris · cannot collect',
    debris: true,
  })
})

it('recomputes resource blockers from ordinary projected balances without completing the objective', () => {
  const { data, view } = fixture(),
    o = data.chapters[0].objectives[0]
  view.bodies[0].amounts = { metal: '0', crystal: '0', deuterium: '0' }
  expect(objectiveStatus(o, data, view).ready).toBe(false)
  view.bodies[0].amounts = {
    metal: '1000000000',
    crystal: '1000000000',
    deuterium: '0',
  }
  expect(objectiveStatus(o, data, view).ready).toBe(true)
  expect(o.completed).toBe(false)
  expect(data.receipts).toEqual([])
})

it('rejects malformed private destination links instead of falling back to an attack on the anchor planet', () => {
  expect(() =>
    validateDispatchSearch({
      galaxy: 1,
      system: 1,
      position: 1,
      site: 'broken',
      siteRevision: '1',
    }),
  ).toThrow('personal site selection')
  expect(() =>
    validateDispatchSearch({ site: '00000000-0000-4000-8000-000000000001' }),
  ).toThrow('personal site selection')
})

it('keeps concise job titles stable after completion removes the next action', () => {
  const objectives = tutorialFixture().chapters.flatMap((c) => c.objectives)
  const titles = objectives.map(objectiveTitle)
  expect(titles.slice(0, 3)).toEqual([
    'Build Solar Plant level 1',
    'Build Metal Mine level 1',
    'Build Crystal Mine level 1',
  ])
  expect(titles).toContain('Research Energy Technology level 1')
  expect(titles).toContain('Research Combustion Drive level 2')
  expect(titles).toContain('Build a Light Fighter')
  expect(titles).toContain('Collect raid loot')
  expect(
    objectives.map((o) =>
      objectiveTitle({ ...o, completed: true, next_action: null }),
    ),
  ).toEqual(titles)
})

it('uses the authored purpose for incomplete and completed directives', () => {
  const jobs = tutorialFixture(false).chapters.flatMap(
    (chapter) => chapter.objectives,
  )
  const mine = jobs.find((job) => job.id === 'metal-1')!
  expect(objectiveDescription(mine)).toBe(
    'Start producing metal to fund your colony.',
  )
  expect(
    objectiveDescription({ ...mine, completed: true, next_action: null }),
  ).toBe(objectiveDescription(mine))
})

it('keeps every job reachable before and after completion without requiring recommended order', () => {
  const data = tutorialFixture()
  const jobs = data.chapters.flatMap((c) => c.objectives)
  for (const job of jobs) {
    expect(objectiveDestination(job, data)).not.toBeNull()
    expect(
      objectiveDestination(
        { ...job, completed: true, next_action: null },
        data,
      ),
    ).not.toBeNull()
  }
  const crystal = jobs.find((o) => o.id === 'crystal-1')!
  expect(objectiveDestination(crystal, data)).toEqual({
    page: 'resources',
    body: data.homeworld,
    item: 'CrystalMine',
  })
  expect(
    objectiveDestination(
      { ...crystal, completed: true, next_action: null },
      data,
    ),
  ).toEqual(objectiveDestination(crystal, data))
  expect(
    objectiveDestination(
      {
        ...jobs.find((o) => o.id === 'energy-1')!,
        completed: true,
        next_action: null,
      },
      data,
    )?.page,
  ).toBe('research')
  expect(
    objectiveDestination(
      {
        ...jobs.find((o) => o.id === 'fighter')!,
        completed: true,
        next_action: null,
      },
      data,
    )?.item,
  ).toBe('LightFighter')
  expect(
    objectiveDestination(
      {
        ...jobs.find((o) => o.id === 'contact')!,
        completed: true,
        next_action: null,
      },
      data,
    )?.page,
  ).toBe('reports')
  expect(
    objectiveDestination(jobs.find((o) => o.id === 'haul')!, data)?.page,
  ).toBe('fleets')
})

it('opens disclosed operations in Galaxy with their private identity, including while in flight', () => {
  const data = tutorialFixture(true)
  const job = tutorialFixture()
    .chapters.flatMap((c) => c.objectives)
    .find((o) => o.id === 'contact')!
  if (job.next_action?.type !== 'Attack') throw Error('fixture')
  const site = data.sites[0]
  site.site.retired = false
  site.busy = false
  job.next_action.site = site.site.destination.selection
  const target = objectiveDestination(job, data)!
  expect(target.page).toBe('galaxy')
  expect(target.location).toEqual({
    ...site.site.destination.coordinates,
    site: site.site.destination.selection.id,
  })
  site.busy = true
  expect(objectiveDestination(job, data)).toEqual(target)
})

it('uses the saved solar target for directive and accomplishment titles', () => {
  const data = tutorialFixture(false)
  const solar = data.chapters
    .flatMap((chapter) => chapter.objectives)
    .find((objective) => objective.id === 'solar-5')!
  expect(objectiveTitle(solar)).toBe('Upgrade Solar Plant to level 5')
  expect(objectiveTitle({ ...solar, completed: true, next_action: null })).toBe(
    'Upgrade Solar Plant to level 5',
  )
  expect(accomplishmentTitle(solar.id, data)).toBe(
    'Solar Plant · at least level 5',
  )
  expect(accomplishmentTitle(solar.id, tutorialFixture(true))).toBe(
    'Solar Plant · at least level 5',
  )
})

it('keeps initial navigation compact and briefing reachable while its first read is missing', () => {
  const { view, data } = fixture()
  const pages = tutorialPages(null, view)
  expect(pages?.has('briefing')).toBe(true)
  expect(pages?.has('resources')).toBe(true)
  expect(pages?.has('fleets')).toBe(false)
  expect(tutorialMorePages(pages)).toContain('messages')
  expect(briefingEntryAvailable(null, 4)).toBe(true)
  expect(briefingEntryAvailable(data, 4)).toBe(true)
  expect(briefingEntryAvailable({ ...data, enrolled: false }, 4)).toBe(false)
  expect(briefingEntryAvailable(null, 2)).toBe(false)
})

it('shows overview briefing progress only in the beginner interface', () => {
  const { data, view } = fixture()
  data.beginner = true
  expect(briefingProgress(data, view)).toMatchObject({ step: 1, total: 31 })
  data.beginner = false
  expect(briefingProgress(data, view)).toBeNull()
})

it('names the quoted higher upgrade in a legacy level-one directive without granting completion', () => {
  const { data, view } = fixture()
  const objective = data.chapters[0].objectives[0]
  const terms = objective.inspection!.terms!
  if (terms.type !== 'Building') throw Error('fixture')
  terms.source_level = 17
  terms.target_level = 18
  terms.paid.metal = '73489000000'
  view.bodies[0].levels.SolarPlant = 17
  view.bodies[0].amounts.metal = '19000000000'
  expect(objectiveTitle(objective)).toBe('Build Solar Plant level 1')
  expect(objectiveStatus(objective, data, view)).toEqual({
    ready: false,
    text: 'Next Solar Plant upgrade (level 18) needs 54,489 more metal.',
  })
  expect(objective.completed).toBe(false)
  expect(data.receipts).toEqual([])
})

it('names the quoted research level and keeps generic shortfalls scoped to the next action', () => {
  const { data, view } = fixture()
  const objective = data.chapters
    .flatMap((c) => c.objectives)
    .find((o) => o.id === 'energy-1')!
  const inspection = objective.inspection!
  const terms = inspection.terms!
  if (terms.type !== 'Research') throw Error('fixture')
  inspection.blockers = []
  terms.source_level = 3
  terms.target_level = 4
  terms.paid.metal = '250000000'
  view.bodies[0].amounts.metal = '0'
  expect(objectiveStatus(objective, data, view).text).toBe(
    'Energy Technology research (level 4) needs 250 more metal.',
  )
  inspection.terms = null
  inspection.blockers = [
    {
      code: 'InsufficientResources',
      resource: 'Metal',
      required: '250000000',
      actual: '0',
      requirement: null,
      unit: 'MicroResource',
    },
  ]
  expect(objectiveStatus(objective, data, view).text).toBe(
    'Next action needs 250 more metal.',
  )
  objective.completed = true
  expect(objectiveStatus(objective, data, view).text).toBe('Accomplished')
})
