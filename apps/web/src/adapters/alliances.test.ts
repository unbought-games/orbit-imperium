import { afterEach, expect, it, vi } from 'vitest'
import { allianceQuery, allianceCommand, readPublicAlliance } from './alliances'
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const binding = { account: id(1), player: id(2), universe: id(3), epoch: id(4) }
const summary = {
  id: id(5),
  universe: binding.universe,
  name: 'Star League',
  tag: 'STAR',
  member_count: 4,
  recruitment: 'Open',
}
afterEach(() => vi.unstubAllGlobals())
it('binds queries and CSRF and rejects mismatched responses', async () => {
  const fetch = vi.fn().mockImplementation(async (_, options) => {
    const { context, query } = JSON.parse(options.body)
    expect(query).toEqual({ type: 'Mine' })
    return Response.json({
      ...context,
      sampled_at: 0,
      directory: [],
      directory_count: 0,
      alliance: null,
      applications: [],
    })
  })
  vi.stubGlobal('fetch', fetch)
  await expect(
    allianceQuery(binding, 'csrf', { type: 'Mine' }),
  ).resolves.toMatchObject({ binding })
  expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('csrf')
  for (const wrong of [
    { request_id: id(99) },
    { binding: { ...binding, epoch: id(99) } },
    { directory_count: 'bad' },
  ]) {
    fetch.mockImplementation(async (_, options) =>
      Response.json({
        ...JSON.parse(options.body).context,
        sampled_at: 0,
        directory: [],
        directory_count: 0,
        alliance: null,
        applications: [],
        ...wrong,
      }),
    )
    await expect(
      allianceQuery(binding, 'csrf', { type: 'Mine' }),
    ).rejects.toThrow()
  }
})
it('validates command identity and never rewrites a supplied id', async () => {
  const command = {
    command_id: id(6),
    expected_revision: null,
    action: { type: 'Create' as const, name: 'Star League', tag: 'STAR' },
  }
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ command_id: id(6), alliance: id(5), revision: 1 }),
    )
  vi.stubGlobal('fetch', fetch)
  await allianceCommand(binding, 'csrf', command)
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject(command)
  fetch.mockResolvedValue(
    Response.json({ command_id: id(7), alliance: id(5), revision: 1 }),
  )
  await expect(allianceCommand(binding, 'csrf', command)).rejects.toThrow(
    'identity',
  )
})
it('public reads omit credentials and reject private fields', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ summary, public_text: 'Welcome' }))
  vi.stubGlobal('fetch', fetch)
  await readPublicAlliance(
    binding.universe,
    id(5),
    new AbortController().signal,
  )
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
  })
  fetch.mockResolvedValue(
    Response.json({ summary, public_text: 'Welcome', leader: id(2) }),
  )
  await expect(
    readPublicAlliance(binding.universe, id(5), new AbortController().signal),
  ).rejects.toThrow()
})
