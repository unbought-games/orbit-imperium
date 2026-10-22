# Champagne + ice orbital crest

The final mark pairs a crescent moon with a ship launching diagonally upward.
The artwork is hand-authored SVG; no image generation is involved.

## Assets

All browser assets live in `apps/web/public/` and are copied into the production
build by Vite. URLs start at `/`, so icons work from nested browser-history routes.

- `favicon.svg`: the approved moon-and-ship mark on a navy tile for contrast in
  both light and dark browser tabs; generated from `brand-mark.svg`.
- `favicon-16.png`, `favicon-32.png`, `favicon-48.png`: individual raster exports.
- `favicon.ico`: contains those three native-resolution PNG frames for fallback.
- `brand-mark.svg`: transparent display mark for the shared wordmark. A tapered
  champagne crescent and a balanced, two-facet ice-blue ship stay crisp at login
  and compact header sizes, without an enclosing tile or decorative stars.
- `brand-wordmark.svg`: standalone transparent ORBIT IMPERIUM lettering.
- `brand-lockup.svg`: transparent horizontal combination of the logo and wordmark,
  exported from the two independent masters with `node scripts/export-brand.mjs`.
  The wordmark exports use system fonts with fixed text widths, like the app;
  the lettering is live SVG text, not outlined paths.
- `icon.svg`: the same mark and navy tile, with a 64-unit viewBox and 1024px
  dimensions; generated from `brand-mark.svg`. The foreground is scaled to 85%
  around the tile center, leaving at least 12% clear space at each edge. This
  padding applies only to home-screen icons; the favicon retains its larger mark
  for readability at small sizes.
- `icon-1024.png`: 1024 × 1024 RGBA export of the app icon, preserving its
  rounded silhouette and transparent outer corners.
- `apple-touch-icon.png`: 180 × 180 app icon, flattened against navy for iOS.

The shared wordmark uses `brand-mark.svg` as a decorative image; its link name
remains “ORBIT IMPERIUM”. Login displays the mark at 52px (44px on mobile), while
the game header keeps its compact 32px mark. The document head declares SVG/ICO
favicons, the touch icon, and the navy browser theme color.

## App components

`BrandLogo` and `BrandWordmark` can each be used independently without a link.
`Brand` is the router link and accepts `variant="logo"`, `variant="wordmark"`, or
`variant="both"` (the default). Logo-only links have an accessible name; the logo
is decorative when the wordmark is present. Existing login and header placements
use the combined version. The mobile navigation drawer composes `BrandLogo` and
`BrandWordmark` without a link. The app wordmark stays live HTML so it can wrap in
the compact header.

## Palette

| Role                             | Base      | Highlight | Shadow    |
| -------------------------------- | --------- | --------- | --------- |
| Champagne moon / primary actions | `#cbb68d` | `#f4ead2` | `#857354` |
| Ice ship / links and focus       | `#a4dbef` | `#e4faff` | `#578fac` |
| Navy background                  | `#0d1827` | `#22374b` | —         |

`apps/web/src/styles/tokens.css` owns the application palette. Semantic aliases
apply the brand colors to controls, links, navigation, focus, energy, and crystal;
navy-derived surfaces keep panels and inputs distinct. Errors retain a coral
semantic color and deuterium remains green so status and resource distinctions
are preserved. Component styles reference tokens, including overview gradients.

## Editing and export

Edit `brand-mark.svg` and `brand-wordmark.svg` directly, keeping their core hex
colors in sync with the named tokens. Run `node scripts/export-brand.mjs` to
refresh the combined lockup, favicon SVG, app icon SVG, and both home-screen PNGs
from those masters. The script uses Sharp to render the PNGs and flattens the
touch icon against navy. Render favicon PNGs directly from `favicon.svg` at their
required sizes with Sharp.
Assemble the ICO using the three corresponding PNG frames. Do not upscale the
16px raster to produce larger files. Flatten the touch icon against `#0d1827`.
