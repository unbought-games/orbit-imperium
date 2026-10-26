import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homepageTemplate } from './homepage-template.mjs'

test('standalone homepage uses the same source document and preserves shared metadata/bootstrap contracts', () => {
  const source = readFileSync('apps/web/index.html', 'utf8')
  const html = homepageTemplate(source)
  assert.equal(html.replace('/src/landing-main.tsx', '/src/main.tsx'), source)
  assert.ok(html.includes('<!--orbit-page-metadata:end-->'))
  assert.ok(html.includes('<script id="orbit-bootstrap" type="application/json"></script>'))
  assert.throws(() => homepageTemplate(source.replace('<!--orbit-page-metadata:end-->', '')))
  assert.throws(() => homepageTemplate(source + '<script src="/src/main.tsx"></script>'))
})
