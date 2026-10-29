import type { components } from '../../contracts'
import {
  canonical,
  type BoundProgressionOptions,
  type Command,
} from '../../client-model/commands'
import { resourceShortfalls } from '../../client-model/resources'
import type { ProgressionProps } from './shared'

export type ProgressionRequest = BoundProgressionOptions['request']

// Catalog material costs depend on the rules profile and source level, not
// active queues, available fields, balances, or production eligibility.
export function catalogCostContext(
  view: ProgressionProps['view'],
  request: ProgressionRequest | null,
) {
  const body =
    request?.type === 'Upgrade'
      ? view.bodies.find((body) => body.id === request.body)
      : null
  return canonical({
    protocol: view.protocol,
    binding: view.binding,
    profile: view.profile_hash,
    request,
    level:
      body && request?.type === 'Upgrade'
        ? body.levels[request.building as keyof typeof body.levels]
        : request?.type === 'Research'
          ? (view.research.find((entry) => entry.research === request.research)
              ?.level ?? 0)
          : null,
  })
}

export function currentCatalogCost(
  proposal: BoundProgressionOptions | null,
  view: ProgressionProps['view'],
) {
  const terms = proposal?.terms
  if (
    !proposal ||
    proposal.protocol !== view.protocol ||
    canonical(proposal.binding) !== canonical(view.binding) ||
    !terms ||
    terms.type === 'Transport' ||
    terms.profile_hash !== view.profile_hash
  )
    return null
  switch (terms.type) {
    case 'Building': {
      const body = view.bodies.find((body) => body.id === terms.body)
      if (
        terms.action !== 'Upgrade' ||
        !body ||
        body.levels[terms.building as keyof typeof body.levels] !==
          terms.source_level
      )
        return null
      return terms.paid
    }
    case 'Research': {
      const level =
        view.research.find((entry) => entry.research === terms.research)
          ?.level ?? 0
      if (
        !view.bodies.some((body) => body.id === terms.host) ||
        level !== terms.source_level
      )
        return null
      return terms.paid
    }
    case 'Manufacture':
      return view.bodies.some((body) => body.id === terms.body)
        ? terms.unit_cost
        : null
  }
}

// Balances and sample timestamps change during normal polling. They do not
// change quoted terms; eligibility is derived directly from the current view.
// Structural changes invalidate server terms and non-resource blockers.
export function progressionContext(view: ProgressionProps['view']) {
  return canonical({
    protocol: view.protocol,
    binding: view.binding,
    profile: view.profile_hash,
    speed: view.speed,
    bodies: view.bodies.map(({ amounts: _amounts, ...body }) => body),
    research: view.research,
    catalog: view.catalog,
    capabilities: view.capabilities,
    constructions: view.constructions,
    researchOperation: view.progression.research_operation,
    manufacturing: view.progression.manufacturing,
    limits: view.progression.limits,
  })
}

export function currentProgressionOptions(
  proposal: BoundProgressionOptions,
  view: ProgressionProps['view'],
): BoundProgressionOptions | null {
  const request = proposal.request
  const id = request.type === 'Research' ? request.host : request.body
  const body = view.bodies.find((body) => body.id === id)
  if (!body) return null
  const terms = proposal.terms
  if (!terms || !('paid' in terms)) return proposal
  const resources = {
    metal: 'Metal',
    crystal: 'Crystal',
    deuterium: 'Deuterium',
  } as const
  return {
    ...proposal,
    blockers: [
      ...proposal.blockers.filter(
        (blocker) => blocker.code !== 'InsufficientResources',
      ),
      ...resourceShortfalls(terms.paid, body.amounts).map(
        ({ name, required, actual }) => ({
          code: 'InsufficientResources' as const,
          requirement: null,
          required,
          actual,
          resource: resources[name],
          unit: 'MicroResource' as const,
        }),
      ),
    ],
  }
}

export function progressionCommand(
  proposal: BoundProgressionOptions | null,
): Command | null {
  if (!proposal?.terms_hash) return null
  const request = proposal.request
  const expected_terms_hash = proposal.terms_hash
  switch (request.type) {
    case 'Upgrade':
      return { ...request, type: 'StartUpgrade', expected_terms_hash }
    case 'Demolition':
      return { ...request, type: 'StartDemolition', expected_terms_hash }
    case 'Research':
      return { ...request, type: 'StartResearch', expected_terms_hash }
    case 'Manufacture':
      return { ...request, type: 'StartManufacture', expected_terms_hash }
  }
}

export function technologyRequest(
  key: components['schemas']['CatalogEntry3']['key'],
  body: string,
  action: 'Upgrade' | 'Demolition',
  quantity: string,
): ProgressionRequest | null {
  switch (key.kind) {
    case 'Building':
      return { type: action, body, building: key.id }
    case 'Research':
      return { type: 'Research', host: body, research: key.id }
    case 'Ship':
    case 'Defense':
    case 'Missile':
      if (
        !/^[1-9][0-9]*$/.test(quantity) ||
        quantity.length > 19 ||
        BigInt(quantity) > 9223372036854775807n
      )
        return null
      return { type: 'Manufacture', body, item: key, quantity }
    default:
      return null
  }
}
