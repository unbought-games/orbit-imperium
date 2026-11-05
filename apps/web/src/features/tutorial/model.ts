import { currentProgressionOptions } from '../progression/options'
import type { components } from '../../contracts'
import type { GameState } from '../../client-model/game-store'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { catalogPage } from '../../shell/catalog-routes'
import type { Page } from '../../shell/routes'
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
export function objectiveTitle(o: Objective) {
  const a = o.next_action
  if (a?.type === 'Progression') {
    const t = progressionTarget(a.request)
    if (t)
      return `${a.request.type === 'Manufacture' ? 'Build ' : ''}${label(t.item)}${o.minimum_level ? ` · level ${o.minimum_level}` : ''}`
  }
  if (a?.type === 'Attack')
    return a.ships.includes('SmallCargo')
      ? 'Bring cargo to your next operation'
      : 'Make first contact'
  if (a?.type === 'AwaitReturn') return 'Bring raid loot home'
  return o.explanation
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
      if (b.resource && b.required && b.actual)
        return {
          ready: false,
          text: `Needs ${formatWholeNumber((BigInt(b.required) - BigInt(b.actual) + 999999n) / 1000000n)} more ${b.resource.toLowerCase()}.`,
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
/** Presentation only: essential controls and real queue work never disappear. */
export function tutorialPages(
  data: TutorialData | null,
  view: S['BoundView4'] | null,
): ReadonlySet<Page> | null {
  if (!data?.beginner || !view) return null
  const pages = new Set<Page>([
    'overview',
    'resources',
    'resource-settings',
    'facilities',
    'fleets',
    'dispatch',
    'reports',
    'settings',
    'messages',
  ])
  for (const o of data.chapters.flatMap((c) => c.objectives)) {
    if (o.next_action?.type !== 'Progression') continue
    const target = progressionTarget(o.next_action.request)
    if (
      target &&
      !o.inspection?.blockers.some((b) => b.code === 'PrerequisiteMissing')
    )
      pages.add(target.page)
  }
  const home = view.bodies.find((b) => b.id === data.homeworld)
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
export function tutorialPending(state: GameState) {
  return [...state.attempts.values()].some(
    (a) =>
      ['submitting', 'pending', 'uncertain'].includes(a.status) &&
      a.envelope.command.type === 'World' &&
      ['OpenTutorial', 'SetTutorialPresentation'].includes(
        a.envelope.command.action.type,
      ),
  )
}

/** Concise presentation labels for the pinned opening's stable accomplishment IDs. */
export function accomplishmentTitle(id: string) {
  const named: Record<string, string> = {
    fighter: 'Light Fighter manufactured',
    cargo: 'Small Cargo manufactured',
    contact: 'First combat resolved',
    loaded: 'Raid loot loaded',
    haul: 'Raid loot delivered',
    reinvest: 'Production reinvested',
  }
  if (named[id]) return named[id]
  const match = /^(.+)-(\d+)$/.exec(id)
  const names: Record<string, string> = {
    metal: 'Metal Mine',
    crystal: 'Crystal Mine',
    deuterium: 'Deuterium Synthesizer',
    solar: 'Solar Plant',
    robotics: 'Robotics Factory',
    lab: 'Research Lab',
    shipyard: 'Shipyard',
    energy: 'Energy Technology',
    combustion: 'Combustion Drive',
  }
  return match && names[match[1]]
    ? `${names[match[1]]} · at least level ${match[2]}`
    : label(id)
}

export function receiptAcknowledgement(
  data: TutorialData,
  dismissed: string | null,
) {
  const receipt = data.receipts.at(-1)
  return !receipt || receipt.id === dismissed
    ? null
    : {
        receipt,
        title: accomplishmentTitle(receipt.objective),
        paid: Object.values(receipt.resources).some((n) => BigInt(n) > 0n),
      }
}
