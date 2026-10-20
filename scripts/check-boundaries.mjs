import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'

const { packages } = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], {
    encoding: 'utf8',
  }),
)
const allowed = {
  'orbit-engine': [],
  'orbit-application': ['orbit-engine'],
  'orbit-storage-postgres': ['orbit-engine', 'orbit-application'],
  'orbit-transport-http': ['orbit-application'],
  'orbit-server': [
    'orbit-engine',
    'orbit-application',
    'orbit-storage-postgres',
    'orbit-transport-http',
  ],
}
for (const pkg of packages) {
  for (const dependency of pkg.dependencies) {
    if (dependency.kind === 'dev') continue
    const name = dependency.name
    if (name.startsWith('orbit-'))
      assert.ok(
        allowed[pkg.name]?.includes(name),
        `${pkg.name} cannot depend on ${name}`,
      )
    if (pkg.name === 'orbit-engine')
      assert.ok(
        !['tokio', 'sqlx', 'axum', 'rand', 'getrandom'].includes(name),
        `engine cannot depend on ${name}`,
      )
  }
}
for (const file of globSync('crates/engine/src/**/*.rs')) {
  const source = readFileSync(file, 'utf8')
  for (const forbidden of [
    'std::fs',
    'std::net',
    'std::env',
    'SystemTime',
    'Instant::now',
    'Uuid::new_v4',
    'f32',
    'f64',
    'tokio::',
  ]) {
    assert.ok(!source.includes(forbidden), `${file}: ${forbidden}`)
  }
}
for (const file of globSync('apps/web/src/**/*.{ts,tsx}')) {
  if (!file.split('/').includes('adapters'))
    assert.ok(!readFileSync(file, 'utf8').includes('fetch('), file)
}
console.log('Five-crate and browser transport boundaries passed.')
