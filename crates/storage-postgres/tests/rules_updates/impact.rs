use super::*;
use serde_json::Value;
use std::collections::BTreeMap;

// Fixed test-owned identifiers, never operator input. Replace each relation with
// a non-updatable function view that raises even when its original table is empty.
// Fresh application pools prevent prepared statements retaining the old table OID.
const GAMEPLAY_TABLES: &[&str] = &[
    "bodies",
    "building_levels",
    "research_levels",
    "inventories",
    "production_settings",
    "constructions",
    "research_operations",
    "manufacturing_batches",
    "asset_lots",
    "mission_fleets",
    "missile_flights",
    "debris_fields",
    "mission_reports",
    "transition_journal",
];

async fn snapshot(pool: &PgPool, tables: &[&str]) -> BTreeMap<String, Vec<Value>> {
    let mut result = BTreeMap::new();
    for table in tables {
        let rows = sqlx::query_scalar(&format!(
            "SELECT to_jsonb(t) FROM {table} t ORDER BY to_jsonb(t)::text"
        ))
        .fetch_all(pool)
        .await
        .unwrap();
        result.insert((*table).to_owned(), rows);
    }
    result
}

async fn forbid_gameplay_access(pool: &PgPool) {
    for table in GAMEPLAY_TABLES {
        sqlx::raw_sql(&format!(
            "ALTER TABLE {table} RENAME TO impact_saved_{table};
             CREATE FUNCTION impact_read_{table}() RETURNS SETOF impact_saved_{table}
             LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forbidden gameplay read: {table}'; END $$;
             CREATE VIEW {table} AS SELECT * FROM impact_read_{table}();"
        )).execute(pool).await.unwrap();
        let read = sqlx::query(&format!("SELECT * FROM {table}"))
            .fetch_all(pool)
            .await
            .unwrap_err();
        assert!(read.to_string().contains("forbidden gameplay read"));
        let write = sqlx::query(&format!("DELETE FROM {table}"))
            .execute(pool)
            .await
            .unwrap_err();
        assert!(write.to_string().contains("cannot delete from view"));
    }
}

