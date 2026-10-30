use super::*;
use serde_json::{Value, json};

// Fixture preparation inserts a historical snapshot; production never rewrites identities.
pub(super) async fn install_legacy(store: &PgStore, pool: &PgPool, u: UniverseId) -> Value {
    let current = store.load_rules(u).await.unwrap();
    let wire = legacy_wire(&serde_json::to_value(&current).unwrap());
    assert_ne!(wire["hash"], json!(current.hash));
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(wire["hash"].as_str().unwrap())
        .bind(&current.artifact.id)
        .bind(&wire)
        .execute(pool)
        .await
        .unwrap();
    let stored: Value = sqlx::query_scalar("SELECT profile FROM rulesets WHERE hash=$1")
        .bind(wire["hash"].as_str().unwrap())
        .fetch_one(pool)
        .await
        .unwrap();
    assert_eq!(stored, wire);
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(wire["hash"].as_str().unwrap())
        .execute(pool)
        .await
        .unwrap();
    wire
}
#[tokio::test]
async fn historical_jsonb_reads_noops_and_real_updates_preserve_original_record() {
    let (store, pool, u, _) = setup().await;
    let original = install_legacy(&store, &pool, u).await;
    let hash = original["hash"].as_str().unwrap();
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    reopened.ready().await.unwrap();
    let rules = reopened.load_rules(u).await.unwrap();
    assert_eq!(rules.hash.0, hash);
    assert_eq!(serde_json::to_value(&rules).unwrap(), original);
    let service = RulesService::new(reopened.clone());
    let document = service.export(u).await.unwrap();
    let diff = service.diff(&document).await.unwrap();
    assert!(diff.changes.is_empty());
    assert_eq!(diff.current_hash, diff.proposed_hash);
    assert!(
        matches!(service.apply(&document).await.unwrap(), RulesApplyOutcome::AlreadyActive { profile_hash, revision } if profile_hash.0 == hash && revision == document.base_revision)
    );
    // Store callers get the same no-op behavior even if they normalized defaults themselves.
    let normalized = Ruleset::from_artifact(document.artifact.clone(), document.speed).unwrap();
    assert_ne!(normalized.hash, rules.hash);
    assert!(
        matches!(reopened.apply_rules(u, document.base_revision, &normalized).await.unwrap(), RulesApplyOutcome::AlreadyActive { profile_hash, .. } if profile_hash == rules.hash)
    );
    reopened.prepare_scoped_runtime(u, 1).await.unwrap();
    reopened.activate_scoped_runtime(u).await.unwrap();
    assert!(
        matches!(reopened.apply_rules(u, document.base_revision, &normalized).await.unwrap(), RulesApplyOutcome::AlreadyActive { profile_hash, .. } if profile_hash == rules.hash)
    );
    let mut edited = document.clone();
    edited.artifact.base_income[0] += 1;
    assert!(!service.diff(&edited).await.unwrap().changes.is_empty());
    assert!(matches!(
        service.apply(&edited).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert_ne!(
        reopened.load_rules(u).await.unwrap().hash.clone(),
        rules.hash
    );
    let retained: Value = sqlx::query_scalar("SELECT profile FROM rulesets WHERE hash=$1")
        .bind(hash)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(retained, original);
    let activations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(activations, 1);
}

pub(super) fn legacy_wire(current: &Value) -> Value {
    let wire = serde_json::to_string(current)
        .unwrap()
        .replace("Dreadnought", "Deathstar");
    let mut wire: Value = serde_json::from_str(&wire).unwrap();
    wire["artifact"]["world"]
        .as_object_mut()
        .unwrap()
        .remove("beginner_protection_multiplier");
    wire["hash"] = json!(hash(&(&wire["artifact"], &wire["speed"])));
    wire
}

#[tokio::test]
async fn legacy_inventory_key_commits_without_rewrite_and_keeps_live_fences() {
    let (store, pool, u, binding) = setup().await;
    let body: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1")
        .bind(binding.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let legacy = json!({"kind":"Ship","id":"Deathstar"});
    // Zero stock exercises a retained identity without enabling a disabled ship.
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,0,0)")
        .bind(body)
        .bind(binding.player.0)
        .bind(&legacy)
        .execute(&pool)
        .await
        .unwrap();
    let command = || CommandEnvelope {
        command_id: CommandId(Uuid::new_v4()),
        epoch: binding.epoch,
        protocol: 4,
        command: Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(BodyId(body)),
                cause: PresenceCause::AccountVisit,
                paired_command_id: None,
            },
        },
    };
    store
        .admit(Actor::Player(binding.player), u, command())
        .await
        .unwrap();
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = store.load_claim(&claim).await.unwrap();
    let (facts, rules) = (snapshot.state, snapshot.rules);
    let previous = facts
        .inventories
        .iter()
        .find(|x| x.item == ManufacturedItem::Ship(ShipType::Dreadnought))
        .unwrap();
    let TransitionResult::Applied(changes) = transition(&facts, &claim.input, &rules) else {
        panic!("presence must apply");
    };
    let mut changes = *changes;
    let mut inventory = previous.clone();
    inventory.revision += 1;
    changes.inventories.push(inventory);
    let mut stale = changes.clone();
    stale.expected_facts_hash = Hash("stale".into());
    assert!(matches!(
        store
            .commit_claim(&claim, TransitionResult::Applied(Box::new(stale)))
            .await
            .unwrap(),
        CommitOutcome::Conflict
    ));
    let mut stale = changes.clone();
    *stale
        .expected_collection_revisions
        .values_mut()
        .next()
        .unwrap() += 1;
    assert!(matches!(
        store
            .commit_claim(&claim, TransitionResult::Applied(Box::new(stale)))
            .await
            .unwrap(),
        CommitOutcome::Conflict
    ));
    let outcome = TransitionResult::Applied(Box::new(changes));
    assert!(matches!(
        store.commit_claim(&claim, outcome.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let saved: (Value, i64, i64) =
        sqlx::query_as("SELECT item,count,revision FROM inventories WHERE body=$1 AND item=$2")
            .bind(body)
            .bind(&legacy)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved, (legacy.clone(), 0, 1));
    let canonical = json!({"kind":"Ship","id":"Dreadnought"});
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,0,1)")
        .bind(body)
        .bind(binding.player.0)
        .bind(&canonical)
        .execute(&pool)
        .await
        .unwrap();
    store
        .admit(Actor::Player(binding.player), u, command())
        .await
        .unwrap();
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(
        matches!(store.load_claim(&claim).await, Err(StoreError::CorruptData)),
        "colliding spellings must be rejected before executing work"
    );
    let revisions: Vec<i64> = sqlx::query_scalar(
        "SELECT revision FROM inventories WHERE body=$1 AND (item=$2 OR item=$3)",
    )
    .bind(body)
    .bind(legacy)
    .bind(&canonical)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(revisions, vec![1, 1], "ambiguous identities must not write");
    sqlx::query("DELETE FROM inventories WHERE body=$1 AND item=$2")
        .bind(body)
        .bind(canonical)
        .execute(&pool)
        .await
        .unwrap();
    GameService::new(store).resolve_claim(claim).await.unwrap();
}
