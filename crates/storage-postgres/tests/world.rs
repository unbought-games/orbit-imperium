use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore, PoolLimits};
use uuid::Uuid;
#[tokio::test]
async fn paired_admission_rejected_gameplay_restart_and_passive_reads() {
    // Keep each scenario's future on the heap and drop its snapshots before the
    // next scenario. One debug-build poll frame for this entire journey can
    // exhaust the native test thread stack on Linux.
    let mut fixture = Box::pin(paired_presence_and_restart()).await;
    let due = Box::pin(completed_assets_preserve_other_owners(&fixture)).await;
    let (fb, pool) = Box::pin(report_pagination_and_privacy(&fixture)).await;
    fixture.pool = pool;
    let accepted = Box::pin(scoped_claim_ordering(&fixture, fb, due)).await;
    Box::pin(staged_commit_recovery(&fixture, accepted, due)).await;
    Box::pin(scoped_transport_catches_up_before_later_recipient_work(
        &fixture.store,
        &fixture.pool,
        fixture.b,
        fb,
        fixture.body,
    ))
    .await;
    Box::pin(concurrent_report_preferences(
        &fixture.url,
        &fixture.store,
        &fixture.pool,
        fixture.b,
        fb,
    ))
    .await;
}

struct RuntimeFixture {
    url: String,
    store: PgStore,
    reopened: PgStore,
    pool: sqlx::PgPool,
    accounts: [MvpAccount; 5],
    b: Binding,
    body: BodyId,
    outsider: Uuid,
}
impl RuntimeFixture {
    fn principal(&self) -> Principal {
        Principal {
            account: self.b.account,
            player: self.b.player,
            universe: self.b.universe,
        }
    }
    fn context(&self) -> QueryContext {
        QueryContext {
            binding: self.b,
            request_id: Uuid::new_v4(),
        }
    }
}

async fn paired_presence_and_restart() -> RuntimeFixture {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect_with_limits(
        &url,
        PoolLimits {
            refresh: 2,
            admission: 1,
            reads: 1,
            worker: 1,
            control: 4,
        },
    )
    .await
    .unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("world-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[31; 32])
        .await
        .unwrap();
    store.set_test_time(604801000).await.unwrap();
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let p = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let context = || QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    };
    let v = game.world_view(p, context()).await.unwrap();
    assert!(!v.has_unread_reports);
    let body = v.progression.bodies[0].id;
    assert_eq!(v.progression.protocol, 4);
    assert!(
        !v.progression
            .capabilities
            .iter()
            .any(|c| c.capability == "Attack")
    );
    assert_eq!(v.missions.score_value_micro, "0");
    let (before, _) = store.bound_world(b).await.unwrap().facts;
    assert_eq!(
        before.state.players.len(),
        1,
        "a player's snapshot must not load the universe"
    );
    assert_eq!(world_facts(&before.state).unwrap().covered_players.len(), 1);
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let outsider: Uuid =
        sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 AND id<>$2 LIMIT 1")
            .bind(u.0)
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{revision}','-1') WHERE id=$1")
        .bind(outsider)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        store.bound_world(b).await.is_ok(),
        "unrelated facts do not enter a local read"
    );
    assert!(
        store.audit_universe(u).await.is_err(),
        "explicit audit must still cover every player"
    );
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{revision}','0') WHERE id=$1")
        .bind(outsider)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        world_facts(&before.state).unwrap().records.policies[&b.player].last_presence_at,
        1000
    );
    for _ in 0..3 {
        game.world_query(
            p,
            WorldQuery {
                context: context(),
                query: WorldQueryKind::Galaxy {
                    galaxy: 1,
                    system: 5,
                },
            },
        )
        .await
        .unwrap();
    }
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartManufacture {
            body,
            item: ManufacturedItem::Ship(ShipType::EspionageProbe),
            quantity: 1,
            expected_terms_hash: Hash("0".repeat(64)),
        }),
    };
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(body),
                cause: PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    let pair = ForegroundAction { presence, gameplay };
    let (a, z) = tokio::join!(
        game.world_submit(p, pair.clone()),
        game.world_submit(p, pair.clone())
    );
    assert_eq!(a.unwrap().admitted_at, z.unwrap().admitted_at);
    // Only presence executes before the process-equivalent adapter restart.
    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    let reopened = PgStore::connect(&url).await.unwrap();
    let restored = GameService::new(reopened.clone());
    restored.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    let receipt = restored
        .bound_receipt(p, b, pair.gameplay.command_id)
        .await
        .unwrap();
    assert!(matches!(receipt.status, ReceiptStatus::Rejected { .. }));
    assert!(matches!(
        restored
            .bound_receipt(p, b, pair.presence.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    let (after, _) = reopened.bound_world(b).await.unwrap().facts;
    let w = world_facts(&after.state).unwrap();
    assert_eq!(w.records.policies[&b.player].last_presence_at, 604801000);
    assert!(after.state.inventories.is_empty());
    assert!(w.records.fleets.is_empty());
    assert_eq!(w.records.lots.len(), 0);
    store.set_test_time(604802000).await.unwrap();
    restored.world_submit(p, pair.clone()).await.unwrap();
    assert!(matches!(
        restored.step(u, WorkerId(Uuid::new_v4())).await.unwrap(),
        StepOutcome::Idle
    ));
    let (final_state, _) = reopened.bound_world(b).await.unwrap().facts;
    assert_eq!(
        world_facts(&final_state.state).unwrap().records.policies[&b.player].last_presence_at,
        604801000
    );
    let mut changed = pair;
    changed.gameplay.command_id = CommandId(Uuid::new_v4());
    assert!(restored.world_submit(p, changed).await.is_err());
    RuntimeFixture {
        url,
        store,
        reopened,
        pool,
        accounts,
        b,
        body,
        outsider,
    }
}

async fn completed_assets_preserve_other_owners(fixture: &RuntimeFixture) -> i64 {
    let store = fixture.store.clone();
    let pool = fixture.pool.clone();
    let restored = GameService::new(fixture.reopened.clone());
    let (b, body, outsider) = (fixture.b, fixture.body, fixture.outsider);
    let u = b.universe;
    let p = fixture.principal();
    let context = || fixture.context();
    // A local completion must never replace another owner's asset collection.
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,'unrelated',$2)")
        .bind(u.0)
        .bind(serde_json::json!({"owner":outsider,"marker":"unrelated"}))
        .execute(&pool)
        .await
        .unwrap();
    let quote = restored
        .progression_options(
            p,
            context(),
            QuoteRequestDto3::Progression(QuoteRequest::Upgrade {
                body,
                building: Building::MetalMine,
            }),
        )
        .await
        .unwrap()
        .facts
        .inspection;
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: quote.terms_hash.unwrap(),
        }),
    };
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(body),
                cause: PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    restored
        .world_submit(p, ForegroundAction { presence, gameplay })
        .await
        .unwrap();
    for _ in 0..2 {
        restored.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    }
    let due: i64 = sqlx::query_scalar(
        "SELECT due_at FROM constructions WHERE universe=$1 AND owner=$2 AND status='Active'",
    )
    .bind(u.0)
    .bind(b.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    store.set_test_time(due).await.unwrap();
    assert!(matches!(
        restored.step(u, WorkerId(Uuid::new_v4())).await.unwrap(),
        StepOutcome::Committed { .. }
    ));
    let retained: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM asset_lots WHERE universe=$1 AND key='unrelated'")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained["marker"], "unrelated");
    sqlx::query("DELETE FROM asset_lots WHERE universe=$1 AND key='unrelated'")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    due
}

