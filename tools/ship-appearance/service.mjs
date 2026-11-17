import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import {
  MAX_REQUEST_BYTES,
  validateRequest,
  RENDERER_VERSION,
} from '../../packages/ship-appearance/validation.mjs'
export function createRenderService({
  token,
  render,
  ready = () => true,
  renderTimeoutMs = 90_000,
}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512)
    throw Error('A 32–512 character renderer bearer token is required')
  const expected = Buffer.from(`Bearer ${token}`),
    active = new Map()
  const send = (response, status, body, headers = {}) => {
    if (!response.destroyed)
      response
        .writeHead(status, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          ...headers,
        })
        .end(JSON.stringify(body))
  }
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      send(response, ready() ? 200 : 503, {
        version: 1,
        renderer_version: RENDERER_VERSION,
        ready: ready(),
        capabilities: { cancel: true, retry: true, max_concurrent: 1 },
      })
      return
    }
    const actual = Buffer.from(request.headers.authorization ?? '')
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      send(response, 401, { error: 'unauthorized' })
      return
    }
    const cancel = request.url?.match(/^\/v1\/render\/([a-f0-9-]{36})$/i)
    if (request.method === 'DELETE' && cancel) {
      const controller = active.get(cancel[1])
      controller?.abort(Error('Render canceled'))
      send(response, controller ? 202 : 404, {
        version: 1,
        request_id: cancel[1],
        canceled: !!controller,
      })
      return
    }
    if (request.method !== 'POST' || request.url !== '/v1/render') {
      send(response, 404, { error: 'not_found' })
      return
    }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
      send(response, 415, { error: 'json_required' })
      return
    }
    let input
    try {
      if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) {
        send(response, 413, { error: 'request_too_large' })
        request.resume()
        return
      }
      const chunks = []
      let length = 0
      for await (const chunk of request) {
        length += chunk.length
        if (length > MAX_REQUEST_BYTES) {
          send(response, 413, { error: 'request_too_large' })
          return
        }
        chunks.push(chunk)
      }
      input = validateRequest(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      )
    } catch {
      send(response, 400, { error: 'invalid_render_request' })
      return
    }
    if (active.size) {
      send(response, 429, { error: 'renderer_busy' }, { 'retry-after': '1' })
      return
    }
    const controller = new AbortController()
    active.set(input.request_id, controller)
    const timeout = setTimeout(
      () => controller.abort(Error('Render preparation timed out')),
      renderTimeoutMs,
    )
    const close = () => {
      if (!response.writableEnded)
        controller.abort(Error('Caller disconnected'))
    }
    response.on('close', close)
    try {
      const result = await render(input, controller.signal)
      if (controller.signal.aborted)
        send(response, 409, { error: 'render_canceled' })
      else send(response, 200, result)
    } catch {
      send(response, controller.signal.aborted ? 409 : 503, {
        error: controller.signal.aborted
          ? 'render_canceled'
          : 'render_unavailable',
      })
    } finally {
      clearTimeout(timeout)
      response.off('close', close)
      active.delete(input.request_id)
    }
  })
  server.on('close', () => {
    for (const controller of active.values())
      controller.abort(Error('Renderer stopped'))
  })
  // Transport/readiness bounds, not routine test execution deadlines.
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  return {
    server,
    cancelAll: () => {
      for (const controller of active.values())
        controller.abort(Error('Renderer stopped'))
    },
  }
}
