---
id: renown-and-universe-invitations
title: Renown, personal invitations, and a home for your alliance
date: '2026-11-12T14:20:00-05:00'
---

This build adds Renown, permanent cosmetic rewards, and personal invitations into
a specific universe. It also brings together the changes from our overnight
updates, including a few that hadn't made it into the Orb's announcements.
Renown depends on your server's account integration and rewards program being
enabled; the other game improvements don't require membership.

## Renown and rewards

Renown records contributions such as inviting players who keep playing, verified
community participation, and optional financial support. Reaching a milestone
opens a permanent cosmetic choice. Renown isn't spent when you choose a reward.

Titles at title milestones are awarded automatically **alongside** that choice.
Financial-support and recruitment titles are automatic too. You decide which
earned title to display in your empire profile; earning one never replaces your
current title.

The collection includes named dyes, emblem elements and sets, finishes, and
effects. Permanent unlocks stay yours after membership ends. Saved designs stay
saved when something is temporarily unavailable, and rewards don't add resources,
speed up fleets, or change combat.

New players receive **15 days of membership on their first eligible game join**,
already activated. There's no separate claim to find in an account page.
Later membership awards and gifts retain their stated activation and sharing rules.

Unbought Accounts now has a dedicated Renown view, a consistent sidebar, named
reward previews, and a milestone path showing automatic titles separately from
cosmetic choices. The invitation card can copy an existing personal link directly
when there's one clear destination; multiple destinations open Invitations.

## Invite someone into your universe

Personal invitations open a page featuring the inviter's emblem, title, empire,
and destination universe. Shared links include a matching rich preview.

The main action starts signup for a new player. After authentication, the invited
universe is joined and opened automatically when entry is available. There isn't
another invitation-acceptance step or a second universe picker. Personal links
are reusable, so sending one to a second friend doesn't consume it.

Alliance recruitment remains a separate decision. Applications still need
approval, and joining a universe doesn't silently add someone to an alliance.

Alliance recruitment also has its own honors. An authorized member's alliance
invitation can credit both that player and the alliance; a public alliance link
credits the alliance alone. Sponsored recruits who keep playing unlock collective
distinctions and, at some milestones, permanent commemorative emblems for
qualifying members. Personal invitations don't automatically sponsor an alliance.

## Alliance halls and public recruitment

The overnight update gave alliances a Hall with a crest, artwork, motto, welcome
message, and noticeboard. Hall customization and uploads are free, including
animated GIFs and WebPs. Leaders can delegate editing through alliance roles,
and the identity stays with the alliance when leadership changes.

Public recruitment pages offer Flagship, Transmission, and Citadel layouts.
Write your story in Markdown, add community links, and preview the page before
saving. Switching layouts preserves each template's content.

New commanders following a recruitment link can join or apply during their
arrival, after naming their world. They can begin their Briefing while an
application waits for approval.

## Your Galaxy probe count, remembered

Settings → Galaxy espionage now lets you save how many probes the Spy action
sends. The count belongs to your empire in each universe and follows you across
planets, moons, and devices. It defaults to one.

You can save any positive whole number, even before you've built that many
probes. Spy stays unavailable when the selected world has too few; it never
quietly sends a smaller fleet.

## Other improvements in this round

Across the overnight updates and this build:

- Alliance boards, member rosters, applications, settings, and activity history
  are more compact and readable.
- The book beside Empire opens your Briefing and signals new material. Dismissing
  a Briefing restores the command uplink, and directive-completion popups give
  earned rewards more emphasis.
- Espionage reports include stored Anti-Ballistic Missiles and Interplanetary
  Missiles when defenses are revealed. Existing reports aren't rewritten.
- The resource header reaches the screen edge and stays fixed during overscroll.
  Orbital loading indicators animate again while respecting reduced motion.
- The Orb uses your title when addressing you directly, rather than adding it to
  every passing remark.
- Menu and Rewards retain the selected planet or moon in their address paths.
  Older links redirect, and beginner mode keeps Alliance accessible under More.
- Official hosts can add an Account link to the desktop player menu.
- Closing a page during an admitted sign-in refresh no longer interrupts that
  refresh and unnecessarily signs you out. Signing out still takes effect.
- Cancelled database requests finish cleanup before their connection is reused.
  Committed game actions remain committed.
- Analytics identification retries can reuse existing records after the daily
  limit; requests for new records receive the appropriate rate-limit response.

## For server operators

The rewards integration uses ordinary additive migrations and separately
installed content. Deploy compatible game and account services before enabling
the program, retain previous content objects, and follow the
[community rewards guide](https://github.com/unbought-games/orbit-imperium/blob/main/docs/operations/community-rewards.md).
Self-hosted servers remain independent and can supply their own content.

This is a build update, not a new numbered release or a claim that every server
has activated the optional program.

## Thanks

Thanks to [sumdeos](https://discord.com/users/181133185491402753) for
[requesting a configurable Galaxy probe count](https://discord.com/channels/1559681008532586586/1560363739818098738/1563580676094038228),
and [Gh0stP1rate](https://discord.com/users/343178308164255744) for
[asking that the setting be remembered](https://discord.com/channels/1559681008532586586/1560363739818098738/1563582002265981050).
