import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { temporaryDirectory } from './test-helpers.mjs'
import { verifyReleaseFiles } from './inspect-release-image.mjs'

function fixture(t, extra = []) {
  const root = temporaryDirectory(t)
  const output = join(root, 'image')
  mkdirSync(output)
  const names = [
    'LICENSE',
    'Cargo.lock',
    'package-lock.json',
    'Dockerfile',
    'scripts/package-source.mjs',
    'crates/server/src/main.rs',
    'apps/web/src/main.tsx',
    ...extra,
  ]
  for (const name of names) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), `${name}\n`)
  }
  execFileSync('tar', [
    '-czf',
    join(output, 'source.tar.gz'),
    '-C',
    root,
    ...names.map((name) => `./${name}`),
  ])
  writeFileSync(join(output, 'LICENSE.txt'), 'LICENSE\n')
  writeFileSync(join(output, 'third-party.txt'), 'React license\n')
  writeFileSync(join(output, 'rust-notices.txt'), 'MIT License\n')
  return { root, output }
}

test('inspects packaged source bytes, license and both dependency notice sets', (t) => {
  const { root, output } = fixture(t)
  assert.equal(verifyReleaseFiles(output, root), 7)
  writeFileSync(join(root, 'Dockerfile'), 'different revision')
  assert.throws(() => verifyReleaseFiles(output, root), /Source differs/)
})

test('rejects absent notices and a license differing from the released source', (t) => {
  const { root, output } = fixture(t)
  writeFileSync(join(output, 'LICENSE.txt'), 'wrong')
  assert.throws(() => verifyReleaseFiles(output, root))
  writeFileSync(join(output, 'LICENSE.txt'), 'LICENSE\n')
  writeFileSync(join(output, 'rust-notices.txt'), '')
  assert.throws(
    () => verifyReleaseFiles(output, root),
    /Missing\/empty rust-notices/,
  )
})

test('rejects credentials, Git history, build output and excluded research directories', (t) => {
  for (const path of [
    '.git/config',
    '.secrets/password',
    'apps/web/.env.production',
    'docs/key.pem',
    'docs/specs/internal.md',
    'docs/game/internal.md',
    'docs/plans/internal.md',
    'docs/verification/internal.md',
    'docs/superpowers/internal.md',
    'apps/web/dist/old.js',
  ]) {
    const { root, output } = fixture(t, [path])
    assert.throws(() => verifyReleaseFiles(output, root), undefined, path)
  }
})
