import { currentProgressionOptions } from '../progression/options'
import type { components } from '../../contracts'
import type { GameState } from '../../client-model/game-store'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { catalogPage } from '../../shell/catalog-routes'
import type { Page } from '../../shell/routes'
import type { GalaxySearch } from '../../shell/galaxy-location'
import { siteLocation } from './galaxy-sites-model'
import { label } from '../../ui/format'
import { formatWholeNumber } from '../../ui/whole-number'

type S = components['schemas']
export type Objective = S['TutorialObjective4']
export function progressionTarget(request: S['ProgressionQuoteRequest']) {
  if (request.type === 'Upgrade' || request.type === 'Demolition')
    return {
      page: catalogPage({ kind: 'Building', id: request.building }),
      body: request.body,
      item: request.building,
    }
  if (request.type === 'Research')
    return {
      page: 'research' as const,
      body: request.host,
      item: request.research,
    }
  if (request.type === 'Manufacture')
    return {
      page: catalogPage(request.item),
      body: request.body,
      item: request.item.id,
    }
  return null
}
const openingItems: Record<string, S['CatalogKey3']> = {
  metal: { kind: 'Building', id: 'MetalMine' },
  crystal: { kind: 'Building', id: 'CrystalMine' },
  deuterium: { kind: 'Building', id: 'DeuteriumSynthesizer' },
  solar: { kind: 'Building', id: 'SolarPlant' },
  robotics: { kind: 'Building', id: 'RoboticsFactory' },
  lab: { kind: 'Building', id: 'ResearchLab' },
  shipyard: { kind: 'Building', id: 'Shipyard' },
  energy: { kind: 'Research', id: 'EnergyTechnology' },
  combustion: { kind: 'Research', id: 'CombustionDrive' },
  fighter: { kind: 'Ship', id: 'LightFighter' },
  cargo: { kind: 'Ship', id: 'SmallCargo' },
  reinvest: { kind: 'Building', id: 'MetalMine' },
}

function levelObjective(id: string, minimum?: number | null) {
  const match = /^(.+)-(\d+)$/.exec(id)
  return match && openingItems[match[1]]
    ? {
        name: label(openingItems[match[1]].id),
        level: String(minimum ?? match[2]),
        research: openingItems[match[1]].kind === 'Research',
      }
    : null
}

/** Stable job titles survive completion, when next_action is no longer present. */
export function objectiveTitle(o: Objective) {
  const level = levelObjective(o.id, o.minimum_level)
  if (level) {
    if (level.research) return `Research ${level.name} level ${level.level}`
    return level.level === '1'
      ? `Build ${level.name} level 1`
      : `Upgrade ${level.name} to level ${level.level}`
  }
  const titles: Record<string, string> = {
    'production-settings': 'Review resource settings',
    fighter: 'Build a Light Fighter',
    cargo: 'Build a Small Cargo',
    contact: 'Make first contact',
    loaded: 'Collect raid loot',
    haul: 'Bring raid loot home',
    reinvest: 'Reinvest in your Metal Mine',
  }
  if (titles[o.id]) return titles[o.id]
  const a = o.next_action
  if (a?.type === 'Progression') {
    const t = progressionTarget(a.request)
    if (t) {
      const name = label(t.item)
      if (a.request.type === 'Research')
        return `Research ${name}${o.minimum_level ? ` level ${o.minimum_level}` : ''}`
      if (a.request.type === 'Manufacture') return `Build ${name}`
      if (a.request.type === 'Demolition') return `Demolish ${name}`
      return o.minimum_level === 1
        ? `Build ${name} level 1`
        : `Upgrade ${name}${o.minimum_level ? ` to level ${o.minimum_level}` : ''}`
    }
  }
  if (a?.type === 'Attack')
    return a.ships.includes('SmallCargo')
      ? 'Collect raid loot'
      : 'Make first contact'
  if (a?.type === 'AwaitReturn') return 'Bring raid loot home'
  return label(o.id)
}
/** Shared by current-job cards and chapter rows, including persisted older runs. */
export function objectiveDescription(o: Objective) {
  return o.explanation
}
type ObjectiveDestination = {
  page: Page
  body: string
  item?: string
  location?: GalaxySearch
}

/** Navigation only: any job may be inspected without issuing its action. */
export function objectiveDestination(
  o: Objective,
  data: TutorialData,
): ObjectiveDestination | null {
  const action = o.next_action
  if (action?.type === 'Progression') return progressionTarget(action.request)
  const body = data.homeworld
  if (!body) return null
  if (o.id === 'production-settings') return { page: 'resource-settings', body }
  const key = openingItems[o.id.replace(/-\d+$/, '')]
  if (key) return { page: catalogPage(key), body, item: key.id }
  if (action?.type === 'AwaitReturn' || o.id === 'haul')
    return {
      page: 'fleets',
      body,
      item: action?.type === 'AwaitReturn' ? action.fleets[0] : undefined,
    }
  if (o.completed && ['contact', 'loaded'].includes(o.id))
    return { page: 'reports', body }
  if (action?.type === 'Attack') {
    const site = siteContext(data, action.site?.id)
    if (site)
      return {
        page: 'galaxy',
        body,
        location: siteLocation(site),
      }
    return { page: 'galaxy', body }
  }
  return { page: 'briefing', body }
}

