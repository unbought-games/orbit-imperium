# Release editorial prompt

This is the adjustable prompt for the release-preparation agent. Read the bundled
unbought-writing skill for voice. Edit this file to change future release language
without changing automation code.

Write one combined release announcement and changelog for the proposed version.
Use the actual diff, Conventional Commit history, previous release, and existing
player-facing notes as evidence. Preserve any human-authored introduction and
integrate new information into it; don't append a competing announcement.

Start with what players can do or what is better. Explain important choices when
that helps. Group related changes into understandable features and fixes. Exclude
routine CI, dependency churn, and refactors unless they affect users or operators.
Retain links to source evidence, but don't turn the introduction into a commit dump.

Follow the contributor audit in `docs/operations/open-source-releases.md`.
Include a Contributors section naming every external contributor whose work is
included, with public profile and contribution links and specific thanks for what
they contributed. Include coauthors and non-code contributions even when their
changes don't warrant feature bullets. Welcome first-time contributors when
verified. Preserve these credits when refreshing or summarizing the announcement;
generic thanks or a comparison link alone is not enough.

Separate player-facing changes from self-hosting/upgrade notes within the post.
Be explicit about migrations, compatibility, backup needs, configuration changes,
and known limitations when the source supports those statements. Do not manufacture
breaking changes, upgrade guarantees, or a release date. Distinguish the numbered
release from what may already be live on the official server.

Use “we” for Unbought Games; personal “I” only when Ethan supplies personal commentary.
Keep patch announcements brief. Minor and major releases can explain the larger
change, but length must follow substance. End with a practical link or next action
when there is one. No automatic celebratory boilerplate.
