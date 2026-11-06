//! Regression: site source facts must use the same journal, rollback and scope
//! fences as gameplay, including unknown-commit retries and retirement history.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use sqlx::PgPool;
use uuid::Uuid;

struct Fixture {
    store: PgStore,
    pool: PgPool,
    binding: Binding,
    scoped: bool,
    other: Binding,
}
impl Fixture {
    async fn new(scoped: bool) -> Self {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.set_test_time(1000).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("sites-{}-{i}", Uuid::new_v4()),
            password: Uuid::new_v4().to_string(),
        });
        store
            .bootstrap_mvp_raids(u, 1000, &accounts, &[19; 32])
            .await
            .unwrap();
        let auth = SessionService::new(store.clone())
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .unwrap();
        let binding = store
            .current_binding(auth.session.account, u)
            .await
            .unwrap()
            .0;
        let other_auth = SessionService::new(store.clone())
            .login(&accounts[1].name, &accounts[1].password, None)
            .await
            .unwrap();
        let other = store
            .current_binding(other_auth.session.account, u)
            .await
            .unwrap()
            .0;
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        Self {
            store,
            pool: PgPool::connect(&url).await.unwrap(),
            binding,
            scoped,
            other,
        }
    }
    fn key(&self) -> SiteIssuanceKey {
        SiteIssuanceKey {
            universe: self.binding.universe,
            epoch: self.binding.epoch,
            beneficiary: self.binding.player,
            key: "fixtures:regional-cache".into(),
        }
    }
    async fn admit(&self, declare: bool) -> CommandId {
        let command_id = CommandId(Uuid::new_v4());
        self.store
            .admit_presence_scoped(CommandEnvelopeV4 {
                protocol: 4,
                binding: self.binding,
                command_id,
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::BodyVisit,
                        paired_command_id: None,
                    },
                }),
            })
            .await
            .unwrap();
        if self.scoped && declare {
            self.store
                .declare_site_scope_for_test(self.binding.universe, command_id, &self.key())
                .await
                .unwrap();
        }
        command_id
    }
    async fn read(&self) -> MissionSite {
        let data: serde_json::Value =
            sqlx::query_scalar("SELECT data FROM mission_sites WHERE universe=$1 AND id=$2")
                .bind(self.binding.universe.0)
                .bind(self.key().id().0)
                .fetch_one(&self.pool)
                .await
                .unwrap();
        serde_json::from_value(data).unwrap()
    }
    async fn count(&self) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM mission_sites WHERE universe=$1")
            .bind(self.binding.universe.0)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
}
fn definition() -> SiteDefinition {
    SiteDefinition {
        schema_version: 1,
        id: "fixtures:regional-cache".into(),
        version: 1,
        placement: SitePlacementPolicy::Orbital,
        access: SiteAccessPolicy::BeneficiaryOnly,
        admission: SiteAdmissionPolicy::OneActiveOperation,
        debris: SiteDebrisPolicy::RetainedSiteLocal,
        initial_stock: Resources::all(20 * SCALE),
        forces: vec![],
        combat_technology: [0; 3],
    }
}
fn change(
    snapshot: &ClaimSnapshot,
    input: &OrderedInput,
    key: SiteIssuanceKey,
    step: u8,
) -> TransitionResult {
    let state = &snapshot.state;
    let rules = &snapshot.rules;
    let TransitionResult::Applied(mut change) = transition(state, input, rules) else {
        panic!("presence transition rejected")
    };
    let world = state.world.as_ref().unwrap();
    let mut sites = world.records.mission_sites.clone();
    let origin = state
        .bodies
        .values()
        .find(|b| b.owner == key.beneficiary)
        .unwrap()
        .coordinates;
    let id = issue_mission_site(
        &mut sites,
        key.clone(),
        definition(),
        origin,
        input,
        rules,
        &world.secret,
    )
    .unwrap();
    let site = sites.get_mut(&id).unwrap();
    let reference = SiteOperationReference {
        operation: OperationId(Uuid::from_u128(700)),
        fleet: FleetId(Uuid::from_u128(701)),
        actor: key.beneficiary,
    };
    let kinds = match step {
        0 => vec![SiteEventKind::Disclosed],
        1 => vec![SiteEventKind::OperationAccepted { reference }],
        2 => vec![SiteEventKind::Extracted {
            reference,
            free_capacity: 9 * SCALE,
            resources: raid_loot(site.remaining_stock().unwrap(), 9 * SCALE).unwrap(),
        }],
        3 => vec![SiteEventKind::Retired {
            reason: "fixture-complete".into(),
        }],
        4 => vec![SiteEventKind::OperationSettled {
            operation: reference.operation,
            fleet: reference.fleet,
        }],
        _ => vec![],
    };
    for kind in kinds {
        site.append(input, site.revision(), kind).unwrap();
    }
    attach_mission_sites(state, input, rules, &mut change, sites).unwrap();
    TransitionResult::Applied(change)
}
async fn fault(pool: &PgPool, stage: &str) {
    sqlx::query("CREATE TABLE IF NOT EXISTS orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL DEFAULT true,seen bigint NOT NULL DEFAULT 0)").execute(pool).await.unwrap();
    sqlx::query("INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES($1,'error',true) ON CONFLICT(stage) DO UPDATE SET mode='error',enabled=true").bind(stage).execute(pool).await.unwrap();
}

