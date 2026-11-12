import type { CSSProperties } from 'react'
import type { CosmeticTreatment } from '../adapters/community-rewards'
export type TreatmentDefinition = Pick<
  CosmeticTreatment,
  'renderer' | 'parameters' | 'family'
> & { sample_dye?: string }
export const treatmentPatterns: Record<string, string> = {
  satin: 'linear-gradient(var(--angle),#fff5,transparent 45%,#0004)',
  brushed:
    'repeating-linear-gradient(var(--angle),#fff4 0 1px,#0002 1px 2px,transparent 2px 4px)',
  pearl:
    'radial-gradient(ellipse at 30% 20%,#fff9,transparent 50%),linear-gradient(130deg,#e8bbff55,#a0ffed44)',
  smoke:
    'radial-gradient(ellipse at 20% 70%,#0008,transparent 60%),radial-gradient(ellipse at 80% 15%,#fff5,transparent 70%)',
  frost:
    'repeating-conic-gradient(from 20deg,#fff5 0 12deg,transparent 12deg 50deg)',
  enamel: 'linear-gradient(120deg,#fff8,transparent 25% 70%,#0005)',
  etched:
    'repeating-linear-gradient(var(--angle),transparent 0 9px,#0006 9px 10px,#fff5 10px 11px)',
  relief:
    'repeating-radial-gradient(ellipse at 50% 65%,#fff6 0 2px,#0005 2px 4px,transparent 4px 12px)',
  glitter:
    'radial-gradient(circle,#fff 0 1px,transparent 2px),radial-gradient(circle at 80% 70%,#ffd98a 0 1px,transparent 2px)',
  foil: 'linear-gradient(var(--angle),#fff8,#0003 25%,#fff9 50%,#0004 75%,#fff7)',
  crosshatch:
    'repeating-linear-gradient(45deg,#fff4 0 1px,transparent 1px 8px),repeating-linear-gradient(-45deg,#0003 0 1px,transparent 1px 8px)',
  lenticular:
    'repeating-linear-gradient(var(--angle),#fff7,transparent 5px,#0006 10px)',
  ceramic:
    'radial-gradient(ellipse at 30% 10%,#fff8,transparent 55%),repeating-linear-gradient(0deg,#fff1 0 2px,transparent 2px 5px)',
  hammered: 'radial-gradient(circle,#fff7,#0004 40%,transparent 65%)',
  linen:
    'repeating-linear-gradient(0deg,#fff3 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,#0002 0 1px,transparent 1px 5px)',
  carbon: 'repeating-conic-gradient(#0006 0 25%,#fff2 0 50%)',
  stipple: 'radial-gradient(circle,#0008 0 1px,transparent 1.5px)',
  patina:
    'radial-gradient(ellipse at 15% 70%,#317b6788,transparent 55%),radial-gradient(ellipse at 85% 20%,#9f5e3588,transparent 45%)',
  mosaic: 'conic-gradient(from 45deg,#fff5,#0005,#fff2,#0002,#fff5)',
  contour:
    'repeating-radial-gradient(ellipse at 10% 100%,transparent 0 7px,#fff6 7px 8px,#0003 8px 9px)',
  obsidian:
    'conic-gradient(from 20deg at 35% 65%,#0009,#fff4,#0008,#fff3,#0009)',
  gilded: 'linear-gradient(var(--angle),#d6a23b77,#fff1 35% 65%,#edcf7377)',
  crystalline:
    'repeating-conic-gradient(from 30deg,#fff6 0 30deg,#0003 30deg 60deg,transparent 60deg 90deg)',
  stardust:
    'radial-gradient(circle,#fff9 0 1px,transparent 2px),linear-gradient(120deg,#151f5c55,#e0bbff33)',
  gleam: 'linear-gradient(115deg,transparent 30%,#fff9 48%,transparent 65%)',
  rainbow:
    'linear-gradient(110deg,#ff6b6b66,#ffe58677,#8cffa766,#78c8ff88,#c48aff88)',
  facets:
    'conic-gradient(from 20deg,#e9acff77,#a3edff88,#fff8,#a3ffb877,#e9acff77)',
  oil: 'repeating-radial-gradient(ellipse at 25% 40%,#6cf8,#d5f7 12%,#fe98 24%,#4af6 36%)',
  ripple:
    'repeating-radial-gradient(ellipse at 50% 50%,transparent 0 12px,#fff7 13px,transparent 17px)',
  confetti:
    'conic-gradient(from 45deg at 45% 50%,#ffd766 0 25%,#b5a0ff 0 50%,transparent 0 75%,#88ffd2 0)',
  starfield:
    'radial-gradient(circle,#fff 0 1px,transparent 2px),radial-gradient(circle at 75% 70%,#fff9 0 2px,transparent 3px)',
  aurora:
    'linear-gradient(115deg,transparent,#86ffc377 30%,#bd9aff88 45%,transparent 60%)',
  constellation:
    'radial-gradient(circle,#fff 0 2px,transparent 3px),repeating-linear-gradient(35deg,transparent 0 24px,#fff3 25px,transparent 26px)',
  edge: 'linear-gradient(90deg,#b9eaffdd,transparent 12% 88%,#b9eaffdd)',
  halo: 'radial-gradient(ellipse,transparent 38%,#fff9 46%,transparent 60%)',
  rays: 'repeating-conic-gradient(from 15deg at 50% 25%,transparent 0 18deg,#fff6 19deg 23deg,transparent 25deg 40deg)',
  eclipse:
    'radial-gradient(circle at 50% 40%,#142335dd 25%,#ffe2a5aa 28%,transparent 45%)',
  comet:
    'linear-gradient(145deg,transparent 25%,#fff9 48%,#ffe09499 50%,transparent 54%)',
  pulse: 'radial-gradient(ellipse,#fff9,transparent 70%)',
  scan: 'repeating-linear-gradient(0deg,transparent 0 18px,#9eeeff99 20px,transparent 23px)',
  caustic:
    'repeating-radial-gradient(ellipse at 15% 25%,transparent 0 20px,#b2faff99 23px,transparent 25px)',
  lightning:
    'repeating-conic-gradient(from 10deg at 30% 0%,transparent 0 60deg,#d5d9ffbb 62deg 64deg,transparent 67deg 180deg)',
  corona:
    'conic-gradient(from 45deg,transparent,#ffd894aa,transparent,#ffb56c99,transparent)',
  supernova:
    'radial-gradient(circle at 50% 40%,#fff 0 3%,#ffe2a599 8%,#cc9dff88 25%,transparent 65%)',
  tilt: 'linear-gradient(125deg,#fff5,transparent 40%,#0004)',
  parallax:
    'radial-gradient(circle at 30% 35%,#fff7 0 8%,transparent 9%),linear-gradient(145deg,#fff2,#0004)',
  spotlight:
    'radial-gradient(circle at var(--pointer-x) var(--pointer-y),#fff9,transparent 60%)',
  reveal: 'linear-gradient(115deg,transparent,#fff8,transparent)',
  'tap-sweep':
    'linear-gradient(100deg,transparent 30%,#fff9 48%,transparent 65%)',
  'focus-trace': 'linear-gradient(90deg,#fff9,transparent 7% 93%,#fff9)',
  bevel: 'linear-gradient(130deg,#fff7 0 12%,transparent 13% 85%,#0005 86%)',
  orbit:
    'conic-gradient(from var(--angle),transparent 65%,#ffeab5aa,transparent)',
  prism: 'linear-gradient(110deg,#ffb9c777,#b6f0ff99,#d2c0ff88)',
  lift: 'linear-gradient(0deg,#0004,transparent 55%,#fff5)',
  magnetic:
    'radial-gradient(ellipse at var(--pointer-x) var(--pointer-y),#fff7,transparent 65%)',
  iris: 'repeating-conic-gradient(from 20deg,#fff3 0 25deg,transparent 25deg 45deg)',
  depth: 'radial-gradient(ellipse at 50% 40%,transparent 20%,#0006 85%)',
  starburst:
    'repeating-conic-gradient(from 15deg at 50% 40%,#fff7 0 8deg,transparent 8deg 40deg)',
  portal:
    'repeating-radial-gradient(ellipse at 50% 45%,transparent 0 10px,#fff7 11px,transparent 14px)',
}

export function treatmentStyle(treatment: TreatmentDefinition): CSSProperties {
  const p = treatment.parameters,
    pattern = String(p.pattern ?? 'plain')
  const numeric = (key: string, fallback: number, min: number, max: number) =>
    Math.max(
      min,
      Math.min(
        max,
        Number.isFinite(Number(p[key])) ? Number(p[key]) : fallback,
      ),
    )
  const tiled = [
    'glitter',
    'hammered',
    'carbon',
    'stipple',
    'mosaic',
    'stardust',
    'confetti',
    'starfield',
  ].includes(pattern)
  return {
    '--sample-dye': treatment.sample_dye ?? '#b5ad9d',
    '--pattern': treatmentPatterns[pattern] ?? 'none',
    '--strength': numeric('strength', 0.4, 0, 1),
    '--angle': numeric('angle', 45, 0, 360) + 'deg',
    '--pattern-size': tiled
      ? `${numeric('scale', 8, 1, 32) * 2}px ${numeric('scale', 8, 1, 32) * 2}px`
      : '100% 100%',
    '--duration': numeric('duration_ms', 3000, 150, 20000) + 'ms',
    '--depth': numeric('depth', 0, 0, 12),
  } as CSSProperties
}
