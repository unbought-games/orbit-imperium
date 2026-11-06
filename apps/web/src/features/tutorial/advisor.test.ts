import {
  celebrationReceipts,
  celebrationReward,
  celebrationNextDirective,
  receiptEvent,
} from './advisor-celebration'
import { expect, it } from 'vitest'
import { tutorialFixture } from '../../test-support/tutorial'
import { advisorLesson } from './advisor-model'
import { createAdvisorHistory } from './advisor-history'

it('continues after out-of-order completions and skips later completed directives without looping backward', () => {
  const data = tutorialFixture(false)
  const receipts = tutorialFixture(true).receipts
  const lab = receipts.filter((r) => r.objective === 'lab-2')
  expect(celebrationNextDirective(data, lab)?.id).toBe('energy-1')
  const objectives = data.chapters.flatMap((chapter) => chapter.objectives)
  objectives.find((o) => o.id === 'energy-1')!.completed = true
  expect(celebrationNextDirective(data, lab)?.id).toBe('combustion-1')
  expect(
    celebrationNextDirective(
      data,
      receipts.filter((r) => r.objective === 'solar-9'),
    )?.id,
  ).toBe('lab-2')
  expect(
    celebrationNextDirective(
      data,
      receipts.filter((r) => r.objective === 'reinvest'),
    ),
  ).toBeNull()
  expect(celebrationNextDirective(data, [])).toBeNull()
})

it('continues after the furthest directive in a batch regardless of receipt order', () => {
  const data = tutorialFixture(false)
  const receipts = tutorialFixture(true).receipts.filter((r) =>
    ['metal-1', 'lab-2'].includes(r.objective),
  )
  expect(celebrationNextDirective(data, receipts)?.id).toBe('energy-1')
  expect(celebrationNextDirective(data, receipts.reverse())?.id).toBe(
    'energy-1',
  )
})

it('offers Metal Mine guidance only on its available detail route during onboarding', () => {
  const data = tutorialFixture()
  const route = {
    available: true,
    page: 'resources' as const,
    item: 'MetalMine',
  }
  expect(advisorLesson(data, route)).toBe('metal-mine')
  expect(advisorLesson(data, { ...route, item: null })).toBeNull()
  expect(advisorLesson(data, { ...route, item: 'CrystalMine' })).toBeNull()
  expect(advisorLesson(data, { ...route, available: false })).toBeNull()
  expect(advisorLesson(null, route)).toBeNull()
  expect(advisorLesson({ ...data, enrolled: false }, route)).toBeNull()
  expect(advisorLesson({ ...data, beginner: false }, route)).toBeNull()
})

it('remembers presentation across reloads without sharing it between empires or resets', () => {
  const saved = new Map<string, string>()
  const storage = () => ({
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => {
      saved.set(k, v)
    },
  })
  const history = createAdvisorHistory(storage)
  expect(history.seen('account:universe:epoch:player', 'metal-mine')).toBe(
    false,
  )
  history.remember('account:universe:epoch:player', 'metal-mine')
  expect(
    createAdvisorHistory(storage).seen(
      'account:universe:epoch:player',
      'metal-mine',
    ),
  ).toBe(true)
  expect(history.seen('account:universe:next-epoch:player', 'metal-mine')).toBe(
    false,
  )
  expect(history.seen('other:universe:epoch:player', 'metal-mine')).toBe(false)
})

it('keeps a session fallback when browser storage is unavailable', () => {
  const history = createAdvisorHistory(() => {
    throw new Error('Storage blocked')
  })
  expect(history.seen('empire', 'metal-mine')).toBe(false)
  history.remember('empire', 'metal-mine')
  expect(history.seen('empire', 'metal-mine')).toBe(true)
})

it('celebrates confirmed receipts, including full-interface and final completion, with exact paid rewards', () => {
  const data = tutorialFixture(true)
  data.beginner = false
  const selected = data.receipts.slice(0, 2).map((receipt) => receipt.id)
  const receipts = celebrationReceipts(data, selected)
  expect(receipts).toHaveLength(2)
  expect(celebrationReceipts(null, selected)).toEqual([])
  expect(celebrationReceipts({ ...data, enrolled: false }, selected)).toEqual(
    [],
  )
  expect(celebrationReceipts({ ...data, receipts: [] }, selected)).toEqual([])
  expect(celebrationReward(receipts)).toEqual({
    metal: '400000000',
    crystal: '200000000',
    deuterium: '0',
  })
})

it('persists receipt presentation separately from page lessons and other empires', () => {
  const saved = new Map<string, string>()
  const storage = () => ({
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value)
    },
  })
  const history = createAdvisorHistory(storage)
  history.remember('empire', receiptEvent('one'))
  const restored = createAdvisorHistory(storage)
  expect(restored.seen('empire', receiptEvent('one'))).toBe(true)
  expect(restored.seen('empire', receiptEvent('two'))).toBe(false)
  expect(restored.seen('other-empire', receiptEvent('one'))).toBe(false)
  expect(restored.seen('empire', 'metal-mine')).toBe(false)
})

it('teaches energy in context and keeps production review available after leaving beginner mode', () => {
  const data = tutorialFixture(false)
  const route = {
    available: true,
    page: 'resources' as const,
    item: 'SolarPlant',
  }
  expect(advisorLesson(data, route)).toBe('solar-power')
  const all = data.chapters.flatMap((c) => c.objectives)
  all.find((o) => o.id === 'metal-1')!.completed = true
  expect(advisorLesson(data, { ...route, item: 'MetalMine' })).toBe(
    'growing-mines',
  )
  all.find((o) => o.id === 'metal-2')!.completed = true
  expect(advisorLesson(data, route)).toBe('restore-power')
  const settings = { ...route, page: 'resource-settings' as const, item: null }
  data.beginner = false
  expect(advisorLesson(data, settings)).toBe('production-settings')
  all.find((o) => o.id === 'production-settings')!.completed = true
  expect(advisorLesson(data, settings)).toBeNull()
})

it('retires introductory mine and solar lessons once their milestones are complete', () => {
  const data = tutorialFixture()
  const route = {
    available: true,
    page: 'resources' as const,
    item: 'MetalMine',
  }
  const all = data.chapters.flatMap((c) => c.objectives)
  all.find((o) => o.id === 'metal-2')!.completed = true
  expect(advisorLesson(data, route)).toBeNull()
  all.find((o) => o.id === 'metal-1')!.completed = true
  expect(advisorLesson(data, route)).toBeNull()
  all.find((o) => o.id === 'solar-2')!.completed = true
  expect(advisorLesson(data, { ...route, item: 'SolarPlant' })).toBeNull()
})
