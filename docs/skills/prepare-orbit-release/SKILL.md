---
name: prepare-orbit-release
description: Prepare an Orbit Imperium open-source release PR, recommending a version from Conventional Commits and history, updating versions and changelog, and editing its announcement. Does not deploy the official server.
---

Read the repository AGENTS.md, `docs/operations/open-source-releases.md`, the
sibling `unbought-writing/SKILL.md`, and `docs/news/release-editorial.md`.
Work from current main in an isolated branch, preserving other work.

Run `npm run release:suggest`. Read the actual diff, commit bodies, existing
`docs/news/changes/` entries, and the previous release notes. Recommend a version
and explain it briefly. The command's result is evidence, not a substitute for
judgment: a mislabeled breaking change still matters. Honor an explicit version
from the user; don't ask them to repeat it. First release defaults to 0.1.0.

Run `npm run release:prepare -- --version VERSION`. It updates npm/Cargo versions
and lockfiles, links CHANGELOG.md, and writes the release descriptor. It preserves
an existing announcement in `docs/news/releases/vVERSION.md`. Edit that file in
place so the announcement and technical notes form one post with one stable ID.
Remove `draft: true` only when the notes are ready for the intended release PR.

Apply the editorial prompt before proposing the PR. For patch versions, proceed
without asking for extra commentary by default. For minor/major versions (including
0.1.0), show a useful draft and ask once whether the owner wants to add editorial
comments, unless they already supplied them or requested a draft PR for later
editing. Never block a requested draft PR on commentary. Draft PRs stay unpublished.

Verify versions agree and the prepared source contains its documentation. Run
relevant tooling tests, build the game news pages, and use the existing checks;
don't add another approval or release-specific test gate. Keep the PR title
Conventional Commits: `chore(release): prepare Orbit Imperium VERSION`.

Open the release PR within the user's requested scope. A request to prepare a
release PR does not authorize merging it. If the user explicitly requests the full
release, merging the finalized PR is the publication decision. Existing successful
main CI continues automatically to tag the exact merge commit, publish the source
and container assets, and trigger www. Never move a tag or rewrite published assets.

If the owner says more work is coming, keep the release PR draft and explain how
to refresh it: rebase onto main, rerun preparation, and reconcile the notes against
the new history without replacing their editorial. The script preserves existing
copy; the agent must add newly included changes and remove claims no longer true.
