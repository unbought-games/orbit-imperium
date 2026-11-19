import { expect, it, vi } from 'vitest'
import { gamePort } from '../../adapters/http'
import { createResourceScene } from '../../../tests/components/resource-runtime'
import { id } from '../../test-support/bootstrap'
import { progressionCommand } from './options'

it.each(['', 'blocked', 'active', 'failed'])(
  'validates resource scene contracts (%s)',
  async (mode) => {
    const { model, queries, requests } = await createResourceScene(
      new URLSearchParams({ mode }),
    )
    expect(model.ready).toBe(true)
    if (mode === 'failed') {
      await expect(
        model.options({ type: 'Upgrade', body: id(5), building: 'MetalMine' }),
      ).rejects.toThrow('Deliberately')
      expect(queries()).toBe(1)
      expect(requests).toEqual([
        { type: 'Upgrade', body: id(5), building: 'MetalMine' },
      ])
      return
    }
    const options = await model.options({
      type: 'Upgrade',
      body: id(5),
      building: 'MetalMine',
    })
    expect(options?.terms).toMatchObject({
      type: 'Building',
      source_level: 1,
      target_level: 2,
    })
    expect(options?.blockers.map((b) => b.code)).toEqual(
      mode === 'blocked'
        ? ['NoFreeField']
        : mode === 'active'
          ? ['ActiveConstruction']
          : [],
    )
  },
)
it('settles construction and cancellation through the real coordinator', async () => {
  const { model, sent } = await createResourceScene(new URLSearchParams())
  const options = await model.options({
    type: 'Upgrade',
    body: id(5),
    building: 'MetalMine',
  })
  await model.send(progressionCommand(options)!, options!)
  expect(sent).toHaveLength(1)
  expect(model.view?.constructions).toMatchObject([
    { building: 'MetalMine', target_level: 2 },
  ])
  await model.send({ type: 'CancelConstruction', operation: id(90) })
  expect(model.view?.constructions).toEqual([])
})

it('writes a protocol-3 upgrade as the direct bound HTTP envelope', async () => {
  const { model, sent, view } = await createResourceScene(
    new URLSearchParams({ protocol: '3' }),
  )
  const options = await model.options({
    type: 'Upgrade',
    body: id(5),
    building: 'MetalMine',
  })
  await model.send(progressionCommand(options)!, options!)
  expect(sent).toHaveLength(1)
  const [envelope] = sent
  const transport = gamePort('fixture', { binding: view.binding, protocol: 3 })
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _options?: RequestInit) =>
      new Response(
        JSON.stringify({
          protocol: 3,
          binding: view.binding,
          command_id: envelope.command_id,
          admitted_at: 1000,
          executed_at: 1000,
          status: 'Committed',
          result_ids: [id(90)],
          minimum_viewer_revision: '1',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetch)
  try {
    await transport.submit(envelope)
    const [path, options] = fetch.mock.calls[0]
    expect(path).toBe(`/api/v3/universes/${view.binding.universe}/commands`)
    expect(options?.method).toBe('POST')
    expect(JSON.parse(String(options?.body))).toEqual({
      protocol: 3,
      binding: view.binding,
      command_id: envelope.command_id,
      command: {
        type: 'StartUpgrade',
        body: id(5),
        building: 'MetalMine',
        expected_terms_hash: 'b'.repeat(64),
      },
    })
  } finally {
    vi.unstubAllGlobals()
  }
})
