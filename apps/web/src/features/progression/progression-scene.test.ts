import { expect, it } from 'vitest'
import { createProgressionScene } from '../../../tests/components/progression.scenarios'
import { id } from '../../test-support/bootstrap'
it.each([
  '',
  'stats',
  'legacy',
  'costs',
  'ledger',
  'inventory',
  'blocked',
  'active',
])(
  'accepts prepared progression schema and quote contracts (%s)',
  async (mode) => {
    const { model } = await createProgressionScene(
      new URLSearchParams({ mode, protocol: mode === 'legacy' ? '3' : '4' }),
    )
    expect(model.ready).toBe(true)
    if (mode === 'active') {
      expect(model.view!.constructions).toHaveLength(1)
      return
    }
    const options = await model.options({
      type: 'Manufacture',
      body: id(5),
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
    })
    expect(options?.terms?.type).toBe('Manufacture')
    expect(options?.blockers.map((b) => b.code)).toEqual(
      mode === 'blocked' ? ['NoFreeField'] : [],
    )
  },
)
