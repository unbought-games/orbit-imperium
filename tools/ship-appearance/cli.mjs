import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  validateRequest,
  MAX_OUTPUT_BYTES,
} from '../../packages/ship-appearance/validation.mjs'
const [file, directory] = process.argv.slice(2)
if (!file || !directory)
  throw Error(
    'Usage: node tools/ship-appearance/cli.mjs request.json output-directory',
  )
const request = validateRequest(JSON.parse(await readFile(file, 'utf8')))
const token = process.env.ORBIT_SHIP_RENDERER_TOKEN
if (!token) throw Error('Set ORBIT_SHIP_RENDERER_TOKEN')
const response = await fetch(
  new URL(
    '/v1/render',
    process.env.ORBIT_SHIP_RENDERER_URL ?? 'http://127.0.0.1:52941',
  ),
  {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(100_000),
  },
)
if (!response.ok) throw Error(`Renderer returned ${response.status}`)
const result = await response.json()
if (
  result.version !== 1 ||
  result.request_id !== request.request_id ||
  !Array.isArray(result.variants) ||
  result.variants.length > 8
)
  throw Error('Invalid renderer response')
await mkdir(directory, { recursive: true })
let total = 0
for (const variant of result.variants) {
  if (
    !['image/png', 'image/webp'].includes(variant.mime_type) ||
    !Number.isInteger(variant.width) ||
    !Number.isInteger(variant.height) ||
    variant.width < 1 ||
    variant.width > 2048 ||
    variant.height < 1 ||
    variant.height > 2048
  )
    throw Error('Invalid variant')
  const bytes = Buffer.from(variant.data_base64, 'base64')
  total += bytes.length
  if (total > MAX_OUTPUT_BYTES) throw Error('Output too large')
  const name = `${variant.width}x${variant.height}.${variant.mime_type.slice(6)}`
  await writeFile(join(directory, name), bytes)
}
console.log(`Wrote ${result.variants.length} variants for ${result.request_id}`)
