import { expect, it } from 'vitest'
import { validate } from './schema'
import { attemptKey, type Binding } from './commands'
it('keys include every binding component and command identity', () => {
  const b: Binding = { account: 'a', player: 'p', universe: 'u', epoch: 'e' }
  expect(attemptKey(b, '1')).toBe('["a","p","u","e","1"]')
  expect(attemptKey({ ...b, player: 'q' }, '1')).not.toBe(attemptKey(b, '1'))
})
it('rejects invalid, ambiguous and overflowing exact quantities', () => {
  for (const metal of ['01', '-1', '1e6', '9223372036854775808'])
    expect(() =>
      validate('Resources', { metal, crystal: '0', deuterium: '0' }),
    ).toThrow()
  expect(
    validate('Resources', {
      metal: '9007199254740993',
      crystal: '0',
      deuterium: '0',
    }),
  ).toEqual({ metal: '9007199254740993', crystal: '0', deuterium: '0' })
})
it('rejects future commands and uninhabited defense keys', () => {
  expect(() =>
    validate('Command', { type: 'SetProduction', metal: 50 }),
  ).toThrow()
  expect(() =>
    validate('ItemKey', { kind: 'Defense', id: 'RocketLauncher' }),
  ).toThrow()
})
it('versioned progression contracts require complete settings and prohibit manufacturing cancellation', () => {
  const settings = {
    metal_mine: 50,
    crystal_mine: 100,
    deuterium_synthesizer: 100,
    solar_plant: 100,
    fusion_reactor: 100,
    solar_satellite: 100,
  }
  expect(validate('ProductionSettings', settings)).toEqual(settings)
  for (const bad of [
    { ...settings, metal_mine: 55 },
    { ...settings, solar_satellite: undefined },
  ])
    expect(() => validate('ProductionSettings', bad)).toThrow()
  expect(() =>
    validate('Command3', {
      type: 'CancelManufacture',
      operation: '00000000-0000-4000-8000-000000000001',
    }),
  ).toThrow()
  expect(() =>
    validate('CapabilityState3', {
      capability: 'Transport',
      enabled: true,
      reason: 'UnavailableContent',
    }),
  ).toThrow()
})
