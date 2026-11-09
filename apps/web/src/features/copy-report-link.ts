/** The visible input stays inside the modal, so focus and selection are usable
 * even when clipboard permissions or the async Clipboard API are unavailable.
 */
export async function copyReportLink(input: HTMLInputElement) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(input.value)
      return true
    }
  } catch {
    /* Try the selected-input fallback below. */
  }
  if (!input.isConnected) return false
  input.focus({ preventScroll: true })
  input.select()
  input.setSelectionRange(0, input.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  }
}
