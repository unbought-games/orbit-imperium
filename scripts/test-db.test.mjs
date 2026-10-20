import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

test('database runner encodes passwords, selects a serial suite and cleans up on failure', async (t) => {
  const directory = temporaryDirectory(t)
  const log = join(directory, 'docker.log')
  executable(
    join(directory, 'docker'),
    `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')`,
  )
  executable(
    join(directory, 'cargo'),
    `console.log(JSON.stringify({args: process.argv.slice(2), url: process.env.TEST_DATABASE_URL})); process.exit(101)`,
  )
  const password = 'local@password:/?#%'
  let output
  await assert.rejects(
    exec('sh', ['scripts/test-db.sh', 'signup'], {
      cwd: root,
      signal: t.signal,
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        ORBIT_DB_PASSWORD: password,
        ORBIT_TEST_DB_PORT: '55123',
      },
    }),
    (error) => {
      output = JSON.parse(error.stdout)
      return error.code === 101
    },
  )
  assert.deepEqual(output.args, [
    'nextest',
    'run',
    '-p',
    'orbit-storage-postgres',
    '--features',
    'test-support',
    '--test',
    'signup',
    '--test-threads=1',
  ])
  const url = new URL(output.url)
  assert.equal(decodeURIComponent(url.password), password)
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.port, '55123')
  const database = url.pathname.slice(1)
  assert.match(database, /^orbit_test_\d+_\d+$/)
  const calls = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(calls, [
    ['compose', 'exec', '-T', 'db', 'createdb', '-U', 'orbit', database],
    [
      'compose',
      'exec',
      '-T',
      'db',
      'dropdb',
      '-U',
      'orbit',
      '--force',
      database,
    ],
  ])
})
