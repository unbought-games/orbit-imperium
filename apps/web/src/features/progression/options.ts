import type { components } from '../../contracts'
import {
  canonical,
  type BoundProgressionOptions,
  type Command,
} from '../../client-model/commands'
import { resourceShortfalls } from '../../client-model/resources'
import type { ProgressionProps } from './shared'

export type ProgressionRequest = BoundProgressionOptions['request']

// Building material costs depend on the rules profile and source level, not
// active queues, available fields, balances, or production eligibility.
export function buildingCostContext(
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
        : null,
  })
}

export function currentBuildingCost(
  proposal: BoundProgressionOptions | null,
  view: ProgressionProps['view'],
) {
  const terms = proposal?.terms
  if (
    !proposal ||
    proposal.protocol !== view.protocol ||
    canonical(proposal.binding) !== canonical(view.binding) ||
    terms?.type !== 'Building' ||
    terms.action !== 'Upgrade' ||
    terms.profile_hash !== view.profile_hash
  )
    return null
  const body = view.bodies.find((body) => body.id === terms.body)
  if (
    !body ||
    body.levels[terms.building as keyof typeof body.levels] !==
      terms.source_level
  )
    return null
  return terms.paid
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
