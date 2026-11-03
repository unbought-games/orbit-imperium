import { useRef, useState } from 'react'
import { usePhalanxScan } from './use-phalanx-scan'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { Button, ButtonLink } from '../ui/button'
import { ActionSheet } from '../ui/action-sheet'
import { ResourceQuantity } from '../ui/number-value'
import { coordinates } from '../ui/format'
import { routeTarget } from '../shell/route-target'
import { scanCost, phalanxRange } from './phalanx-model'
import { dispatchFailure } from '../client-model/dispatch-validation'
export function PhalanxAction({
  model,
  origin,
  position,
  universe,
}: {
  model: Coordinator
  origin: string
  position: components['schemas']['GalaxyPosition4']
  universe: string
}) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const {
    source,
    attempt,
    pending,
    receipt,
    report,
    reason,
    scan,
    busy,
    error,
  } = usePhalanxScan(model, origin, position)
  return (
    <>
      <Button ref={opener} variant="secondary" onClick={() => setOpen(true)}>
        Scan planet
      </Button>
      <ActionSheet
        initialSnap={90}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={opener}
        title="Sensor Phalanx"
        description={`${position.body?.name ?? 'Planet'} · ${coordinates(position)}`}
      >
        <p>
          Source: Moon {source && coordinates(source)} · Level{' '}
          {source?.levels.SensorPhalanx ?? 0} · Range{' '}
          {String(
            phalanxRange(source?.levels.SensorPhalanx ?? 0) < 0n
              ? 0n
              : phalanxRange(source?.levels.SensorPhalanx ?? 0),
          )}{' '}
          systems in this galaxy.
        </p>
        <p>
          Spend <ResourceQuantity resource="deuterium" value={scanCost} /> from
          this moon. Empty scans cost the same. Saved reports never update;
          fresh information requires another paid scan.
        </p>
        <p>
          Available locally:{' '}
          <ResourceQuantity
            resource="deuterium"
            value={source?.amounts.deuterium ?? '0'}
          />
        </p>
        {reason && <p role="status">{reason}</p>}
        {(error || receipt?.status === 'Rejected') && (
          <p role="alert">
            {error ||
              (receipt?.status === 'Rejected'
                ? dispatchFailure(receipt.code)
                : '')}
          </p>
        )}
        {report && (
          <p>
            <ButtonLink {...routeTarget(universe, 'reports', origin, report)}>
              Open saved scan
            </ButtonLink>
          </p>
        )}
        <Button
          disabled={busy || !!pending || !!reason}
          onClick={() => void scan()}
        >
          {busy || pending
            ? 'Confirming scan…'
            : report
              ? 'Scan again — spend 5,000 deuterium'
              : 'Scan — spend 5,000 deuterium'}
        </Button>
        {attempt?.status === 'uncertain' && (
          <Button
            variant="secondary"
            onClick={() => void model.recover(attempt.envelope.command_id)}
          >
            Check scan status
          </Button>
        )}
      </ActionSheet>
    </>
  )
}
