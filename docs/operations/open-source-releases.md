# Open-source releases and news

The official server deploys selected trusted `main` builds. Numbered open-source
releases are prepared separately. A production deployment never creates a version
tag, and a version announcement never claims that an official server has upgraded.

## Prepare a release

Invoke the repository skill at `docs/skills/prepare-orbit-release/SKILL.md`.
`npm run release:suggest` inspects reachable version tags and full Conventional
Commit messages. No previous release suggests `0.1.0`; features increment minor,
fixes increment patch, and breaking changes increment major (minor before 1.0).
The agent checks actual changes, explains its recommendation, and accepts an override.

`npm run release:prepare -- --version 0.2.0` creates the version's Markdown notes,
updates npm/Cargo manifests and lockfiles, links the changelog, and writes
`docs/news/release.json`. An existing announcement for that version is preserved
and edited in place. The agent performs editorial work before opening the release
PR. Patch releases default to no additional editorial question; minor/major releases
ask whether the owner wants to add commentary. Existing user instructions override
that default. There is no post-merge approval step.

Merging the release PR runs existing CI. Its successful push run starts
`Publish open-source release`, which tags that exact prepared commit. Tags are
immutable: a tag pointing elsewhere is an error, never a force-update.
The same workflow builds and inspects the container, publishes the prepared notes
and assets to GitHub Releases, then records the publication in `www`.
Externally pushed version tags use the same publication workflow. Resume an interrupted
publication using its workflow-dispatch input with the existing tag. A published
release is not rebuilt or overwritten on retry; only the website notification retries.

## Release assets

Each release has a complete source archive, a compressed Linux amd64 Docker image,
and SHA256SUMS. GitHub hosts the public assets; self-hosters don't need access to
Unbought's private ECR registry or a separate package registry account.

```sh
gh release download v0.1.0 --repo unbought-games/orbit-imperium
sha256sum -c SHA256SUMS
gzip -dc orbit-imperium-v0.1.0-linux-amd64.tar.gz | docker load
```

Use `orbit-imperium:0.1.0` with the repository's standalone deployment configuration.
Back up the database and follow the upgrade guidance in that version's notes.

## Notes in the game

`docs/news/changes/*.md` holds player-facing build updates; add a dated note for
substantive changes. `docs/news/releases/vVERSION.md` holds the combined version
announcement and detailed release notes. Markdown frontmatter includes a stable
`id`, `title`, and ISO `date`; releases also carry `summary`, `subject:
orbit-imperium`, `kind: release`, `template: release`, and `version`.

`npm run news:build` renders a self-contained `/updates/index.html` and individual
pages included in every application build and source distribution. No Git checkout,
website API, external account, or Unbought service is required at runtime. These
pages describe the installed build, not the official server's deployment history.

## Website integration

`WWW_PUBLISH_TOKEN` is a fine-grained token limited to Contents read/write on `unbought-games/www`. Only the
trusted release workflow receives it, after the GitHub release has published. It
commits an immutable publication record containing the version tag, commit, and
GitHub publication timestamp. That push starts the normal website build and deployment.
The website imports Markdown from the recorded commit, never from moving `main`.

Official deployment records are written by the infra workflow only after readiness
succeeds. `www` builds a dated summary of player-facing Conventional Commits between
successful deployment revisions. Author a separate announcement in `www` for editorial about a hosted update.
The first recorded deployment establishes a baseline.

The build also bundles player-facing Conventional Commit history into paginated
local pages. `docs/news/history.json` is a generated build input, excluded from Git
and included in released source so archives rebuild without a Git checkout.
