import { afterEach, expect, it, vi } from 'vitest'
import { loadAnnouncements } from './announcements'

afterEach(() => vi.unstubAllGlobals())

it('loads a maximum-size published feed including its HTTP revision envelope', async () => {
  const announcements = Array.from({ length: 64 }, (_, index) => ({
    id: `news-${index}`,
    title: 'News',
    date: '2026-11-07T12:00:00Z',
    body: index < 63 ? 'a'.repeat(16_384) : 'a',
  }))
  const feed = { schema: 1, announcements }
  const available =
    1_048_576 - new TextEncoder().encode(JSON.stringify(feed)).byteLength
  announcements[63].body += 'a'.repeat(available)
  expect(new TextEncoder().encode(JSON.stringify(feed))).toHaveLength(1_048_576)
  expect(announcements[63].body.length).toBeLessThanOrEqual(16_384)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ revision: 'a'.repeat(64), ...feed })),
  )
  await expect(
    loadAnnouncements(new AbortController().signal),
  ).resolves.toEqual(announcements)
})

it('bounds the response in UTF-8 bytes, including non-ASCII input', async () => {
  const text = '😀'.repeat(262_177)
  expect(text.length).toBeLessThan(1_048_576)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(text)),
  )
  await expect(loadAnnouncements(new AbortController().signal)).rejects.toThrow(
    'Announcement feed too large',
  )
})
