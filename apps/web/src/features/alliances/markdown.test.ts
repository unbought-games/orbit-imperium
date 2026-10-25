import { expect, it } from 'vitest'
import { allianceMarkdown } from './markdown'
it('renders basic formatting while disabling HTML images embeds and unsafe protocols', () => {
  const html = allianceMarkdown(
    '**Welcome**\n\n[Safe](https://example.com) [Bad](javascript:alert(1)) [Data](data:text/html,test) [Relative](//evil.example)\n\n![Image](https://example.com/x.png)\n\n<iframe src="https://example.com"></iframe><script>alert(1)</script>',
  )
  expect(html).toContain('<strong>Welcome</strong>')
  expect(html).toContain('href="https://example.com"')
  expect(html).not.toMatch(/<(img|iframe|script)\b/)
  expect(html).not.toMatch(/href="(javascript:|data:|\/\/)/)
})
