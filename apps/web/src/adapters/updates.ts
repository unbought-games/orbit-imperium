import {
  sameBinding,
  type Binding,
  type GameUpdate,
  type GameUpdatesPort,
} from '../client-model/commands'
import { validate } from '../client-model/schema'
import { HttpError } from './http'

const maximumFrame = 256 * 1024
function message(frame: string, binding: Binding): GameUpdate | null {
  let event = 'message',
    id: string | undefined
  const data: string[] = []
  for (const line of frame.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':'),
      field = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'id') id = value
    else if (field === 'data') data.push(value)
  }
  if (event !== 'game-update' || data.length === 0) return null
  const update = validate<GameUpdate>('GameUpdate', JSON.parse(data.join('\n')))
  if (
    !sameBinding(update.binding, binding) ||
    (update.cursor !== null ? id !== update.cursor : id !== undefined) ||
    id?.includes('\0')
  )
    throw Error('Invalid update binding or cursor')
  return update
}
export function createGameUpdatesPort(baseUrl = ''): GameUpdatesPort {
  return {
    async subscribe(binding, after, options) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      const cancel = () => {
        void reader?.cancel().catch(() => {})
      }
      try {
        const response = await fetch(
          `${baseUrl}/api/v4/universes/${encodeURIComponent(binding.universe)}/updates?epoch=${encodeURIComponent(binding.epoch)}`,
          {
            credentials: 'same-origin',
            mode: 'same-origin',
            signal: options.signal,
            headers: {
              Accept: 'text/event-stream',
              ...(after ? { 'Last-Event-ID': after } : {}),
            },
          },
        )
        if (!response.ok)
          throw new HttpError(response.status, 'UpdateStreamUnavailable')
        if (
          !response.body ||
          !response.headers.get('Content-Type')?.startsWith('text/event-stream')
        )
          throw Error('Invalid update stream')
        reader = response.body.getReader()
        options.signal.addEventListener('abort', cancel, { once: true })
        if (options.signal.aborted) return
        const decoder = new TextDecoder()
        let buffer = ''
        while (!options.signal.aborted) {
          const chunk = await reader.read()
          if (chunk.done || options.signal.aborted) break
          buffer += decoder.decode(chunk.value, { stream: true })
          for (;;) {
            const boundary = /\r?\n\r?\n/.exec(buffer)
            if (!boundary) break
            if (boundary.index > maximumFrame)
              throw Error('Update frame too large')
            const frame = buffer.slice(0, boundary.index)
            buffer = buffer.slice(boundary.index + boundary[0].length)
            const update = message(frame, binding)
            if (update && !options.signal.aborted)
              await options.onUpdate(update)
          }
          if (buffer.length > maximumFrame)
            throw Error('Update frame too large')
        }
      } finally {
        options.signal.removeEventListener('abort', cancel)
        await reader?.cancel().catch(() => {})
        options.onDisconnect()
      }
    },
  }
}
