import { afterEach, describe, expect, it, vi } from 'vitest'
import { Coordinator } from '../../client-model/coordinator'
import type { Attempt, Command } from '../../client-model/commands'
import type { components } from '../../contracts'
import {
  productionAutosave,
  productionControlSettings,
} from './production-autosave'

type Production = components['schemas']['ProductionDto']
const settings: Production['settings'] = {
  metal_mine: 100,
  crystal_mine: 100,
  deuterium_synthesizer: 100,
  solar_plant: 100,
  fusion_reactor: 100,
  solar_satellite: 100,
}
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
function setup() {
  // Exercise the queue deterministically; transport, persistence and receipt
  // validation are covered by coordinator tests and the browser fixture tests.
  const model = new Coordinator({} as never, {} as never, {} as never)
  const binding = { account: 'a', player: 'p', universe: 'u', epoch: 'e' }
  const production = {
    body: 'body',
    settings: { ...settings },
    settings_revision: '1',
    editable: ['metal_mine', 'crystal_mine', 'solar_plant'],
    gross_per_hour: { metal: '100', crystal: '100', deuterium: '100' },
  } as Production
  model.store.setState({
    binding,
    ready: true,
    view: {
      protocol: 3,
      binding,
      viewer_revision: '1',
      progression: { production: [production] },
    } as components['schemas']['BoundView3'],
  })
  const sent: Command[] = []
  vi.spyOn(model, 'send').mockImplementation(async (command) => {
    sent.push(command)
    const id = String(sent.length)
    model.store.setState(({ attempts }) => ({
      attempts: new Map(attempts).set(id, {
        envelope: { command, command_id: id },
        status: 'pending',
        reconciled: false,
      } as Attempt),
    }))
    return id
  })
  vi.spyOn(model, 'refresh').mockResolvedValue()
  const autosave = productionAutosave(model, 'body')
  function receipt(id: string, status: Attempt['status'], reconciled = false) {
    model.store.setState(({ attempts }) => ({
      attempts: new Map(attempts).set(id, {
        ...attempts.get(id)!,
        status,
        reconciled,
      }),
    }))
  }
  function snapshot(next: Partial<Production['settings']>, revision: string) {
    const view = model.store.getState()
      .view as components['schemas']['BoundView3']
    const current = view.progression.production[0]
    model.store.setState({
      view: {
        ...view,
        progression: {
          ...view.progression,
          production: [
            {
              ...current,
              settings: { ...current.settings, ...next },
              settings_revision: revision,
            },
          ],
        },
      },
    })
  }
  return { model, autosave, sent, receipt, snapshot }
}

