import { describe, expect, it } from 'vitest'
import {
  announcementEnd,
  createAnnouncementHistory,
  currentAnnouncement,
  type Announcement,
} from './model'

const entry = (id: string, date: string, until?: string): Announcement => ({
  id,
  title: id,
  date,
  until,
  body: id,
})
const day = 86_400_000
const at = (iso: string) => Date.parse(iso)
const never = () => false

describe('currentAnnouncement', () => {
  const older = entry('older', '2026-11-01T00:00:00Z')
  const newer = entry('newer', '2026-11-05T00:00:00Z', '2026-11-08T00:00:00Z')

  it('hides news published before the empire joined', () => {
    const now = at('2026-11-06T00:00:00Z')
    expect(
      currentAnnouncement(
        [older, newer],
        now,
        never,
        at('2026-11-02T00:00:00Z'),
      )?.id,
    ).toBe('newer')
    expect(
      currentAnnouncement(
        [older, newer],
        now,
        never,
        at('2026-11-05T12:00:00Z'),
      ),
    ).toBeNull()
  })

  it('picks the newest live announcement regardless of catalog order', () => {
    expect(
      currentAnnouncement([older, newer], at('2026-11-06T00:00:00Z'), never)
        ?.id,
    ).toBe('newer')
  })

  it('falls back to an older live announcement once the newest is seen', () => {
    expect(
      currentAnnouncement(
        [older, newer],
        at('2026-11-06T00:00:00Z'),
        (id) => id === 'newer',
      )?.id,
    ).toBe('older')
  })

  it('respects start, explicit end and the default 30-day window', () => {
    const show = (now: string) =>
      currentAnnouncement([older, newer], at(now), never)?.id ?? null
    expect(show('2026-10-31T23:59:59Z')).toBeNull()
    expect(show('2026-11-08T00:00:00Z')).toBe('older')
    expect(announcementEnd(older)).toBe(at('2026-11-01T00:00:00Z') + 30 * day)
    expect(show('2026-12-01T00:00:00Z')).toBeNull()
  })
})

describe('announcement history', () => {
  it('scopes acknowledgements to the account', () => {
    const data = new Map<string, string>()
    const history = createAnnouncementHistory(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }))
    history.remember('account-a', 'research-network')
    expect(history.seen('account-a', 'research-network')).toBe(true)
    expect(history.seen('account-b', 'research-network')).toBe(false)
    // A fresh page load reads the persisted value.
    const reloaded = createAnnouncementHistory(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: () => {},
    }))
    expect(reloaded.seen('account-a', 'research-network')).toBe(true)
  })

  it('still hides an acknowledged announcement for the session when storage is blocked', () => {
    const history = createAnnouncementHistory(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(history.seen('account', 'news')).toBe(false)
    history.remember('account', 'news')
    expect(history.seen('account', 'news')).toBe(true)
  })
})
