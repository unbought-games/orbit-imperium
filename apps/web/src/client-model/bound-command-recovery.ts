import type { components } from '../contracts'
import {
  bindingKey,
  canonical,
  sameBinding,
  type Binding,
  type QueryContext,
} from './commands'
import {
  commandWindowError,
  definiteMutationResponse,
  futureCommand,
  withinCommandWindow,
} from './command-window'
import type { PendingCommands } from './pending-commands'

type Schemas = components['schemas']
type Kind = 'SocialCommandRequest' | 'AllianceCommandRequest'
type Request<K extends Kind> = Schemas[K]
type Source = { [K in Kind]: { kind: K; envelope: Request<K> } }[Kind]

export class BoundCommandRecovery {
  constructor(private storage?: PendingCommands) {}

  private load<K extends Kind>(kind: K, binding: Binding): Request<K>[] {
    return (
      this.storage?.load<Request<K>>(kind, bindingKey(binding)) ?? []
    ).filter((row) => sameBinding(row.context.binding, binding))
  }

  restore(binding: Binding): Source[] {
    return [
      ...this.load('SocialCommandRequest', binding).map((envelope) => ({
        kind: 'SocialCommandRequest' as const,
        envelope,
      })),
      ...this.load('AllianceCommandRequest', binding).map((envelope) => ({
        kind: 'AllianceCommandRequest' as const,
        envelope,
      })),
    ]
  }

  async submit<K extends Kind, T>(
    kind: K,
    context: QueryContext,
    request: Omit<Request<K>, 'context'>,
    estimatedNow: number,
    confirmClock: () => Promise<number>,
    send: (envelope: Request<K>) => Promise<T>,
    restoring: boolean,
  ): Promise<T | null> {
    const scope = bindingKey(context.binding)
    const prior = this.load(kind, context.binding).find(
      (row) => row.command_id === request.command_id,
    )
    if (restoring && !prior) return null // Another tab already retired this record.
    const envelope = {
      ...structuredClone(request),
      context: prior?.context ?? context,
    } as Request<K>
    if (prior && canonical(prior) !== canonical(envelope))
      throw Error('A different order already uses this ID.')
    if (!prior) this.storage?.save(kind, scope, envelope)
    if (
      prior ||
      (this.storage && !withinCommandWindow(envelope.command_id, estimatedNow))
    ) {
      // Receipt lookup is the original POST on these two routes. Check the
      // binding clock first, including on servers predating the cutover.
      const now = await confirmClock()
      const code = commandWindowError(request.command_id, now)
      if (code) {
        if (code !== 'COMMAND_IN_FUTURE')
          this.storage?.remove(kind, scope, request.command_id)
        throw Object.assign(new Error(code), { code, status: 409 })
      }
    }
    try {
      const result = await send(envelope)
      this.storage?.remove(kind, scope, envelope.command_id)
      return result
    } catch (error) {
      if (futureCommand(error)) {
        // The saved envelope remains eligible for a later same-ID retry.
        await confirmClock()
        throw error
      }
      if (definiteMutationResponse(error, !!prior))
        this.storage?.remove(kind, scope, envelope.command_id)
      throw error
    }
  }
}
