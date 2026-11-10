import { expect, it } from 'vitest'
import {
  createInboxPagination,
  type InboxPageContext,
} from './inbox-pagination'
function fixture(targetCount = 130) {
  const context: InboxPageContext = {
    visible: true,
    changingVisibility: false,
    targetCount,
    hasMore: true,
  }
  const pending: Array<{ resolve: () => void; reject: () => void }> = []
  const pagination = createInboxPagination({
    context: () => context,
    request: () =>
      new Promise<void>((resolve, reject) => pending.push({ resolve, reject })),
  })
  return { context, pending, pagination }
}
it('queued observations cannot page hidden content, including before observer cleanup', async () => {
  const { context, pagination, pending } = fixture(40)
  const observation = pagination.observation()
  context.visible = false
  await observation.intersect()
  expect(pagination.snapshot().limit).toBe(20)
  observation.disconnect()
  context.visible = true
  await observation.intersect()
  expect(pagination.snapshot().limit).toBe(20)
  await pagination.observation().intersect()
  expect(pagination.snapshot().limit).toBe(40)
  expect(pending).toEqual([])
})
it('old observations retain their original page boundary even before cleanup after a later batch', async () => {
  const { pagination } = fixture()
  const queued = pagination.observation()
  await pagination.loadMore()
  await queued.intersect()
  expect(pagination.snapshot().limit).toBe(40)
  await pagination.loadMore()
  await queued.intersect()
  expect(pagination.snapshot().limit).toBe(60)
})
it('buffered pages stay available during background refresh; only an explicit gesture requests more history', async () => {
  const { context, pagination, pending } = fixture(50)
  await pagination.loadMore()
  expect(pagination.snapshot()).toEqual({ limit: 40, pageIntent: null })
  expect(pending).toEqual([])
  const request = pagination.loadMore()
  expect(pagination.snapshot()).toEqual({ limit: 40, pageIntent: 60 })
  await pagination.loadMore()
  expect(pending).toHaveLength(1)
  context.targetCount = 100
  pending[0].resolve()
  await request
  expect(pagination.snapshot()).toEqual({ limit: 60, pageIntent: null })
  // Marking an item read or refreshing the list never creates paging intent.
  context.targetCount = 59
  expect(pending).toHaveLength(1)
  expect(pagination.snapshot()).toEqual({ limit: 60, pageIntent: null })
  const next = pagination.loadMore()
  expect(pending).toHaveLength(2)
  context.targetCount = 99
  pending[1].resolve()
  await next
  expect(pagination.snapshot()).toEqual({ limit: 80, pageIntent: null })
})
it('failed pagination leaves the settled limit and retries the same intent', async () => {
  const { pagination, pending } = fixture(20)
  const failed = pagination.loadMore()
  pending[0].reject()
  await failed
  expect(pagination.snapshot()).toEqual({ limit: 20, pageIntent: null })
  const retried = pagination.loadMore()
  expect(pagination.snapshot().pageIntent).toBe(40)
  pending[1].resolve()
  await retried
  expect(pagination.snapshot()).toEqual({ limit: 40, pageIntent: null })
})
it('canceled completion cannot consume a later pending intent', async () => {
  const { pagination, pending } = fixture(20)
  const old = pagination.loadMore()
  pagination.cancel()
  const current = pagination.loadMore()
  pending[0].resolve()
  await old
  expect(pagination.snapshot()).toEqual({ limit: 20, pageIntent: 40 })
  pending[1].resolve()
  await current
  expect(pagination.snapshot()).toEqual({ limit: 40, pageIntent: null })
})
it('visibility mutations block paging and exhausted history never requests a nonexistent cursor', async () => {
  const { context, pagination, pending } = fixture(5)
  context.changingVisibility = true
  await pagination.loadMore()
  expect(pagination.snapshot().limit).toBe(20)
  context.changingVisibility = false
  context.hasMore = false
  await pagination.loadMore()
  expect(pagination.snapshot()).toEqual({ limit: 40, pageIntent: null })
  expect(pending).toEqual([])
})
