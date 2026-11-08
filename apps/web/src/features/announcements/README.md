# In-game announcements

Curated "what's new" announcements that open from the command orb. Most
releases don't get one. Add an announcement only when a change is worth
interrupting play for, such as a new building, technology or game mode.

## Adding an announcement

1. Write the content as a React component in `entries/<id>.tsx` with a default
   export. It can use images, lists, links or any shared UI component. The
   bubble supplies the "Now available" label, the title, the "Read the update"
   link and "Got it", so the entry only provides the body.
2. Add an entry to `catalog.ts`:
   - `id`: stable kebab-case ID. Changing it shows the announcement again to
     everyone who has already seen it.
   - `title`: the bubble heading and its accessible name.
   - `date`: ISO time when it starts showing.
   - `until` (optional): ISO time when it stops showing. Without it, the
     announcement shows for 30 days after `date`, so players who join later
     aren't greeted with old news.
   - `href` (optional): the full note, usually `/updates/<news-id>.html` for a
     note in `docs/news/`. A unit test checks that the note exists.
   - `Content`: `lazy(() => import('./entries/<id>'))`. Content loads only when
     it is shown, so announcements don't grow the main bundle.
3. Check it at desktop and mobile widths. Keep images short (the bubble crops
   artwork to 170px high) and copy brief; the bubble scrolls if content is long.

Announcements ship with the client build, like the `/updates` pages. Keep in
mind that an announced feature may still need content activation on a given
server; announce it in the build that the official server activates it in.

## Behavior

- The newest announcement inside its window that the account hasn't seen opens
  automatically. If several are live, older unseen ones follow later visits.
- Closing it in any way counts as seen: "Got it", "Read the update" (opens the
  note in a new tab), Escape, or clicking the orb. Focus returns to the orb,
  and the orb then opens Command uplink as usual.
- It waits while an attack or espionage is incoming, while Command uplink is
  open, or while a tutorial lesson or reward celebration owns the orb.
- "Seen" is presentation history stored in browser storage per account
  (`orbit.announcement.v1:<account>:<id>`). It is not game state and sends no
  commands. Another browser or device shows the announcement once more. When
  storage is blocked it is remembered for the session only.
