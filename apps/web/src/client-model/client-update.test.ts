import { expect, it, vi } from 'vitest'
import {
  createClientUpdate,
  reloadNoticeMs,
  reloadQuietPeriodMs,
} from './client-update'

function setup() {
  let now = 1000000,
    saved: string | null = null
  const reload = vi.fn()
  const jobs: Array<() => void> = []
  const deps = {
    build: 'a',
    now: () => now,
    read: () => saved,
    write: (value: string) => {
      saved = value
    },
    schedule: vi.fn((callback: () => void) => {
      jobs.push(callback)
    }),
    reload,
  }
  return {
    deps,
    reload,
    jobs,
    advance: (ms: number) => {
      now += ms
    },
  }
}

it('ignores absent/matching headers and reserves one reload across concurrent responses and page recreation', () => {
  const s = setup(),
    update = createClientUpdate(s.deps)
  expect(update.observe(null)).toBe(false)
  expect(update.observe('a')).toBe(false)
  expect(update.observe('b')).toBe(true)
  expect(update.observe('c')).toBe(true)
  expect(s.deps.read()).toBe('1000000')
  expect(s.deps.schedule).toHaveBeenCalledExactlyOnceWith(
    s.reload,
    reloadNoticeMs,
  )
  expect(s.reload).not.toHaveBeenCalled()
  s.jobs[0]()
  expect(s.reload).toHaveBeenCalledOnce()
  const nextPage = createClientUpdate(s.deps)
  nextPage.observe('c')
  expect(nextPage.store.getState()).toEqual({ status: 'blocked', build: 'c' })
  s.advance(reloadQuietPeriodMs - 1)
  nextPage.observe('b')
  expect(s.jobs).toHaveLength(1)
  s.advance(1)
  nextPage.observe('b')
  expect(s.jobs).toHaveLength(2)
})

it('fails closed on blocked storage, invalid timestamps, and clocks moving backward, while allowing manual reload', () => {
  for (const read of [
    () => {
      throw Error('storage')
    },
    () => 'NaN',
    () => '1000001',
  ]) {
    const s = setup(),
      update = createClientUpdate({ ...s.deps, read })
    update.observe('b')
    expect(update.store.getState().status).toBe('blocked')
    expect(s.jobs).toHaveLength(0)
    update.reload()
    expect(s.reload).toHaveBeenCalledOnce()
  }
  const s = setup(),
    update = createClientUpdate({
      ...s.deps,
      write: () => {
        throw Error('quota')
      },
    })
  update.observe('b')
  expect(s.jobs).toHaveLength(0)
  update.reload()
  expect(s.reload).toHaveBeenCalledOnce()
})

it('does not reload incompatible data without evidence of a new build or hide an already scheduled update', () => {
  const s = setup(),
    update = createClientUpdate(s.deps)
  update.incompatible()
  expect(update.store.getState().status).toBe('incompatible')
  expect(s.jobs).toHaveLength(0)
  update.observe('b')
  update.incompatible()
  expect(update.store.getState().status).toBe('refreshing')
})
