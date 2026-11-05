/** Standalone archive pages never need an active universe or game bootstrap. */
export function archivePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '/profile' ||
      /^\/(?:profiles\/(?:empire\/)?|commemorations\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
        value,
      ))
  )
}
