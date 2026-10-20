import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

test('retains package, LICENSES directory and bundled native dependency notices', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'orbit-notices-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, content] of [
    ['registry/alpha-1.0/LICENSE-MIT', 'alpha copyright'],
    ['registry/beta-2.0/LICENSES/MIT.txt', 'beta copyright'],
    ['registry/gamma-3.0/vendor/library/NOTICE', 'native attribution'],
    ['registry/gamma-3.0/src/lib.rs', 'implementation omitted'],
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const notices = execFileSync(
    'sh',
    ['scripts/collect-rust-notices.sh', root],
    { encoding: 'utf8' },
  )
  for (const text of [
    'alpha copyright',
    'beta copyright',
    'native attribution',
  ])
    assert.ok(notices.includes(text))
  assert.ok(notices.includes('beta-2.0/LICENSES/MIT.txt'))
  assert.ok(!notices.includes('implementation omitted'))
})
