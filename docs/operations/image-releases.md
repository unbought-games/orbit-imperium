# Trusted image releases

The `Release image` workflow publishes commits from two protected source
branches. `main` carries shared game development and `prod/S001` carries
Andromeda's ending. The publisher always runs from trusted `main` tooling.
Push CI must pass on the exact source branch and commit. The gate checks the
repository ID, workflow, run attempt, successful aggregate job, and ancestry
against the current tip of that branch. A commit present on both branches needs
independent push CI and publication evidence for each.

Successful push CI on either branch triggers image publication. To republish a
reviewed commit from a source branch, dispatch on `main` and supply that branch
and the full commit SHA. Omitting `source_branch` selects `main`.

```sh
gh workflow run release-image.yml --repo unbought-games/orbit-imperium \
  --ref main -f source_branch=prod/S001 -f commit=<full-season-commit>
```

Manual publication discovers and pins the successful push CI run and attempt.
Failed or cancelled CI requires a successful rerun of that branch's push CI.
The publisher rechecks the same CI evidence and the selected branch's ancestry
before AWS authentication. New pushes leave the pinned revision intact.
PR updates cancel superseded checks for that PR. Image publication and push CI
use separate concurrency groups for each source branch and commit.

The build job checks out the selected source and runs its build and inspection
on a read-only runner. The OIDC-enabled publishing job runs on a separate runner,
checks out only the trusted publisher revision, loads the inspected image using
the build job's artifact ID, and verifies its revision and platform. Build
artifacts are retained for one day. Rerun all jobs to rebuild an expired image.
Publishing an image leaves the deployment decision to the operator.

GitHub's [workflow_run security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
explains why privileged follow-up workflows must validate their triggering run.
No PR artifacts or caches are consumed by the release workflow. All actions use
commit pins and all jobs use disposable GitHub-hosted Ubuntu runners.

## Pre-merge packaging checks

`make check` runs `make check-image-inputs` after the normal frontend build. This
checks TypeScript's source files and relative assets against the Docker COPY
layout, plus the generated analytics-route input transferred to Rust. It catches
the two observed missing-file regressions without another compilation. The check
supports this Dockerfile's explicit COPY syntax; it is not a Docker interpreter
or a general Rust dependency scanner.

CI additionally builds and inspects the actual `linux/amd64` image when packaging
inputs change: Dockerfile/ignore rules, dependency manifests/locks, toolchains,
Rust build scripts, vendored dependencies, packaging checks/workflows or Make.
Selection covers the full PR or merge group and fails safe without a valid base.
The existing required aggregate gate rejects a selected image job that fails,
is cancelled or is skipped. Ordinary source changes do not incur this build.

Run the complete packaging check locally with a unique image tag:

```sh
ORBIT_RELEASE_IMAGE=orbit-check:local ORBIT_RELEASE_SHA=$(git rev-parse HEAD) make release-image inspect-release-image
```

The image job has read-only repository access and no registry credentials. It
neither publishes nor starts the image. Full-system/container acceptance remains
explicit. The trusted publisher still rebuilds every selected revision; it
does not consume PR-produced images or caches. Native checks and these packaging
checks do not promise to detect every production-only compilation difference.

## Editorial exclusions

`docs/news/excluded-commits.json` contains full commit IDs that must not appear
in generated build history or official deployment summaries, for example work
whose player-facing feature is still disabled. Keep unfinished feature notes out
of `docs/news/changes/` as well. The website reads these exclusions from the exact
deployed source revision. Announce the feature explicitly when it is ready.

## Registry and identity contract

Infrastructure owns the private ECR repository and IAM role. Configure these
GitHub repository variables after provisioning; missing or unexpected values
fail before the image build:

| Variable               | Contract                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| `AWS_REGION`           | `us-east-2`                                                            |
| `AWS_PUBLISH_ROLE_ARN` | `arn:aws:iam::888782969020:role/unbought-orbit-imperium-publish`       |
| `ECR_REPOSITORY_URL`   | `888782969020.dkr.ecr.us-east-2.amazonaws.com/unbought/orbit-imperium` |

Use GitHub OIDC with audience `sts.amazonaws.com` and exact subject
`repo:unbought-games@342208397/orbit-imperium@1427640162:ref:refs/heads/main`. The immutable subject includes the owner and repository IDs. The workflow does not use
a GitHub environment. If infrastructure adopts an environment or customized OIDC
subject, update both sides together. Never use a wildcard repository/ref subject
or long-lived AWS access keys. See [GitHub's AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

The role needs ECR authorization-token access and only the target repository's
layer-upload, image-publication, layer-existence and image-description actions.
It must not provision resources, delete images, change repository policies, deploy
applications or access another application's repository. ECR must enforce tag
immutability. Retention must preserve deployed and compatible rollback digests.

## Image and release record

One `linux/amd64` image is built with the existing Dockerfile. Its OCI revision
label contains the full commit SHA. Before publication, artifact inspection uses
`docker create` and `docker cp` without starting the application or a database.
It verifies `/app/web/LICENSE.txt` matches the checkout and checks web dependency
`third-party.txt` and `rust-notices.txt`. Source is available in the GitHub
repository at the revision recorded in the image label.

This inspection is a packaging check, not the full production-container or
full-system acceptance suites. Those remain in `Explicit tests`, triggered only
by `workflow_dispatch`; release publication never dispatches them.

ECR receives a unique `sha-COMMIT-RUN-ATTEMPT-BRANCH` tag, with the branch
encoded as `main` or `prod-S001`. The workflow reads the registry
digest after push and saves `release-image.json` in its run summary and a 90-day
Actions artifact. The record includes `source_branch`, commit, `repository@sha256:...`, platform,
CI run/attempt, release run/attempt and `publisher_commit`. The publisher revision
is the trusted workflow/gate revision on main; it may differ from the selected
application source. Source and release tooling use separate checkouts so historical
application revisions do not reintroduce an obsolete publication gate. No mutable `latest` tag is created.
Re-running a release can produce another immutable image for the same commit;
always use the recorded digest, never infer a digest from the commit or tag.

Run API and worker processes using **the same recorded digest**, configuring
`ORBIT_ROLE=api` or `ORBIT_ROLE=worker` at runtime. The image defaults to the
combined development role when no role is specified. Hosting and deployment
are separate infrastructure decisions; this workflow does not deploy or migrate
databases. Deployment tooling must retain the release record alongside its
current and compatible rollback digests beyond the Actions artifact lifetime.

If a release fails, fix its cause and rerun or dispatch that same selected source
revision after confirming its successful push CI and source-branch ancestry. Newer commits do
not require changing the selected release. Reruns may create different digests
for identical source; retain the exact artifact from the successful attempt and
deploy that digest explicitly.