#[tokio::test]
async fn serial_site_commit_rollback_unknown_result_and_restart_preserve_finite_source() {
    let f = Fixture::new(false).await;
    for step in 0..=4 {
        f.admit(false).await;
        let claim = f
            .store
            .claim_next(f.binding.universe, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .unwrap();
        let snapshot = f.store.load_claim(&claim).await.unwrap();
        let result = change(&snapshot, &claim.input, f.key(), step);
        if step == 4 {
            let mut removed = snapshot.state.clone();
            removed.players.remove(&f.binding.player);
            removed
                .world
                .as_mut()
                .unwrap()
                .records
                .policies
                .get_mut(&f.binding.player)
                .unwrap()
                .lifecycle = PlayerLifecycle::Removed;
            let TransitionResult::Applied(c) = &result else {
                unreachable!()
            };
            validate_site_changes(
                &removed,
                &claim.input,
                &c.world.as_ref().unwrap().records.mission_sites,
                &snapshot.rules,
            )
            .unwrap();
        }
        if step == 0 {
            let TransitionResult::Applied(c) = &result else {
                unreachable!()
            };
            let sites = &c.world.as_ref().unwrap().records.mission_sites;
            let mut removed = snapshot.state.clone();
            removed
                .world
                .as_mut()
                .unwrap()
                .records
                .policies
                .get_mut(&f.binding.player)
                .unwrap()
                .lifecycle = PlayerLifecycle::Removed;
            assert_eq!(
                validate_site_changes(&removed, &claim.input, sites, &snapshot.rules),
                Err(SiteError::InsufficientCoverage)
            );
            let mut missing = snapshot.state.clone();
            missing.players.remove(&f.binding.player);
            assert_eq!(
                validate_site_changes(&missing, &claim.input, sites, &snapshot.rules),
                Err(SiteError::InsufficientCoverage)
            );
            fault(&f.pool, "after_writes").await;
            assert!(f.store.commit_claim(&claim, result.clone()).await.is_err());
            assert_eq!(
                f.count().await,
                0,
                "site and causal transition roll back together"
            );
        }
        if step == 2 {
            fault(&f.pool, "after_commit").await;
            assert!(f.store.commit_claim(&claim, result.clone()).await.is_err());
            assert_eq!(
                f.read().await.remaining_stock().unwrap(),
                Resources::all(17 * SCALE)
            );
        }
        assert!(matches!(
            f.store.commit_claim(&claim, result.clone()).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
        assert!(matches!(
            f.store.commit_claim(&claim, result).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
        if step == 0 {
            let game = GameService::new(f.store.clone());
            let principal = |b: Binding| Principal {
                account: b.account,
                player: b.player,
                universe: b.universe,
            };
            let context = |binding| QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            };
            let views = game
                .mission_sites(principal(f.binding), context(f.binding))
                .await
                .unwrap();
            assert_eq!(views.facts.data.len(), 1);
            let view = &views.facts.data[0];
            assert_eq!(
                serde_json::to_value(view).unwrap()["remaining_stock"]["metal"],
                (20 * SCALE).to_string()
            );
            assert_eq!(
                serde_json::to_value(view).unwrap()["destination"]["selection"]["expected_revision"],
                "1"
            );
            game.resolve_mission_site(
                principal(f.binding),
                context(f.binding),
                view.destination.selection,
            )
            .await
            .unwrap();
            assert!(matches!(
                game.resolve_mission_site(
                    principal(f.binding),
                    context(f.binding),
                    SiteSelection {
                        expected_revision: 0,
                        ..view.destination.selection
                    }
                )
                .await,
                Err(ServiceError::Conflict)
            ));
            assert!(matches!(
                game.mission_sites(principal(f.other), context(f.binding))
                    .await,
                Err(ServiceError::NotFound)
            ));
            assert!(
                game.mission_sites(principal(f.other), context(f.other))
                    .await
                    .unwrap()
                    .facts
                    .data
                    .is_empty()
            );
            assert!(matches!(
                game.resolve_mission_site(
                    principal(f.other),
                    context(f.other),
                    view.destination.selection
                )
                .await,
                Err(ServiceError::NotFound)
            ));
            let wrong = Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..f.binding
            };
            assert!(matches!(
                game.mission_sites(principal(f.binding), context(wrong))
                    .await,
                Err(ServiceError::EpochChanged)
            ));
        }
        if step == 3 {
            assert_eq!(f.read().await.active_references().len(), 1);
            let game = GameService::new(f.store.clone());
            assert!(
                game.mission_sites(
                    Principal {
                        account: f.binding.account,
                        player: f.binding.player,
                        universe: f.binding.universe
                    },
                    QueryContext {
                        binding: f.binding,
                        request_id: Uuid::new_v4()
                    }
                )
                .await
                .unwrap()
                .facts
                .data
                .is_empty()
            );
        }
    }
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    f.admit(false).await;
    let claim = reopened
        .claim_next(f.binding.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    // Indexed identity must match retained source facts. Constraints prevent
    // owner/key drift; load validation catches a mismatched physical primary ID.
    assert!(
        sqlx::query("UPDATE mission_sites SET beneficiary=$3 WHERE universe=$1 AND id=$2")
            .bind(f.binding.universe.0)
            .bind(f.key().id().0)
            .bind(f.other.player.0)
            .execute(&f.pool)
            .await
            .is_err()
    );
    let corrupt_id = Uuid::new_v4();
    sqlx::query("UPDATE mission_sites SET id=$3 WHERE universe=$1 AND id=$2")
        .bind(f.binding.universe.0)
        .bind(f.key().id().0)
        .bind(corrupt_id)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(matches!(
        reopened.load_claim(&claim).await,
        Err(StoreError::CorruptData)
    ));
    sqlx::query("UPDATE mission_sites SET id=$3 WHERE universe=$1 AND id=$2")
        .bind(f.binding.universe.0)
        .bind(corrupt_id)
        .bind(f.key().id().0)
        .execute(&f.pool)
        .await
        .unwrap();
    let snapshot = reopened.load_claim(&claim).await.unwrap();
    let loaded = &snapshot.state.world.as_ref().unwrap().records.mission_sites[&f.key().id()];
    assert_eq!(*loaded, f.read().await);
    assert!(loaded.retired());
    assert!(loaded.active_references().is_empty());
    assert_eq!(
        loaded.remaining_stock().unwrap(),
        Resources::all(17 * SCALE)
    );
    let result = change(&snapshot, &claim.input, f.key(), 5);
    reopened.commit_claim(&claim, result).await.unwrap();
    assert_eq!(f.count().await, 1);
}

#[tokio::test]
async fn scoped_site_mutation_requires_scope_and_fences_competing_extraction_and_retirement() {
    let f = Fixture::new(true).await;
    f.admit(false).await;
    let missing = f
        .store
        .claim_scoped(f.binding.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_scoped(&missing).await.unwrap();
    assert!(
        f.store
            .commit_scoped(&missing, change(&snapshot, &missing.input, f.key(), 0))
            .await
            .is_err()
    );
    assert_eq!(f.count().await, 0);
    f.store
        .commit_scoped(
            &missing,
            transition(&snapshot.state, &missing.input, &snapshot.rules),
        )
        .await
        .unwrap();
    for step in 0..=4 {
        if step != 3 {
            f.admit(true).await;
        }
        let claim = f
            .store
            .claim_scoped(f.binding.universe, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .unwrap();
        assert!(claim.scopes.contains(&ScopeKey::Site(f.key().id())));
        let snapshot = f.store.load_scoped(&claim).await.unwrap();
        assert!(
            snapshot
                .state
                .world
                .as_ref()
                .unwrap()
                .covered_sites
                .contains(&f.key().id())
        );
        let result = change(&snapshot, &claim.input, f.key(), step);
        if step == 2 {
            // Admit retirement while extraction is claimed. Their shared site
            // scope prevents the later transition from loading an earlier stock.
            f.admit(true).await;
            assert!(
                f.store
                    .claim_scoped(f.binding.universe, WorkerId(Uuid::new_v4()))
                    .await
                    .unwrap()
                    .is_none()
            );
            // Expire the first generation; only its replacement may debit stock.
            f.store
                .set_test_time(claim.input.at + 16_000)
                .await
                .unwrap();
            let replacement = f
                .store
                .claim_scoped(f.binding.universe, WorkerId(Uuid::new_v4()))
                .await
                .unwrap()
                .unwrap();
            assert_ne!(replacement.token, claim.token);
            assert_eq!(
                f.store.commit_scoped(&claim, result.clone()).await.unwrap(),
                CommitOutcome::StaleClaim
            );
            f.store.commit_scoped(&replacement, result).await.unwrap();
        } else {
            f.store.commit_scoped(&claim, result).await.unwrap();
        }
    }
    let saved = f.read().await;
    assert!(saved.retired());
    assert_eq!(saved.remaining_stock().unwrap(), Resources::all(17 * SCALE));
    assert!(saved.active_references().is_empty());
    assert_eq!(f.count().await, 1);
}

#[tokio::test]
async fn trusted_site_and_objective_composition_rolls_back_and_retries_as_one_commit() {
    // This tests the trusted Chat 3 composition seam, not live NPC combat.
    let f = Fixture::new(false).await;
    f.admit(false).await;
    let enrollment = f
        .store
        .claim_next(f.binding.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_claim(&enrollment).await.unwrap();
    let TransitionResult::Applied(mut changes) = change(&snapshot, &enrollment.input, f.key(), 5)
    else {
        unreachable!()
    };
    let reward = Resources::all(7 * SCALE);
    let run_id = enroll_objective_program(
        &snapshot.state,
        &enrollment.input,
        &snapshot.rules,
        &mut changes,
        f.binding.player,
        ObjectiveProgram {
            id: "site-composition-fixture".into(),
            version: 1,
            objectives: vec![ObjectiveDefinition {
                id: "contact".into(),
                explanation: "Fixture encounter evidence".into(),
                predicate: ObjectivePredicate::Attack,
                reward,
            }],
        },
    )
    .unwrap();
    f.store
        .commit_claim(&enrollment, TransitionResult::Applied(changes))
        .await
        .unwrap();
    assert!(!f.read().await.disclosed());

    f.admit(false).await;
    let claim = f
        .store
        .claim_next(f.binding.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = f.store.load_claim(&claim).await.unwrap();
    let home = snapshot.state.world.as_ref().unwrap().homeworlds[&f.binding.player];
    let before = snapshot.state.bodies[&home].checkpoint.amounts;
    let TransitionResult::Applied(mut changes) =
        transition(&snapshot.state, &claim.input, &snapshot.rules)
    else {
        panic!("presence rejected")
    };
    apply_objective_evidence(
        &snapshot.state,
        &claim.input,
        &snapshot.rules,
        &mut changes,
        vec![ObjectiveEvidence {
            input: claim.input.id,
            order: objective_order(&claim.input),
            actor: claim.input.actor,
            beneficiary: f.binding.player,
            operation: OperationId(Uuid::from_u128(900)),
            fact: ObjectiveFact::AttackResolved {
                fleet: FleetId(Uuid::from_u128(901)),
            },
        }],
    )
    .unwrap();
    let mut sites = snapshot
        .state
        .world
        .as_ref()
        .unwrap()
        .records
        .mission_sites
        .clone();
    sites
        .get_mut(&f.key().id())
        .unwrap()
        .append(&claim.input, 0, SiteEventKind::Disclosed)
        .unwrap();
    attach_mission_sites(
        &snapshot.state,
        &claim.input,
        &snapshot.rules,
        &mut changes,
        sites,
    )
    .unwrap();
    let records = &changes.world.as_ref().unwrap().records;
    assert!(records.mission_sites[&f.key().id()].disclosed());
    assert_eq!(records.objective_runs[&run_id].receipts.len(), 1);
    let result = TransitionResult::Applied(changes);
    fault(&f.pool, "after_writes").await;
    assert!(f.store.commit_claim(&claim, result.clone()).await.is_err());
    assert!(
        !f.read().await.disclosed(),
        "site disclosure rolled back with reward"
    );
    let stored: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM objective_runs WHERE id=$1")
            .bind(run_id.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let run: ObjectiveRun = serde_json::from_value(stored).unwrap();
    assert!(run.receipts.is_empty());
    let amounts: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_value::<Resources>(amounts).unwrap(),
        before
    );
    for _ in 0..2 {
        assert!(matches!(
            f.store.commit_claim(&claim, result.clone()).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
    }
    assert!(f.read().await.disclosed());
    assert_eq!(f.read().await.events.len(), 1);
    let amounts: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let after: Resources = serde_json::from_value(amounts).unwrap();
    for ((a, b), r) in after
        .values()
        .into_iter()
        .zip(before.values())
        .zip(reward.values())
    {
        assert_eq!(a - b, r);
    }
    let stored: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM objective_runs WHERE id=$1")
            .bind(run_id.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(
        serde_json::from_value::<ObjectiveRun>(stored)
            .unwrap()
            .receipts
            .len(),
        1
    );
}
