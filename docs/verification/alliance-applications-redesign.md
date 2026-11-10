# Alliance applications — 2026-11-10

Tested base: `40c25770`, with this uncommitted Applications UI change.

Reused EmptyState for the empty application queue. Moved the recruitment-page
link from above all alliance tabs into the empty state, or the top-right header
when applications exist. The link retains the stable universe/alliance IDs.
The closed-recruitment explanation appears only for a nonempty closed queue.

Validation:

- `npm run test:components -- alliance.component.spec.ts -g 'applications recruitment|role form delegates' --workers=1`:
  3 passed, preparation 3,985ms, execution 3.7s; no runner queue. The new desktop
  and mobile cases verify header alignment, destination, no overflow, and the
  transition into the empty state after acceptance. Existing application/role
  interactions remain covered. No failed test attempts or repairs.
- Component and application TypeScript checks, focused ESLint, Prettier, and
  `git diff --check` passed. No backend changes or backend tests.
- Captured and inspected empty states in the running local application at
  1440×1000 and 390×844. Followed the recruitment link and verified the correct
  public alliance page. Captured populated states at both sizes in the isolated
  component gallery using its existing application fixture. No live applications
  were created or accepted for visual review.

The task-only component preview was stopped and temporary dependency link
removed. The existing development application remains available with Applications
selected. No push, commit, production build, or hosted CI run in this change.
