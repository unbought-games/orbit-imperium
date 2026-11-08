import type { Page, Route } from '@playwright/test'
import type { components } from '../../src/contracts'
import {
  tutorialFixture,
  siteReportFixture,
} from '../../src/test-support/tutorial'
import { validateTutorialFixture as validate } from '../../src/test-support/tutorial'
import { progressionTarget } from '../../src/features/tutorial/model'
import { installGameFixture, body, binding, id } from './game'
import { productionFixture } from '../../src/test-support/production'
import { routeProgressionOptions } from './progression-options'
type S = components['schemas']
export async function installTutorialFixture(page: Page, stage = 'opening') {
  const now = Date.now()
  const original = tutorialFixture(false),
    originalCompleted = tutorialFixture(true)
  const remap = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value)
        .replaceAll(original.homeworld!, body.id)
        .replaceAll(originalCompleted.homeworld!, body.id)
        .replace(
          /"profile_hash":"[a-f0-9]{64}"/g,
          `"profile_hash":"${'a'.repeat(64)}"`,
        ),
    )
  const initial = validate<S['TutorialView4']>('TutorialView4', remap(original))
  const completed = validate<S['TutorialView4']>(
    'TutorialView4',
    remap(originalCompleted),
  )
  completed.receipts.forEach((r) => {
    r.beneficiary = binding.player
    r.granted_at.at_ms = now - 60000
  })
  completed.sites.forEach((s) => {
    s.site.destination.coordinates = body.coordinates
  })
  const planet = structuredClone(body)
  planet.name = 'Aster Haven'
  planet.fields_reserved = 0
  planet.fields_used = 0
  planet.levels = Object.fromEntries(
    Object.keys(planet.levels).map((k) => [k, 0]),
  )
  planet.inventories = []
  planet.amounts = {
    metal: '1000000000',
    crystal: '1000000000',
    deuterium: '0',
  }
  planet.energy = { supply: '0', demand: '0', utilization: '1000000' }
  const production = [productionFixture(planet)]
  production[0].gross_per_hour = {
    metal: '90000000',
    crystal: '45000000',
    deuterium: '0',
  }
  const missions: S['MissionView4'] = {
    fleets: [],
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '3',
  }
  const constructions: S['Construction3'][] = []
  const manufacturing: S['ManufacturingBatchDto'][] = []
  const catalog: S['CatalogEntry3'][] = []
  for (const o of initial.chapters.flatMap((c) => c.objectives)) {
    const a = o.next_action
    if (a?.type !== 'Progression') continue
    const target = progressionTarget(a.request)
    if (!target || catalog.some((c) => c.key.id === target.item)) continue
    const key: S['CatalogKey3'] =
      a.request.type === 'Research'
        ? { kind: 'Research', id: a.request.research }
        : a.request.type === 'Manufacture'
          ? a.request.item
          : a.request.type === 'Upgrade'
            ? { kind: 'Building', id: a.request.building }
            : { kind: 'Building', id: 'MetalMine' }
    catalog.push({
      key,
      enabled: true,
      mobile: key.kind === 'Ship',
      requirements: [],
      body_kinds: ['Planet'],
    })
  }
  let revision = 1
  const state = {
    data: initial,
    commands: [] as S['Command4'][],
    worldQueries: [] as string[],
    error: false,
    hold: null as null | ((route: Route) => Promise<void>),
    launchError: false,
    quoteFailure: false,
    changeFuel(value:string){planet.amounts.deuterium=value;revision++},
    removeShips(){planet.inventories=[];revision++},
    retireSite(){state.data.sites[0].site.retired=true;revision++},
    report: siteReportFixture().data,
    stage,
    earnMine() {
      revision++
      planet.levels.MetalMine = 1
      constructions.length = 0
      const objective = state.data.chapters
        .flatMap((c) => c.objectives)
        .find((o) => o.id === 'metal-1')!
      objective.completed = true
      objective.inspection = null
      objective.next_action = null
      const receipt = structuredClone(
        completed.receipts.find((r) => r.objective === 'metal-1')!,
      )
      receipt.granted_at.at_ms = Date.now()
      state.data.receipts.push(receipt)
      planet.amounts.metal = String(
        BigInt(planet.amounts.metal) + BigInt(receipt.resources.metal),
      )
      planet.amounts.crystal = String(
        BigInt(planet.amounts.crystal) + BigInt(receipt.resources.crystal),
      )
    },
    setStage(next: string) {
      state.stage = next
      revision++
      state.data = structuredClone(initial)
      missions.fleets.length = 0
      constructions.length = 0
      planet.inventories = []
      if (next === 'complete') {
        state.data = structuredClone(completed)
        planet.levels = {
          ...planet.levels,
          MetalMine: 9,
          CrystalMine: 6,
          DeuteriumSynthesizer: 4,
          SolarPlant: 10,
          RoboticsFactory: 2,
          ResearchLab: 1,
          Shipyard: 2,
        }
        planet.energy = {
          supply: '518748492',
          demand: '435633234',
          utilization: '1000000',
        }
        Object.assign(production[0], {
          energy_supply: planet.energy.supply,
          energy_demand: planet.energy.demand,
        })
        planet.inventories = [
          { item: { kind: 'Ship', id: 'LightFighter' }, count: '1' },
          { item: { kind: 'Ship', id: 'SmallCargo' }, count: '1' },
        ]
        return
      }
      if (next === 'energy-settings') {
        planet.levels.MetalMine = 2
        planet.levels.CrystalMine = 1
        planet.levels.SolarPlant = 2
        const ids = ['solar-1','metal-1','crystal-1','metal-2','solar-2']
        for (const o of state.data.chapters.flatMap((c) => c.objectives)) {
          if (ids.includes(o.id)) {o.completed = true; o.next_action = null; o.inspection = null}
        }
        // This stage represents a restored session; earlier receipts were already presented.
        state.data.receipts = []
        state.data.recommended_objectives = ['production-settings','crystal-2']
        planet.energy = {supply: '48400000', demand: '35200000', utilization:'1000000'}
        Object.assign(production[0], {energy_supply:'48400000',energy_demand:'35200000'})
        return
      }
      if (next === 'opening') {
        planet.levels = Object.fromEntries(
          Object.keys(planet.levels).map((k) => [k, 0]),
        )
        planet.energy = { supply: '0', demand: '0', utilization: '1000000' }
        Object.assign(production[0], {
          energy_supply: '0',
          energy_demand: '0',
          gross_per_hour: {
            metal: '90000000',
            crystal: '45000000',
            deuterium: '0',
          },
          net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '0' },
        })
        planet.amounts = {
          metal: '1000000000',
          crystal: '1000000000',
          deuterium: '0',
        }
        return
      }
      planet.amounts = {
        metal: '6661000000',
        crystal: '9420000000',
        deuterium: '3122000000',
      }
      planet.levels.ResearchLab = 1
      planet.levels.Shipyard = 2
      planet.levels.RoboticsFactory = 2
      planet.levels.MetalMine = 8
      planet.levels.CrystalMine = 6
      planet.levels.DeuteriumSynthesizer = 4
      planet.levels.SolarPlant = 9
      planet.energy = {
        supply: '424430584',
        demand: '394905046',
        utilization: '1000000',
      }
      Object.assign(production[0], {
        energy_supply: planet.energy.supply,
        energy_demand: planet.energy.demand,
        gross_per_hour: {
          metal: '1633383943',
          crystal: '682761960',
          deuterium: '238943680',
        },
        net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '238943680' },
      })
      const all = state.data.chapters.flatMap((c) => c.objectives)
      if (next === 'research' || next === 'manufacture') {
        const o = all.find(
          (o) => o.id === (next === 'research' ? 'energy-1' : 'fighter'),
        )!
        o.inspection!.blockers = []
        state.data.recommended_objectives = [o.id]
        return
      }
      for (const o of all) {
        o.completed = !['contact', 'loaded', 'haul', 'reinvest'].includes(o.id)
        if (o.completed) {
          o.next_action = null
          o.inspection = null
        }
      }
      state.data.receipts = completed.receipts.filter(
        (r) => !['contact', 'loaded', 'haul', 'reinvest'].includes(r.objective),
      )
      planet.inventories = [
        { item: { kind: 'Ship', id: 'LightFighter' }, count: '1' },
        { item: { kind: 'Ship', id: 'SmallCargo' }, count: '1' },
      ]
      const site = structuredClone(
        completed.sites.find((s) =>
          ['cargo-site','return','reinvest'].includes(next)
            ? s.site.definition_id === 'opening-cargo'
            : s.site.definition_id !== 'opening-cargo',
        )!,
      )
      site.site.retired = false
      site.busy = false
      site.site.destination.selection.expected_revision = '1'
      site.remaining_forces = [
        { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '1' },
      ]
      site.site.remaining_stock = {
        metal: '40000000',
        crystal: '40000000',
        deuterium: '20000000',
      }
      state.data.sites = next === 'prepare' ? [] : [site]
      const contact = all.find((o) => o.id === 'contact')!
      contact.next_action = {
        type: 'Attack',
        site: next === 'prepare' ? null : site.site.destination.selection,
        ships: ['LightFighter'],
      }
      state.data.recommended_objectives = ['contact']
      if (next === 'cargo-site') {
        contact.completed = true
        contact.next_action = null
        const loaded = all.find((o) => o.id === 'loaded')!
        loaded.next_action = {
          type: 'Attack',
          site: site.site.destination.selection,
          ships: ['LightFighter', 'SmallCargo'],
        }
        site.recommended_ships = ['LightFighter', 'SmallCargo']
        site.site.remaining_stock = {
          metal: '6000000000',
          crystal: '3000000000',
          deuterium: '1000000000',
        }
        state.data.recommended_objectives = ['loaded']
      }
      if (next === 'return' || next === 'reinvest') {
        contact.completed = true
        contact.next_action = null
        site.site.retired = true
        site.busy = next === 'return'
        site.remaining_forces = []
        site.site.remaining_stock={metal:'3634000000',crystal:'1500000000',deuterium:'500000000'}
        const loaded = all.find((o) => o.id === 'loaded')!
        loaded.completed = true
        loaded.next_action = null
        const haul = all.find((o) => o.id === 'haul')!
        haul.next_action = { type: 'AwaitReturn', fleets: [id(80)] }
        state.data.recommended_objectives =
          next === 'return' ? ['haul'] : ['reinvest']
        if (next === 'return') missions.fleets.push(fleet(site))
        else {
          haul.completed = true
          haul.next_action = null
          state.data.receipts.push(structuredClone(completed.receipts.find((r) => r.objective === 'haul')!))
          state.data.beginner = false
          all.find((o) => o.id === 'reinvest')!.inspection!.blockers = []
        }
      }
    },
  }
  function fleet(site: S['TutorialSite4']): S['OwnMission4'] {
    return {
      id: id(80),
      intent: {
        origin: body.id,
        destination: {
          type: 'Site',
          selection: site.site.destination.selection,
        },
        mission: 'Attack',
        ships: site.recommended_ships.map(ship_type=>({owner:binding.player,ship_type,count:'1'})),
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      },
      origin: body.coordinates,
      destination: body.coordinates,
      leg: 'Returning',
      ships: site.recommended_ships.map(ship_type=>({ship_type,count:'1'})),
      cargo: site.recommended_ships.includes('SmallCargo')?{metal:'2366000000',crystal:'1500000000',deuterium:'500000000'}:{metal:'19000000',crystal:'20000000',deuterium:'10000000'},
      launched_at: now - 110000,
      duration_ms: site.recommended_ships.includes('SmallCargo')?110000:71000,
      due_at: now + 110000,
      paid_fuel: '1000000',
      can_recall: false,
    }
  }
  state.setStage(stage)
  const report = state.report
  if (report.payload.kind === 'SiteEncounter') {
    const source = report.payload.battle.participants.find(
      (p) => 'Player' in p.owner,
    )?.owner
    const oldPlayer = source && 'Player' in source ? source.Player : ''
    state.report = validate<S['ReportDetail4']>(
      'ReportDetail4',
      JSON.parse(JSON.stringify(report).replaceAll(oldPlayer, binding.player)),
    )
    const payload = state.report.payload
    if (payload.kind === 'SiteEncounter') {
      payload.site = (
        state.data.sites[0] ?? completed.sites[0]
      ).site.destination.selection.id
      payload.fleet = id(80)
      payload.coordinates = body.coordinates
      payload.loot={metal:'2366000000',crystal:'1500000000',deuterium:'500000000'}
      payload.cargo={...payload.loot}
      payload.at = now
      state.report.header.observed_at = now
      state.report.header.preview = {
        kind: 'SiteEncounter',
        site: payload.site,
        fleet: id(80),
        coordinates: body.coordinates,
        outcome: payload.battle.outcome,
        loot: payload.loot,
        cargo: payload.cargo,
        debris: payload.debris,
        debris_policy: payload.debris_policy,
        at: now,
      }
    }
  }
  await installGameFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog,
    homeworldId: body.id,
    viewerRevision: () => String(revision),
    missions,
    constructions,
    manufacturing,
    production,
    speed: 3,
    sampledAt: () => Date.now(),
    extraCapabilities: ['Reports', 'Attack'],
    hasUnreadReports: () =>
      state.stage === 'return' || state.stage === 'complete',
  })
  const envelope = (request_id: string) => ({
    protocol: 4,
    binding,
    request_id,
    viewer_revision: String(revision),
    sampled_at: Date.now(),
    as_of_ms: Date.now(),
  })
  await page.route('**/world', async (route) => {
    const q = route.request().postDataJSON()
    state.worldQueries.push(q.type)
    if (state.hold) await state.hold(route)
    if (q.type === 'Tutorial') {
      state.data.chapters.forEach(
        (c) => (c.completed = c.objectives.every((o) => o.completed)),
      )
      if (state.error)
        return route.fulfill({ status: 500, json: { code: 'Unavailable' } })
      return route.fulfill({
        json: { ...envelope(q.context.request_id), data: state.data },
      })
    }
    if (q.type === 'ResolveMissionSite') {
      const site = state.data.sites.find(
        (s) => s.site.destination.selection.id === q.selection.id,
      )
      if (!site || site.site.retired)
        return route.fulfill({ status: 409, json: { code: 'Conflict' } })
      return route.fulfill({
        json: {
          ...envelope(q.context.request_id),
          data: { type: 'Site', selection: q.selection },
        },
      })
    }
    if(q.type==='FleetQuote' && state.quoteFailure)return route.fulfill({status:422,json:{code:'GameRejected',game_code:'InsufficientResources'}})
    if (q.type === 'FleetQuote' || q.type === 'FleetEstimate')
      return route.fulfill({
        json: {
          ...envelope(q.context.request_id),
          data: {
            intent: q.intent,
            profile_hash: 'a'.repeat(64),
            ...(q.type === 'FleetEstimate'
              ? { estimate: true }
              : {
                  distance: 5,
                  speeds: [],
                  slot_limit: '3',
                  terms_hash: 'b'.repeat(64),
                }),
            duration_ms:q.intent.ships.some((s:{ship_type:string})=>s.ship_type==='SmallCargo')?110000:71000,
            fuel: '1000000',
            capacity:q.intent.ships.some((s:{ship_type:string})=>s.ship_type==='SmallCargo')?'5050000000':'50000000',
            maximum_payload:q.intent.ships.some((s:{ship_type:string})=>s.ship_type==='SmallCargo')?'5049000000':'49000000',
          },
        },
      })
    return route.fulfill({ status: 404, json: { code: 'NotFound' } })
  })
  await routeProgressionOptions(page, (route) => {
    const { context, request } = route.request().postDataJSON()
    const target = progressionTarget(request)
    const o = initial.chapters
      .flatMap((c) => c.objectives)
      .find(
        (o) =>
          o.next_action?.type === 'Progression' &&
          progressionTarget(o.next_action.request)?.item === target?.item,
      )
    if (!o?.inspection)
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    const inspection = structuredClone(o.inspection)
    inspection.request = request
    inspection.blockers = []
    if (inspection.terms?.type === 'Building') {
      inspection.terms.source_level =
        planet.levels[inspection.terms.building] ?? 0
      inspection.terms.target_level = inspection.terms.source_level + 1
      if (inspection.terms.source_level > 0)
        inspection.terms.paid = {
          metal: '90000000',
          crystal: '22000000',
          deuterium: '0',
        }
    }
    if(inspection.terms?.type==='Research'){
      inspection.terms.effective_lab=String(planet.levels.ResearchLab ?? 0)
      inspection.terms.labs=inspection.terms.labs.map(l=>({...l,level:planet.levels.ResearchLab ?? 0}))
      inspection.terms.duration_ms=Math.floor(inspection.terms.duration_ms/(1+(planet.levels.ResearchLab ?? 0)))
      inspection.estimates={first_start_at:Date.now(),final_due_at:Date.now()+inspection.terms.duration_ms}
    }
    if(inspection.terms?.type==='Manufacture'){
      inspection.terms.facilities=inspection.terms.facilities.map(f=>f.building==='Shipyard'?{...f,level:planet.levels.Shipyard ?? 0}:f)
      inspection.terms.unit_duration_ms=Math.floor(inspection.terms.unit_duration_ms/(1+(planet.levels.Shipyard ?? 0)))
      inspection.estimates={first_start_at:Date.now(),final_due_at:Date.now()+inspection.terms.unit_duration_ms}
    }
    return route.fulfill({
      json: {
        ...envelope(context.request_id),
        ...inspection,
        terms: inspection.terms,
        terms_hash: inspection.terms_hash,
      },
    })
  })
  await page.route('**/commands', (route) => {
    const pair = route.request().postDataJSON()
    const command: S['Command4'] = pair.gameplay.command
    state.commands.push(command)
    revision++
    if (command.type === 'World') {
      if (command.action.type === 'ReviewProductionSettings') {
        const objective = state.data.chapters.flatMap((c) => c.objectives).find((o) => o.id === 'production-settings')!
        objective.completed = true; objective.next_action = null
        state.data.receipts.push(structuredClone(completed.receipts.find((r) => r.objective === objective.id)!))
        state.data.recommended_objectives = ['crystal-2']
      }
      if (command.action.type === 'SetTutorialPresentation') {
        state.data.preference = { beginner: command.action.beginner }
        state.data.beginner = command.action.beginner && !state.data.completed
      }
      if (command.action.type === 'OpenTutorial' && state.stage === 'prepare')
        state.setStage('site')
      if (command.action.type === 'LaunchFleet' && !state.launchError) {
        const site = state.data.sites[0]
        site.busy = true
        const f = fleet(site)
        f.leg = 'Outbound'
        f.can_recall = true
        missions.fleets.push(f)
      }
      if (command.action.type === 'MarkReportRead')
        state.report.header.read = true
    }
    if (command.type === 'StartUpgrade')
      constructions.push({
        id: id(81),
        body: body.id,
        building: command.building,
        target_level: 1,
        due_at: now + 36000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      })
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        ...(state.launchError
          ? { status: 'Rejected', code: 'InsufficientResources' }
          : {
              status: 'Committed',
              result_ids: [id(80)],
              minimum_viewer_revision: String(revision),
            }),
      },
    })
  })
  await page.route('**/api/v4/**/reports', (route) => {
    const q = route.request().postDataJSON()
    return route.fulfill({
      json: {
        ...envelope(q.context.request_id),
        data: {
          items: ['return', 'complete', 'reinvest'].includes(state.stage)
            ? [state.report.header]
            : [],
          next_cursor: null,
          has_more: false,
          as_of_ms: Date.now(),
        },
      },
    })
  })
  await page.route('**/api/v4/**/reports/*', (route) => {
    const q = route.request().postDataJSON()
    return route.fulfill({
      json: { ...envelope(q.request_id), data: state.report },
    })
  })
  return state
}
