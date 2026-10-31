import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'
import { load } from 'js-yaml'

test('CI database groups compile and run every binary exactly once, including new suites', async (t) => {
  const directory = temporaryDirectory(t)
  copyFileSync(join(root, 'Makefile'), join(directory, 'Makefile'))
  const tests = join(directory, 'crates/storage-postgres/tests')
  mkdirSync(tests, { recursive: true })
  const suites = readdirSync(join(root, 'crates/storage-postgres/tests'))
    .filter(name => name.endsWith('.rs')).map(name => name.slice(0, -3))
  suites.push('future_regression')
  for (const suite of suites) writeFileSync(join(tests, `${suite}.rs`), '')
  const log = join(directory, 'events.jsonl')
  executable(join(directory, 'cargo'), `
    require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({prepare: process.argv.slice(2)}) + '\\n');
  `)
  executable(join(directory, 'sh'), `
    require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({run: process.argv[3]}) + '\\n');
  `)
  const env = { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}` }
  delete env.MAKEFLAGS
  delete env.MFLAGS
  delete env.DB_SUITES
  const workflow = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  const selected = []
  for (const group of workflow.jobs.database.strategy.matrix.group) {
    writeFileSync(log, '')
    await exec('make', [`test-db-${group}`], { cwd: directory, env, signal: t.signal })
    const events = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
    const { prepare } = events.shift()
    const compiled = prepare.flatMap((arg, index) => arg === '--test' ? [prepare[index + 1]] : [])
    const ran = events.map(event => event.run).sort()
    assert.ok(ran.length > 0)
    assert.deepEqual(compiled.sort(), ran, `${group} only compiles its selected binaries`)
    selected.push(...ran)
  }
  assert.equal(new Set(selected).size, selected.length, 'groups must not duplicate suites')
  assert.deepEqual(selected.sort(), suites.sort(), 'groups must not omit suites')
})

test('Make prepares every database suite before bounded parallel execution', async (t) => {
  const directory = temporaryDirectory(t)
  const suites = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
  copyFileSync(join(root, 'Makefile'), join(directory, 'Makefile'))
  const tests = join(directory, 'crates/storage-postgres/tests')
  mkdirSync(tests, { recursive: true })
  for (const suite of suites) writeFileSync(join(tests, `${suite}.rs`), '')
  const log = join(directory, 'events.jsonl')
  executable(join(directory, 'cargo'), `
    const assert = require('node:assert/strict');
    assert.deepEqual(process.argv.slice(2), ['nextest', 'run', '-p', 'orbit-storage-postgres', '--features', 'test-support', ...${JSON.stringify([...suites].sort().flatMap(suite => ['--test', suite]))}, '--no-run']);
    require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({event: 'prepared'}) + '\\n');
  `)
  executable(join(directory, 'sh'), `
    const assert = require('node:assert/strict');
    assert.equal(process.argv[2], 'scripts/test-db.sh');
    const suite = process.argv[3];
    const emit = event => require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({event, suite}) + '\\n');
    emit('start');
    setTimeout(() => { emit('end'); process.exit(suite === process.env.FAIL_SUITE ? 1 : 0); }, 150);
  `)
  const env = { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}` }
  delete env.MAKEFLAGS
  delete env.MFLAGS
  delete env.DB_JOBS
  delete env.FAIL_SUITE
  for (const jobs of [4, 2]) {
    writeFileSync(log, '')
    await exec('make', ['test-db', ...(jobs === 4 ? [] : [`DB_JOBS=${jobs}`])], {
      cwd: directory, env, signal: t.signal,
    })
    const events = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(events.shift(), { event: 'prepared' })
    const active = new Set()
    let maximum = 0
    for (const { event, suite } of events) {
      if (event === 'start') {
        assert.equal(active.has(suite), false)
        active.add(suite)
        maximum = Math.max(maximum, active.size)
      } else {
        assert.equal(event, 'end')
        assert.equal(active.delete(suite), true)
      }
    }
    assert.equal(active.size, 0)
    assert.ok(maximum > 1 && maximum <= jobs, `${maximum} concurrent suites with limit ${jobs}`)
    assert.deepEqual(events.filter(e => e.event === 'start').map(e => e.suite).sort(), [...suites].sort())
  }
  await assert.rejects(exec('make', ['test-db'], {
    cwd: directory, env: { ...env, FAIL_SUITE: 'alpha' }, signal: t.signal,
  }), error => error.code !== 0)
})

for (const filter of [null, 'test(compatibility::) | test(legacy_rules_)'])
test(`database runner encodes passwords, selects a serial suite and cleans up on failure (${filter ?? 'all'})`, async (t) => {
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
    exec('sh', ['scripts/test-db.sh', 'signup', ...(filter ? [filter] : [])], {
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
    ...(filter ? ['-E', filter] : []),
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
