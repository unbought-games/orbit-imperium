import { commandId } from './command-id'
import type { components } from '../contracts'
import type { Binding } from '../client-model/commands'
import { validate } from '../client-model/schema'
import { request } from './http'
type S = components['schemas']
export async function socialQuery(
  binding: Binding,
  csrf: string,
  query: S['SocialQuery'],
  request_id: string = commandId(crypto),
): Promise<S['SocialView']> {
  const result = validate<S['SocialView']>(
    'SocialView',
    await request(
      `/api/v4/universes/${binding.universe}/social/query`,
      'POST',
      { context: { binding, request_id }, query },
      csrf,
    ),
  )
  if (
    result.request_id !== request_id ||
    Object.keys(binding).some(
      (key) =>
        binding[key as keyof Binding] !== result.binding[key as keyof Binding],
    )
  )
    throw new Error('Social response binding mismatch')
  return result
}
export async function socialCommand(
  binding: Binding,
  csrf: string,
  command: Omit<S['SocialCommandRequest'], 'context'>,
): Promise<S['SocialCommandResult']> {
  const result = validate<S['SocialCommandResult']>(
    'SocialCommandResult',
    await request(
      `/api/v4/universes/${binding.universe}/social/commands`,
      'POST',
      { context: { binding, request_id: commandId(crypto) }, ...command },
      csrf,
    ),
  )
  if (result.command_id !== command.command_id)
    throw new Error('Social command identity mismatch')
  return result
}
