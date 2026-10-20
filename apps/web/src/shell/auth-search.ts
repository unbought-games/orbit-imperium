export function validateAuthSearch(search: Record<string, unknown>): {
  redirect?: string
} {
  if (typeof search.redirect !== 'string' || !search.redirect.startsWith('/u/'))
    return { redirect: undefined }
  const destination = new URL(search.redirect, 'https://orbit.invalid')
  if (
    destination.origin !== 'https://orbit.invalid' ||
    !destination.pathname.startsWith('/u/')
  )
    return { redirect: undefined }
  return {
    redirect: destination.pathname + destination.search + destination.hash,
  }
}
