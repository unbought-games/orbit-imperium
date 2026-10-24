# Trusted image releases

The `Release image` workflow builds a selected commit from `main` history after
that exact revision's push-triggered `CI` run succeeds. A read-only gate verifies
the repository ID, workflow identity, run attempt, commit and successful
`Build, lint and unit tests` aggregate check through the GitHub API. It verifies
that the selected commit remains an ancestor of current `main`; it does not
require the selected commit to be the newest one. PR/fork CI, unmerged commits,
failed/cancelled checks and incomplete evidence cannot publish.

A successful main CI completion publishes its own revision automatically. To
publish or republish an older reviewed revision, dispatch the publisher **from
main**, supplying the full source commit:

```sh
gh workflow run release-image.yml --repo unbought-games/orbit-imperium \
  --ref main -f commit=<full-main-history-commit>
```

Manual publication discovers successful main push CI for that exact commit and
pins its run/attempt before building. If the commit's CI was cancelled or failed,
rerun that original main CI run and require it to pass first; a PR check is not a
substitute. The gate rechecks the same run/attempt and main ancestry before AWS
authentication. New merges during either stage do not change or cancel the selected
release. A changed CI attempt or removed ancestry fails closed.

CI concurrency is isolated by commit for main pushes and manual CI runs, so newer
main commits do not cancel earlier validation. PR updates still cancel superseded
checks for that PR. Image publication is isolated by source commit without
cancelling an active build. Neither workflow dispatches a production deployment.

GitHub's [workflow_run security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
explains why privileged follow-up workflows must validate their triggering run.
No PR artifacts or caches are consumed by the release workflow. All actions use
commit pins and all jobs use disposable GitHub-hosted Ubuntu runners.

## Registry and identity contract

Infrastructure owns the private ECR repository and IAM role. Configure these
GitHub repository variables after provisioning; missing or unexpected values
fail before the image build:

| Variable | Contract |
| --- | --- |
| `AWS_REGION` | `us-east-2` |
| `AWS_PUBLISH_ROLE_ARN` | `arn:aws:iam::888782969020:role/unbought-orbit-imperium-publish` |
| `ECR_REPOSITORY_URL` | `888782969020.dkr.ecr.us-east-2.amazonaws.com/unbought/orbit-imperium` |

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

ECR receives a unique `sha-COMMIT-RUN-ATTEMPT` tag. The workflow reads the registry
digest after push and saves `release-image.json` in its run summary and a 90-day
Actions artifact. The record includes commit, `repository@sha256:...`, platform,
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
revision after confirming its successful CI and main ancestry. Newer commits do
not require changing the selected release. Reruns may create different digests
for identical source; retain the exact artifact from the successful attempt and
deploy that digest explicitly.
