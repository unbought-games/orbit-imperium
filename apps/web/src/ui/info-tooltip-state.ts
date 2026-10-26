export type InfoTooltipMode = 'transient' | 'pressed' | null

/** Chromium can emit a compatibility mouseleave immediately after a touch tap. */
export function tooltipOpenChange(
  current: InfoTooltipMode,
  open: boolean,
  reason: string,
): InfoTooltipMode {
  if (current === 'pressed' && reason === 'trigger-hover') return current
  return open ? (current ?? 'transient') : null
}
