import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { clientBuildPlugin } from './client-build.mjs'

test('each asset build ships the exact identity compiled into its JavaScript', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orbit-client-build-')))
  try {
    writeFileSync(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    writeFileSync(join(root, 'main.js'), 'console.log(import.meta.env.ORBIT_CLIENT_BUILD)')
    const ids = []
    for (let i = 0; i < 2; i++) {
      const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [clientBuildPlugin()], build: { write: false } })
      const metadata = result.output.find(entry => entry.fileName === 'client-build.json')
      const { id } = JSON.parse(metadata.source)
      assert.match(id, /^[0-9a-f-]{36}$/)
      assert.ok(result.output.some(entry => entry.type === 'chunk' && entry.code.includes(id)))
      ids.push(id)
    }
    assert.notEqual(ids[0], ids[1])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