export function siteContext(data: TutorialData | null, id: string | undefined) {
  return data?.sites.find((s) => s.site.destination.selection.id === id)
}
export function objectiveStatus(
  o: Objective,
  data: TutorialData,
  view: S['BoundView4'],
) {
  if (o.completed) return { ready: false, text: 'Accomplished' }
  if (
    o.after_objective &&
    !data.chapters
      .flatMap((c) => c.objectives)
      .some((other) => other.id === o.after_objective && other.completed)
  )
    return {
      ready: false,
      text: 'Complete the raid return before reinvesting.',
    }
  const action = o.next_action
  if (action?.type === 'ReviewProductionSettings') {
    const ready = canReviewProduction(data, view)
    return {
      ready,
      text: ready
        ? 'Review the controls, then select Understood.'
        : 'Upgrade your Solar Plant to level 2 first.',
    }
  }
  if (action?.type === 'Progression') {
    const inspection =
      o.inspection && currentProgressionOptions(o.inspection, view)
    const blockers = inspection?.blockers ?? []
    if (blockers.length) {
      const b = blockers[0]
      if (b.requirement)
        return {
          ready: false,
          text: `Requires ${label(b.requirement.type === 'BodyBuilding' ? b.requirement.building : b.requirement.research)} level ${b.requirement.level}.`,
        }
      if (b.resource && b.required && b.actual) {
        const terms = inspection?.terms
        const subject =
          terms?.type === 'Building' && terms.action === 'Upgrade'
            ? `Next ${label(terms.building)} upgrade (level ${terms.target_level})`
            : terms?.type === 'Research'
              ? `${label(terms.research)} research (level ${terms.target_level})`
              : 'Next action'
        return {
          ready: false,
          text: `${subject} needs ${formatWholeNumber((BigInt(b.required) - BigInt(b.actual) + 999999n) / 1000000n)} more ${b.resource.toLowerCase()}.`,
        }
      }
      return {
        ready: false,
        text:
          (
            {
              ActiveConstruction: 'Construction in progress.',
              ResearchActive: 'Research in progress.',
              YardLocked: 'Shipyard is upgrading.',
              LabLocked: 'Research laboratory is busy.',
              InsufficientResources: 'Waiting for resources.',
            } as Partial<Record<S['GameError3'], string>>
          )[b.code] ?? label(b.code),
      }
    }
    return { ready: !!inspection?.terms, text: 'Ready to review' }
  }
  if (action?.type === 'AwaitReturn')
    return {
      ready: false,
      text: action.fleets.length
        ? 'Loot is aboard your returning fleet.'
        : 'Bring positive raid loot home in surviving ships.',
    }
  if (action?.type === 'Attack') {
    const site = siteContext(data, action.site?.id)
    if (site?.busy)
      return {
        ready: false,
        text: 'Your operation is in flight. Follow it in Fleets.',
      }
    const home = view.bodies.find((b) => b.id === data.homeworld)
    const missing = action.ships.filter(
      (ship) =>
        !home?.inventories.some(
          (i) => i.item.id === ship && BigInt(i.count) > 0n,
        ),
    )
    if (missing.length)
      return {
        ready: false,
        text: `Build ${missing.map(label).join(' and ')} at your homeworld.`,
      }
    return {
      ready: !!site && !site.site.retired,
      text: site
        ? 'Ready for briefing'
        : data.beginner
          ? 'Prepare your personal opportunity.'
          : 'Choose an eligible target through normal play.',
    }
  }
  return { ready: false, text: 'Keep developing your empire.' }
}
export function canReviewProduction(
  data: TutorialData | null,
  view: S['BoundView4'],
) {
  const home = view.bodies.find((body) => body.id === data?.homeworld)
  return (home?.levels.SolarPlant ?? 0) >= 2
}
export function recommendation(data: TutorialData, view: S['BoundView4']) {
  const all = data.chapters.flatMap((c) => c.objectives)
  const ordered = data.recommended_objectives.flatMap(
    (id) => all.find((o) => o.id === id && !o.completed) ?? [],
  )
  return (
    ordered.find((o) => objectiveStatus(o, data, view).ready) ??
    ordered[0] ??
    null
  )
}
export function hasIncompleteBriefing(data: TutorialData | null) {
  return !!data?.enrolled && !data.completed
}