describe('production autosave', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces movement, ignores refresh triggers during the wait and flushes the final edit', async () => {
    vi.useFakeTimers()
    const { autosave, model, sent, snapshot } = setup()
    autosave.changeDeferred('metal_mine', 90)
    await vi.advanceTimersByTimeAsync(200)
    autosave.changeDeferred('metal_mine', 0)
    snapshot({ crystal_mine: 60 }, '2')
    await vi.advanceTimersByTimeAsync(299)
    expect(sent).toHaveLength(0)
    expect(
      productionControlSettings(
        model.store.getState(),
        'body',
        autosave.store.getState().edits,
      )?.metal_mine,
    ).toBe(0)
    autosave.flush()
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      expected_settings_revision: '2',
      settings: { metal_mine: 0, crystal_mine: 60 },
    })
    await vi.advanceTimersByTimeAsync(300)
    expect(sent).toHaveLength(1)
  })

  it('saves the trailing edit after leaving a planet without leaking it into another planet', async () => {
    vi.useFakeTimers()
    const { autosave, model, sent } = setup()
    const view = model.store.getState()
      .view as components['schemas']['BoundView3']
    model.store.setState({
      view: {
        ...view,
        progression: {
          ...view.progression,
          production: [
            ...view.progression.production,
            { ...view.progression.production[0], body: 'other' },
          ],
        },
      },
    })
    autosave.changeDeferred('metal_mine', 0)
    const other = productionAutosave(model, 'other')
    other.changeDeferred('solar_plant', 70)
    await vi.advanceTimersByTimeAsync(300)
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({
      body: 'body',
      settings: { metal_mine: 0, solar_plant: 100 },
    })
    expect(sent[1]).toMatchObject({
      body: 'other',
      settings: { metal_mine: 100, solar_plant: 70 },
    })
  })

  it('cancels a deferred save when the session changes', async () => {
    vi.useFakeTimers()
    const { autosave, model, sent } = setup()
    autosave.changeDeferred('metal_mine', 0)
    model.store.setState({ binding: null, view: null, ready: false })
    await vi.advanceTimersByTimeAsync(300)
    expect(sent).toHaveLength(0)
    expect(autosave.store.getState().edits).toEqual({})
  })

  it('serializes rapid edits, waits for reconciliation and merges into current confirmed settings', async () => {
    const { autosave, sent, receipt, snapshot } = setup()
    autosave.change('metal_mine', 50)
    await settle()
    autosave.change('metal_mine', 100) // Revert while the first command is pending.
    autosave.change('solar_plant', 80)
    await settle()
    expect(sent).toHaveLength(1)
    receipt('1', 'committed')
    snapshot({ metal_mine: 50, crystal_mine: 70 }, '2')
    await settle()
    expect(sent).toHaveLength(1)
    receipt('1', 'committed', true)
    await settle()
    expect(sent[1]).toEqual({
      type: 'SetProduction',
      body: 'body',
      expected_settings_revision: '2',
      settings: { ...settings, crystal_mine: 70, solar_plant: 80 },
    })
    snapshot({ metal_mine: 100, solar_plant: 80 }, '3')
    receipt('2', 'committed', true)
    await settle()
    expect(autosave.store.getState()).toEqual({
      edits: {},
      flight: null,
      error: null,
    })
    expect(sent).toHaveLength(2)
  })

  it('retains rejected edits and retries only edited fields against a refreshed revision', async () => {
    const { model, autosave, sent, receipt, snapshot } = setup()
    autosave.change('metal_mine', 50)
    await settle()
    receipt('1', 'rejected', true)
    await settle()
    expect(model.store.getState().attempts.get('1')?.status).toBe('rejected')
    expect(autosave.store.getState().error).toContain(
      'Your production edits are retained',
    )
    autosave.change('metal_mine', 40)
    snapshot({ crystal_mine: 60 }, '3')
    await settle()
    expect(sent).toHaveLength(1)
    await autosave.retry()
    await settle()
    expect(model.refresh).toHaveBeenCalledOnce()
    expect(sent[1]).toMatchObject({
      expected_settings_revision: '3',
      settings: { metal_mine: 40, crystal_mine: 60 },
    })
  })

  it('keeps uncertain commands in flight and retains queued edits across panel navigation', async () => {
    const { model, autosave, sent, receipt } = setup()
    autosave.change('metal_mine', 50)
    await settle()
    receipt('1', 'uncertain')
    autosave.change('metal_mine', 20)
    await settle()
    expect(productionAutosave(model, 'body')).toBe(autosave)
    expect(autosave.store.getState().edits.metal_mine).toBe(20)
    expect(sent).toHaveLength(1)
  })

  it('waits for a restored command before rebasing new edits', async () => {
    const { model, autosave, sent, receipt, snapshot } = setup()
    model.store.setState({
      attempts: new Map([
        [
          'restored',
          {
            envelope: {
              command_id: 'restored',
              command: { type: 'SetProduction', body: 'body' },
            },
            status: 'uncertain',
            reconciled: false,
          } as Attempt,
        ],
      ]),
    })
    autosave.change('metal_mine', 20)
    await settle()
    expect(sent).toHaveLength(0)
    snapshot({ crystal_mine: 60 }, '5')
    receipt('restored', 'committed', true)
    await settle()
    expect(sent[0]).toMatchObject({
      expected_settings_revision: '5',
      settings: { metal_mine: 20, crystal_mine: 60 },
    })
  })

  it('queues behind a restored body command without an intent and resumes automatically', async () => {
    const { model, autosave, sent, receipt, snapshot } = setup()
    model.store.setState({
      attempts: new Map([
        [
          'restored',
          {
            envelope: {
              command_id: 'restored',
              command: {
                type: 'StartUpgrade',
                body: 'body',
                building: 'MetalMine',
                expected_terms_hash: 'hash',
              },
            },
            status: 'pending',
            reconciled: false,
          } as Attempt,
        ],
      ]),
    })
    autosave.change('metal_mine', 50)
    await settle()
    expect(sent).toHaveLength(0)
    expect(autosave.store.getState().error).toBeNull()
    expect(autosave.store.getState().edits).toEqual({ metal_mine: 50 })
    snapshot({ crystal_mine: 80 }, '2')
    receipt('restored', 'committed', true)
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      expected_settings_revision: '2',
      settings: { metal_mine: 50, crystal_mine: 80 },
    })
  })

  it('does not wait for a restored command on a different body', async () => {
    const { model, autosave, sent } = setup()
    model.store.setState({
      attempts: new Map([
        [
          'restored',
          {
            envelope: {
              command_id: 'restored',
              command: {
                type: 'StartUpgrade',
                body: 'other-body',
                building: 'MetalMine',
                expected_terms_hash: 'hash',
              },
            },
            status: 'pending',
            reconciled: false,
          } as Attempt,
        ],
      ]),
    })
    autosave.change('metal_mine', 50)
    await settle()
    expect(sent).toHaveLength(1)
  })

  it.each(['pending', 'uncertain'] as const)(
    'shows restored %s settings, with newer local edits taking precedence',
    (status) => {
      const { model, autosave } = setup()
      const game = model.store.getState()
      model.store.setState({
        attempts: new Map([
          [
            'restored',
            {
              envelope: {
                binding: game.binding,
                command_id: 'restored',
                command: {
                  type: 'SetProduction',
                  body: 'body',
                  settings: { ...settings, metal_mine: 50 },
                  expected_settings_revision: '1',
                },
              },
              status,
              reconciled: false,
            } as Attempt,
          ],
        ]),
      })
      expect(
        productionControlSettings(model.store.getState(), 'body', {}),
      ).toEqual({ ...settings, metal_mine: 50 })
      expect(
        productionControlSettings(model.store.getState(), 'body', {
          metal_mine: 100,
        }),
      ).toEqual(settings)
      expect(autosave.store.getState().edits).toEqual({})
      expect(
        game.view?.protocol !== 2 &&
          game.view?.progression.production[0].settings,
      ).toEqual(settings)
    },
  )

  it.each([
    'rejected',
    'reconciled',
    'snapshot arrived',
    'other binding',
    'other body',
  ] as const)('does not overlay restored production when %s', (condition) => {
    const { model } = setup()
    const game = model.store.getState()
    model.store.setState({
      attempts: new Map([
        [
          'restored',
          {
            envelope: {
              binding:
                condition === 'other binding'
                  ? { ...game.binding, epoch: 'other' }
                  : game.binding,
              command_id: 'restored',
              command: {
                type: 'SetProduction',
                body: condition === 'other body' ? 'other' : 'body',
                settings: { ...settings, metal_mine: 50 },
                expected_settings_revision: '1',
              },
            },
            status:
              condition === 'rejected'
                ? 'rejected'
                : condition === 'snapshot arrived'
                  ? 'committed'
                  : 'pending',
            reconciled: condition === 'reconciled',
            receipt:
              condition === 'snapshot arrived'
                ? { status: 'Committed', minimum_viewer_revision: '1' }
                : null,
          } as Attempt,
        ],
      ]),
    })
    expect(
      productionControlSettings(model.store.getState(), 'body', {}),
    ).toEqual(settings)
  })

  it('does not send unavailable controls or no-op edits', async () => {
    const { autosave, sent } = setup()
    autosave.change('fusion_reactor', 0)
    autosave.change('metal_mine', 100)
    await settle()
    expect(sent).toHaveLength(0)
    expect(autosave.store.getState().edits).toEqual({})
  })

  it('shows a local persistence/admission failure without losing user edits or looping', async () => {
    const { model, autosave, sent } = setup()
    vi.mocked(model.send).mockImplementationOnce(async () => {
      model.store.setState({
        message: 'Unable to save action. Free local storage and try again.',
      })
      return undefined
    })
    autosave.change('metal_mine', 50)
    await settle()
    expect(autosave.store.getState().error).toContain('Free local storage')
    expect(autosave.store.getState().edits).toEqual({ metal_mine: 50 })
    expect(sent).toHaveLength(0)
    await autosave.retry()
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('retains throttled edits without resending when the cooldown ends', async () => {
    const { model, autosave, sent } = setup()
    vi.mocked(model.send).mockImplementationOnce(async () => {
      model.store.setState({ rateLimited: true })
      return undefined
    })
    autosave.change('metal_mine', 50)
    await settle()
    expect(autosave.store.getState().error).toContain('weren’t saved')
    expect(autosave.store.getState().edits).toEqual({ metal_mine: 50 })
    await autosave.retry()
    expect(model.refresh).not.toHaveBeenCalled()
    model.store.setState({ rateLimited: false })
    await settle()
    expect(model.send).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(0)
    await autosave.retry()
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ settings: { metal_mine: 50 } })
  })

  it('does not carry queued edits into another account/binding', async () => {
    const { model, autosave, sent } = setup()
    autosave.change('metal_mine', 50)
    model.store.setState({ binding: null, view: null, ready: false })
    await settle()
    expect(sent).toHaveLength(0)
    expect(autosave.store.getState().edits).toEqual({})
  })
})
