export function detectionPercent(ppm: number): string {
  if (!Number.isInteger(ppm) || ppm < 0 || ppm > 1000000)
    throw Error('Invalid detection probability')
  const hundredths = Math.floor((ppm + 50) / 100)
  if (ppm > 0 && hundredths === 0) return '<0.01%'
  if (ppm < 1000000 && hundredths === 10000) return '>99.99%'
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}%`
}
