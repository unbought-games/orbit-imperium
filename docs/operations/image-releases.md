# Trusted image releases

The `Release image` workflow builds the exact current `main` commit after its
push-triggered `CI` run succeeds. A read-only gate verifies the repository ID,
workflow identity, run attempt, commit and successful `Build, lint and unit tests`
aggregate check through the GitHub API. PR, fork, manual CI, stale-main, failed
and cancelled runs cannot publish. The gate runs again after the build and before
AWS authentication. Publication is serialized without cancelling an active push.

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
It verifies `/app/web/source.tar.gz`, matching `LICENSE.txt`, web dependency
`third-party.txt` and `rust-notices.txt`; selected archive files must match the
checkout byte for byte. The archive rejects Git history, secrets, build output
and excluded internal research directories. License and attribution contents
remain unchanged.

This inspection is a packaging check, not the full production-container or
full-system acceptance suites. Those remain in `Explicit tests`, triggered only
by `workflow_dispatch`; release publication never dispatches them.

ECR receives a unique `sha-COMMIT-RUN-ATTEMPT` tag. The workflow reads the registry
digest after push and saves `release-image.json` in its run summary and a 90-day
Actions artifact. The record includes commit, `repository@sha256:...`, platform,
CI run/attempt and release run/attempt. No mutable `latest` tag is created.
Re-running a release can produce another immutable image for the same commit;
always use the recorded digest, never infer a digest from the commit or tag.

Run API and worker processes using **the same recorded digest**, configuring
`ORBIT_ROLE=api` or `ORBIT_ROLE=worker` at runtime. The image defaults to the
combined development role when no role is specified. Hosting and deployment
are separate infrastructure decisions; this workflow does not deploy or migrate
databases. Deployment tooling must retain the release record alongside its
current and compatible rollback digests beyond the Actions artifact lifetime.

If a release fails, fix the cause and rerun it only while its CI revision is
still current `main`. A newer `main` requires its own successful push CI. The
second gate deliberately refuses a build superseded while compiling. A commit
that passes this gate remains a trusted image if `main` advances during upload;
deployment must explicitly select the recorded digest.
