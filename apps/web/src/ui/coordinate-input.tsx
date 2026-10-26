import { flushSync } from 'react-dom'
import { useId, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  nextCoordinateSegment,
  pastedCoordinateInput,
} from './coordinate-input-model'
import type { LocationKind } from '../shell/location-address'
import styles from './coordinate-input.module.css'
export function CoordinateInput({
  value,
  onChange,
  universe,
  error,
  label = 'Destination coordinates',
  embedded = false,
}: {
  value: string
  onChange: (value: string, target?: LocationKind) => void
  universe: string
  error?: string
  label?: string
  embedded?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [pasteError, setPasteError] = useState('')
  function next() {
    const result = nextCoordinateSegment(
      value,
      input.current?.selectionStart ?? value.length,
    )
    flushSync(() => onChange(result.value))
    input.current?.focus()
    input.current?.setSelectionRange(result.caret, result.caret)
  }
  return (
    <div className={`${styles.field} ${embedded ? styles.embedded : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.control}>
        <input
          id={id}
          ref={input}
          type="text"
          inputMode="numeric"
          data-coordinate-input=""
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="galaxy:system:slot"
          title={embedded ? 'Type or paste destination coordinates' : undefined}
          aria-invalid={!!(error || pasteError)}
          aria-describedby={`${id}-hint ${id}-error`}
          // Rejected pastes leave the value intact; their notice belongs to
          // this edit, not a later selection made elsewhere in the control.
          onBlur={() => setPasteError('')}
          onChange={(event) => {
            setPasteError('')
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (
              (event.key === ':' || event.key === ' ') &&
              !event.nativeEvent.isComposing &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              event.preventDefault()
              next()
            }
          }}
          onPaste={(event) => {
            const parsed = pastedCoordinateInput(
              event.clipboardData.getData('text/plain'),
              window.location.origin,
              universe,
            )
            if (parsed) {
              event.preventDefault()
              setPasteError('')
              onChange(parsed.text, parsed.target)
            } else if (
              event.clipboardData.getData('text/plain').includes('/')
            ) {
              event.preventDefault()
              setPasteError(
                'Use coordinates or a location link from this server and universe.',
              )
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={next}
          aria-label="Next coordinate segment"
          title="Next coordinate segment"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <small
        id={`${id}-hint`}
        className={embedded ? styles.silentHint : undefined}
      >
        Galaxy : system : slot. Colon or Space advances; Tab leaves the field.
      </small>
      <small
        id={`${id}-error`}
        role={error || pasteError ? 'alert' : undefined}
      >
        {pasteError || error}
      </small>
    </div>
  )
}
