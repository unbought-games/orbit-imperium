import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { bundledAssets, loadInstalledPackages, assetConfig } from './assets.mjs'
import { createRenderService } from './service.mjs'
import { renderRequest } from './renderer.mjs'

const token = process.env.ORBIT_SHIP_RENDERER_TOKEN
if (!token || token.length < 32)
  throw Error('Set ORBIT_SHIP_RENDERER_TOKEN to at least 32 random characters')
const dist = new URL('./dist/', import.meta.url)
await stat(new URL('worker.html', dist))
const [packages, bundled] = await Promise.all([
  loadInstalledPackages(),
  bundledAssets(),
])
const config = assetConfig()
const staticServer = http.createServer(async (request, response) => {
  const path = request.url ?? ''
  if (
    request.method !== 'GET' ||
    (!/^\/assets\/[\w.-]+\.(js|css)$/.test(path) && path !== '/worker.html')
  ) {
    response.writeHead(404).end()
    return
  }
  try {
    const bytes = await readFile(new URL('.' + path, dist))
    const type = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : 'text/html'
    response
      .writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
      .end(bytes)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => staticServer.listen(0, '127.0.0.1', resolve))
const workerOrigin = `http://127.0.0.1:${staticServer.address().port}`
let browser = await chromium.launch({ headless: true })
const service = createRenderService({
  token,
  ready: () => browser.isConnected(),
  render: async (request, signal) => {
    const asset = await packages.load(
      request.package_id + '/' + request.package_revision,
      signal,
    )
    if (!browser.isConnected())
      browser = await chromium.launch({ headless: true })
    return renderRequest(
      request,
      { asset, browser, workerOrigin, bundled, config },
      signal,
    )
  },
})
await new Promise((resolve) =>
  service.server.listen(
    Number(process.env.ORBIT_SHIP_RENDERER_PORT ?? 52941),
    process.env.ORBIT_SHIP_RENDERER_HOST ?? '127.0.0.1',
    resolve,
  ),
)
console.log(`Ship renderer ready on port ${service.server.address().port}`)
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  service.cancelAll()
  service.server.closeAllConnections()
  service.server.close()
  staticServer.closeAllConnections()
  staticServer.close()
  await browser.close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
