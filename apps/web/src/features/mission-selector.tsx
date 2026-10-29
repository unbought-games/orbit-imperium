import { useId } from 'react'
import {
  dispatchMissions,
  missionOptions,
  type DispatchMission,
} from './mission-options'
import styles from './mission-selector.module.css'

export function MissionSelector({
  value,
  available,
  onChange,
}: {
  value: DispatchMission
  available: readonly string[]
  onChange: (mission: DispatchMission) => void
}) {
  const id = useId()
  return (
    <fieldset className={styles.selector}>
      <legend>Mission</legend>
      <div className={styles.choices}>
        {dispatchMissions
          .filter((mission) => mission === value || available.includes(mission))
          .map((mission) => {
            const { icon: Icon, description } = missionOptions[mission]
            return (
              <label
                className={styles.choice}
                key={mission}
                title={description}
              >
                <input
                  type="radio"
                  name={id}
                  value={mission}
                  checked={mission === value}
                  aria-describedby={
                    mission === value ? `${id}-description` : undefined
                  }
                  onChange={() => onChange(mission)}
                />
                <span>
                  <Icon size={18} aria-hidden="true" />
                  {mission}
                </span>
              </label>
            )
          })}
      </div>
      <p id={`${id}-description`} className={styles.description}>
        {missionOptions[value].description}
      </p>
    </fieldset>
  )
}
