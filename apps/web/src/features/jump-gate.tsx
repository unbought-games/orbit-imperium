import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { Field, NumberInput, Select } from '../ui/form'
import { DurationValue, NumberValue } from '../ui/number-value'
import { Timestamp } from '../ui/timestamp'
import { bodyName, label } from '../ui/format'
import { useJumpGate } from './use-jump-gate'
import styles from './jump-gate.module.css'
export function JumpGate({
  model,
  body,
}: {
  model: Coordinator
  body: string
}) {
  const a = useJumpGate(model, body)
  return (
    <section className={styles.section} aria-label="Jump Gate transfer">
      <h3>Jump ships</h3>
      <p>
        Transfer ships instantly between your moons. Resources stay behind. No
        fuel or fleet slot is used.
      </p>
      {a.source?.jump_gate && (
        <p>
          Both gates cool for{' '}
          <DurationValue milliseconds={a.source.jump_gate.cooldown_ms} /> after
          each jump. Higher levels do not shorten the cooldown.
        </p>
      )}
      <div className={styles.status}>
        <span>Source gate</span>
        <span>
          {a.source?.jump_gate && a.source.jump_gate.ready_at > a.now ? (
            <Timestamp value={a.source.jump_gate.ready_at} now={a.now} />
          ) : a.source?.levels.JumpGate ? (
            a.source.jump_gate ? (
              'Ready'
            ) : (
              'Unavailable'
            )
          ) : (
            'Not built'
          )}
        </span>
      </div>
      <Field>
        Destination moon
        <Select
          value={a.destinationId}
          disabled={a.busy}
          onChange={(e) => a.setDestination(e.target.value)}
        >
          <option value="">Choose a moon</option>
          {a.destinations.map((b) => (
            <option key={b.id} value={b.id}>
              {bodyName(b)} [{b.coordinates.galaxy}:{b.coordinates.system}:
              {b.coordinates.position}]
              {!b.levels.JumpGate
                ? ' · No gate'
                : !b.jump_gate
                  ? ' · Unavailable'
                  : b.jump_gate.ready_at > a.now
                    ? ' · Cooling'
                    : ' · Ready'}
            </option>
          ))}
        </Select>
      </Field>
      {a.destination?.jump_gate && (
        <div className={styles.status}>
          <span>Destination gate</span>
          <span>
            {!a.destination.levels.JumpGate ? (
              'Not built'
            ) : a.destination.jump_gate.ready_at > a.now ? (
              <Timestamp value={a.destination.jump_gate.ready_at} now={a.now} />
            ) : (
              'Ready'
            )}
          </span>
        </div>
      )}
      {!!a.ships.length && (
        <div className={styles.ships}>
          <div className={styles.status}>
            <strong>Stationed ships</strong>
            <Button variant="ghost" disabled={a.busy} onClick={a.selectAll}>
              Select all
            </Button>
          </div>
          {a.ships.map((ship) => (
            <Field className={styles.ship} key={ship.ship_type}>
              <span>
                {label(ship.ship_type)}
                <small>
                  <NumberValue value={ship.count} /> available
                </small>
              </span>
              <NumberInput
                aria-label={label(ship.ship_type)}
                value={a.quantities[ship.ship_type] ?? '0'}
                disabled={a.busy}
                onChange={(e) => a.setQuantity(ship.ship_type, e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}
      {a.blocker && <p>{a.blocker}</p>}
      {a.quote && (
        <div className={styles.review} aria-label="Jump review">
          <strong>Ready to transfer</strong>
          {a.quote.intent.ships.map((ship) => (
            <div key={ship.ship_type}>
              <NumberValue value={ship.count} /> {label(ship.ship_type)}
            </div>
          ))}
          <p>
            To {a.destination && bodyName(a.destination)}. Both gates will cool
            for <DurationValue milliseconds={a.quote.cooldown_ms} />.
          </p>
        </div>
      )}
      {!a.blocker &&
        !a.valid &&
        Object.values(a.quantities).some((v) => v !== '0' && v !== '') && (
          <p role="alert">
            Enter whole ship counts within the available inventory.
          </p>
        )}
      {a.error && <p role="alert">{a.error}</p>}
      {a.committed && <p role="status">Ships transferred.</p>}
      <Button
        disabled={a.busy || !!a.blocker || !a.valid || !a.canSubmit}
        onClick={() => void a.perform()}
      >
        {a.busy ? 'Confirming jump…' : a.quote ? 'Jump ships' : 'Review jump'}
      </Button>
      {a.uncertain && (
        <Button variant="secondary" onClick={() => void a.recover()}>
          Check jump status
        </Button>
      )}
    </section>
  )
}
