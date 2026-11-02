import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

test('community source contains only the approved bundled insignias and no legacy hosted original', () => {
  assert.deepEqual(readdirSync('crates/application/assets/insignias').filter(name => name.endsWith('.svg')).sort(), ['compass.svg', 'forge-anvil.svg', 'forge-ascendant.svg', 'forge-crown.svg', 'forge-diagonal-circles.svg', 'forge-diagonal-stars.svg', 'forge-diamonds.svg', 'forge-full-circle.svg', 'forge-helix.svg', 'forge-mini-stripes.svg', 'forge-moons.svg', 'forge-quarter-moon.svg', 'forge-starwing.svg', 'forge-triads.svg', 'forge-triforce.svg', 'forge-wayfinder.svg', 'forge-zigzags.svg', 'spire.svg', 'wings.svg'])
  for (const restricted of ['forge-nova.svg','forge-nine-star.svg','forge-laurel.svg','forge-dashed-ring.svg','forge-rails.svg']) assert.equal(existsSync(`crates/application/assets/insignias/${restricted}`),false)
  // Fingerprint only: the previously public original must not be reintroduced
  // under a different filename. Actual hosted artwork stays out of test fixtures.
  const legacyHostedHash = 'd24d05c01821b0ddab6e33bda58c6bc3f065b038c4afac0ae80cb93a5b63cedd'
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0')
  for (const name of files.filter(name => name.endsWith('.svg') && existsSync(name))) {
    assert.notEqual(createHash('sha256').update(readFileSync(name)).digest('hex'), legacyHostedHash, `Hosted original leaked into ${name}`)
  }
  const dockerfile = readFileSync('Dockerfile', 'utf8')
  assert.doesNotMatch(dockerfile, /hosted-content|ORBIT_COSMETIC_CATALOG|aws s3/)
})
