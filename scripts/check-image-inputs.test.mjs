import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { root } from './test-helpers.mjs'
import { compilerInputs, missingInputs } from './check-image-inputs.mjs'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const inputs = compilerInputs(root)

test('the release stages contain browser compiler inputs and generated analytics routes', () => {
  assert.ok(
    inputs.web.some((file) => file.startsWith('packages/ship-appearance/')),
  )
  assert.deepEqual(missingInputs(dockerfile, root, inputs), [])
})

test('a missing shared source directory fails before an image build', () => {
  const broken = dockerfile.replace(/^COPY packages packages\n/m, '')
  assert.notEqual(broken, dockerfile)
  assert.ok(
    missingInputs(broken, root, inputs).some((file) =>
      file.startsWith('web: packages/ship-appearance/'),
    ),
  )
})

test('a missing generated-file transfer catches the November 13 regression', () => {
  const broken = dockerfile.replace(
    /^COPY --from=web \/build\/apps\/web\/src\/analytics-routes.json .*\n/m,
    '',
  )
  assert.notEqual(broken, dockerfile)
  assert.deepEqual(missingInputs(broken, root, inputs), [
    'rust: apps/web/src/analytics-routes.json',
  ])
})
