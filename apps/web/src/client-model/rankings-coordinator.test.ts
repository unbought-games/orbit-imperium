import { expect, it } from 'vitest'
import { Coordinator } from './coordinator'
import { readyFixture, id } from '../test-support/bootstrap'
import type { GamePort, Rankings } from './commands'

async function setup() {
  const { session, snapshot } = readyFixture(4)
  const unused = async (): Promise<never> => {
    throw new Error('unused')
  }
  const port: GamePort = {
    currentBinding: unused,
    settings: unused,
    view: unused,
    quote: unused,
    submit: unused,
    receipt: unused,
  }
  const model = new Coordinator(
    port,
    {
      load: async () => [],
      put: async () => {},
      remove: async () => {},
      clear: async () => {},
    },
    { newId: () => id(90), monotonicNowMs: () => 0, isOnline: () => true },
  )
  await model.initialize(session, snapshot)
  const response: Rankings = {
    binding: snapshot.candidate.binding,
    request_id: id(90),
    sampled_at: 1000,
    processing_pending: false,
    players: [{ player: id(2), username: 'Pilot', rank: 1, points: '10' }],
  }
  return { model, port, response }
}

it('rejects misbound, mismatched and duplicate responses and fences logout', async () => {
  const { model, port, response } = await setup()
  port.rankings = async () => ({ ...response, request_id: id(91) })
  expect(await model.rankings()).toBeNull()
  port.rankings = async () => ({
    ...response,
    binding: { ...response.binding, epoch: id(99) },
  })
  expect(await model.rankings()).toBeNull()
  port.rankings = async () => ({
    ...response,
    players: [...response.players, ...response.players],
  })
  await expect(model.rankings()).rejects.toThrow('Duplicate ranking player')
  let resolve!: (value: Rankings) => void
  port.rankings = () =>
    new Promise((r) => {
      resolve = r
    })
  const pending = model.rankings()
  model.invalidate()
  resolve(response)
  expect(await pending).toBeNull()
})

it('isolates transient ranking failures but expires access on authentication failure', async () => {
  const { model, port, response } = await setup()
  port.rankings = async () => {
    throw { status: 503, code: 'Unavailable' }
  }
  await expect(model.rankings()).rejects.toEqual({
    status: 503,
    code: 'Unavailable',
  })
  expect(model.stale).toBe(false)
  expect(model.ready).toBe(true)
  port.rankings = async () => response
  expect(await model.rankings()).toEqual(response)
  port.rankings = async () => {
    throw { status: 401 }
  }
  await expect(model.rankings()).rejects.toEqual({ status: 401 })
  expect(model.ready).toBe(false)
  expect(model.accessLost).toBe(true)
})
