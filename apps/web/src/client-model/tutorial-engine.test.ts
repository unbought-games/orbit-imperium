import { expect, it } from 'vitest'
import { TutorialEngine } from './tutorial-engine'
import { createGameStore } from './game-store'
import { readyFixture } from '../test-support/bootstrap'
import { tutorialFixture } from '../test-support/tutorial'
import type { components } from '../contracts'
type S = components['schemas']
function fixture() {
  const store = createGameStore(),
    { snapshot } = readyFixture(4)
  store.setState({
    ready: true,
    binding: snapshot.view.binding,
    view: snapshot.view,
  })
  const reads: Array<(r: S['BoundWorld4'] | null) => void> = []
  const engine = new TutorialEngine(
    store,
    () => new Promise((resolve) => reads.push(resolve)),
  )
  const response = (revision = '0'): S['BoundWorld4'] => ({
    protocol: 4,
    binding: snapshot.view.binding,
    request_id: 'test',
    viewer_revision: revision,
    as_of_ms: 1000,
    sampled_at: 1000,
    data: tutorialFixture(),
  })
  return { store, engine, reads, response }
}
it('deduplicates consumers and rejects a superseded revision response without erasing current receipts', async () => {
  const h = fixture(),
    old = h.engine.ensure()
  expect(h.engine.ensure()).toBe(old)
  h.store.setState((s) => ({
    view: { ...s.view!, viewer_revision: '2' },
    receivedAt: 20,
  }))
  const latest = h.engine.ensure()
  h.reads[1](h.response('2'))
  await latest
  h.reads[0](h.response())
  await old
  expect(h.store.getState().tutorial.revision).toBe('2')
  expect(h.reads).toHaveLength(2)
})
it('clears source data at logout and ignores an earlier account response', async () => {
  const h = fixture(),
    pending = h.engine.ensure()
  h.engine.invalidate()
  h.store.setState({ binding: null, ready: false })
  h.reads[0](h.response())
  await pending
  expect(h.store.getState().tutorial.data).toBeNull()
})
it('reuses unchanged snapshots, permits explicit retries, and retains data when a refresh is stale', async () => {
  const h = fixture()
  const first = h.engine.ensure()
  h.store.setState({ receivedAt: 10 })
  expect(h.engine.ensure()).toBe(first)
  expect(h.reads).toHaveLength(1)
  h.reads[0](h.response())
  await first
  h.store.setState({ receivedAt: 20 })
  await h.engine.ensure()
  expect(h.reads).toHaveLength(1)
  const forced = h.engine.ensure(true)
  expect(h.reads).toHaveLength(2)
  h.store.setState((s) => ({ view: { ...s.view!, viewer_revision: '3' } }))
  h.reads[1](h.response('2'))
  await forced
  expect(h.store.getState().tutorial.data?.enrolled).toBe(true)
  expect(h.store.getState().tutorial.error).toContain('catching up')
})