async fn report_pagination_and_privacy(fixture: &RuntimeFixture) -> (Binding, sqlx::PgPool) {
    let url = &fixture.url;
    let reopened = fixture.reopened.clone();
    let restored = GameService::new(reopened.clone());
    let b = fixture.b;
    let u = b.universe;
    let p = fixture.principal();
    let context = || fixture.context();
    let accounts = &fixture.accounts;
    // Synthetic report history exercises pagination independently of real mission producers.
    let pool = sqlx::PgPool::connect(url).await.unwrap();
    for n in 1..=101u128 {
        let id = ReportId(Uuid::from_u128(10000 + n));
        let report = MissionReport {
            id,
            event: InputId(Uuid::from_u128(20000 + n)),
            kind: "Harvested".into(),
            at: 1000,
            fleet: None,
            rules_hash: Ruleset::mvp_fleets().unwrap().hash,
            payloads: std::collections::BTreeMap::from([(
                b.player,
                serde_json::json!({"kind":"Harvested","captured":"immutable","cargo":{"metal":"123000000","crystal":"0","deuterium":"0"}}),
            )]),
        };
        sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Harvested',1000,$4)").bind(u.0).bind(id.0).bind(report.event.0).bind(sqlx::types::Json(report)).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,$3)").bind(id.0).bind(b.player.0).bind(n as i64).execute(&pool).await.unwrap();
    }
    sqlx::query("UPDATE mission_report_heads SET revision=101 WHERE recipient=$1")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let query = ReportsQuery4 {
        context: context(),
        cursor: None,
        kind: Some("Harvested".into()),
        limit: 100,
        include_hidden: false,
    };
    let first = restored
        .reports4(p, query.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(first.items.len(), 100);
    assert_eq!(
        first.items[0].preview,
        Some(
            serde_json::json!({"kind":"Harvested","cargo":{"metal":"123000000","crystal":"0","deuterium":"0"}})
        )
    );
    let detail = restored
        .report4(p, context(), first.items[0].id)
        .await
        .unwrap();
    assert_eq!(detail.data.header.preview, first.items[0].preview);
    assert_eq!(detail.data.payload["captured"], "immutable");
    assert!(first.has_more);
    assert_eq!(first.items[0].id, ReportId(Uuid::from_u128(10101)));
    let mut next = query.clone();
    next.cursor = first.next_cursor.clone();
    let second = restored.reports4(p, next.clone()).await.unwrap().facts.data;
    assert_eq!(second.items.len(), 1);
    assert_eq!(second.items[0].id, ReportId(Uuid::from_u128(10001)));
    assert!(!second.has_more);
    // Only the oldest report is unread: the alert must cover beyond page one.
    sqlx::query("UPDATE mission_report_recipients SET read=(report<>$1) WHERE recipient=$2")
        .bind(Uuid::from_u128(10001))
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(unread_reports(&restored, b).await);
    sqlx::query("UPDATE mission_report_recipients SET hidden=true WHERE recipient=$1")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(!unread_reports(&restored, b).await);
    sqlx::query("UPDATE mission_report_recipients SET hidden=false,read=true WHERE recipient=$1")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(!unread_reports(&restored, b).await);
    // A post-cut insertion at the same observation time must not enter subsequent pages.
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) SELECT universe,$1,$2,kind,at_ms,jsonb_set(jsonb_set(data,'{id}',to_jsonb($1::uuid)),'{event}',to_jsonb($2::uuid)) FROM mission_reports WHERE id=$3").bind(Uuid::from_u128(10200)).bind(Uuid::from_u128(20200)).bind(Uuid::from_u128(10001)).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO mission_report_recipients VALUES($1,$2,102,false,false)")
        .bind(Uuid::from_u128(10200))
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE mission_report_heads SET revision=102 WHERE recipient=$1")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        restored
            .reports4(p, next.clone())
            .await
            .unwrap()
            .data
            .items
            .len(),
        1
    );
    let foreign = SessionService::new(reopened.clone())
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap();
    let fb = restored
        .current_binding(foreign.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let fp = Principal {
        account: fb.account,
        player: fb.player,
        universe: u,
    };
    assert!(unread_reports(&restored, b).await);
    assert!(
        !unread_reports(&restored, fb).await,
        "another recipient must not inherit the alert"
    );
    next.context.binding = fb;
    assert!(matches!(
        restored.reports4(fp, next).await,
        Err(ServiceError::InvalidCursor)
    ));
    assert!(matches!(
        restored
            .report4(
                fp,
                QueryContext {
                    binding: fb,
                    request_id: Uuid::new_v4()
                },
                first.items[0].id
            )
            .await,
        Err(ServiceError::NotFound)
    ));
    (fb, pool)
}

