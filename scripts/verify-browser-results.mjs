// Compare the native output of the command CI actually ran with its intended
// selection. A collect-only check cannot observe a runtime skip or a misrouted
// Make/npm invocation.
import { readFile } from 'node:fs/promises'
import { listBrowserCases, verifyExecutedCases } from './playwright-cases.mjs'

const [suite, shard] = process.argv.slice(2)
const directory = {
  homepage: 'browser-homepage',
  journeys: 'browser-ui',
  components: 'components',
}[suite]
if (!directory) throw Error(`Unknown required browser boundary: ${suite}`)
const actual = JSON.parse(
  await readFile(
    new URL(`../test-results/${directory}/results.json`, import.meta.url),
    'utf8',
  ),
)
verifyExecutedCases(await listBrowserCases(suite, { shard }), actual)
