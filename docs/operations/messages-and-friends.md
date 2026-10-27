# Messages and friends

Protocol 4 provides one private conversation per player pair in a universe and
epoch, a friend contact list, player blocks, and one-way alliance circulars.
Galaxy, ranking profiles and visible report participants link to the conversation.

Messages retain their immutable Markdown source indefinitely. Supported formatting
uses the alliance renderer: HTML and images are disabled and link schemes are
restricted. Message bodies accept at most 4,000 Unicode scalar values. There are
no subjects, edits, unsend, attachments, read receipts or presence indicators.
Reading a conversation advances only the reader's position. Hiding records a
position in that person's inbox; later messages bring the conversation back.
Opening a hidden conversation through a player link still shows its history.
There is no message expiry job. Explicit universe destruction/reset retains its
existing operator semantics; indefinite retention is not a backup guarantee.

Friend requests require explicit acceptance. Reciprocal requests do not accept
each other. Either participant can remove a friendship. A block removes the
relationship and outstanding request in the same transaction and prevents new
messages, friend requests and circular delivery between the pair. Unblocking does
not recreate a relationship or deliver messages suppressed during the block.
Blocks have no effect on gameplay or essential game reports. Friendships grant
no gameplay rights or private activity information.

`SendCircular` is an alliance role permission. Leaders have it; newly created
alliances grant it to their default Member role. Existing alliances retain their
configured permissions, and leaders can grant this new permission through Roles.
Circulars capture recipients at send time, excluding blocked pairs. Joining later
does not grant access, and leaving or disbanding does not remove delivered copies.
The sender gets no delivery counts, block information or read receipts. Circulars
have no reply-all; recipients can open a private conversation with the sender.

## API and storage

The API follows the existing authenticated bound-query/command protocol:

- `POST /api/v4/universes/{universe}/social/query` takes `SocialQueryRequest`.
- `POST /api/v4/universes/{universe}/social/commands` takes `SocialCommandRequest`.

Both require the normal session, same-origin/CSRF checks and current binding.
Responses are private/no-store. Query pages require a limit from 1 to 100. The UI
uses 30 entries per inbox/contact page and 50 messages per history page.

`Conversations`, `Circulars` and `Contacts` accept an optional opaque UUID cursor.
`Messages` takes a peer player ID and either `before` or `after`, never both.
The default is the newest page, returned in chronological order. `before` walks
backward; `after` walks forward without skipping messages when several new pages
have arrived. `next_cursor` refers to the next page in the requested direction.
Message cursors must belong to that participant pair; inbox and circular cursors
must be readable by the actor. Contact cursors bound the stable peer-ID ordering.
The client never interprets a cursor as authorization. All history reads recheck
access. Inbox sorting derives from each conversation's latest message.

The normalized tables are `conversations`, `conversation_messages`,
`conversation_player_state`, `alliance_circulars`,
`alliance_circular_recipients`, `friend_relationships`, `player_blocks` and
`social_command_receipts`. No previews, unread counts, effective permissions or
rendered HTML are stored. Accepted friendships derive from their acceptance fact.
Read/hide positions advance monotonically. Message sequence allocation is
serialized with sends; messages have permanent UUIDs and decimal-string sequences.

Writes share the existing alliance transaction lock so a send, block, membership
change or permission revocation has a single committed order. Content, delivery
facts and retry receipts commit together. Reusing a command ID with different
content rejects; retrying the same ID returns its original result without another
message. No social plaintext is copied into command receipts. The client retains
an uncertain command until retry resolves it and clears private state on session
or epoch changes. Visible conversations poll incrementally every five seconds;
background tabs pause polling. Paging older messages preserves scroll position.

Player reporting and moderation remain deferred. There are no report buttons,
intake records, automatic sanctions, or moderation workers.

## Verification

`make check` runs the ordinary unit, tooling, lint, contract and build checks.
`make _db-social _db-alliances` covers PostgreSQL history, recipient privacy,
permission revocation, retention, friendship and block races, monotonic read/hide
state, retry identity, and HTTP authorization. Use an isolated Compose project as
in the CI runner instructions. `npm run test:ui -- social.spec.ts` exercises the
conversation and circular flows on desktop and mobile with deterministic HTTP
fixtures. Related report/profile/galaxy browser suites protect the message entry
points and accessibility.
