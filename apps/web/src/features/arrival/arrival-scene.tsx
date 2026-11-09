import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Dice5 } from 'lucide-react'
import { AmbientOrb } from '../command-hud/hud-controls'
import { Button } from '../../ui/button'
import { Form, Input, Select } from '../../ui/form'
import { InputWithAction } from '../../ui/input-with-action'
import { planetNameError, trimmedPlanetName } from '../planet-name'
import { nextArrivalStep, type ArrivalStep } from './model'
import { randomPlanetName } from './names'
import { PlanetCarousel } from './planet-carousel'
import { useArrival } from './use-arrival'
import styles from './arrival.module.css'

/** Lines fade in one after another; the step's controls follow the last line. */
function Lines({ lines, questionId }: { lines: string[]; questionId: string }) {
  return lines.map((line, i) => (
    <p
      key={line}
      id={i === lines.length - 1 ? questionId : undefined}
      className={styles.line}
      style={{ '--line': i } as CSSProperties}
    >
      {line}
    </p>
  ))
}

function after(lines: number): CSSProperties {
  return { '--line': lines } as CSSProperties
}

export function ArrivalScene() {
  const arrival = useArrival()
  const [step, setStep] = useState<ArrivalStep>('title')
  const [touched, setTouched] = useState(false)
  const question = useId()
  const exchange = useRef<HTMLElement>(null)
  const advance = () => setStep(nextArrivalStep)
  const { draft, setDraft, title } = arrival
  const nameError = planetNameError(draft.name)
  useEffect(() => {
    if (step !== 'title') exchange.current?.focus({ preventScroll: true })
  }, [step])
  useEffect(() => {
    document.title = 'Arrival · Orbit Imperium'
  }, [])

  return (
    <main className={styles.scene} aria-label="Arrival">
      <div className={styles.column}>
        <AmbientOrb className={styles.orb} />
        <section
          key={step}
          ref={exchange}
          tabIndex={-1}
          className={styles.exchange}
          data-step={step}
          aria-live="polite"
        >
          {step === 'title' && (
            <>
              <Lines
                questionId={question}
                lines={[
                  '…Signal restored. Your vital signs look steady.',
                  'Good morning. You’ve been in hypersleep for a long time.',
                  'We’re on final approach to the world you’ve been given to command.',
                  'Before we make planetfall: how should I address you?',
                ]}
              />
              <div className={styles.controls} style={after(4)}>
                <Select
                  aria-labelledby={question}
                  value={title.id}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                >
                  {arrival.titles.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <p className={styles.preview}>
                  “Welcome aboard, {title.address}.”
                </p>
                <Button onClick={advance}>That’s me</Button>
              </div>
            </>
          )}
          {step === 'planet' && (
            <>
              <Lines
                questionId={question}
                lines={[
                  `Very good, ${title.address}. Look out the viewport. Your world is coming into view.`,
                  'What do you see?',
                ]}
              />
              <div className={styles.controls} style={after(2)}>
                <PlanetCarousel
                  options={arrival.options}
                  value={draft.slot}
                  onChange={(slot) => setDraft((d) => ({ ...d, slot }))}
                  labelledBy={question}
                />
                <Button onClick={advance}>That’s it</Button>
              </div>
            </>
          )}
          {step === 'name' && (
            <>
              <Lines
                questionId={question}
                lines={[
                  'A fine world.',
                  'Every world deserves a name. What should we call it?',
                ]}
              />
              <Form
                className={styles.controls}
                style={after(2)}
                onSubmit={(event) => {
                  event.preventDefault()
                  setTouched(true)
                  if (!nameError) advance()
                }}
              >
                <InputWithAction>
                  <Input
                    aria-labelledby={question}
                    value={draft.name}
                    placeholder="Name your world"
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-small"
                    className={styles.dice}
                    aria-label="Suggest a random name"
                    title="Suggest a random name"
                    onClick={() =>
                      setDraft((d) => ({ ...d, name: randomPlanetName() }))
                    }
                  >
                    <Dice5 size={16} aria-hidden="true" />
                  </Button>
                </InputWithAction>
                {touched && nameError && (
                  <p className={styles.error} role="alert">
                    {nameError}
                  </p>
                )}
                <Button type="submit">Name it</Button>
              </Form>
            </>
          )}
          {step === 'farewell' && (
            <>
              <Lines
                questionId={question}
                lines={[
                  `${trimmedPlanetName(draft.name)}. It suits it.`,
                  'There’s a lot of work ahead to build an empire from nothing. I know you’re up to it.',
                  'Let’s get down there and start with the basics.',
                ]}
              />
              <div className={styles.controls} style={after(3)}>
                {arrival.error && (
                  <p className={styles.error} role="alert">
                    {arrival.error}
                  </p>
                )}
                <Button onClick={arrival.finish} disabled={arrival.busy}>
                  {arrival.busy
                    ? 'Landing…'
                    : arrival.error
                      ? 'Try again'
                      : 'Begin'}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
      {step !== 'farewell' && (
        <Button
          variant="ghost"
          size="small"
          className={styles.skip}
          disabled={arrival.busy}
          onClick={arrival.skip}
        >
          {arrival.busy ? 'Landing…' : 'Skip intro'}
        </Button>
      )}
      {step !== 'farewell' && arrival.error && (
        <p className={`${styles.error} ${styles.skipError}`} role="alert">
          {arrival.error}
        </p>
      )}
    </main>
  )
}
