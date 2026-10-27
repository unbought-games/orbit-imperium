# Favicon padding verification

October 27, 2026. Production build served by Vite preview. `desktop.png` is the
anonymous landing page at 1440×900; `mobile.png` is the same page at 390×844,
both at device scale 1. The standard anonymous bootstrap payload was supplied
by the capture harness (`version: 1`, `signup_enabled: true`, anonymous result);
all scripts, styles, images and icon assets came from the production build.

Page screenshots exclude browser chrome. `desktop-favicon.png` and
`mobile-favicon.png` therefore separately capture the actual served
`/favicon.svg` element at its native 64×64 size in those respective viewports.
The document's SVG favicon link and served bytes were checked against the
checked-in asset. The landing page itself is unchanged.

Validation: `npm run build`, generator regeneration, SVG geometry equivalence
with the app icon, PNG native sizes/rendered bytes, all ICO frame dimensions and
embedded bytes, and `git diff --check` pass. All four screenshots were inspected.
