import { expect, it } from 'vitest'
import { tutorialFixture } from '../../test-support/tutorial'
import { createAdvisorHistory } from './advisor-history'
import { briefingAttentionEvents } from './briefing-attention'

it('waits for authoritative enrollment and offers the first visit in both interfaces', () => {
  const data = tutorialFixture()
  expect(briefingAttentionEvents(null)).toEqual([])
  expect(briefingAttentionEvents({ ...data, enrolled: false })).toEqual([])
  const events = briefingAttentionEvents(data)
  expect(events).toHaveLength(1)
  expect(events[0]).toContain(':welcome')
  expect(briefingAttentionEvents({ ...data, beginner: false })).toEqual(events)
})

it('acknowledges only the clicked progress and lights up for each later completion', () => {
  const data = tutorialFixture()
  const saved = new Map<string, string>()
  const storage = () => ({
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value)
    },
  })
  const history = createAdvisorHistory(storage)
  const unread = () =>
    briefingAttentionEvents(data).filter(
      (event) => !history.seen('empire', event),
    )
  const acknowledge = () =>
    briefingAttentionEvents(data).forEach((event) =>
      history.remember('empire', event),
    )
  expect(unread()).toHaveLength(1)
  acknowledge()
  expect(unread()).toEqual([])
  const objectives = data.chapters.flatMap((chapter) => chapter.objectives)
  objectives[0].completed = true
  expect(unread()).toEqual([
    expect.stringContaining(`completed:${objectives[0].id}`),
  ])
  acknowledge()
  expect(unread()).toEqual([])
  objectives[1].completed = true
  expect(unread()).toEqual([
    expect.stringContaining(`completed:${objectives[1].id}`),
  ])
  acknowledge()
  const restored = createAdvisorHistory(storage)
  expect(
    briefingAttentionEvents(data).every((event) =>
      restored.seen('empire', event),
    ),
  ).toBe(true)
  expect(
    briefingAttentionEvents(data).every(
      (event) => !restored.seen('other-empire', event),
    ),
  ).toBe(true)
})

it('keeps the final accomplishment unread until acknowledged and ignores ordering or receipts', () => {
  const data = tutorialFixture(true)
  const events = briefingAttentionEvents(data)
  expect(events).toHaveLength(31)
  expect(events.some((event) => event.endsWith(':welcome'))).toBe(false)
  data.receipts = []
  data.chapters.reverse()
  for (const chapter of data.chapters) chapter.objectives.reverse()
  expect(briefingAttentionEvents(data).sort()).toEqual(events.sort())
  expect(
    briefingAttentionEvents({ ...data, version: data.version + 1 }),
  ).not.toEqual(events)
})

it('keeps briefing clicks separate from automatic advisor celebrations and supports blocked storage', () => {
  const history = createAdvisorHistory(() => {
    throw new Error('Storage blocked')
  })
  const data = tutorialFixture(true)
  for (const receipt of data.receipts)
    history.remember('empire', `receipt:${receipt.id}`)
  const events = briefingAttentionEvents(data)
  expect(events.every((event) => !history.seen('empire', event))).toBe(true)
  for (const event of events) history.remember('empire', event)
  expect(events.every((event) => history.seen('empire', event))).toBe(true)
})
