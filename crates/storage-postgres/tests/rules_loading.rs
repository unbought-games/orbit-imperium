use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use sqlx::PgPool;
use uuid::Uuid;

// This disposable database view rejects a repeated read of the same profile in a
// transaction, including read-only snapshots. The transaction-local setting
// resets at commit/rollback; no production instrumentation or global cache is used.
// STABLE lets PostgreSQL prune the profile projection for historical hash/count
// checks, so those separate integrity queries do not count as profile reads.
async fn limit_profile_reads(pool: &PgPool) {
    sqlx::raw_sql(
        "ALTER TABLE rulesets RENAME TO stored_rulesets;
         CREATE FUNCTION read_rules_profile(profile jsonb) RETURNS jsonb
         LANGUAGE plpgsql STABLE AS $$
         DECLARE counter text := 'orbit_test.rules_' || md5(profile::text);
         BEGIN
           IF current_setting(counter, true) = 'yes' THEN
             RAISE EXCEPTION 'rules profile read twice in one transaction';
           END IF;
           PERFORM set_config(counter, 'yes', true);
           RETURN profile;
         END $$;
         CREATE VIEW rulesets AS
           SELECT hash, id, read_rules_profile(profile) AS profile FROM stored_rulesets;",
    )
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn transaction_loaders_share_one_validated_ruleset() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let mut fixtures = Vec::new();
    for protocol in [2, 3, 4] {
        let universe = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("rules-{protocol}-{i}"),
            password: Uuid::new_v4().to_string(),
        });
        match protocol {
            2 => {
                store
                    .bootstrap_mvp(universe, 1000, &accounts, &[41; 32])
                    .await
            }
            3 => {
                store
                    .bootstrap_mvp_progression(universe, 1000, &accounts, &[42; 32])
                    .await
            }
            _ => {
                store
                    .bootstrap_mvp_fleets(universe, 1000, &accounts, &[43; 32])
                    .await
            }
        }
        .unwrap();
        store.set_test_time(1000).await.unwrap();
        let (account, player, body, epoch, galaxy, system): (Uuid, Uuid, Uuid, Uuid, i32, i32) =
            sqlx::query_as("SELECT m.account,m.player,b.id,u.epoch,b.galaxy,b.system FROM universe_memberships m JOIN bodies b ON b.owner=m.player JOIN universes u ON u.id=m.universe WHERE m.universe=$1 ORDER BY b.id LIMIT 1")
                .bind(universe.0).fetch_one(&pool).await.unwrap();
        let binding = Binding {
            account: AccountId(account),
            player: PlayerId(player),
            universe,
            epoch: Epoch(epoch),
        };
        let request = QuoteRequest::Upgrade {
            body: BodyId(body),
            building: Building::MetalMine,
        };
        let before = store
            .load_quote(Actor::Player(binding.player), universe, &request)
            .await
            .unwrap();
        let world = if protocol == 4 {
            Some(
                store
                    .load_scoped_snapshot(FactQuery::World {
                        binding,
                        query: WorldQueryKind::Galaxy {
                            galaxy: galaxy as u32,
                            system: system as u32,
                        },
                    })
                    .await
                    .unwrap(),
            )
        } else {
            None
        };
        let claim = if protocol < 4 {
            store
                .admit(
                    Actor::Player(binding.player),
                    universe,
                    CommandEnvelope {
                        command_id: CommandId(Uuid::new_v4()),
                        epoch: binding.epoch,
                        protocol,
                        command: Command::RecallFleet {
                            fleet: FleetId(Uuid::new_v4()),
                        },
                    },
                )
                .await
                .unwrap();
            let claim = store
                .claim_next(universe, WorkerId(Uuid::new_v4()))
                .await
                .unwrap()
                .unwrap();
            let snapshot = store.load_claim(&claim).await.unwrap();
            Some((claim, snapshot))
        } else {
            None
        };
        fixtures.push((binding, request, before, world, galaxy, system, claim));
    }
    limit_profile_reads(&pool).await;
    // Verify the probe itself detects repeated reads and rolls back cleanly.
    let mut probe = pool.begin().await.unwrap();
    sqlx::query("SELECT profile FROM rulesets LIMIT 1")
        .fetch_one(&mut *probe)
        .await
        .unwrap();
    let error = sqlx::query("SELECT profile FROM rulesets LIMIT 1")
        .fetch_one(&mut *probe)
        .await
        .unwrap_err();
    assert_eq!(
        error.as_database_error().unwrap().message(),
        "rules profile read twice in one transaction"
    );
    probe.rollback().await.unwrap();
    for (binding, request, before, world, galaxy, system, claim) in fixtures {
        let actor = Actor::Player(binding.player);
        let after = store
            .load_quote(actor, binding.universe, &request)
            .await
            .unwrap();
        assert_eq!(hash(&after.state), hash(&before.state));
        assert_eq!(after.rules, before.rules);
        assert_eq!(
            store.load_rules(binding.universe).await.unwrap(),
            before.rules
        );
        if let Some((claim, before)) = claim {
            let after = store.load_claim(&claim).await.unwrap();
            assert_eq!(hash(&after.state), hash(&before.state));
            assert_eq!(after.rules, before.rules);
            let result = transition(&after.state, &claim.input, &after.rules);
            assert!(matches!(result, TransitionResult::Rejected(_)));
            assert!(matches!(
                store.commit_claim(&claim, result).await.unwrap(),
                CommitOutcome::Committed { .. }
            ));
        }
        // A fresh operation must fetch and validate again, rather than retaining
        // an earlier transaction's rules. Speed remains checked against metadata.
        sqlx::query("UPDATE universes SET speed=speed+1 WHERE id=$1")
            .bind(binding.universe.0)
            .execute(&pool)
            .await
            .unwrap();
        assert!(matches!(
            store.load_quote(actor, binding.universe, &request).await,
            Err(StoreError::CorruptData)
        ));
        sqlx::query("UPDATE universes SET speed=speed-1 WHERE id=$1")
            .bind(binding.universe.0)
            .execute(&pool)
            .await
            .unwrap();
        if let Some(world) = world {
            let after = store
                .load_scoped_snapshot(FactQuery::World {
                    binding,
                    query: WorldQueryKind::Galaxy {
                        galaxy: galaxy as u32,
                        system: system as u32,
                    },
                })
                .await
                .unwrap();
            assert!(
                after.state.players.len() > 1,
                "exercise multiple owner progression loads"
            );
            assert_eq!(hash(&after.state), hash(&world.state));
            assert_eq!(after.rules, world.rules);
        }
    }
}
