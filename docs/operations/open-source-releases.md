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
publication using its workflow-dispatch input with the existing tag, selecting
`main` as the workflow branch. This uses current trusted publishing tools with a
separate checkout of the exact tag commit, including historical backfills:

```sh
gh workflow run publish-release.yml --ref main -f tag=v0.4.0
```

Both architectures build natively (`ubuntu-24.04` and `ubuntu-24.04-arm`), then pass
revision, architecture, runtime and license/dependency notice inspection before
being pushed with `GITHUB_TOKEN`. The final job combines their content digests.
The workflow that creates a tag also publishes it: it does not depend on a second
workflow triggered by a `GITHUB_TOKEN`-created tag.

A retry rebuilds staging images but preserves a complete version manifest and
existing release notes/archives. Missing registry publication is recovered even
when the GitHub release already exists. A partial manifest retains its existing
architecture digests; any conflicting source revision, version or repository label
fails closed. Version tags are never moved. `container-image.json` records the
source commit, index digest and platform digests as an additional release asset;
an existing record must match exactly. Staging `build-<run>-<arch>` tags
are implementation artifacts, not supported release references. Their names stay
stable across attempts so rerunning only failed jobs can reuse successful builds.

## Release assets

Content additions also update the compiled recipe in
`crates/engine/src/standard_rules/`, its `STANDARD_RULES_RELEASE`, and its tests.
The recipe explicitly identifies owned fields and recognized older values;
changing an existing bundled default must supply a reviewed predecessor rather
than overwrite a custom value. Keep historical fixtures intact. Verify fresh
setup, upgrade from the previous standard content, partial activations, conflicts,
and retry/no-op behavior. A code-only patch release need not change the content
bundle version. Operators use `orbit rules upgrade` from the installed image;
release publication itself never activates a live universe.

Numbered images are published at `ghcr.io/unbought-games/orbit-imperium:<version>`
for **linux/amd64** and **linux/arm64**. Docker selects the host architecture:

```sh
docker pull ghcr.io/unbought-games/orbit-imperium:0.4.0
```

For immutable deployments, use `ghcr.io/unbought-games/orbit-imperium@sha256:<digest>`
with the index digest from the release's `container-image.json`. The index supports
both architectures; each platform digest identifies only that architecture.
There is no floating `latest` alias. Back up the database and read the version's
upgrade notes before changing images. The official server's private ECR images and
production deployment workflow remain separate.

Each release also publishes a compressed Linux amd64 Docker image and SHA256SUMS.
Source is available in the GitHub repository at the release tag.
GitHub hosts the public assets; self-hosters don't need access to
Unbought's private ECR registry or a separate package registry account.

```sh
gh release download v0.1.0 --repo unbought-games/orbit-imperium
sha256sum -c SHA256SUMS
gzip -dc orbit-imperium-v0.1.0-linux-amd64.tar.gz | docker load
```

Use `orbit-imperium:0.1.0` with the repository's standalone deployment configuration.
Back up the database and follow the upgrade guidance in that version's notes.

## One-time GHCR package setup and public verification

GHCR initially creates packages as private, even for a public source repository.
After the first push, an organization owner/package administrator must open
[Orbit Imperium package settings](https://github.com/orgs/unbought-games/packages/container/orbit-imperium/settings),
check the linked `unbought-games/orbit-imperium` repository and Actions write access,
and change **this package** to **Public** under the danger zone. Source labels and
workflow identity establish repository linkage; they do not set visibility.
See [GitHub's package visibility documentation](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

The workflow's final check requests the version index, both platform manifests and
configs with an anonymous registry token (no Docker/gh credentials). It fails until
public access works. After making the package public, rerun the failed publication
job. For an independent check, with the source SHA from `container-image.json`:

```sh
ORBIT_RELEASE_VERSION=0.4.0 ORBIT_RELEASE_SHA=<tag-commit> make verify-release-registry
config=$(mktemp -d)
DOCKER_CONFIG="$config" docker pull --platform linux/amd64 ghcr.io/unbought-games/orbit-imperium:0.4.0
DOCKER_CONFIG="$config" docker pull --platform linux/arm64 ghcr.io/unbought-games/orbit-imperium:0.4.0
rm -rf "$config"
```

Do not set `REGISTRY_TOKEN` for the anonymous check. Authenticated push success alone
does not establish public distribution. Authentication/permission failures stop
publication rather than being interpreted as an absent image.

## Notes in the game

`docs/news/changes/*.md` holds player-facing build updates; add a dated note for
substantive changes. `docs/news/releases/vVERSION.md` holds the combined version
announcement and detailed release notes. Markdown frontmatter includes a stable
`id`, `title`, and ISO `date`; releases also carry `summary`, `subject:
orbit-imperium`, `kind: release`, `template: release`, and `version`.

`npm run news:build` renders a self-contained `/updates/index.html` and individual
pages included in every application build. No Git checkout,
website API, external account, or Unbought service is required at runtime. These
pages describe the installed build, not the official server's deployment history.

## Website integration

`WWW_PUBLISH_KEY` is a write deploy key limited to `unbought-games/www`.
If organization policy disallows deploy keys, `WWW_PUBLISH_TOKEN` can instead hold
a fine-grained token limited to Contents read/write on that repository. Only the
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
and generated before Docker builds so the image includes history without Git.
