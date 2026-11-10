import { describe, expect, it } from 'vitest'
import { announcementUrl, parseAnnouncementFeed } from './feed'
import { renderAnnouncementMarkdown } from './markdown'
const item = {
  id: 'new-research',
  title: 'New research',
  date: '2026-11-07T12:00:00Z',
  body: 'A useful update.',
}
describe('runtime announcement validation', () => {
  it('accepts empty feeds and validates unique entries, schema and windows', () => {
    expect(parseAnnouncementFeed({ schema: 1, announcements: [] })).toEqual([])
    expect(parseAnnouncementFeed({ schema: 1, announcements: [item] })).toEqual(
      [item],
    )
    for (const feed of [
      { schema: 2, announcements: [] },
      { schema: 1, announcements: [item, item] },
      { schema: 1, announcements: [{ ...item, until: item.date }] },
      {
        schema: 1,
        announcements: [{ ...item, image: { src: '//evil.test', alt: '' } }],
      },
    ])
      expect(() => parseAnnouncementFeed(feed)).toThrow()
  })
  it('rejects executable, protocol-relative and disguised URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:image/svg+xml,bad',
      '//evil.test',
      '/\\evil.test',
      'https://user@host',
      '/a\nb',
    ])
      expect(announcementUrl(url)).toBe(false)
    expect(announcementUrl('/updates/news.html')).toBe(true)
    expect(announcementUrl('https://example.test/news')).toBe(true)
  })
})
describe('announcement Markdown boundary', () => {
  it('escapes raw markup and refuses executable links and images', () => {
    const html = renderAnnouncementMarkdown(
      '<img src=x onerror=alert(1)>\n\n[click](javascript:alert%281%29)\n\n![bad](data:image/svg+xml,bad)\n\n<script>alert(1)</script>',
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('href=')
    expect(html).toContain('&lt;img')
  })
  it('renders ordinary rich copy with isolated links', () => {
    const html = renderAnnouncementMarkdown(
      '**Together**\n\n- Faster research\n\n[Details](/updates/news.html)',
    )
    expect(html).toContain('<strong>Together</strong>')
    expect(html).toContain('<li>Faster research</li>')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })
})
