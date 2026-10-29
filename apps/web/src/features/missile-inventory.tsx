import { useMissileAction } from './use-missile-action'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import { NumberValue } from '../ui/number-value'
import { label } from '../ui/format'
import type { ProgressionProps } from './progression/shared'
import type { components } from '../contracts'
import styles from './missiles.module.css'
export function SiloSummary({ body }: { body: ProgressionProps['body'] }) {
  if (!body.silo) return null
  return (
    <section className={styles.silo} aria-label="Missile silo capacity">
      <h3>Missile silo</h3>
      <dl className={styles.stats}>
        <div>
          <dt>Occupied</dt>
          <dd>
            <NumberValue value={body.silo.occupied} />
          </dd>
        </div>
        <div>
          <dt>Reserved in queue</dt>
          <dd>
            <NumberValue value={body.silo.reserved} />
          </dd>
        </div>
        <div>
          <dt>Total slots</dt>
          <dd>
            <NumberValue value={body.silo.total} />
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        Queued missiles reserve space immediately. Upgrades add space only when
        completed. Empty the silo and finish queued missiles before demolition.
      </p>
    </section>
  )
}
export function ScrapMissiles({
  coordinator,
  body,
  item,
}: Pick<ProgressionProps, 'coordinator' | 'body'> & {
  item: components['schemas']['MissileId']
}) {
  const a = useMissileAction(coordinator, body.id)
  return (
    <details className={styles.silo}>
      <summary>Scrap {label(item)}</summary>
      <div className={styles.form}>
        <p>
          Deletes completed missiles and frees silo space. No resources are
          refunded.
        </p>
        <Field>
          Scrap quantity
          <NumberInput
            aria-label="Scrap quantity"
            value={a.count}
            onChange={(e) => a.setCount(e.target.value)}
            disabled={a.busy || a.committed}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!a.valid || a.busy || a.committed}
          onClick={() => void a.perform(item)}
        >
          Scrap without refund
        </Button>
        {a.error && <p role="alert">{a.error}</p>}
        {a.committed && (
          <>
            <p role="status">Missiles scrapped.</p>
            <Button variant="secondary" onClick={a.reset}>
              Scrap more missiles
            </Button>
          </>
        )}
        {a.uncertain && (
          <Button onClick={() => void a.recover()}>Check scrap status</Button>
        )}
      </div>
    </details>
  )
}
