import { expect, it } from 'vitest'
import { createResourceScene } from '../../../tests/components/resource-runtime'
import { id } from '../../test-support/bootstrap'
import { progressionCommand } from './options'

it.each(['', 'blocked', 'active', 'failed'])(
  'validates resource scene contracts (%s)',
  async (mode) => {
    const { model } = await createResourceScene(new URLSearchParams({ mode }))
    expect(model.ready).toBe(true)
    if (mode === 'failed') {
      await expect(
        model.options({ type: 'Upgrade', body: id(5), building: 'MetalMine' }),
      ).rejects.toThrow('Deliberately')
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
it('settles production and construction commands through the real coordinator', async () => {
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
