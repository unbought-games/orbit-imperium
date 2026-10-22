import { describe, expect, it, vi } from 'vitest'
import { Coordinator } from '../../client-model/coordinator'
import type { Attempt, Command } from '../../client-model/commands'
import type { components } from '../../contracts'
import { productionAutosave } from './production-autosave'

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
    expect(autosave.store.getState().error).toContain('rejected')
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

  it('does not carry queued edits into another account/binding', async () => {
    const { model, autosave, sent } = setup()
    autosave.change('metal_mine', 50)
    model.store.setState({ binding: null, view: null, ready: false })
    await settle()
    expect(sent).toHaveLength(0)
    expect(autosave.store.getState().edits).toEqual({})
  })
})
