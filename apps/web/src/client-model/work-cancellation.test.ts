import { describe, expect, it } from 'vitest'
import { createGameStore } from './game-store'
import { snapshot } from './game-projection.test'
import { formatLostWork, workCancellation } from './work-cancellation'

for (const kind of ['CancelConstruction', 'CancelResearch'] as const) {
  describe(kind, () => {
    function fixture(elapsed: number) {
      const state = createGameStore().getState()
      const view = snapshot()
      state.view = view
      state.receivedAt = 800
      state.now = 1800
      view.sampled_at = 1_000_000_000_000 // Deliberately unrelated to client clock.
      const timing = {
        id: 'work',
        started_at: view.sampled_at + 1000 - elapsed,
        due_at: view.sampled_at + 60_000,
        paid: { metal: '100', crystal: '0', deuterium: '0' },
      }
      if (kind === 'CancelConstruction')
        view.constructions = [
          { ...timing, body: 'body', building: 'MetalMine', target_level: 2 },
        ]
      else
        view.progression.research_operation = {
          ...timing,
          host: 'body',
          research: 'EnergyTechnology',
          source_level: 1,
          target_level: 2,
          effective_lab: '1',
          labs: [],
          can_cancel: true,
        }
      return { state, view }
    }
    it.each([29_999, 30_000, 30_001, 29 * 3_600_000])(
      'guards elapsed %i ms from server time',
      (elapsed) => {
        const { state } = fixture(elapsed)
        expect(workCancellation(state, kind, 'work')).toEqual({
          canCancel: true,
          elapsedMs: elapsed,
          requiresConfirmation: elapsed >= 30_000,
        })
      },
    )
    it('rechecks completion, identity and inaccessible research', () => {
      const { state, view } = fixture(60_000)
      expect(workCancellation(state, kind, 'other').canCancel).toBe(false)
      if (kind === 'CancelResearch') {
        view.progression.research_operation!.can_cancel = false
        expect(workCancellation(state, kind, 'work').canCancel).toBe(false)
      }
      view.constructions = []
      view.progression.research_operation = null
      expect(workCancellation(state, kind, 'work').canCancel).toBe(false)
    })
    it('does not treat a future timestamp as a fresh start', () => {
      const { state } = fixture(-1000)
      expect(workCancellation(state, kind, 'work').requiresConfirmation).toBe(
        true,
      )
    })
  })
}
it('guards older servers without start timestamps', () => {
  const state = createGameStore().getState()
  state.view = snapshot()
  state.view.constructions = [
    {
      id: 'work',
      body: 'body',
      building: 'MetalMine',
      target_level: 2,
      due_at: 60_000,
      paid: { metal: '0', crystal: '0', deuterium: '0' },
    },
  ]
  expect(
    workCancellation(state, 'CancelConstruction', 'work').elapsedMs,
  ).toBeNull()
  expect(
    workCancellation(state, 'CancelConstruction', 'work').requiresConfirmation,
  ).toBe(true)
})
it('states long work loss without rounding it up or hiding hours in days', () => {
  expect(formatLostWork(29 * 3_600_000 + 59 * 60_000 + 999)).toBe(
    '29 hours 59 minutes',
  )
  expect(formatLostWork(30_999)).toBe('30 seconds')
})
