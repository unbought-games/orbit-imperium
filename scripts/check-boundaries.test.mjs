import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

function fixture(t) {
  const directory = temporaryDirectory(t)
  for (const part of [
    'crates/engine/src/nested',
    'apps/web/src/adapters',
    'bin',
  ])
    mkdirSync(join(directory, part), { recursive: true })
  const metadata = join(directory, 'metadata.json')
  executable(
    join(directory, 'bin/cargo'),
    `console.log(require('node:fs').readFileSync(${JSON.stringify(metadata)}, 'utf8'))`,
  )
  return {
    write: (file, text) => writeFileSync(join(directory, file), text),
    metadata: (packages) =>
      writeFileSync(metadata, JSON.stringify({ packages })),
    run: () =>
      exec(process.execPath, [join(root, 'scripts/check-boundaries.mjs')], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${join(directory, 'bin')}${delimiter}${process.env.PATH}`,
        },
        signal: t.signal,
      }),
  }
}

test('boundary check permits the dependency graph, dev dependencies and adapter fetches', async (t) => {
  const f = fixture(t)
  f.metadata([
    { name: 'orbit-engine', dependencies: [{ name: 'tokio', kind: 'dev' }] },
    {
      name: 'orbit-application',
      dependencies: [{ name: 'orbit-engine', kind: null }],
    },
    {
      name: 'orbit-storage-postgres',
      dependencies: [{ name: 'orbit-application', kind: null }],
    },
  ])
  f.write('apps/web/src/adapters/http.ts', 'fetch("/api")')
  assert.match((await f.run()).stdout, /boundaries passed/)
})

test('boundary check rejects reversed dependencies, engine side effects and UI fetches', async (t) => {
  const f = fixture(t)
  for (const dependency of ['orbit-storage-postgres', 'tokio']) {
    f.metadata([
      {
        name: 'orbit-engine',
        dependencies: [{ name: dependency, kind: null }],
      },
    ])
    await assert.rejects(f.run(), (error) => error.stderr.includes(dependency))
  }
  f.metadata([])
  f.write('crates/engine/src/nested/bad.rs', 'std::env::var("HOME")')
  await assert.rejects(f.run(), (error) => error.stderr.includes('std::env'))
  f.write('crates/engine/src/nested/bad.rs', '')
  f.write('apps/web/src/page.tsx', 'fetch("/api")')
  await assert.rejects(f.run(), (error) => error.stderr.includes('page.tsx'))
})
