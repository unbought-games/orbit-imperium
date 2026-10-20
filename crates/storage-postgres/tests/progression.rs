use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use uuid::Uuid;
struct Journey {
    store: PgStore,
    game: GameService<PgStore>,
    binding: Binding,
    body: BodyId,
    at: i64,
}
impl Journey {
    fn principal(&self) -> Principal {
        Principal {
            account: self.binding.account,
            player: self.binding.player,
            universe: self.binding.universe,
        }
    }
    fn context(&self) -> QueryContext {
        QueryContext {
            binding: self.binding,
            request_id: Uuid::new_v4(),
        }
    }
    async fn view(&self) -> BoundView3 {
        self.game
            .progression_view(self.principal(), self.context())
            .await
            .unwrap()
            .facts
    }
    async fn drain(&self) {
        for _ in 0..1000 {
            if matches!(
                self.game
                    .step(self.binding.universe, WorkerId(Uuid::new_v4()))
                    .await
                    .unwrap(),
                StepOutcome::Idle
            ) {
                return;
            }
        }
        panic!("unbounded drain")
    }
    async fn time(&mut self, t: i64) {
        self.at = t;
        self.store.set_test_time(t).await.unwrap();
        self.drain().await;
    }
    async fn command(&self, c: Command) -> (CommandEnvelopeV3, BoundReceipt) {
        let e = CommandEnvelopeV3 {
            protocol: 3,
            binding: self.binding,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(c),
        };
        self.game
            .progression_submit(self.principal(), e.clone())
            .await
            .unwrap();
        self.drain().await;
        let receipt = self
            .game
            .bound_receipt(self.principal(), self.binding, e.command_id)
            .await
            .unwrap();
        (e, receipt)
    }
}
// Changing only the authoritative revision must invalidate in-flight work, while
// a fresh load can still commit without any second token to synchronize.
async fn assert_revision_fences_stale_work(j: &Journey, table: &str, at: i64) {
    j.store.set_test_time(at).await.unwrap();
    let claim = j
        .store
        .claim_next(j.binding.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let facts = j.store.load_claim(&claim).await.unwrap().state;
    let rules = j.store.load_rules(j.binding.universe).await.unwrap();
    let outcome = transition(&facts, &claim.input, &rules);
    assert!(matches!(outcome, TransitionResult::Applied(_)));
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let updated = sqlx::query(&format!("UPDATE {table} SET data=jsonb_set(data,'{{revision}}',to_jsonb((data->>'revision')::bigint+1)) WHERE universe=$1 AND data->>'status'='Active'"))
        .bind(j.binding.universe.0).execute(&pool).await.unwrap();
    assert_eq!(updated.rows_affected(), 1);
    assert!(matches!(
        j.store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Conflict
    ));
    let fresh = j.store.load_claim(&claim).await.unwrap().state;
    assert!(matches!(
        j.store
            .commit_claim(&claim, transition(&fresh, &claim.input, &rules))
            .await
            .unwrap(),
        CommitOutcome::Committed { .. }
    ));
}

#[tokio::test]
async fn concurrent_spend_deadline_ordering_and_restart_preserve_state() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("slice2-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    let secret = [31; 32];
    store
        .bootstrap_mvp_progression(u, 1000, &accounts, &secret)
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let candidate = game
        .current_binding(login.session.account, u, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(candidate.protocol, 3);
    let binding = candidate.binding;
    let p = Principal {
        account: binding.account,
        player: binding.player,
        universe: u,
    };
    let v = game
        .progression_view(
            p,
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert_eq!(v.bodies[0].amounts.metal, "1000000000");
    assert_eq!(v.bodies[0].amounts.crystal, "1000000000");
    assert_eq!(v.bodies[0].amounts.deuterium, "0");
    assert_eq!(v.bodies[0].levels.len(), 10);
    assert_eq!(v.research.len(), 7);
    assert!(
        !v.capabilities
            .iter()
            .find(|x| x.capability == "Transport")
            .unwrap()
            .enabled
    );
    let mut j = Journey {
        store,
        game,
        binding,
        body: v.bodies[0].id,
        at: 1000,
    };
    // Prepare only the prerequisites needed by the failure cases below. The
    // engine tests own progression formulas; this suite owns durable races.
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    for (building, level) in [
        (Building::MetalMine, 1),
        (Building::CrystalMine, 1),
        (Building::DeuteriumSynthesizer, 1),
        (Building::SolarPlant, 3),
        (Building::ResearchLab, 1),
        (Building::Shipyard, 1),
    ] {
        sqlx::query("UPDATE building_levels SET level=$2 WHERE body=$1 AND building=$3")
            .bind(j.body.0)
            .bind(i64::from(level))
            .bind(format!("{building:?}"))
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    sqlx::query("UPDATE bodies SET amounts=$2, revision=revision+1 WHERE id=$1")
        .bind(j.body.0)
        .bind(sqlx::types::Json(Resources::all(10000 * SCALE)))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count) VALUES($1,$2,$3,1)")
        .bind(j.body.0)
        .bind(j.binding.player.0)
        .bind(sqlx::types::Json(ManufacturedItem::Defense(
            DefenseId::RocketLauncher,
        )))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1 AND player=$2")
        .bind(u.0)
        .bind(j.binding.player.0)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND key IN ($2,$3)",
    )
    .bind(u.0)
    .bind(j.body.0)
    .bind(j.binding.player.0)
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    pool.close().await;
    let before = j.view().await;
    assert_eq!(before.bodies[0].inventories.len(), 1);
    j.store
        .bootstrap_mvp_progression(u, j.at + 1000, &accounts, &secret)
        .await
        .unwrap();
    let reopened = PgStore::connect(&url).await.unwrap();
    let guard = reopened.server_guard_config(None).await.unwrap();
    let after = GameService::new(reopened)
        .progression_view(j.principal(), j.context())
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(&before.bodies).unwrap(),
        serde_json::to_value(&after.bodies).unwrap()
    );
    assert_eq!(before.binding, after.binding);
    drop(guard);
    // Race two individually affordable prepaid orders against the same settled stock.
    j.time(j.at + 86_400_000).await;
    let metal = j.view().await.bodies[0]
        .amounts
        .metal
        .parse::<i64>()
        .unwrap();
    let quantity = metal / (2000 * SCALE) / 2 + 1;
    let q = QuoteRequest::Manufacture {
        body: j.body,
        item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
        quantity,
    };
    let terms = j
        .game
        .progression_options(j.principal(), j.context(), QuoteRequestDto3::Progression(q))
        .await
        .unwrap()
        .facts
        .inspection;
    assert!(terms.blockers.is_empty());
    let make = || CommandEnvelopeV3 {
        protocol: 3,
        binding: j.binding,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartManufacture {
            body: j.body,
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            quantity,
            expected_terms_hash: terms.terms_hash.clone().unwrap(),
        }),
    };
    let a = make();
    let b = make();
    let (ra, rb) = tokio::join!(
        j.game.progression_submit(j.principal(), a.clone()),
        j.game.progression_submit(j.principal(), b.clone())
    );
    ra.unwrap();
    rb.unwrap();
    j.drain().await;
    let ra = j
        .game
        .bound_receipt(j.principal(), j.binding, a.command_id)
        .await
        .unwrap();
    let rb = j
        .game
        .bound_receipt(j.principal(), j.binding, b.command_id)
        .await
        .unwrap();
    let statuses = [ra.status, rb.status];
    assert_eq!(
        statuses
            .iter()
            .filter(|s| matches!(s, ReceiptStatus::Committed { .. }))
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|s| matches!(
                s,
                ReceiptStatus::Rejected {
                    code: GameError::InsufficientResources
                }
            ))
            .count(),
        1
    );
    let final_due = j.view().await.progression.manufacturing[0].final_due_at;
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let next_due: i64 = sqlx::query_scalar("SELECT (data->>'next_due_at')::bigint FROM manufacturing_batches WHERE universe=$1 AND data->>'status'='Active'")
        .bind(u.0).fetch_one(&pool).await.unwrap();
    assert_revision_fences_stale_work(&j, "manufacturing_batches", next_due).await;
    j.time(final_due).await;
    // At the exact deadline the durable due event wins over the cancellation command.
    j.time(j.at + 86_400_000).await;
    let q = QuoteRequest::Research {
        host: j.body,
        research: ResearchId::ComputerTechnology,
    };
    let terms = j
        .game
        .progression_options(j.principal(), j.context(), QuoteRequestDto3::Progression(q))
        .await
        .unwrap()
        .facts
        .inspection;
    let (_, receipt) = j
        .command(Command::StartResearch {
            host: j.body,
            research: ResearchId::ComputerTechnology,
            expected_terms_hash: terms.terms_hash.unwrap(),
        })
        .await;
    assert!(matches!(receipt.status, ReceiptStatus::Committed { .. }));
    let op = j.view().await.progression.research_operation.unwrap();
    assert_revision_fences_stale_work(&j, "research_operations", op.due_at).await;
    j.at = op.due_at;
    j.store.set_test_time(j.at).await.unwrap();
    let (_, receipt) = j
        .command(Command::CancelResearch { operation: op.id })
        .await;
    assert_eq!(
        receipt.status,
        ReceiptStatus::Rejected {
            code: GameError::OperationNotActive
        }
    );
    assert!(j.view().await.progression.research_operation.is_none());
    let foreign = SessionService::new(j.store.clone())
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap();
    let f = j
        .game
        .current_binding(foreign.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    assert!(
        j.game
            .progression_view(
                Principal {
                    account: f.account,
                    player: f.player,
                    universe: u
                },
                j.context()
            )
            .await
            .is_err()
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    // Capacity follows committed storage levels across the deadline and restart,
    // without any current capacity column/row or journal mirror.
    for (action, expected_before, expected_after) in [
        (BuildingAction::Upgrade, "10000000000", "20000000000"),
        (BuildingAction::Demolition, "20000000000", "10000000000"),
    ] {
        sqlx::query("UPDATE bodies SET amounts=$2 WHERE id=$1")
            .bind(j.body.0)
            .bind(sqlx::types::Json(Resources::all(20000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        let request = if action == BuildingAction::Upgrade {
            QuoteRequest::Upgrade {
                body: j.body,
                building: Building::MetalStorage,
            }
        } else {
            QuoteRequest::Demolition {
                body: j.body,
                building: Building::MetalStorage,
            }
        };
        let terms = j
            .game
            .progression_options(
                j.principal(),
                j.context(),
                QuoteRequestDto3::Progression(request),
            )
            .await
            .unwrap()
            .facts
            .inspection;
        let cmd = if action == BuildingAction::Upgrade {
            Command::StartUpgrade {
                body: j.body,
                building: Building::MetalStorage,
                expected_terms_hash: terms.terms_hash.unwrap(),
            }
        } else {
            Command::StartDemolition {
                body: j.body,
                building: Building::MetalStorage,
                expected_terms_hash: terms.terms_hash.unwrap(),
            }
        };
        let (_, receipt) = j.command(cmd).await;
        assert!(matches!(receipt.status, ReceiptStatus::Committed { .. }));
        let view = j.view().await;
        let due = view.constructions[0].due_at;
        assert_eq!(view.bodies[0].capacity.metal, expected_before);
        j.time(due - 1).await;
        assert_eq!(j.view().await.bodies[0].capacity.metal, expected_before);
        j.time(due).await;
        j.store = PgStore::connect(&url).await.unwrap();
        j.game = GameService::new(j.store.clone());
        let view = j.view().await;
        assert_eq!(view.bodies[0].capacity.metal, expected_after);
        if action == BuildingAction::Demolition {
            assert!(view.bodies[0].amounts.metal.parse::<i64>().unwrap() > 10000 * SCALE);
        }
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM legacy_body_capacities")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM transition_journal j, jsonb_each(j.facts->'bodies') b WHERE b.value ? 'capacity'")
        .fetch_one(&pool).await.unwrap(), 0);
}

impl Journey {
    async fn quote(&self, request: QuoteRequest) -> Hash {
        let inspection = self
            .game
            .progression_options(
                self.principal(),
                self.context(),
                QuoteRequestDto3::Progression(request),
            )
            .await
            .unwrap()
            .facts
            .inspection;
        assert!(inspection.blockers.is_empty(), "{:?}", inspection.blockers);
        inspection.terms_hash.unwrap()
    }

    async fn race(&self, command: Command, rejected: GameError) {
        let envelope = || CommandEnvelopeV3 {
            protocol: 3,
            binding: self.binding,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(command.clone()),
        };
        let (a, b) = (envelope(), envelope());
        let (ra, rb) = tokio::join!(
            self.game.progression_submit(self.principal(), a.clone()),
            self.game.progression_submit(self.principal(), b.clone()),
        );
        ra.unwrap();
        rb.unwrap();
        let (wa, wb) = tokio::join!(
            self.game
                .step(self.binding.universe, WorkerId(Uuid::new_v4())),
            self.game
                .step(self.binding.universe, WorkerId(Uuid::new_v4())),
        );
        wa.unwrap();
        wb.unwrap();
        self.drain().await;
        let a = self
            .game
            .bound_receipt(self.principal(), self.binding, a.command_id)
            .await
            .unwrap();
        let b = self
            .game
            .bound_receipt(self.principal(), self.binding, b.command_id)
            .await
            .unwrap();
        let statuses = [a.status, b.status];
        assert_eq!(
            statuses
                .iter()
                .filter(|s| matches!(s, ReceiptStatus::Committed { .. }))
                .count(),
            1
        );
        assert_eq!(
            statuses
                .iter()
                .filter(|s| **s
                    == ReceiptStatus::Rejected {
                        code: rejected.clone()
                    })
                .count(),
            1
        );
    }
}

#[tokio::test]
async fn competing_construction_and_dome_admissions_derive_capacity_after_restart() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("reservations-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_progression(u, 1000, &accounts, &[32; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(login.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let body: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1")
        .bind(binding.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let mut j = Journey {
        store,
        game,
        binding,
        body: BodyId(body),
        at: 1000,
    };
    // Configure prerequisites before admitting any work, in this disposable universe only.
    sqlx::query("UPDATE building_levels SET level=CASE WHEN building='Shipyard' THEN 1 ELSE level END WHERE body=$1")
        .bind(body).execute(&pool).await.unwrap();
    sqlx::query(
        "UPDATE research_levels SET level=2 WHERE owner=$1 AND research='ShieldingTechnology'",
    )
    .bind(binding.player.0)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE bodies SET amounts=$2, revision=revision+1 WHERE id=$1")
        .bind(body)
        .bind(sqlx::types::Json(Resources::all(1_000_000 * SCALE)))
        .execute(&pool)
        .await
        .unwrap();
    let hash = j
        .quote(QuoteRequest::Upgrade {
            body: j.body,
            building: Building::MetalMine,
        })
        .await;
    j.race(
        Command::StartUpgrade {
            body: j.body,
            building: Building::MetalMine,
            expected_terms_hash: hash,
        },
        GameError::ActiveConstruction,
    )
    .await;
    assert_eq!(j.view().await.bodies[0].fields_reserved, 1);
    j.store = PgStore::connect(&url).await.unwrap();
    j.game = GameService::new(j.store.clone());
    assert_eq!(j.view().await.bodies[0].fields_reserved, 1);
    let operation = OperationId(Uuid::parse_str(&j.view().await.constructions[0].id).unwrap());
    let (_, cancelled) = j.command(Command::CancelConstruction { operation }).await;
    assert!(matches!(cancelled.status, ReceiptStatus::Committed { .. }));
    assert_eq!(j.view().await.bodies[0].fields_reserved, 0);
    let hash = j
        .quote(QuoteRequest::Upgrade {
            body: j.body,
            building: Building::MetalMine,
        })
        .await;
    let (_, receipt) = j
        .command(Command::StartUpgrade {
            body: j.body,
            building: Building::MetalMine,
            expected_terms_hash: hash,
        })
        .await;
    assert!(matches!(receipt.status, ReceiptStatus::Committed { .. }));
    let due = j.view().await.constructions[0].due_at;
    j.time(due).await;
    assert_eq!(j.view().await.bodies[0].fields_reserved, 0);
    assert_eq!(j.view().await.bodies[0].levels[&Building::MetalMine], 1);

    let item = ManufacturedItem::Defense(DefenseId::SmallShieldDome);
    let hash = j
        .quote(QuoteRequest::Manufacture {
            body: j.body,
            item,
            quantity: 1,
        })
        .await;
    j.race(
        Command::StartManufacture {
            body: j.body,
            item,
            quantity: 1,
            expected_terms_hash: hash,
        },
        GameError::CapacityReserved,
    )
    .await;
    j.store = PgStore::connect(&url).await.unwrap();
    j.game = GameService::new(j.store.clone());
    let batches = j.view().await.progression.manufacturing;
    assert_eq!(batches.len(), 1);
    j.time(batches[0].final_due_at).await;
    let view = j.view().await;
    assert!(view.progression.manufacturing.is_empty());
    assert_eq!(
        view.bodies[0]
            .inventories
            .iter()
            .find(|x| x.item == item)
            .unwrap()
            .count,
        "1"
    );
    let inspection = j
        .game
        .progression_options(
            j.principal(),
            j.context(),
            QuoteRequestDto3::Progression(QuoteRequest::Manufacture {
                body: j.body,
                item,
                quantity: 1,
            }),
        )
        .await
        .unwrap()
        .facts
        .inspection;
    assert!(
        inspection
            .blockers
            .iter()
            .any(|b| b.code == GameError::CapacityReserved)
    );
    let legacy: i64 = sqlx::query_scalar("SELECT count(*) FROM transition_journal WHERE universe=$1 AND (facts ? 'progression_reservations' OR outcome::text LIKE '%progression_reservations%' OR facts->'coverage' ? 'reservation_bodies')")
        .bind(u.0).fetch_one(&pool).await.unwrap();
    assert_eq!(
        legacy, 0,
        "new journals must not persist derived reservations"
    );
    let table: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('progression_reservations')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(table.is_none());
}
