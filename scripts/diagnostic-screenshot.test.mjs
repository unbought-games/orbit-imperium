import { runInNewContext } from 'node:vm'
import { captureCatalog } from '../apps/web/tests/fixtures/catalog-capture.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import {
  captureFailureScreenshots,
  diagnosticScreenshot,
} from '../apps/web/tests/fixtures/diagnostic-screenshot.ts'
import config from '../playwright.config.ts'
import componentConfig from '../playwright.components.config.ts'

test('diagnostic capture is opt-in and forwards options without swallowing failures', async (t) => {
  const original = process.env.ORBIT_TEST_SCREENSHOTS
  t.after(() => {
    if (original === undefined) delete process.env.ORBIT_TEST_SCREENSHOTS
    else process.env.ORBIT_TEST_SCREENSHOTS = original
  })
  const calls = []
  const target = {
    async screenshot(options) {
      calls.push(options)
    },
  }
  const options = {
    path: 'evidence.png',
    fullPage: true,
    animations: 'disabled',
  }

  delete process.env.ORBIT_TEST_SCREENSHOTS
  await diagnosticScreenshot(target, options)
  for (const value of ['', '0', 'false']) {
    process.env.ORBIT_TEST_SCREENSHOTS = value
    await diagnosticScreenshot(target, options)
  }
  assert.deepEqual(calls, [], 'routine tests must not invoke screenshot at all')

  process.env.ORBIT_TEST_SCREENSHOTS = '1'
  await diagnosticScreenshot(target, options)
  assert.deepEqual(calls, [options])
  assert.equal(calls[0], options)
  await assert.rejects(
    diagnosticScreenshot(
      {
        async screenshot() {
          throw new Error('capture failed')
        },
      },
      options,
    ),
    /capture failed/,
  )
})

test('failure evidence is captured only for unexpected failures and preserves the original error', async () => {
  const calls = [],
    attachments = []
  const image = Buffer.from('png')
  const page = {
    isClosed: () => false,
    async screenshot(options) {
      calls.push(options)
      return image
    },
  }
  const info = {
    status: 'passed',
    expectedStatus: 'passed',
    annotations: [],
    outputPath: (name) => `/test/${name}`,
    async attach(name, options) {
      attachments.push({ name, ...options })
    },
  }
  await captureFailureScreenshots([page], info)
  await captureFailureScreenshots([page], { ...info, status: 'skipped' })
  await captureFailureScreenshots([page], {
    ...info,
    status: 'failed',
    expectedStatus: 'failed',
  })
  assert.equal(calls.length, 0)

  await captureFailureScreenshots(
    [
      { isClosed: () => true },
      {
        isClosed: () => false,
        async screenshot() {
          throw Error('page crashed')
        },
      },
      page,
    ],
    { ...info, status: 'failed' },
  )
  assert.deepEqual(calls, [{ path: '/test/failure-3.png', timeout: 5_000 }])
  assert.deepEqual(attachments, [
    {
      name: 'failure-3',
      path: '/test/failure-3.png',
      contentType: 'image/png',
    },
  ])
  assert.match(info.annotations[0].description, /page crashed/)
  await captureFailureScreenshots([page], { ...info, status: 'timedOut' })
  assert.equal(attachments.length, 2)
})

test('browser diagnostics stay gated and all specs use the failure-only fixture', () => {
  assert.equal(
    config.use.screenshot,
    'off',
    'native only-on-failure also captures passing contexts',
  )
  const directory = new URL('../apps/web/tests/', import.meta.url)
  const directCaptures = []
  for (const file of readdirSync(directory, { recursive: true })) {
    if (!file.endsWith('.ts')) continue
    const source = ts.createSourceFile(
      file,
      readFileSync(new URL(file, directory), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    if (file.endsWith('.spec.ts')) {
      const testImport = source.statements.find(
        (node) =>
          ts.isImportDeclaration(node) &&
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.some(
            (item) => item.name.text === 'test',
          ),
      )
      assert.equal(
        testImport?.moduleSpecifier.text,
        file.startsWith('components/') ? './fixture' : './fixtures/test',
        file,
      )
    }
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'screenshot'
      )
        directCaptures.push(file)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(directCaptures, [
    'fixtures/diagnostic-screenshot.ts',
    'fixtures/diagnostic-screenshot.ts',
  ])
  assert.equal(componentConfig.use.screenshot, 'off')
  assert.equal(
    componentConfig.use.trace.screenshots,
    false,
    'successful traces must not capture screenshots',
  )
  const wrapper = ts.createSourceFile(
    'fixture.ts',
    readFileSync(new URL('components/fixture.ts', directory), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const inherited = wrapper.statements.find(
    (node) =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === '../fixtures/test',
  )
  const importedTest = inherited?.importClause?.namedBindings?.elements?.find(
    (item) => item.propertyName?.text === 'test',
  )
  assert.ok(importedTest, 'components inherit the failure-only fixture')
  const exportedTest = wrapper.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(wrapper) === 'test')
  assert.equal(
    exportedTest?.initializer?.expression?.getText(wrapper),
    `${importedTest.name.text}.extend`,
    'component test must extend that fixture',
  )
})

test('disabled catalog evidence never touches the page, including image preparation', async (t) => {
  const original = process.env.ORBIT_TEST_SCREENSHOTS
  t.after(() => {
    if (original === undefined) delete process.env.ORBIT_TEST_SCREENSHOTS
    else process.env.ORBIT_TEST_SCREENSHOTS = original
  })
  const page = new Proxy(
    {},
    {
      get(_, property) {
        assert.fail(`disabled capture touched page.${String(property)}`)
      },
    },
  )
  for (const value of [undefined, '', '0', 'false']) {
    if (value === undefined) delete process.env.ORBIT_TEST_SCREENSHOTS
    else process.env.ORBIT_TEST_SCREENSHOTS = value
    await captureCatalog(page, 'catalog.png')
  }
})

test('enabled catalog evidence prepares images, captures both views and restores scroll', async (t) => {
  const original = process.env.ORBIT_TEST_SCREENSHOTS
  t.after(() => {
    if (original === undefined) delete process.env.ORBIT_TEST_SCREENSHOTS
    else process.env.ORBIT_TEST_SCREENSHOTS = original
  })
  process.env.ORBIT_TEST_SCREENSHOTS = '1'
  const calls = []
  const images = [
    {
      complete: true,
      naturalWidth: 64,
      loading: 'lazy',
      async decode() {
        assert.equal(this.loading, 'eager')
        calls.push('decode')
      },
    },
  ]
  const page = {
    async evaluate(callback, argument) {
      return runInNewContext(`(${callback.toString()})(argument)`, {
        argument,
        scrollX: 7,
        scrollY: 23,
        document: { documentElement: { scrollHeight: 2000 } },
        window: {
          scrollTo: (options) =>
            calls.push(JSON.parse(JSON.stringify(options))),
        },
      })
    },
    locator(selector) {
      assert.equal(selector, 'main img')
      return { evaluateAll: async (callback) => callback(images) }
    },
    async screenshot(options) {
      calls.push(options)
    },
  }
  await captureCatalog(page, 'catalog.png')
  assert.deepEqual(calls, [
    { top: 2000, behavior: 'instant' },
    'decode',
    { path: 'catalog-catalog-viewport.png' },
    { path: 'catalog.png', fullPage: true },
    { left: 7, top: 23, behavior: 'instant' },
  ])
})
