use super::*;

async fn version_three() -> (PgStore, PgPool, UniverseId, Binding) {
    let (store, pool, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    let mut document = service.export(universe).await.unwrap();
    let mut artifact: RulesArtifact =
        serde_json::from_slice(include_bytes!("../../../../rules/mvp-v1-slice-11.json")).unwrap();
    artifact.universe = document.artifact.universe;
    artifact.id = "friends".into();
    artifact.base_income[0] = 45;
    document.artifact = artifact;
    service.apply(&document).await.unwrap();
    (store, pool, universe, binding)
}

async fn start_mine(store: &PgStore, binding: Binding) {
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let body = *snapshot.state.bodies.keys().next().unwrap();
    let terms = inspect_progression(
        &snapshot.state,
        Actor::Player(binding.player),
        &QuoteRequest::Upgrade {
            body,
            building: Building::MetalMine,
        },
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    let command_id = CommandId(Uuid::new_v4());
    store
        .bound_admit4(ForegroundAction {
            gameplay: CommandEnvelopeV4 {
                protocol: 4,
                binding,
                command_id,
                command: CommandDto3::Progression(Command::StartUpgrade {
                    body,
                    building: Building::MetalMine,
                    expected_terms_hash: terms.terms_hash.unwrap(),
                }),
            },
            presence: CommandEnvelopeV4 {
                protocol: 4,
                binding,
                command_id: CommandId(Uuid::new_v4()),
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: Some(body),
                        cause: PresenceCause::GameplayGesture,
                        paired_command_id: Some(command_id),
                    },
                }),
            },
        })
        .await
        .unwrap();
    for _ in 0..2 {
        assert!(matches!(
            GameService::new(store.clone())
                .step(binding.universe, WorkerId(Uuid::new_v4()))
                .await
                .unwrap(),
            StepOutcome::Committed { .. }
        ));
    }
}

