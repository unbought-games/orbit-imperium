# Command retry integration, November 28

The implementation was integrated with main `5b3923808d4691889273b8c43a82048d2abc68d3`. Shipped migrations52–56 remain byte-identical; the previously unshipped command admission migration is57.

Dispatch retains immediate confirmation on admission, current draft/navigation behavior and dispatch observations. Registration callbacks run after durable envelope capture, including when sampling server time delays registration. Detail archiving retains the combined archive/share action and observes only its own registered receipt.

Two integration test assumptions failed on the first focused run: the profile4 archive fixture answered a new clock sample with the generic protocol2 identity; it now answers with its actual bound candidate and clock. The delayed dispatch-registration test expected pending admission not to reset the current draft; main#506 intentionally confirms admission immediately, so the test now checks that behavior while retaining stale-registration rejection. The repaired two files pass115 tests; six other focused files passed102 tests. Full workspace/all-target Rust check passed.

Current main's browser migration and retired-case history are retained. The existing mobile retry journey now asserts that reload restores the exact paired envelope. It and the mobile detail-archive journey pass. New profile uncertainty coverage uses one mobile application case, registered in journey-contracts; identical desktop execution was removed after independent review identified redundant setup. Expiry/no-remint permutations remain at deterministic controller/database boundaries. Existing desktop profile success tours stay retired.

Independent browser review is tracked against the final revision before publication. Production acceptance and combined Accounts–Orbit–bot validation remain separate release gates.
