const effects = ['tear', 'chroma', 'collapse', 'roll'] as const
export type OrbGlitch = (typeof effects)[number]
export const glitchDurationMs = 1200

/** Draw each fault once per cycle, including a different first draw across cycles. */
export function startOrbGlitches(show: (effect: OrbGlitch | null) => void) {
  let remaining: OrbGlitch[] = []
  let previous: OrbGlitch | undefined
  let timer: ReturnType<typeof setTimeout>
  const delay = (min: number, max: number) => min + Math.random() * (max - min)

  function burst() {
    if (!remaining.length) remaining = [...effects]
    const choices = remaining.filter((effect) => effect !== previous)
    const effect = choices[Math.floor(Math.random() * choices.length)]
    remaining.splice(remaining.indexOf(effect), 1)
    previous = effect
    show(effect)
    timer = setTimeout(() => {
      show(null)
      timer = setTimeout(burst, delay(12_000, 28_000))
    }, glitchDurationMs)
  }

  // Let the existing 1.4s orb entrance finish before breaking the signal.
  timer = setTimeout(burst, delay(1450, 1850))
  return () => clearTimeout(timer)
}
