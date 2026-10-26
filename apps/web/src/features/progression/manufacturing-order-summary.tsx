import type { BoundProgressionOptions } from '../../client-model/commands'
import { DurationValue } from '../../ui/number-value'
import { DecisionCosts } from './detail-metrics'
import { affordabilityForecast } from './detail-insights'
import { DetailRow } from './detail-layout'
import type { manufacturingPreview } from './manufacturing-preview'
import type { ProgressionProps } from './shared'
import styles from './manufacturing-order-summary.module.css'

/** Keep the form's footprint stable without retaining a previous order or quote. */
export function ManufacturingOrderSummary({
  source,
  preview,
  view,
  body,
  title,
  now,
}: {
  source: BoundProgressionOptions | null
  preview: ReturnType<typeof manufacturingPreview>
  view: ProgressionProps['view']
  body: ProgressionProps['body']
  title: string
  now: number
}) {
  const unit = source?.terms?.type === 'Manufacture' ? source.terms : null
  const cost = preview?.terms.paid ?? unit?.unit_cost
  return (
    <dl className={styles.summary}>
      <DetailRow label="Production duration per unit">
        {unit ? <DurationValue milliseconds={unit.unit_duration_ms} /> : '—'}
      </DetailRow>
      <DetailRow label="Order">
        {preview ? `${preview.terms.quantity} × ${title}` : '—'}
      </DetailRow>
      <DetailRow label="Estimated start">
        {preview?.estimates ? (
          preview.estimates.first_start_at <= now ? (
            'Now'
          ) : (
            <>
              In{' '}
              <DurationValue
                milliseconds={preview.estimates.first_start_at - now}
              />
            </>
          )
        ) : (
          '—'
        )}
      </DetailRow>
      <DetailRow label="Order complete">
        {preview?.estimates ? (
          <>
            In{' '}
            <DurationValue
              milliseconds={Math.max(0, preview.estimates.final_due_at - now)}
            />
          </>
        ) : (
          '—'
        )}
      </DetailRow>
      {cost ? (
        <DecisionCosts
          title="New order cost"
          cost={cost}
          available={body.amounts}
          forecast={affordabilityForecast(view, body, cost)}
          placeholder={!preview}
          showAvailability={false}
        />
      ) : (
        <DetailRow label="New order cost">
          <span className={styles.costPlaceholder}>—</span>
        </DetailRow>
      )}
    </dl>
  )
}
