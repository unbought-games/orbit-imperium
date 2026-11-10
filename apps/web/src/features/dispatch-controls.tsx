import type { ComponentProps } from 'react'
import { DispatchCargoCapacity } from './dispatch-cargo-capacity'
import { DispatchTiming } from './dispatch-timing'
import { InputWithAction, FillButton } from '../ui/input-with-action'
import { NumberInput, RangeInput, Field } from '../ui/form'
import { ResourceMark } from '../ui/resource-mark'
import { Button } from '../ui/button'
import { resourceNames } from '../client-model/resources'
import styles from './missions.module.css'

export function DispatchCargoControls({
  cargo,
  space,
  message,
  disabled,
  onNormalize,
  onChange,
  onFill,
}: {
  cargo: string[]
  space: ComponentProps<typeof DispatchCargoCapacity>['space']
  message: string
  disabled: boolean
  onNormalize: (cargo: string[]) => void
  onChange: (cargo: string[]) => void
  onFill: (resource: 'all' | (typeof resourceNames)[number]) => void
}) {
  return (
    <fieldset className={styles.cargoFields} aria-label="Cargo">
      <div className={styles.cargoHeader}>
        <span>Cargo</span>
        <DispatchCargoCapacity space={space} message={message} />
      </div>
      <div className={styles.cargoInputs}>
        {resourceNames.map((resource, i) => (
          <InputWithAction className={styles.cargoInput} key={resource}>
            <Field title={resource[0].toUpperCase() + resource.slice(1)}>
              <ResourceMark resource={resource} />
              <NumberInput
                aria-label={resource[0].toUpperCase() + resource.slice(1)}
                value={cargo[i]}
                placeholder="0"
                onBlur={(e) => {
                  if (!e.target.value.trim())
                    onNormalize(cargo.map((n, j) => (i === j ? '0' : n)))
                }}
                onChange={(e) => {
                  onChange(cargo.map((n, j) => (i === j ? e.target.value : n)))
                }}
              />
            </Field>
            <FillButton
              aria-label={`Max ${resource}`}
              title={`Max ${resource}, reserving space for other cargo and fuel`}
              disabled={disabled}
              onClick={() => onFill(resource)}
            />
          </InputWithAction>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={disabled}
          title="Keep entered cargo and split remaining space evenly, reserving deuterium for fuel"
          onClick={() => onFill('all')}
        >
          Add all
        </Button>
      </div>
    </fieldset>
  )
}

export function DispatchFlightControls({
  speed,
  onChange,
  timing,
}: {
  speed: number
  onChange: (speed: number) => void
  timing: ComponentProps<typeof DispatchTiming>
}) {
  return (
    <fieldset
      className={styles.flightSettings}
      aria-label="Speed and flight estimates"
    >
      <Field>
        <span className={styles.speedLabel}>
          Speed <span aria-hidden="true">{speed}%</span>
        </span>
        <RangeInput
          aria-label="Speed"
          aria-valuetext={`${speed}%`}
          min={10}
          max={100}
          step={10}
          value={speed}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </Field>
      <DispatchTiming {...timing} />
    </fieldset>
  )
}