async fn allow_gameplay_access(pool: &PgPool) {
    for table in GAMEPLAY_TABLES.iter().rev() {
        sqlx::raw_sql(&format!(
            "DROP VIEW {table}; DROP FUNCTION impact_read_{table}();
             ALTER TABLE impact_saved_{table} RENAME TO {table};"
        ))
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn mode(store: &PgStore, u: UniverseId, scoped: bool) {
    if scoped {
        store.prepare_scoped_runtime(u, 1).await.unwrap();
        store.activate_scoped_runtime(u).await.unwrap();
    }
}

fn set_debris(document: &mut RulesDocument, bps: u32) {
    document
        .artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .ship_debris_bps = bps;
}

#[tokio::test]
async fn debris_activation_preserves_admitted_claimed_and_queued_ordering() {
    activation_ordering(true).await;
}

#[tokio::test]
async fn debris_activation_never_accesses_gameplay_state_in_either_runtime() {
    for scoped in [false, true] {
        let (store, pool, u, binding) = setup().await;
        mode(&store, u, scoped).await;
        let (initial, _) = store.bound_world(binding).await.unwrap().facts;
        let body = *initial.state.bodies.keys().next().unwrap();
        let quote = inspect_progression(
            &initial.state,
            Actor::Player(binding.player),
            &QuoteRequest::Upgrade {
                body,
                building: Building::MetalMine,
            },
            initial.at,
            &initial.rules,
        )
        .unwrap();
        gameplay::command(
            &store,
            binding,
            Command::StartUpgrade {
                body,
                building: Building::MetalMine,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (before, _) = store.bound_world(binding).await.unwrap().facts;
        assert!(
            before
                .state
                .constructions
                .values()
                .any(|c| c.status == ConstructionStatus::Active && c.due_at > 1019)
        );
        let other = store
            .ensure_signup_universe(Some(UniverseId(Uuid::new_v4())), Default::default(), None)
            .await
            .unwrap()
            .universe;
        let other_rules = store.load_rules(other).await.unwrap();
        let mut doc = RulesService::new(store.clone()).export(u).await.unwrap();
        set_debris(&mut doc, 5000);
        let cursor = store
            .read_updates(binding, None, 128)
            .await
            .unwrap()
            .items
            .last()
            .unwrap()
            .cursor
            .clone()
            .unwrap();
        let data_before = snapshot(&pool, GAMEPLAY_TABLES).await;
        store.set_test_time(1007).await.unwrap();
        forbid_gameplay_access(&pool).await;
        let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        let service = RulesService::new(reopened.clone());
        let preview = service.diff(&doc).await.unwrap();
        assert_eq!(preview.impact, RulesUpdateImpact::RulesOnly);
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::Applied {
                revision: 1,
                effective_at: 1007,
                ..
            }
        ));
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::AlreadyActive { revision: 1, .. }
        ));
        let mut stale = doc.clone();
        set_debris(&mut stale, 6000);
        assert!(matches!(
            service.apply(&stale).await,
            Err(RulesUpdateError::Stale { .. })
        ));
        assert_eq!(reopened.load_rules(other).await.unwrap(), other_rules);
        let updates = reopened
            .read_updates(binding, Some(&cursor), 128)
            .await
            .unwrap();
        assert!(
            updates
                .items
                .iter()
                .any(|x| matches!(x.event, StreamEvent::Invalidate { .. }))
        );
        allow_gameplay_access(&pool).await;
        assert_eq!(snapshot(&pool, GAMEPLAY_TABLES).await, data_before);
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
                .bind(u.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
        reopened.set_test_time(1019).await.unwrap();
        let (after, _) = reopened.bound_world(binding).await.unwrap().facts;
        assert_eq!(after.state.bodies[&body], before.state.bodies[&body]);
        let expected = settle_economy(&before.state.bodies[&body], 1019, &before.rules).unwrap();
        assert_eq!(
            settle_economy(&after.state.bodies[&body], 1019, &after.rules).unwrap(),
            expected
        );
        assert!(expected.amounts.metal > before.state.bodies[&body].checkpoint.amounts.metal);
    }
}

#[tokio::test]
async fn production_and_mixed_updates_keep_exact_old_and_new_accrual() {
    for scoped in [false, true] {
        for speed_change in [false, true] {
            let (store, pool, u, binding) = setup().await;
            mode(&store, u, scoped).await;
            let (before, _) = store.bound_world(binding).await.unwrap().facts;
            let body = *before.state.bodies.keys().next().unwrap();
            let service = RulesService::new(store.clone());
            let mut doc = service.export(u).await.unwrap();
            if speed_change {
                doc.speed = 3;
            } else {
                doc.artifact.base_income[0] = 41;
            }
            set_debris(&mut doc, 5000);
            assert_eq!(
                service.diff(&doc).await.unwrap().impact,
                RulesUpdateImpact::SettleAndInitialize
            );
            let at = 3_601_007;
            store.set_test_time(at).await.unwrap();
            let expected_boundary =
                settle_economy(&before.state.bodies[&body], at, &before.rules).unwrap();
            assert!(matches!(
                service.apply(&doc).await.unwrap(),
                RulesApplyOutcome::Applied { .. }
            ));
            let (after, _) = store.bound_world(binding).await.unwrap().facts;
            let settled = &after.state.bodies[&body];
            assert_eq!(settled.checkpoint, expected_boundary);
            assert_eq!(settled.revision, before.state.bodies[&body].revision + 1);
            let later = 7_201_019;
            let final_state = settle_economy(settled, later, &after.rules).unwrap();
            // Independent integer calculation at level zero, including the fractional carry.
            let old_rate =
                before.rules.artifact.base_income[0] * i64::from(before.rules.speed) * SCALE;
            let new_rate = doc.artifact.base_income[0] * i64::from(doc.speed) * SCALE;
            let accrued = i128::from(old_rate) * i128::from(at - 1000)
                + i128::from(new_rate) * i128::from(later - at);
            assert_eq!(
                final_state.amounts.metal,
                before.state.bodies[&body].checkpoint.amounts.metal
                    + i64::try_from(accrued / 3_600_000).unwrap()
            );
            assert_eq!(
                final_state.carry.metal,
                i64::try_from(accrued % 3_600_000).unwrap()
            );
            assert!(matches!(
                service.apply(&doc).await.unwrap(),
                RulesApplyOutcome::AlreadyActive { .. }
            ));
            let stored: i64 = sqlx::query_scalar("SELECT revision FROM bodies WHERE id=$1")
                .bind(body.0)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stored, settled.revision);
        }
    }
}

#[tokio::test]
async fn rules_only_publication_failure_is_atomic_and_retryable() {
    for scoped in [false, true] {
        let (store, pool, u, _) = setup().await;
        mode(&store, u, scoped).await;
        let service = RulesService::new(store.clone());
        let original = store.load_rules(u).await.unwrap();
        let mut doc = service.export(u).await.unwrap();
        set_debris(&mut doc, 5000);
        let tables = [
            "rulesets",
            "universes",
            "rules_activations",
            "viewer_heads",
            "world_heads",
            "game_updates",
            "game_update_heads",
        ];
        let before = snapshot(&pool, &tables).await;
        sqlx::raw_sql("CREATE FUNCTION impact_fail_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'impact publication failure'; END $$; CREATE TRIGGER impact_fail_publication BEFORE INSERT ON game_updates FOR EACH ROW EXECUTE FUNCTION impact_fail_publication();").execute(&pool).await.unwrap();
        assert!(service.apply(&doc).await.is_err());
        assert_eq!(snapshot(&pool, &tables).await, before);
        assert_eq!(store.load_rules(u).await.unwrap(), original);
        sqlx::raw_sql("DROP TRIGGER impact_fail_publication ON game_updates; DROP FUNCTION impact_fail_publication();").execute(&pool).await.unwrap();
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::Applied { revision: 1, .. }
        ));
        assert!(matches!(
            service.apply(&doc).await.unwrap(),
            RulesApplyOutcome::AlreadyActive { revision: 1, .. }
        ));
    }
}
