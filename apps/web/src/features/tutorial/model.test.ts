import { expect, it } from 'vitest'
import { tutorialFixture, siteReportFixture } from '../../test-support/tutorial'
import { readyFixture } from '../../test-support/bootstrap'
import {
  recommendation,
  tutorialPages,
  objectiveStatus,
  receiptAcknowledgement,
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
it('keeps essential navigation and derives completion disclosure from the server', () => {
  const { data, view } = fixture()
  for (const page of ['fleets', 'reports', 'settings', 'messages'] as const)
    expect(tutorialPages(data, view)?.has(page)).toBe(true)
  expect(tutorialPages(tutorialFixture(true), view)).toBeNull()
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

it('acknowledges authoritative IDs across offline hydration, dismissal and independent progress without inventing payment', () => {
  const data = tutorialFixture(true),
    before = JSON.stringify(data.receipts)
  const first = receiptAcknowledgement(data, null)!
  expect(first.receipt.id).toBe(data.receipts.at(-1)!.id)
  expect(first.paid).toBe(false)
  expect(receiptAcknowledgement(data, first.receipt.id)).toBeNull()
  data.beginner = false
  const grant = structuredClone(
    data.receipts.find((r) => r.objective === 'metal-1')!,
  )
  grant.id = 'different-accomplishment'
  data.receipts.push(grant)
  expect(receiptAcknowledgement(data, first.receipt.id)).toMatchObject({
    paid: true,
    title: 'Metal Mine · at least level 1',
  })
  expect(JSON.stringify(data.receipts.slice(0, -1))).toBe(before)
  expect(accomplishmentTitle('cargo')).toBe('Small Cargo manufactured')
})