/** Keep guidance reachable before its first response and after a read failure. */
export function briefingEntryAvailable(
  data: TutorialData | null,
  protocol: number,
) {
  return protocol === 4 && data?.enrolled !== false
}

/** Progress comes from confirmed objectives, never visits or submitted orders. */
export function briefingProgress(
  data: TutorialData | null,
  view: S['BoundView4'],
) {
  if (!data?.beginner || !hasIncompleteBriefing(data)) return null
  const objectives = data.chapters.flatMap((chapter) => chapter.objectives)
  const completed = objectives.filter((objective) => objective.completed).length
  const remaining = objectives.length - completed
  if (!remaining) return null
  const next =
    recommendation(data, view) ??
    objectives.find((objective) => !objective.completed)
  return {
    completed,
    total: objectives.length,
    remaining,
    step: completed + 1,
    title: next ? objectiveTitle(next) : 'Continue your briefing',
  }
}
/** Main navigation only; deferred opening destinations remain accessible in More. */
export function tutorialPages(
  data: TutorialData | null,
  view: S['BoundView4'] | null,
): ReadonlySet<Page> | null {
  if (!view || (data && !data.beginner)) return null
  const pages = new Set<Page>([
    'overview',
    'menu',
    'briefing',
    'resources',
    'resource-settings',
    'settings',
  ])
  if (!data) return pages
  for (const o of data.chapters.flatMap((c) => c.objectives)) {
    if (o.next_action?.type !== 'Progression') continue
    const target = progressionTarget(o.next_action.request)
    if (
      target &&
      (target.page !== 'facilities' ||
        o.id === data.recommended_objectives[0]) &&
      !o.inspection?.blockers.some((b) => b.code === 'PrerequisiteMissing')
    )
      pages.add(target.page)
  }
  const home = view.bodies.find((b) => b.id === data.homeworld)
  if (
    data.chapters.some((chapter) =>
      chapter.objectives.some((o) => o.id === 'deuterium-1' && o.completed),
    ) ||
    view.bodies.some((b) =>
      Object.entries(b.levels).some(
        ([id, level]) =>
          (level ?? 0) > 0 &&
          catalogPage({ kind: 'Building', id: id as S['BuildingId3'] }) ===
            'facilities',
      ),
    ) ||
    view.constructions.some(
      (c) => catalogPage({ kind: 'Building', id: c.building }) === 'facilities',
    )
  )
    pages.add('facilities')
  const operations =
    data.sites.length > 0 ||
    view.missions.fleets.length > 0 ||
    view.missions.incoming.length > 0
  if (
    operations ||
    view.bodies.some(
      (b) =>
        (b.levels.Shipyard ?? 0) > 0 ||
        b.inventories.some(
          (i) => i.item.kind === 'Ship' && BigInt(i.count) > 0n,
        ),
    ) ||
    view.progression.manufacturing.some((batch) => batch.item.kind === 'Ship')
  ) {
    pages.add('fleets')
    pages.add('dispatch')
  }
  if (operations || view.reports.length) pages.add('reports')
  if (
    (home?.levels.ResearchLab ?? 0) > 0 ||
    view.progression.research_operation
  )
    pages.add('research')
  if ((home?.levels.Shipyard ?? 0) > 0 || view.progression.manufacturing.length)
    pages.add('shipyard')
  if (data.sites.length) pages.add('galaxy')
  return pages
}
/** Keep optional destinations reachable without crowding the opening navigation. */
export function tutorialMorePages(pages: ReadonlySet<Page> | null): Page[] {
  return pages
    ? (
        [
          'messages',
          'alliance',
          'reports',
          'fleets',
          'dispatch',
          'facilities',
        ] as Page[]
      ).filter((page) => !pages.has(page))
    : []
}
export function tutorialPending(state: GameState) {
  return [...state.attempts.values()].some(
    (a) =>
      ['submitting', 'pending', 'uncertain'].includes(a.status) &&
      a.envelope.command.type === 'World' &&
      [
        'OpenTutorial',
        'SetTutorialPresentation',
        'ReviewProductionSettings',
      ].includes(a.envelope.command.action.type),
  )
}

/** Concise presentation labels for the pinned opening's stable accomplishment IDs. */
export function accomplishmentTitle(id: string, data?: TutorialData) {
  const named: Record<string, string> = {
    'production-settings': 'Production controls reviewed',
    fighter: 'Light Fighter manufactured',
    cargo: 'Small Cargo manufactured',
    contact: 'First combat resolved',
    loaded: 'Raid loot loaded',
    haul: 'Raid loot delivered',
    reinvest: 'Production reinvested',
  }
  if (named[id]) return named[id]
  const level = levelObjective(
    id,
    data?.chapters
      .flatMap((chapter) => chapter.objectives)
      .find((objective) => objective.id === id)?.minimum_level,
  )
  return level ? `${level.name} · at least level ${level.level}` : label(id)
}