#[tokio::test]
async fn standard_upgrade_retains_paid_work_and_identity_is_read_only_until_apply_and_repeats_safely()
 {
    let (store, pool, universe, binding) = version_three().await;
    let (_, _, other, _) = setup().await;
    let other_rules = store.load_rules(other).await.unwrap();
    start_mine(&store, binding).await;
    let service = RulesService::new(store.clone());
    let (before, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(before.state.constructions.len(), 1);
    let private: (Uuid, Vec<u8>) = sqlx::query_as(
        "SELECT epoch,secret FROM universes JOIN mvp_bootstraps ON id=universe WHERE id=$1",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let activation_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let plan = service.prepare_upgrade(universe).await.unwrap();
    assert_eq!(plan.release, "0.8.0");
    assert!(!plan.diff.changes.is_empty());
    assert_eq!(
        plan.diff.initialize.add_research,
        vec![
            ResearchId::PlasmaTechnology,
            ResearchId::HyperspaceTechnology,
            ResearchId::HyperspaceDrive
        ]
    );
    assert_eq!(store.load_rules(universe).await.unwrap(), before.rules);
    let after_preview: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(after_preview, activation_count);
    let current_revision = plan.document.base_revision;
    assert!(
        matches!(service.apply(&plan.document).await.unwrap(), RulesApplyOutcome::Applied { revision, .. } if revision == current_revision+1)
    );
    let (after, _) = store.bound_world(binding).await.unwrap().facts;
    let mut expected_research = before.state.research[&binding.player].levels.clone();
    expected_research.insert(ResearchId::PlasmaTechnology, 0);
    expected_research.insert(ResearchId::HyperspaceTechnology, 0);
    expected_research.insert(ResearchId::HyperspaceDrive, 0);
    assert_eq!(
        after.state.research[&binding.player].levels,
        expected_research
    );
    assert!(
        after
            .rules
            .artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Defense(DefenseId::PlasmaTurret) && e.enabled)
    );
    assert!(
        after
            .rules
            .artifact
            .catalog
            .iter()
            .find(|e| e.key == CatalogKey::Ship(ShipType::Bomber))
            .unwrap()
            .enabled
    );
    assert!(after.rules.artifact.catalog.iter().any(|entry| entry.key
        == CatalogKey::Defense(DefenseId::LargeShieldDome)
        && entry.enabled));
    assert!(
        after
            .rules
            .artifact
            .world
            .as_ref()
            .unwrap()
            .combat
            .units
            .iter()
            .any(|unit| unit.item == ManufacturedItem::Defense(DefenseId::LargeShieldDome))
    );
    assert_eq!(after.state.players, before.state.players);
    assert_eq!(after.state.epoch, before.state.epoch);
    assert_eq!(after.state.constructions, before.state.constructions);
    assert_eq!(
        after.state.manufacturing_batches,
        before.state.manufacturing_batches
    );
    assert_eq!(
        after.state.research_operations,
        before.state.research_operations
    );
    assert_eq!(after.state.inventories, before.state.inventories);
    assert_eq!(after.state.fleets, before.state.fleets);
    assert_eq!(
        after.rules.artifact.base_income,
        before.rules.artifact.base_income
    );
    assert_eq!(after.rules.speed, before.rules.speed);
    assert_eq!(
        after.rules.artifact.universe,
        before.rules.artifact.universe
    );
    let retained: (Uuid, Vec<u8>) = sqlx::query_as(
        "SELECT epoch,secret FROM universes JOIN mvp_bootstraps ON id=universe WHERE id=$1",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(private, retained);
    assert_eq!(store.load_rules(other).await.unwrap(), other_rules);
    let repeat = service.prepare_upgrade(universe).await.unwrap();
    assert!(repeat.diff.changes.is_empty());
    assert!(matches!(
        service.apply(&repeat.document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
        .bind(universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, activation_count + 1);
    let due: i64 = sqlx::query_scalar("SELECT due_at FROM constructions WHERE universe=$1")
        .bind(universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    store.set_test_time(due).await.unwrap();
    assert!(matches!(
        GameService::new(store.clone())
            .step(universe, WorkerId(Uuid::new_v4()))
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    let paid: serde_json::Value =
        sqlx::query_scalar("SELECT paid FROM constructions WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        paid,
        serde_json::to_value(before.state.constructions.values().next().unwrap().paid).unwrap()
    );
    store.audit_universe(universe).await.unwrap();
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("plasma{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='PlasmaTechnology'",
    )
    .bind(joined.session.memberships[0].player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    let hyperspace: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='HyperspaceTechnology'",
    )
    .bind(joined.session.memberships[0].player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(hyperspace, 0);
    // A restarted operator independently derives the same no-op proposal.
    let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    assert!(
        RulesService::new(restarted)
            .prepare_upgrade(universe)
            .await
            .unwrap()
            .diff
            .changes
            .is_empty()
    );
}

#[tokio::test]
async fn stale_proposal_and_custom_content_fail_without_activation() {
    let (store, pool, universe, _) = version_three().await;
    let service = RulesService::new(store.clone());
    let plan = service.prepare_upgrade(universe).await.unwrap();
    let mut other_edit = service.export(universe).await.unwrap();
    other_edit.artifact.base_income[0] = 46;
    other_edit.speed = 3;
    service.apply(&other_edit).await.unwrap();
    assert!(matches!(
        service.apply(&plan.document).await,
        Err(RulesUpdateError::Stale { .. })
    ));
    let next = service.prepare_upgrade(universe).await.unwrap();
    assert_eq!(
        next.document.speed, 3,
        "upgrade preserves a live speed change"
    );
    service.apply(&next.document).await.unwrap();
    assert_eq!(store.load_rules(universe).await.unwrap().speed, 3);
    let mut custom = service.export(universe).await.unwrap();
    custom
        .artifact
        .ships
        .get_mut(&ShipType::LargeCargo)
        .unwrap()
        .capacity = 40000;
    service.apply(&custom).await.unwrap();
    let before = service.export(universe).await.unwrap();
    assert!(matches!(
        service.prepare_upgrade(universe).await,
        Err(RulesUpdateError::StandardContent(
            StandardRulesError::Conflicts(_)
        ))
    ));
    let after = service.export(universe).await.unwrap();
    assert_eq!(before.base_revision, after.base_revision);
    assert_eq!(before.artifact, after.artifact);
    let pending: i64 =
        sqlx::query_scalar("SELECT count(*) FROM runtime_barriers WHERE universe=$1 AND NOT done")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn retry_observes_the_same_pending_upgrade_and_does_not_replace_another_activation() {
    let (store, pool, universe, binding) = version_three().await;
    store.prepare_scoped_runtime(universe, 1).await.unwrap();
    store.activate_scoped_runtime(universe).await.unwrap();
    store
        .admit(
            Actor::Player(binding.player),
            universe,
            CommandEnvelope {
                command_id: CommandId(Uuid::new_v4()),
                epoch: binding.epoch,
                protocol: 4,
                command: Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::AccountVisit,
                        paired_command_id: None,
                    },
                },
            },
        )
        .await
        .unwrap();
    let service = RulesService::new(store.clone());
    let first = service.prepare_upgrade(universe).await.unwrap();
    let id = match service.apply(&first.document).await {
        Err(RulesUpdateError::Pending { id }) => id,
        result => panic!("expected pending: {result:?}"),
    };
    let retry = service.prepare_upgrade(universe).await.unwrap();
    assert_eq!(retry.diff.proposed_hash, first.diff.proposed_hash);
    assert!(
        matches!(service.apply(&retry.document).await, Err(RulesUpdateError::Pending { id: same }) if same == id)
    );
    let mut unrelated = service.export(universe).await.unwrap();
    unrelated.artifact.base_income[0] = 47;
    assert!(matches!(
        service.apply(&unrelated).await,
        Err(RulesUpdateError::Busy)
    ));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM runtime_barriers WHERE universe=$1 AND NOT done")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    assert!(matches!(
        GameService::new(store.clone())
            .step_scoped(universe, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    assert!(store.process_runtime_barrier(universe).await.unwrap());
    let completed = service.prepare_upgrade(universe).await.unwrap();
    assert!(completed.diff.changes.is_empty());
    assert!(matches!(
        service.apply(&completed.document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    store.audit_universe(universe).await.unwrap();
}
