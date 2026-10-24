import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { temporaryDirectory } from './test-helpers.mjs'
import { verifyReleaseFiles } from './inspect-release-image.mjs'

function fixture(t) {
  const root = temporaryDirectory(t)
  const output = join(root, 'image')
  mkdirSync(output)
  writeFileSync(join(root, 'LICENSE'), 'LICENSE\n')
  writeFileSync(join(output, 'LICENSE.txt'), 'LICENSE\n')
  writeFileSync(join(output, 'third-party.txt'), 'React license\n')
  writeFileSync(join(output, 'rust-notices.txt'), 'MIT License\n')
  return { root, output }
}

test('inspects license and dependency notices without a packaged source archive', (t) => {
  const { root, output } = fixture(t)
  assert.doesNotThrow(() => verifyReleaseFiles(output, root))
  writeFileSync(join(output, 'LICENSE.txt'), 'different license')
  assert.throws(() => verifyReleaseFiles(output, root))
})

test('rejects missing, empty and invalid dependency notices', (t) => {
  for (const name of ['third-party.txt', 'rust-notices.txt']) {
    const { root, output } = fixture(t)
    rmSync(join(output, name))
    assert.throws(() => verifyReleaseFiles(output, root), /ENOENT/)
    writeFileSync(join(output, name), '')
    assert.throws(() => verifyReleaseFiles(output, root), /Missing\/empty/)
    writeFileSync(join(output, name), 'unrelated contents')
    assert.throws(() => verifyReleaseFiles(output, root))
  }
})
