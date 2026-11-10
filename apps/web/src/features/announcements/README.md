# In-game announcements

The command orb consumes a runtime feed from `/api/announcements`. Content is
operator-managed Markdown and metadata, not React components bundled into builds.
See [the operator guide](../../../../../docs/operations/announcements.md) for
publication, withdrawal, restoration, local files and S3-compatible configuration.

`model.ts` selects the newest eligible unseen entry and owns per-account browser
acknowledgments. `use-release-announcement.ts` refreshes the feed independently of
game state. The HTTP adapter validates the response; the lazy body renderer uses
Markdown with raw HTML disabled and restricted link/image URLs. Never render
feed-provided HTML directly or import official hosted content into this bundle.

The bubble retains its focus behavior, dismissal controls, and low priority below
threats, Command uplink and tutorial/arrival content. Keep stable IDs across copy
corrections. Test the real runtime flow at desktop and mobile widths when changing
rendering or behavior; browser fixtures supply their own freely licensed feed.
