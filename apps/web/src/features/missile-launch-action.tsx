import type { RefObject } from 'react'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import { ActionSheet } from '../ui/action-sheet'
import { ActionPopover } from '../ui/action-popover'
import { useMobileLayout } from '../ui/use-mobile-layout'
import { DurationValue, NumberValue } from '../ui/number-value'
import { label, coordinates } from '../ui/format'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { useMissileAction } from './use-missile-action'
import styles from './missiles.module.css'
type S = components['schemas']
export type MissileLaunchPresentation = {
  open: boolean
  onOpenChange: (open: boolean) => void
  opener: RefObject<HTMLButtonElement | null>
}
export function MissileLaunchAction({
  model,
  origin,
  position,
  open,
  onOpenChange,
  opener,
}: {
  model: Coordinator
  origin: string
  position: S['GalaxyPosition4']
} & MissileLaunchPresentation) {
  const mobile = useMobileLayout()
  const body = position.body
  const target = body
    ? { id: body.id, expected_kind: body.kind, expected_owner: body.owner }
    : undefined
  const action = useMissileAction(model, origin, target)
  if (!body) return null
  const available =
    action.state.view?.bodies
      .find((b) => b.id === origin)
      ?.inventories.find(
        (x) =>
          x.item.kind === 'Missile' && x.item.id === 'InterplanetaryMissile',
      )?.count ?? '0'
  const defenses =
    action.state.view?.protocol !== 2
      ? (action.state.view?.catalog.filter((e) => e.key.kind === 'Defense') ??
        [])
      : []
  const form = (
    <div className={styles.form}>
      <p>
        Available here: <NumberValue value={available} /> Interplanetary
        Missiles
      </p>
      <Field>
        Missile quantity
        <NumberInput
          aria-label="Missile quantity"
          value={action.count}
          disabled={action.busy || action.committed}
          onChange={(e) => action.setCount(e.target.value)}
        />
      </Field>
      <Field>
        Primary defense
        <select
          aria-label="Primary defense"
          value={action.primary ?? ''}
          disabled={action.busy || action.committed}
          onChange={(e) =>
            action.setPrimary(
              (e.target.value as S['MissileIntent4']['primary']) || null,
            )
          }
        >
          <option value="">No preference</option>
          {defenses.map((e) => (
            <option key={e.key.id} value={e.key.id}>
              {label(e.key.id)}
            </option>
          ))}
        </select>
      </Field>
      {!action.valid && (
        <p role="alert">Enter a positive whole missile quantity.</p>
      )}
      {action.quote && (
        <dl className={styles.stats}>
          <div>
            <dt>Flight time</dt>
            <dd>
              <DurationValue milliseconds={action.quote.duration_ms} />
            </dd>
          </div>
          <div>
            <dt>Range</dt>
            <dd>
              {action.quote.distance} / {action.quote.range} systems
            </dd>
          </div>
        </dl>
      )}
      <p className={styles.note}>
        Interceptors defend automatically. Surviving missiles destroy defenses
        permanently. No fleet slot or extra fuel is needed. Launches cannot be
        recalled.
      </p>
      {action.error && <p role="alert">{action.error}</p>}
      {action.committed ? (
        <>
          <p role="status">Missiles launched. Track their arrival in Fleets.</p>
          <Button variant="secondary" onClick={action.reset}>
            Prepare another launch
          </Button>
        </>
      ) : (
        <Button
          disabled={
            action.busy ||
            !action.valid ||
            BigInt(available) < (action.valid ? BigInt(action.count) : 0n)
          }
          onClick={() =>
            void action.perform(action.quote ? 'launch' : 'review')
          }
        >
          {action.busy
            ? 'Confirming…'
            : action.quote
              ? 'Launch missiles — no recall'
              : 'Review missile launch'}
        </Button>
      )}
      {action.uncertain && (
        <Button variant="secondary" onClick={() => void action.recover()}>
          Check launch status
        </Button>
      )}
    </div>
  )
  const presentation = {
    open,
    onOpenChange,
    title: 'Launch missiles',
    description: `${body.name ?? body.kind} · ${coordinates(position)}`,
  }
  return mobile ? (
    <ActionSheet {...presentation} returnFocusRef={opener}>
      {form}
    </ActionSheet>
  ) : (
    <ActionPopover {...presentation} anchorRef={opener}>
      {form}
    </ActionPopover>
  )
}
