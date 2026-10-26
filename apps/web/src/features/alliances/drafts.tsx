import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'

// Only fields the player actually edits are retained. Server defaults remain
// authoritative for every untouched field. This cache lives with the screen's
// session and is discarded on access loss, never written to browser storage.
export class AllianceDrafts {
  readonly fields = new Map<string, Map<string, string[]>>()
  clear = () => {
    this.fields.clear()
  }
}
export const AllianceDraftContext = createContext<AllianceDrafts | null>(null)
function controls(form: HTMLFormElement) {
  return Array.from(form.elements).filter(
    (
      element,
    ): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement,
  )
}
export function useAllianceDraft(key: string) {
  const drafts = useContext(AllianceDraftContext)
  const form = useRef<HTMLFormElement>(null)
  useLayoutEffect(() => {
    if (!form.current) return
    const saved = drafts?.fields.get(key)
    for (const control of controls(form.current)) {
      const values = saved?.get(control.name)
      if (!values) continue
      if (control instanceof HTMLInputElement && control.type === 'checkbox')
        control.checked = values.includes(control.value)
      else control.value = values[0] ?? ''
    }
  }, [drafts, key])
  const onChange = (event: ChangeEvent<HTMLFormElement>) => {
    const target = event.target
    if (
      !drafts ||
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) ||
      !target.name
    )
      return
    const saved = drafts.fields.get(key) ?? new Map<string, string[]>()
    saved.set(
      target.name,
      target instanceof HTMLInputElement && target.type === 'checkbox'
        ? controls(event.currentTarget)
            .filter(
              (control): control is HTMLInputElement =>
                control instanceof HTMLInputElement &&
                control.type === 'checkbox' &&
                control.name === target.name &&
                control.checked,
            )
            .map((control) => control.value)
        : [target.value],
    )
    drafts.fields.set(key, saved)
  }
  return { form, onChange, clear: () => drafts?.fields.delete(key) }
}
