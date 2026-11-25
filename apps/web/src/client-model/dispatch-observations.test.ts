import { expect, it } from 'vitest'
import {
  DispatchObservations,
  type DispatchObservation,
} from './dispatch-observations'

it('distinguishes a warm review with an intervening request from one which immediately reuses terms', () => {
  let now = 100
  const samples: DispatchObservation[] = []
  const observations = new DispatchObservations(
    { monotonicNowMs: () => now, newId: () => '', isOnline: () => true },
    (sample) => samples.push(sample),
  )
  observations.start('review-1', 'review_started_warm', now)
  now += 18
  observations.ready('review-1')
  observations.start('review-2', 'review_started_warm', now)
  observations.requestedFleetTerms()
  now += 250
  observations.ready('review-2')
  observations.ready('review-2')
  expect(
    samples.map(({ id, phase, elapsed_ms }) => [id, phase, elapsed_ms]),
  ).toEqual([
    ['review-1', 'review_started_warm', 0],
    ['review-1', 'review_ready_reused', 18],
    ['review-2', 'review_started_warm', 0],
    ['review-2', 'review_ready_fetched', 250],
  ])
})

it('a foreground return does not turn an interrupted review or launch into uninterrupted foreground feedback', () => {
  let now = 15
  const observed: DispatchObservation[] = []
  const metrics = new DispatchObservations(
    {
      monotonicNowMs: () => now,
      newId: () => '',
      isOnline: () => true,
      isVisible: () => true,
    },
    (sample) => observed.push(sample),
  )
  metrics.start('fleet', 'send_started', now)
  now = 20
  metrics.suspend()
  now = 40
  metrics.mark('fleet', 'confirmed_visible')
  metrics.start('next', 'review_started_warm', now)
  metrics.ready('next')
  expect(observed.map((o) => [o.phase, o.foreground])).toEqual([
    ['send_started', true],
    ['confirmed_visible', false],
    ['review_started_warm', true],
    ['review_ready_reused', true],
  ])
})