async fn scoped_claim_ordering(
    fixture: &RuntimeFixture,
    fb: Binding,
    due: i64,
) -> CommandEnvelopeV4 {
    let store = fixture.store.clone();
    let reopened = fixture.reopened.clone();
    let pool = fixture.pool.clone();
    let restored = GameService::new(reopened.clone());
    let (b, body) = (fixture.b, fixture.body);
    let u = b.universe;
    let p = fixture.principal();
    let context = || fixture.context();
    let accounts = &fixture.accounts;
    // Scoped admission does not acquire the old universe writer lock. Foreign-key
    // checks may still take KEY SHARE, which is compatible with this writer lock.
    sqlx::raw_sql(&format!("CREATE SEQUENCE orbit_order_{} START 100000; UPDATE universe_runtime SET executor_mode='scoped',mode_generation=1 WHERE universe='{}'",u.0.simple(),u))
        .execute(&pool).await.unwrap();
    let accepted = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(body),
                cause: PresenceCause::BodyVisit,
                paired_command_id: None,
            },
        }),
    };
    let mut held = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM universes WHERE id=$1 FOR NO KEY UPDATE")
        .bind(u.0)
        .fetch_one(&mut *held)
        .await
        .unwrap();
    let responses = tokio::time::timeout(std::time::Duration::from_secs(1), async {
        tokio::join!(
            store.admit_presence_scoped(accepted.clone()),
            reopened.admit_presence_scoped(accepted.clone())
        )
    })
    .await;
    held.rollback().await.unwrap();
    let (one, two) = responses.expect("admission must not wait for gameplay locks");
    assert_eq!(one.unwrap().command_id, two.unwrap().command_id);
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM commands WHERE universe=$1 AND command_id=$2")
            .bind(u.0)
            .bind(accepted.command_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let mut staged = pool.begin().await.unwrap();
    let scope_key = serde_json::to_string(&ScopeKey::Player(b.player)).unwrap();
    sqlx::query("INSERT INTO input_scopes(universe,input_id,scope_key) VALUES($1,$2,$3)")
        .bind(u.0)
        .bind(Uuid::new_v4())
        .bind(scope_key)
        .execute(&mut *staged)
        .await
        .unwrap();
    let mut during_stage = accepted.clone();
    during_stage.command_id = CommandId(Uuid::new_v4());
    let admission = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        store.admit_presence_scoped(during_stage),
    )
    .await;
    staged.rollback().await.unwrap();
    assert!(
        admission
            .expect("staging successor foreign keys cannot block admission")
            .is_ok()
    );
    let make_pair = |command_id: CommandId, command: Command| ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id,
            command: CommandDto3::Progression(command),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(body),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            }),
        },
    };
    let parent_id = CommandId(Uuid::new_v4());
    let parent_terms = restored
        .progression_options(
            p,
            context(),
            QuoteRequestDto3::Progression(QuoteRequest::Upgrade {
                body,
                building: Building::MetalMine,
            }),
        )
        .await
        .unwrap()
        .facts
        .inspection
        .terms_hash
        .unwrap();
    store
        .admit_scoped(make_pair(
            parent_id,
            Command::StartUpgrade {
                body,
                building: Building::MetalMine,
                expected_terms_hash: parent_terms,
            },
        ))
        .await
        .unwrap();
    let cancel = make_pair(
        CommandId(Uuid::new_v4()),
        Command::CancelConstruction {
            operation: OperationId(parent_id.0),
        },
    );
    store.admit_scoped(cancel.clone()).await.unwrap();
    reopened.admit_scoped(cancel.clone()).await.unwrap();
    let parent_input: Uuid =
        sqlx::query_scalar("SELECT input_id FROM commands WHERE universe=$1 AND command_id=$2")
            .bind(u.0)
            .bind(parent_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let child: serde_json::Value =
        sqlx::query_scalar("SELECT input FROM commands WHERE universe=$1 AND command_id=$2")
            .bind(u.0)
            .bind(cancel.gameplay.command_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let child: OrderedInput = serde_json::from_value(child).unwrap();
    assert_eq!(
        child.payload,
        Input::Command(Command::CancelConstruction {
            operation: OperationId(derived_id(InputId(parent_input), "construction:0"))
        })
    );
    let foreign_body: Uuid =
        sqlx::query_scalar("SELECT id FROM bodies WHERE universe=$1 AND owner=$2 LIMIT 1")
            .bind(u.0)
            .bind(fb.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    store
        .admit_presence_scoped(CommandEnvelopeV4 {
            protocol: 4,
            binding: fb,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(BodyId(foreign_body)),
                    cause: PresenceCause::BodyVisit,
                    paired_command_id: None,
                },
            }),
        })
        .await
        .unwrap();
    // A short admission gate for A must not hide an independent ready B.
    let mut hot = pool.begin().await.unwrap();
    sqlx::query("SELECT key FROM execution_scopes WHERE universe=$1 AND key=$2 FOR NO KEY UPDATE")
        .bind(u.0)
        .bind(serde_json::to_string(&ScopeKey::Player(b.player)).unwrap())
        .fetch_one(&mut *hot)
        .await
        .unwrap();
    let bypass = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .expect("independent scope remains claimable while an earlier admission gate is held");
    assert_eq!(bypass.input.actor, Actor::Player(fb.player));
    store.release_scoped(&bypass).await.unwrap();
    hot.rollback().await.unwrap();
    let first_claim = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(first_claim.input.actor, Actor::Player(b.player));
    let independent = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(independent.input.actor, Actor::Player(fb.player));
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    assert!(restored.world_view(p, context()).await.is_ok());
    let loaded = store.load_scoped(&first_claim).await.unwrap();
    assert_eq!(loaded.state.players.len(), 1);
    store.set_test_time(due + 16000).await.unwrap();
    let replacement = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(replacement.input.id, first_claim.input.id);
    assert_ne!(replacement.token, first_claim.token);
    assert!(matches!(
        store.renew_scoped(&first_claim).await,
        Err(StoreError::StaleClaim)
    ));
    store.release_scoped(&replacement).await.unwrap();
    assert!(matches!(
        store.renew_scoped(&replacement).await,
        Err(StoreError::StaleClaim)
    ));
    // A third player can already be further along while A's old input waits.
    // Such a consistent committed snapshot must not be projected backward to A's horizon.
    let account: Uuid = sqlx::query_scalar("SELECT id FROM accounts WHERE name=$1")
        .bind(&accounts[2].name)
        .fetch_one(&pool)
        .await
        .unwrap();
    let cb = store
        .current_binding(AccountId(account), u)
        .await
        .unwrap()
        .0;
    sqlx::query("UPDATE bodies SET checkpoint_at=$2 WHERE universe=$1 AND owner=$3")
        .bind(u.0)
        .bind(due + 15000)
        .bind(cb.player.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE player_policies SET data=jsonb_set(data,'{last_presence_at}',to_jsonb($2::bigint)) WHERE id=$1")
        .bind(cb.player.0).bind(due+15000).execute(&pool).await.unwrap();
    let cp = Principal {
        account: cb.account,
        player: cb.player,
        universe: u,
    };
    let cv = restored
        .world_view(
            cp,
            QueryContext {
                binding: cb,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert!(cv.progression.as_of_ms >= due + 15000);
    let coords = cv.progression.bodies[0].coordinates;
    assert!(
        restored
            .world_query(
                p,
                WorldQuery {
                    context: context(),
                    query: WorldQueryKind::Galaxy {
                        galaxy: coords.galaxy,
                        system: coords.system
                    }
                }
            )
            .await
            .is_ok()
    );
    let blocked = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(blocked.input.actor, Actor::Player(b.player));
    store
        .fail_scoped(&blocked, &InvariantError("injected scope invariant".into()))
        .await
        .unwrap();
    let mut queued_while_blocked = accepted.clone();
    queued_while_blocked.command_id = CommandId(Uuid::new_v4());
    assert!(matches!(
        store
            .admit_presence_scoped(queued_while_blocked)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Pending
    ));
    assert!(restored.world_view(p, context()).await.is_ok());
    assert!(store.ready().await.is_ok());
    let other = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(other.input.actor, Actor::Player(fb.player));
    store.release_scoped(&other).await.unwrap();
    // Simulate an explicit repair, retaining every accepted input.
    sqlx::query("UPDATE execution_scopes SET blocked=NULL WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    let active = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let snapshot = store.load_scoped(&active).await.unwrap();
    let outcome = transition(&snapshot.state, &active.input, &snapshot.rules);
    assert!(matches!(outcome, TransitionResult::Applied(_)));
    assert!(matches!(
        store
            .commit_scoped(&first_claim, outcome.clone())
            .await
            .unwrap(),
        CommitOutcome::StaleClaim
    ));
    let before_revision: i64 =
        sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
            .bind(u.0)
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(matches!(
        store.commit_scoped(&active, outcome.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        store.commit_scoped(&active, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let after_revision: i64 =
        sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
            .bind(u.0)
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(after_revision, before_revision + 1);
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM input_scopes WHERE universe=$1 AND input_id=$2")
            .bind(u.0)
            .bind(active.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
    accepted
}

async fn staged_commit_recovery(fixture: &RuntimeFixture, accepted: CommandEnvelopeV4, due: i64) {
    let store = fixture.store.clone();
    let pool = fixture.pool.clone();
    let game = GameService::new(store.clone());
    let restored = GameService::new(fixture.reopened.clone());
    let b = fixture.b;
    let u = b.universe;
    let p = fixture.principal();
    let context = || fixture.context();
    // Pause after staging writes, before final ownership validation.
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_writes','pause',true)")
        .execute(&pool).await.unwrap();
    let mut blocker = pool.acquire().await.unwrap();
    blocker.close_on_drop();
    sqlx::query("SELECT pg_advisory_lock(901322)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    let staging = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let delivery_before = store.read_updates(b, None, 128).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    let staged_facts = store.load_scoped(&staging).await.unwrap();
    let staged_outcome = transition(&staged_facts.state, &staging.input, &staged_facts.rules);
    let writer_store = store.clone();
    let writer_claim = staging.clone();
    let writer = tokio::spawn(async move {
        writer_store
            .commit_scoped(&writer_claim, staged_outcome)
            .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            let seen: i64 =
                sqlx::query_scalar("SELECT seen FROM orbit_test_fault WHERE stage='after_writes'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            if seen == 1 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("writer reached staged fault");
    let mut concurrent = accepted.clone();
    concurrent.command_id = CommandId(Uuid::new_v4());
    let admission = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        store.admit_presence_scoped(concurrent),
    )
    .await;
    let reading = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        game.world_view(p, context()),
    )
    .await;
    assert!(
        reading
            .expect("read pool is isolated from the occupied worker pool")
            .is_ok()
    );
    assert!(
        store.renew_scoped(&staging).await.is_ok(),
        "control capacity remains available during staged worker writes"
    );
    assert!(
        store
            .read_updates(b, Some(&delivery_before), 128)
            .await
            .unwrap()
            .items
            .is_empty(),
        "uncommitted effects have no visible delivery obligation"
    );
    store.set_test_time(due + 32000).await.unwrap();
    let takeover = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(takeover.input.id, staging.input.id);
    sqlx::query("SELECT pg_advisory_unlock(901322)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    assert!(
        admission
            .expect("admission during staged gameplay writes")
            .is_ok()
    );
    assert!(matches!(
        writer.await.unwrap().unwrap(),
        CommitOutcome::StaleClaim
    ));
    let pending: String =
        sqlx::query_scalar("SELECT receipt->>'status' FROM commands WHERE input_id=$1")
            .bind(staging.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pending, "Pending");
    let rolled_back: i64 =
        sqlx::query_scalar("SELECT count(*) FROM game_updates WHERE input_id=$1")
            .bind(staging.input.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        rolled_back, 0,
        "stale staged commit leaves no delivery obligations"
    );
    let fresh = store.load_scoped(&takeover).await.unwrap();
    let outcome = transition(&fresh.state, &takeover.input, &fresh.rules);
    sqlx::query(
        "INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_commit','error',true)",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store.commit_scoped(&takeover, outcome.clone()).await,
        Err(StoreError::Unavailable)
    ));
    assert!(matches!(
        store.commit_scoped(&takeover, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(&pool)
        .await
        .unwrap();
    for _ in 0..32 {
        match restored
            .step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap()
        {
            StepOutcome::Idle => break,
            StepOutcome::Committed { .. } => {}
            other => panic!("unexpected scoped resolution: {other:?}"),
        }
    }
    let mut stale_visit = accepted.clone();
    stale_visit.command_id = CommandId(Uuid::new_v4());
    stale_visit.command = CommandDto3::Progression(Command::World {
        action: WorldAction::RecordForegroundPresence {
            body: Some(BodyId(Uuid::new_v4())),
            cause: PresenceCause::BodyVisit,
            paired_command_id: None,
        },
    });
    store
        .admit_presence_scoped(stale_visit.clone())
        .await
        .unwrap();
    assert!(matches!(
        restored
            .step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    assert!(matches!(
        restored
            .bound_receipt(p, b, stale_visit.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected {
            code: GameError::NotOwned
        }
    ));
}

async fn scoped_transport_catches_up_before_later_recipient_work(
    store: &PgStore,
    pool: &sqlx::PgPool,
    sender: Binding,
    recipient: Binding,
    origin: BodyId,
) {
    let u = sender.universe;
    let at: i64 = sqlx::query_scalar("SELECT at_ms FROM orbit_test_clock")
        .fetch_one(pool)
        .await
        .unwrap();
    let rules = store.load_rules(u).await.unwrap();
    let target = store
        .bound_world(recipient)
        .await
        .unwrap()
        .facts
        .0
        .state
        .bodies
        .values()
        .next()
        .unwrap()
        .clone();
    sqlx::query("UPDATE bodies SET amounts=jsonb_set(amounts,'{deuterium}',to_jsonb(1000000000::bigint)),checkpoint_at=$2 WHERE id=$1")
        .bind(origin.0).bind(at).execute(pool).await.unwrap();
    sqlx::query("UPDATE bodies SET amounts=jsonb_set(amounts,'{metal}',to_jsonb(0::bigint)),checkpoint_at=$2 WHERE id=$1")
        .bind(target.id.0).bind(at).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,1,0)")
        .bind(origin.0)
        .bind(sender.player.0)
        .bind(sqlx::types::Json(ManufacturedItem::Ship(
            ShipType::SmallCargo,
        )))
        .execute(pool)
        .await
        .unwrap();
    let lot_id = OperationId(Uuid::new_v4());
    let lot = AssetLot {
        id: lot_id,
        owner: sender.player,
        item: CatalogKey::Ship(ShipType::SmallCargo),
        level: None,
        location: AssetLocation::Body(origin),
        quantity: 1,
        unit_value_micro: 4000 * SCALE,
        rules_hash: rules.hash.clone(),
        source_operation: lot_id,
        acquired_at: at,
        acquired_sequence: 1,
    };
    sqlx::query(
        "INSERT INTO asset_lots(universe,key,data) VALUES($1,'scoped-transport-fixture',$2)",
    )
    .bind(u.0)
    .bind(sqlx::types::Json(lot))
    .execute(pool)
    .await
    .unwrap();
    let intent = FleetIntent {
        origin,
        destination: MissionDestination::Body {
            id: target.id,
            expected_kind: target.kind,
            expected_owner: recipient.player,
        },
        mission: Mission::Transport,
        ships: vec![ManifestStack {
            owner: sender.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::from_values([10 * SCALE, 0, 0]),
        speed_percent: 100,
    };
    let quote = store
        .bound_quote(
            sender,
            &QuoteRequest::Fleet {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts
        .0;
    let terms = quote_fleet(&quote.state, sender.player, &intent, quote.at, &quote.rules).unwrap();
    assert!(terms.duration_ms > 1);
    let command_id = CommandId(Uuid::new_v4());
    let pair = ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: sender,
            command_id,
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::LaunchFleet {
                    intent,
                    expected_terms_hash: terms.terms_hash,
                },
            }),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: sender,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(origin),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            }),
        },
    };
    let accepted = store.admit_scoped(pair).await.unwrap();
    let arrival = accepted.admitted_at + terms.duration_ms;
    store.set_test_time(arrival + 1).await.unwrap();
    store
        .admit_presence_scoped(CommandEnvelopeV4 {
            protocol: 4,
            binding: recipient,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(target.id),
                    cause: PresenceCause::BodyVisit,
                    paired_command_id: None,
                },
            }),
        })
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let presence = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(presence.input.actor, Actor::Player(sender.player));
    // The launch is not even claimed yet, but its declaration already prevents
    // later recipient work from advancing past the arrival it will create.
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        game.resolve_scoped_claim(presence, &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    let launch = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(launch.scopes.contains(&ScopeKey::Player(recipient.player)));
    let fleet = FleetId(derived_id(launch.input.id, "mission:0"));
    assert!(matches!(
        game.resolve_scoped_claim(launch, &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    let receipt = store.bound_receipt(sender, command_id).await.unwrap();
    assert!(
        matches!(receipt.status, ReceiptStatus::Committed { .. }),
        "{receipt:?}"
    );
    let due = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(due.input.at, arrival);
    assert!(matches!(
        due.input.payload,
        Input::Event(ScheduledEvent::FleetLegDue {
            expected_leg: MissionLeg::Outbound,
            ..
        })
    ));
    let facts = store.load_scoped(&due).await.unwrap();
    let before = settle_production(
        &facts.state,
        &facts.state.bodies[&target.id],
        arrival,
        &facts.rules,
    )
    .unwrap();
    let outcome = transition(&facts.state, &due.input, &facts.rules);
    assert!(
        matches!(outcome, TransitionResult::Applied(_)),
        "{outcome:?}"
    );
    assert!(matches!(
        store.commit_scoped(&due, outcome.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        store.commit_scoped(&due, outcome).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let delivered: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(target.id.0)
        .fetch_one(pool)
        .await
        .unwrap();
    let delivered: Resources = serde_json::from_value(delivered).unwrap();
    assert_eq!(delivered.metal, before.amounts.metal + 10 * SCALE);
    let report_recipients:i64=sqlx::query_scalar("SELECT count(*) FROM mission_report_recipients p JOIN mission_reports r ON r.id=p.report WHERE r.universe=$1 AND r.event=$2")
        .bind(u.0).bind(due.input.id.0).fetch_one(pool).await.unwrap();
    assert_eq!(report_recipients, 2);
    let later = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(later.input.actor, Actor::Player(recipient.player));
    assert_eq!(later.input.at, arrival + 1);
    game.resolve_scoped_claim(later, &InlineEngine)
        .await
        .unwrap();
    let return_at: i64 =
        sqlx::query_scalar("SELECT (data->>'due_at')::bigint FROM mission_fleets WHERE id=$1")
            .bind(fleet.0)
            .fetch_one(pool)
            .await
            .unwrap();
    store.set_test_time(return_at).await.unwrap();
    assert!(matches!(
        game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    let ships: i64 =
        sqlx::query_scalar("SELECT count FROM inventories WHERE body=$1 AND owner=$2 AND item=$3")
            .bind(origin.0)
            .bind(sender.player.0)
            .bind(sqlx::types::Json(ManufacturedItem::Ship(
                ShipType::SmallCargo,
            )))
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(ships, 1);
    let recipient_view = store.bound_world(recipient).await.unwrap();
    assert_eq!(
        recipient_view.progress.scopes[0]
            .resolved
            .as_ref()
            .unwrap()
            .at_ms,
        arrival + 1,
        "a sender's private return must not advance the recipient's visible position"
    );
}

#[tokio::test]
async fn raids_fresh_profile_bootstrap_and_capability_preserve_retained_world() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("raids-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    let u = UniverseId(Uuid::new_v4());
    store
        .bootstrap_mvp_raids(u, 1000, &accounts, &[42; 32])
        .await
        .unwrap();
    store
        .bootstrap_mvp_raids(u, 2000, &accounts, &[42; 32])
        .await
        .unwrap();
    assert!(
        store
            .bootstrap_mvp_fleets(u, 2000, &accounts, &[42; 32])
            .await
            .is_err()
    );
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let v = game
        .world_view(
            principal,
            QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert!(
        v.progression
            .capabilities
            .iter()
            .any(|c| c.capability == "Attack" && c.enabled)
    );
    assert_eq!(v.progression.protocol, 4);
    assert!(v.progression.bodies[0].inventories.is_empty());
    assert_eq!(v.missions.score_value_micro, "0");
    let reopened = PgStore::connect(&url).await.unwrap();
    let rules = reopened.load_rules(u).await.unwrap();
    assert_eq!(rules, Ruleset::mvp_raids().unwrap());
    assert!(
        GameService::new(reopened)
            .require_protocol(auth.session.account, u, 3)
            .await
            .is_err()
    );
}

// A leg update must immediately change the complete active-fleet load. Terminal
// fleets must still be available when explicitly named by a recall or due event.
#[tokio::test]
async fn mission_leg_is_the_only_activity_authority_across_restart_and_recall() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("leg-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[31; 32])
        .await
        .unwrap();
    store.set_test_time(1500).await.unwrap();
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let origin = snapshot
        .state
        .bodies
        .values()
        .find(|body| body.owner == b.player)
        .unwrap();
    let intent = FleetIntent {
        origin: origin.id,
        destination: MissionDestination::Body {
            id: origin.id,
            expected_kind: origin.kind,
            expected_owner: b.player,
        },
        mission: Mission::Transport,
        ships: vec![],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let mut terms = FleetTerms {
        intent: intent.clone(),
        profile_hash: snapshot.state.profile_hash.clone(),
        distance: 5,
        speeds: vec![],
        duration_ms: 1000,
        fuel: 0,
        capacity: 0,
        maximum_payload: 0,
        slot_limit: 1,
        terms_hash: Hash(String::new()),
    };
    terms.terms_hash = hash(&serde_json::json!({"protocol":4,"terms":terms}));
    // Empty cargo/manifests isolate persistence from the separate asset-lot ledger.
    let mut fleet = MissionFleet {
        id: FleetId(Uuid::new_v4()),
        owner: b.player,
        intent,
        origin_coordinates: origin.coordinates,
        destination_coordinates: origin.coordinates,
        terms,
        authorization: MissionAuthorization {
            actor: b.player,
            target_owner: Some(b.player),
            at: 1000,
            input: InputId(Uuid::new_v4()),
            policy_hash: snapshot.state.profile_hash.clone(),
        },
        ships: vec![],
        cargo: Resources::default(),
        launched_at: 1000,
        due_at: 2000,
        generation: 0,
        leg: MissionLeg::Outbound,
        revision: 0,
    };
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("INSERT INTO mission_fleets(universe,id,owner,data) VALUES($1,$2,$3,$4)")
        .bind(u.0)
        .bind(fleet.id.0)
        .bind(b.player.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&pool)
        .await
        .unwrap();
    for (leg, active) in [
        (MissionLeg::Outbound, true),
        (MissionLeg::Returning, true),
        (MissionLeg::Returned, false),
        (MissionLeg::Destroyed, false),
    ] {
        fleet.leg = leg;
        sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
            .bind(fleet.id.0)
            .bind(sqlx::types::Json(&fleet))
            .execute(&pool)
            .await
            .unwrap();
        let reopened = PgStore::connect(&url).await.unwrap();
        let (snapshot, _) = reopened.bound_world(b).await.unwrap().facts;
        let loaded = &world_facts(&snapshot.state).unwrap().records.fleets;
        assert_eq!(loaded.contains_key(&fleet.id), active, "{leg:?}");
        if active {
            assert_eq!(loaded[&fleet.id], fleet);
        }
    }
    // Exercise the actual save path: recall outbound -> returning -> returned.
    fleet.leg = MissionLeg::Outbound;
    sqlx::query("UPDATE mission_fleets SET data=$2 WHERE id=$1")
        .bind(fleet.id.0)
        .bind(sqlx::types::Json(&fleet))
        .execute(&pool)
        .await
        .unwrap();
    let principal = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    for terminal in [false, true] {
        let gameplay = CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecallMission { fleet: fleet.id },
            }),
        };
        let presence = CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(origin.id),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(gameplay.command_id),
                },
            }),
        };
        game.world_submit(
            principal,
            ForegroundAction {
                presence,
                gameplay: gameplay.clone(),
            },
        )
        .await
        .unwrap();
        for _ in 0..2 {
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
        }
        let receipt = game
            .bound_receipt(principal, b, gameplay.command_id)
            .await
            .unwrap();
        if terminal {
            assert_eq!(
                receipt.status,
                ReceiptStatus::Rejected {
                    code: GameError::NotOutbound
                }
            );
        } else {
            assert!(matches!(receipt.status, ReceiptStatus::Committed { .. }));
            let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
            assert_eq!(
                world_facts(&snapshot.state).unwrap().records.fleets[&fleet.id].leg,
                MissionLeg::Returning
            );
            store.set_test_time(2000).await.unwrap();
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
            let persisted: serde_json::Value =
                sqlx::query_scalar("SELECT data FROM mission_fleets WHERE id=$1")
                    .bind(fleet.id.0)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let returned: MissionFleet = serde_json::from_value(persisted).unwrap();
            assert_eq!(returned.leg, MissionLeg::Returned);
            assert_eq!(returned.terms, fleet.terms);
            assert_eq!(returned.revision, 2);
            let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
            assert!(
                world_facts(&snapshot.state)
                    .unwrap()
                    .records
                    .fleets
                    .is_empty()
            );
        }
    }
}

// Both recipients load before either preference is committed. B must never
// restore A's old flags, even if B's publication waits behind A's staged writes.
async fn concurrent_report_preferences(
    url: &str,
    store: &PgStore,
    pool: &sqlx::PgPool,
    a: Binding,
    b: Binding,
) {
    let report: Uuid = sqlx::query_scalar(
        "SELECT r.id FROM mission_reports r WHERE r.universe=$1 AND r.kind='Delivered' LIMIT 1",
    )
    .bind(a.universe.0)
    .fetch_one(pool)
    .await
    .unwrap();
    // Isolate this real delivered report so preference commands must clear the alert.
    sqlx::query(
        "UPDATE mission_report_recipients SET read=true WHERE recipient=ANY($1) AND report<>$2",
    )
    .bind(vec![a.player.0, b.player.0])
    .bind(report)
    .execute(pool)
    .await
    .unwrap();
    let game = GameService::new(store.clone());
    for binding in [a, b] {
        assert!(unread_reports(&game, binding).await);
    }
    let peer = PgStore::connect(url).await.unwrap();
    let mut claims = Vec::new();
    for (binding, action) in [
        (
            a,
            WorldAction::MarkReportRead {
                report: ReportId(report),
            },
        ),
        (
            b,
            WorldAction::SetReportHidden {
                report: ReportId(report),
                hidden: true,
            },
        ),
    ] {
        let command_id = CommandId(Uuid::new_v4());
        let envelope = |id, action| CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: id,
            command: CommandDto3::Progression(Command::World { action }),
        };
        store
            .admit_scoped(ForegroundAction {
                presence: envelope(
                    CommandId(Uuid::new_v4()),
                    WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::GameplayGesture,
                        paired_command_id: Some(command_id),
                    },
                ),
                gameplay: envelope(command_id, action),
            })
            .await
            .unwrap();
        let game = GameService::new(store.clone());
        assert!(matches!(
            game.step_scoped(a.universe, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Committed { .. }
        ));
        let claim = store
            .claim_scoped(a.universe, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(claim.input.actor, Actor::Player(binding.player));
        let facts = store.load_scoped(&claim).await.unwrap();
        let outcome = transition(&facts.state, &claim.input, &facts.rules);
        assert!(
            matches!(outcome, TransitionResult::Applied(_)),
            "{outcome:?}"
        );
        claims.push((claim, outcome));
    }
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_writes','pause',true)")
        .execute(pool).await.unwrap();
    let mut blocker = pool.acquire().await.unwrap();
    blocker.close_on_drop();
    sqlx::query("SELECT pg_advisory_lock(901322)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    let (claim_b, outcome_b) = claims.pop().unwrap();
    let (claim_a, outcome_a) = claims.pop().unwrap();
    let writer = store.clone();
    let first = tokio::spawn(async move { writer.commit_scoped(&claim_a, outcome_a).await });
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let seen: i64 =
                sqlx::query_scalar("SELECT seen FROM orbit_test_fault WHERE stage='after_writes'")
                    .fetch_one(pool)
                    .await
                    .unwrap();
            if seen == 1 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("A has staged its report preference");
    let second = tokio::spawn(async move { peer.commit_scoped(&claim_b, outcome_b).await });
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            let blocked: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE mission_report_recipients%')").fetch_one(pool).await.unwrap();
            if blocked || second.is_finished() { break; }
            tokio::task::yield_now().await;
        }
    }).await.expect("B has loaded commit facts and either published or reached the stale broad write");
    sqlx::query("SELECT pg_advisory_unlock(901322)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    assert!(matches!(
        first.await.unwrap().unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        second.await.unwrap().unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let flags: Vec<(Uuid, bool, bool)> = sqlx::query_as(
        "SELECT recipient,read,hidden FROM mission_report_recipients WHERE report=$1",
    )
    .bind(report)
    .fetch_all(pool)
    .await
    .unwrap();
    assert!(
        flags.contains(&(a.player.0, true, false)),
        "A's committed read flag was lost: {flags:?}"
    );
    assert!(
        flags.contains(&(b.player.0, false, true)),
        "B's hidden flag was lost: {flags:?}"
    );
    for binding in [a, b] {
        assert!(
            !unread_reports(&game, binding).await,
            "committed read/hidden preferences must clear the alert"
        );
    }
    // A fresh connection sees the persisted, recipient-specific deletion. The
    // report remains available for restoration and for the other participant.
    let reopened = GameService::new(PgStore::connect(url).await.unwrap());
    for (binding, hidden) in [(a, false), (b, true)] {
        let principal = Principal {
            account: binding.account,
            player: binding.player,
            universe: binding.universe,
        };
        let context = QueryContext {
            binding,
            request_id: Uuid::new_v4(),
        };
        let detail = reopened
            .report4(principal, context, ReportId(report))
            .await
            .unwrap();
        assert_eq!(detail.facts.data.header.hidden, hidden);
        for include_hidden in [false, true] {
            let page = reopened
                .reports4(
                    principal,
                    ReportsQuery4 {
                        context: QueryContext {
                            binding,
                            request_id: Uuid::new_v4(),
                        },
                        cursor: None,
                        kind: Some("Delivered".into()),
                        limit: 100,
                        include_hidden,
                    },
                )
                .await
                .unwrap();
            assert_eq!(
                page.facts
                    .data
                    .items
                    .iter()
                    .any(|row| row.id == ReportId(report)),
                !hidden || include_hidden
            );
        }
    }
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(pool)
        .await
        .unwrap();
}

// Keep repeated snapshot futures off the large scenario test's stack.
fn unread_reports(
    game: &GameService<PgStore>,
    binding: Binding,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + '_>> {
    Box::pin(async move {
        game.world_view(
            Principal {
                account: binding.account,
                player: binding.player,
                universe: binding.universe,
            },
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap()
        .has_unread_reports
    })
}
