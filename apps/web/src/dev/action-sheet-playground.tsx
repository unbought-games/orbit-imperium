import { StrictMode, useRef, useState } from 'react'
import { ActionSheet, ActionSheetSurface } from '../ui/action-sheet'
import type { SheetMode, SheetSpring } from '../ui/action-sheet-physics'
import { Button } from '../ui/button'
import { Field, Form, Input, Select } from '../ui/form'
import { Heading, Eyebrow, Text } from '../ui/typography'
import { ResourceSummary } from '../ui/number-value'
import styles from './action-sheet-playground.module.css'

export function ActionSheetPlayground() {
  return (
    <StrictMode>
      <Playground />
    </StrictMode>
  )
}
function Playground() {
  const surface = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(true)
  const [mode, setMode] = useState<SheetMode>('snap')
  const [spring, setSpring] = useState<SheetSpring>('silky')
  const [stops, setStops] = useState('classic')
  const [depth, setDepth] = useState(true)
  const [dim, setDim] = useState(true)
  const [flick, setFlick] = useState(true)
  const [name, setName] = useState('Aster')
  const [notes, setNotes] = useState('')
  const [notify, setNotify] = useState(true)
  const [message, setMessage] = useState('')
  const points =
    stops === 'extra'
      ? [12.5, 50, 80, 100]
      : stops === 'compact'
        ? [12.5, 35, 80]
        : [12.5, 50, 100]
  function launch(next: SheetMode) {
    setMode(next)
    setMounted(true)
    setOpen(true)
  }
  return (
    <>
      <ActionSheetSurface ref={surface} aria-label="Orbit preview background">
        <main className={styles.page}>
          <Eyebrow>Orbit Imperium · Interaction playground</Eyebrow>
          <Heading level={1}>Action sheets</Heading>
          <Text>
            Drag the handle. Let a gentle flick find the next stop. Pull firmly
            down to dismiss.
          </Text>
          <div className={styles.actions}>
            <Button onClick={() => launch('snap')}>Open snap sheet</Button>
            <Button variant="secondary" onClick={() => launch('free')}>
              Open freeform sheet
            </Button>
          </div>
          <section className={styles.panel} aria-label="Sheet settings">
            <Heading level={2}>Make it feel right</Heading>
            <Field>
              Snap points
              <Select value={stops} onChange={(e) => setStops(e.target.value)}>
                <option value="classic">Classic: 12.5 / 50 / Full</option>
                <option value="extra">Extra stop: 12.5 / 50 / 80 / Full</option>
                <option value="compact">Compact: 12.5 / 35 / 80</option>
              </Select>
            </Field>
            <Field>
              Spring character
              <Select
                value={spring}
                onChange={(e) => setSpring(e.target.value as SheetSpring)}
              >
                <option value="silky">Silky</option>
                <option value="snappy">Snappy</option>
                <option value="soft">Soft</option>
              </Select>
            </Field>
            <label>
              <input
                type="checkbox"
                checked={depth}
                onChange={(e) => setDepth(e.target.checked)}
              />{' '}
              Background depth
            </label>
            <label>
              <input
                type="checkbox"
                checked={dim}
                onChange={(e) => setDim(e.target.checked)}
              />{' '}
              Dim background
            </label>
            <label>
              <input
                type="checkbox"
                checked={flick}
                onChange={(e) => setFlick(e.target.checked)}
              />{' '}
              Flick to dismiss
            </label>
          </section>
          <section className={styles.panel}>
            <Eyebrow>Planetary command</Eyebrow>
            <Heading level={2}>Aster [1:50:8]</Heading>
            <Text>
              Orbit’s navy surfaces, champagne edges, shared controls, and
              resource symbols are the default.
            </Text>
            <ResourceSummary
              value={{
                metal: '1500000000000',
                crystal: '1000000000000',
                deuterium: '750000000000',
              }}
            />
          </section>
          <p role="status">{message}</p>
          <Text>
            This is an isolated UI preview. Your live universe and fleets are
            untouched.
          </Text>
          <div className={styles.belowFold}>
            <Heading level={2}>Scroll position check</Heading>
            <Button variant="secondary" onClick={() => launch('snap')}>
              Open from below
            </Button>
          </div>
        </main>
      </ActionSheetSurface>
      {mounted && (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title="Planet actions"
          description="Aster · [1:50:8]"
          snapPoints={points}
          mode={mode}
          spring={spring}
          backgroundRef={surface}
          depth={depth}
          dim={dim}
          flickToDismiss={flick}
        >
          {({ snapTo, close }) => (
            <>
              <div className={styles.actions} aria-label="Sheet heights">
                {points.map((point) => (
                  <Button
                    key={point}
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => snapTo(point)}
                  >
                    {point === 100 ? 'Full' : `${point}%`}
                  </Button>
                ))}
              </div>
              <Form
                onSubmit={(e) => {
                  e.preventDefault()
                  setMessage(`Saved ${name} in this preview.`)
                  close()
                }}
              >
                <Field>
                  Planet name
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field>
                  Primary mission
                  <Select defaultValue="transport">
                    <option value="transport">Transport</option>
                    <option value="espionage">Espionage</option>
                    <option value="harvest">Harvest</option>
                  </Select>
                </Field>
                <Field>
                  Notes
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
                <label>
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                  />{' '}
                  Show fleet notifications
                </label>
                <Button type="submit">Save preferences</Button>
              </Form>
              <section
                className={styles.details}
                aria-label="Scrollable sheet details"
              >
                <Heading level={3}>Room to scroll</Heading>
                {[
                  'Review your ships',
                  'Choose a destination',
                  'Check cargo capacity',
                  'Check the fuel cost',
                  'Review the arrival time',
                  'Prepare your next move',
                ].map((label) => (
                  <p key={label}>{label}</p>
                ))}
                <Button variant="secondary" onClick={close}>
                  Close from content
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOpen(false)
                    setMounted(false)
                  }}
                >
                  Unmount preview sheet
                </Button>
              </section>
            </>
          )}
        </ActionSheet>
      )}
    </>
  )
}
