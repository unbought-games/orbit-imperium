# Battlecruiser · foredeck battery

An armament study for the [swept-stern Battlecruiser](../battlecruiser-swept-stern/master.png). Two small twin-emitter turrets sit on the centerline ahead of the bridge. The larger shoulder lasers remain the primary battery. [Compare the arrangements](comparison.webp).

Free Orbit Base concept art. The original ImageGen output is saved as `master.png` for review. Its upper-left corner has faint residual alpha (2/255). The compiled cutout clears this haze while retaining antialiased pixels within two pixels of the silhouette.

## Authored color controls

Rebuild the offline [Battlecruiser v1 package](../../../../../apps/web/public/art/ship-skins/orbit-base-battlecruiser/v1/manifest.json) with `npm run art:orbit-base-battlecruiser`. The [material drawing](livery.svg) maps the hull and turret armor to primary paint, and the swept shoulders, inlay and accent fairings to secondary paint. Mechanisms, laser glass, bridge windows and hyperspace exhaust are protected. The two [emblem surfaces](emblem-slots.json) sit on the swept shoulders and receive paint on the accent panels. The local development Hangar uses this revision.

[Reference and three named-dye finishes](customization-palettes.webp) · [Paired Wayfinder emblems](paired-wayfinder.webp)

The manifest binds the source, guides, calibration and runtime maps by SHA-256. The original calibration is primary `#888b9a` and accent `#d2ae8b`. Reference dyes reproduce the cleaned runtime source exactly. Cleanup removed 531,997 faint, isolated background pixels. All surviving nontransparent pixels retained their original RGBA. Recoloring preserved the cutout alpha and every zero-coverage pixel. Both laser batteries, foredeck optics and engines were checked with each channel varied independently.

Visual checks covered bright debug dyes, dark and pale finishes, matching dyes, 96-pixel thumbnails and native-size crops. Saturated paint initially spilled into a small foredeck lens. The blue holdout in the guide locks that light. Full paired Wayfinder and layers-only near-side Starwing renders were checked in the local HTTP renderer. The browser and worker produced identical native Blue/Gold paint pixels (SHA-256 `1322c2f7f94517f232e3a9da7f327e61322c73f71479c23b4260bbb04849e4f9`). Owner review of the finish and placement is pending.

## Edit prompt

Precise localized edit of this existing Orbit Imperium Battlecruiser miniature. The owner likes this exact design. Add exactly TWO small secondary laser turrets along the central foredeck between the existing bridge and the front half of the spear bow. Place one halfway between the bridge and bow tip, and the second one further back on the next slightly higher plate, in tandem with some clear deck between. Aim toward the lower left along the ship. Each has a low slate armored turret cap on a dark pivot, and two short parallel graphite emitter barrels with tiny recessed ruby optics, consistent with but visibly smaller than the existing shoulder batteries. Each secondary turret footprint roughly one third the width of one main shoulder mount. Make them legible and firmly seated on the deck, the rear turret slightly higher. Leave the forward third of the bow sharp and uncluttered. Preserve both large red-lens shoulder batteries EXACTLY, plus the bridge position and shape, long spear-shaped nose, narrow waist, swept stern curves, twin green engines, slate primary plating, champagne trim, camera angle, neutral light, framing, surface wear, silhouette, and all other details. No new fins or other modifications. Full single ship on genuine transparent alpha, 3:2 landscape. No beams, no captions, no scenery, no floor.
