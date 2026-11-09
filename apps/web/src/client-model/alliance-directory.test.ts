import { expect, it, vi } from 'vitest'
import {
  AllianceDirectoryController,
  defaultAllianceSearch,
  recruitmentSearch,
  type DirectoryResult,
} from './alliance-directory'
const empty: DirectoryResult = {
  kind: 'recruiting',
  data: { alliances: [], total: 0 },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('keeps the latest filtered result when an older search completes afterwards', async () => {
  const old = deferred<DirectoryResult>()
  const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(empty)
  const controller = new AllianceDirectoryController(read)
  const first = controller.load(defaultAllianceSearch)
  await controller.load({ ...defaultAllianceSearch, search: 'new' })
  expect(read.mock.calls[0][1].aborted).toBe(true)
  old.resolve({ kind: 'recruiting', data: { alliances: [], total: 99 } })
  await first
  expect(controller.store.getState().result).toEqual(empty)
})
it('retains confirmed results while reloading and reports errors without claiming an empty result', async () => {
  const next = deferred<DirectoryResult>()
  const read = vi
    .fn()
    .mockResolvedValueOnce(empty)
    .mockReturnValueOnce(next.promise)
    .mockRejectedValue(new Error('Offline'))
  const controller = new AllianceDirectoryController(read)
  await controller.load(defaultAllianceSearch)
  const pending = controller.load({ ...defaultAllianceSearch, language: 'en' })
  expect(controller.store.getState()).toMatchObject({
    result: empty,
    loading: true,
    error: '',
  })
  controller.cancel()
  next.resolve({ kind: 'recruiting', data: { alliances: [], total: 2 } })
  await pending
  await controller.load(defaultAllianceSearch)
  expect(controller.store.getState()).toMatchObject({
    result: empty,
    loading: false,
    error: 'Offline',
  })
  controller.clear()
  expect(controller.store.getState().result).toBeNull()
})
it('sends combined recruitment preferences and pagination without empty parameters', () => {
  expect(recruitmentSearch(defaultAllianceSearch).toString()).toBe('')
  expect(
    Object.fromEntries(
      recruitmentSearch({
        ...defaultAllianceSearch,
        search: 'Stars',
        language: 'en',
        beginners: 'Welcome',
        activity: 'Daily',
        offset: 20,
      }),
    ),
  ).toEqual({
    search: 'Stars',
    language: 'en',
    beginners: 'Welcome',
    activity: 'Daily',
    offset: '20',
  })
})
