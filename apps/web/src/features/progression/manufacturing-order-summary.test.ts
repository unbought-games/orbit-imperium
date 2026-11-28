import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ManufacturingOrderSummary } from './manufacturing-order-summary'
import { manufacturingPreview } from './manufacturing-preview'
import { progressionFixture } from './progression-test-fixture'

function renderDraft(queueEnds: number | undefined, now: number) {
  const { view, source } = progressionFixture()
  const body = view.bodies[0]
  view.sampled_at = 1000
  if (queueEnds !== undefined) {
    view.progression.manufacturing = [
      {
        id: 'preceding-order',
        body: body.id,
        item: { kind: 'Defense', id: 'RocketLauncher' },
        quantity: '1',
        completed_prefix: '0',
        remaining: '1',
        paid: body.amounts,
        accepted_at: 1000,
        first_start_at: 1000,
        next_due_at: queueEnds,
        final_due_at: queueEnds,
        unit_duration_ms: queueEnds - 1000,
        state: 'Producing',
        can_cancel: false,
      },
    ]
  }
  return renderToStaticMarkup(
    createElement(ManufacturingOrderSummary, {
      source,
      preview: manufacturingPreview(source, view, '2'),
      view,
      body,
      title: 'Small Cargo',
      now,
    }),
  )
}

it.each([1000, 21000, 71000])(
  'keeps a one-minute idle draft at one minute at server time %i',
  (now) => {
    const html = renderDraft(undefined, now)
    expect(html).toContain('<dt>Estimated start</dt><dd>Now</dd>')
    expect(html).toContain('<dt>Order complete</dt><dd>In 1m</dd>')
  },
)

it.each([
  [1000, 'In 20s', '1m 20s'],
  [6000, 'In 15s', '1m 15s'],
  [21000, 'Now', '1m'],
  [31000, 'Now', '1m'],
] as const)(
  'counts down the queue wait at server time %i and keeps the full draft duration',
  (now, start, finish) => {
    const html = renderDraft(21000, now)
    expect(html).toContain(`<dt>Estimated start</dt><dd>${start}</dd>`)
    expect(html).toContain(`<dt>Order complete</dt><dd>In ${finish}</dd>`)
  },
)
