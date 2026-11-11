import { useId, useState } from 'react'
import { usePlayerPreferences } from '../shell/player-preferences-context'
import { validProbeCount } from '../client-model/player-preferences'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { Field, NumberInput } from '../ui/form'
import { Button } from '../ui/button'
import styles from './settings.module.css'

export function GalaxyProbeSettings() {
  const settings = usePlayerPreferences()
  const [edit, setEdit] = useState<string | null>(null)
  const help = useId()
  const saved = settings.preferences?.galaxy_probe_count
  const count = edit ?? saved ?? ''
  const invalid = edit !== null && !validProbeCount(count)
  return (
    <Section
      className={styles.probeSettings}
      aria-label="Galaxy espionage"
      id="galaxy-espionage"
    >
      <Heading level={2}>Galaxy espionage</Heading>
      <Text id={help}>
        Choose how many probes Spy sends from Galaxy. Saved for your empire in
        this universe, across all planets and moons. Spy is unavailable when the
        selected world has fewer probes.
      </Text>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (
            saved &&
            !settings.busy &&
            !settings.error &&
            validProbeCount(count)
          )
            void settings.save(count).then((ok) => {
              if (ok) setEdit(null)
            })
        }}
      >
        <div className={styles.probeForm}>
          <Field>
            Probes per spy mission
            <NumberInput
              value={count}
              disabled={settings.busy || !saved}
              aria-describedby={help}
              aria-invalid={invalid}
              onChange={(event) => setEdit(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={
              !saved ||
              settings.busy ||
              !!settings.error ||
              invalid ||
              count === saved
            }
          >
            {settings.busy
              ? saved
                ? 'Updating…'
                : 'Loading…'
              : 'Save probe count'}
          </Button>
        </div>
        {invalid && <p role="alert">Enter a positive whole number.</p>}
        {settings.message && <p role="status">{settings.message}</p>}
        {settings.error && <p role="alert">{settings.error}</p>}
        {settings.error && (
          <Button
            variant="secondary"
            type="button"
            disabled={settings.busy}
            onClick={() => void settings.load()}
          >
            Reload probe count
          </Button>
        )}
      </form>
    </Section>
  )
}
