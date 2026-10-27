import { afterEach, expect, it, vi } from 'vitest'
import { socialCommand, socialQuery } from './social'
import { emptySocialView } from '../client-model/social'
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const binding = { account: id(1), player: id(2), universe: id(3), epoch: id(4) }
afterEach(() => vi.unstubAllGlobals())
it('uses the social endpoint and rejects foreign bindings and unsolicited fields', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, options) =>
    Response.json({
      ...JSON.parse(options.body).context,
      ...emptySocialView(),
    }),
  )
  vi.stubGlobal('fetch', fetch)
  await socialQuery(
    binding,
    'csrf',
    { type: 'Conversations', cursor: null, limit: 30 },
    id(5),
  )
  expect(fetch.mock.calls[0][0]).toBe(
    `/api/v4/universes/${binding.universe}/social/query`,
  )
  expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('csrf')
  for (const wrong of [
    { binding: { ...binding, player: id(9) } },
    { request_id: id(9) },
    { blocked_by: id(9) },
  ]) {
    fetch.mockResolvedValue(
      Response.json({
        binding,
        request_id: id(5),
        ...emptySocialView(),
        ...wrong,
      }),
    )
    await expect(
      socialQuery(
        binding,
        'csrf',
        { type: 'Conversations', cursor: null, limit: 30 },
        id(5),
      ),
    ).rejects.toThrow()
  }
})
it('preserves the send id and verifies receipt identity', async () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0xaa),
  })
  const command = {
    command_id: id(6),
    action: { type: 'Send' as const, player: id(7), body: '**Hello**' },
  }
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ command_id: id(6), message: id(8) }))
  vi.stubGlobal('fetch', fetch)
  await socialCommand(binding, 'csrf', command)
  expect(fetch.mock.calls[0][0]).toBe(
    `/api/v4/universes/${binding.universe}/social/commands`,
  )
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject(command)
  fetch.mockResolvedValue(Response.json({ command_id: id(9), message: id(8) }))
  await expect(socialCommand(binding, 'csrf', command)).rejects.toThrow(
    'identity',
  )
})
