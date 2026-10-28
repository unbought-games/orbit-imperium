/** Travel prevents a jittery tap from becoming a fling. Velocity is px/second. */
export function shouldDismissToast(offset: number, velocity: number) {
  return (
    Math.abs(offset) >= 64 ||
    (Math.abs(offset) >= 18 &&
      Math.abs(velocity) >= 500 &&
      Math.sign(offset) === Math.sign(velocity))
  )
}
