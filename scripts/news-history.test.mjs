import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { temporaryDirectory } from './test-helpers.mjs'
import { writeHistory } from './news-history.mjs'

test('build history excludes withheld commits but keeps released fixes', (t) => {
  const root = temporaryDirectory(t)
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git(
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-qm',
    'feat: unfinished editor',
  )
  const withheld = git('rev-parse', 'HEAD')
  git(
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-qm',
    'fix: return fleets',
  )
  const visible = git('rev-parse', 'HEAD')
  assert.equal(writeHistory(root).length, 2)
  const file = join(root, 'docs/news/excluded-commits.json')
  mkdirSync(join(root, 'docs/news'), { recursive: true })
  writeFileSync(file, JSON.stringify([withheld]))
  assert.deepEqual(
    writeHistory(root).map((entry) => entry.commit),
    [visible],
  )
  assert.doesNotMatch(
    readFileSync(join(root, 'docs/news/history.json'), 'utf8'),
    /unfinished editor/,
  )
  writeFileSync(file, '["not-a-commit"]')
  assert.throws(() => writeHistory(root), /Invalid excluded news commits/)
})
