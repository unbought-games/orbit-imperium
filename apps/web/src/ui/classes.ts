export function classes(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(' ')
}
