//! Explicit local characterization, never a production load generator.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::{Value, json};
use std::{
    env,
    time::{Duration, Instant},
};
use uuid::Uuid;

fn number(name: &str, minimum: u64, maximum: u64) -> u64 {
    let value = env::var(name).expect(name).parse::<u64>().expect(name);
    assert!((minimum..=maximum).contains(&value), "invalid {name}");
    value
}
fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn context(b: Binding) -> QueryContext {
    QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    }
}

fn latency(mut samples: Vec<u128>) -> Value {
    samples.sort_unstable();
    let percentile = |percent: usize| {
        samples
            .get((samples.len() * percent).div_ceil(100).saturating_sub(1))
            .copied()
    };
    json!({"count":samples.len(),"p50_ms":percentile(50),"p95_ms":percentile(95),"p99_ms":percentile(99),"max_ms":samples.last()})
}

struct Pacer {
    next: tokio::time::Instant,
    starts: Vec<tokio::time::Instant>,
}
impl Pacer {
    fn new() -> Self {
        Self {
            next: tokio::time::Instant::now(),
            starts: Vec::new(),
        }
    }
    async fn wait(&mut self) {
        tokio::time::sleep_until(self.next).await;
        let at = tokio::time::Instant::now();
        self.starts.push(at);
        self.next = at + Duration::from_millis(250);
    }
}

#[tokio::main]
async fn main() {
    let url = env::var("TEST_DATABASE_URL").expect("use make qualify-runtime");
    let parsed = reqwest::Url::parse(&url).unwrap();
    assert!(
        matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"))
            && parsed.path().starts_with("/orbit_test_"),
        "disposable loopback database required"
    );
    let bots = number("QUALIFY_BOTS", 1, 1000);
    let seconds = number("QUALIFY_SECONDS", 60, 3600);
    let history = number("QUALIFY_HISTORY_ROWS", 0, 500000);
    let allowance = number("QUALIFY_ACTION_UNITS", 1, 1000);
    let command_interval_ms = number("QUALIFY_COMMAND_INTERVAL_MS", 1000, 60000);
    let minimum_rows_per_minute = number("QUALIFY_MIN_COMMAND_ROWS_PER_MINUTE", 1, 120);
    let manifest: Value =
        serde_json::from_slice(&std::fs::read(env::var("QUALIFY_AUTH_MANIFEST").unwrap()).unwrap())
            .unwrap();
    let endpoint = reqwest::Url::parse(manifest["token_endpoint"].as_str().unwrap()).unwrap();
    assert!(
        matches!(endpoint.host_str(), Some("127.0.0.1" | "localhost"))
            && endpoint.scheme() == "http",
        "disposable loopback provider required"
    );
    let prepared = Instant::now();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    store.set_test_time(12 * 3_600_000).await.unwrap();
    store
        .create_universe(&UniverseCreate {
            universe,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy {
                bots: BotPolicy {
                    display: BotDisplay::Visible,
                    version: 1,
                    enabled: true,
                    max_active: bots as u32,
                    action_units_per_24h: Some(allowance as u32),
                },
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut players = Vec::new();
    for n in 0..bots {
        let b = store
            .create_bot(universe, &format!("synthetic-{n}"), 0)
            .await
            .unwrap();
        let token = store.issue_bot_token(universe, b.player).await.unwrap();
        let body: Uuid = sqlx::query_scalar("SELECT id FROM bodies WHERE owner=$1")
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        players.push((b, token_digest(&token), BodyId(body)));
    }
    // Explicit synthetic mature live inventory, with exact paid lineage. These
    // are isolated fixture edits, not a production retention or backfill path.
    let lots_per_player = number("QUALIFY_ASSET_LOTS", 1, 10000);
    let rules = store.load_rules(universe).await.unwrap();
    for (binding, _, body) in &players {
        let item = ManufacturedItem::Ship(ShipType::SmallCargo);
        sqlx::query(
            "INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,$4,0)",
        )
        .bind(body.0)
        .bind(binding.player.0)
        .bind(sqlx::types::Json(item))
        .bind(lots_per_player as i64)
        .execute(&pool)
        .await
        .unwrap();
        for n in 0..lots_per_player {
            let id = OperationId(Uuid::new_v4());
            let lot = AssetLot {
                id,
                owner: binding.player,
                item: CatalogKey::Ship(ShipType::SmallCargo),
                level: None,
                location: AssetLocation::Body(*body),
                quantity: 1,
                unit_value_micro: 4_000 * SCALE,
                rules_hash: rules.hash.clone(),
                source_operation: id,
                acquired_at: 0,
                acquired_sequence: n as i64,
            };
            sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
                .bind(universe.0)
                .bind(id.to_string())
                .bind(sqlx::types::Json(lot))
                .execute(&pool)
                .await
                .unwrap();
        }
    }
    // Retained terminal operations live in a separate fixture universe. The
    // recent/older split models retry saturation and a cleanup backlog, before
    // a cleanup implementation is available.
    let retained = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: retained,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy {
                bots: BotPolicy {
                    enabled: true,
                    max_active: 1,
                    action_units_per_24h: Some(100),
                    ..Default::default()
                },
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let owner = store
        .create_bot(retained, "retained-fixture", 0)
        .await
        .unwrap();
    let retained_rules = store.load_rules(retained).await.unwrap();
    let mut recent_bytes = 0usize;
    let mut backlog_bytes = 0usize;
    let mut tx = pool.begin().await.unwrap();
    for n in 0..history {
        let at = if n < history / 2 {
            12 * 3_600_000 - 1_000
        } else {
            0
        };
        let input = OrderedInput {
            schema_version: 4,
            id: Uuid::new_v4().into(),
            universe: retained,
            epoch: owner.epoch,
            actor: Actor::Player(owner.player),
            at,
            phase: 1,
            sequence: n as i64 + 1,
            protocol: 4,
            profile_hash: retained_rules.hash.clone(),
            payload: Input::Command(Command::CancelConstruction {
                operation: Uuid::new_v4().into(),
            }),
        };
        let receipt = Receipt {
            command_id: orbit_application::command_id_at(at).into(),
            epoch: owner.epoch,
            admitted_at: at,
            executed_at: Some(at),
            status: ReceiptStatus::Rejected {
                code: GameError::NotFound,
            },
        };
        let bytes =
            serde_json::to_vec(&input).unwrap().len() + serde_json::to_vec(&receipt).unwrap().len();
        if n < history / 2 {
            recent_bytes += bytes;
        } else {
            backlog_bytes += bytes;
        }
        sqlx::query("INSERT INTO commands(universe,epoch,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,done) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)")
            .bind(retained.0).bind(owner.epoch.0).bind(owner.player.0).bind(receipt.command_id.0).bind(input.id.0).bind(hash(&input).0).bind(at).bind(input.sequence)
            .bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(&receipt)).execute(&mut *tx).await.unwrap();
        let event = ScheduledEvent::EmpireDeletionDue {
            player: owner.player,
        };
        let input = OrderedInput {
            id: Uuid::new_v4().into(),
            actor: Actor::Scheduler,
            phase: 0,
            payload: Input::Event(event.clone()),
            ..input
        };
        let bytes =
            serde_json::to_vec(&input).unwrap().len() + serde_json::to_vec(&event).unwrap().len();
        if n < history / 2 {
            recent_bytes += bytes;
        } else {
            backlog_bytes += bytes;
        }
        sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event,done) VALUES($1,$2,$3,$4,$5,$6,true)")
            .bind(input.id.0).bind(retained.0).bind(at).bind(input.sequence).bind(sqlx::types::Json(input)).bind(sqlx::types::Json(event)).execute(&mut *tx).await.unwrap();
    }
    tx.commit().await.unwrap();
    // Every measured read, admission and commit below runs on the absent schema.
    sqlx::query("DROP TABLE IF EXISTS transition_journal RESTRICT")
        .execute(&pool)
        .await
        .unwrap();
    let live_bytes: i64 = sqlx::query_scalar("SELECT pg_total_relation_size('asset_lots') + pg_total_relation_size('inventories') + pg_total_relation_size('bodies')").fetch_one(&pool).await.unwrap();
    let completed_bytes: i64 = sqlx::query_scalar(
        "SELECT pg_total_relation_size('commands') + pg_total_relation_size('scheduled_events')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let provider_history = manifest["retained_history_pairs"].as_u64().unwrap_or(0);
    let preparation_ms = prepared.elapsed().as_millis();
    let mut guard = store.acquire_server_guard().await.unwrap();
    let started = Instant::now();
    let until = tokio::time::Instant::now() + Duration::from_secs(seconds);
    let auth = tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        let mut tokens: Vec<String> = manifest["sessions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["tokens"]["refresh_token"].as_str().unwrap().to_owned())
            .collect();
        // 12 sessions / 300 seconds = retained-creation scenario (a lower-bound
        // traffic input, not a complete measured OAuth request rate).
        assert_eq!(
            tokens.len(),
            12,
            "supply 12 independently issued fixture sessions"
        );
        let mut count = 0usize;
        let mut timings = Vec::new();
        let mut cadence = tokio::time::interval(Duration::from_secs(25));
        cadence.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        while tokio::time::Instant::now() < until {
            tokio::select! { _=cadence.tick()=>{}, _=tokio::time::sleep_until(until)=>break }
            let index = count % tokens.len();
            let at = Instant::now();
            let response = client
                .post(endpoint.clone())
                .basic_auth(
                    manifest["client_id"].as_str().unwrap(),
                    Some(manifest["client_secret"].as_str().unwrap()),
                )
                .form(&[
                    ("grant_type", "refresh_token"),
                    ("refresh_token", tokens[index].as_str()),
                ])
                .send()
                .await
                .expect("local provider transport failed");
            assert!(
                response.status().is_success(),
                "local refresh failed; token-bearing response withheld"
            );
            let result: Value = response.json().await.expect("invalid provider response");
            tokens[index] = result["refresh_token"]
                .as_str()
                .expect("missing rotated token")
                .to_owned();
            timings.push(at.elapsed().as_millis());
            count += 1;
        }
        json!({"refresh_successes":count,"latency":latency(timings)})
    });
    let game = GameService::new(store.clone());
    let mut requests = 0u64;
    let mut read_times = Vec::new();
    let mut machine_times = Vec::new();
    let mut status_times = Vec::new();
    let mut commit_times = Vec::new();
    let mut committed = 0;
    let mut rejected = 0;
    let mut pacer = Pacer::new();
    let mut next_command = tokio::time::Instant::now();
    let mut actions = 0usize;
    while tokio::time::Instant::now() < until {
        let (b, digest, _) = &players[(requests as usize) % players.len()];
        let b = *b;
        pacer.wait().await;
        let at = Instant::now();
        assert!(store.authenticate_machine(digest).await.unwrap().is_some());
        machine_times.push(at.elapsed().as_millis());
        pacer.wait().await;
        let at = Instant::now();
        store.bot_status(principal(b)).await.unwrap();
        status_times.push(at.elapsed().as_millis());
        pacer.wait().await;
        let at = Instant::now();
        game.world_view(principal(b), context(b)).await.unwrap();
        read_times.push(at.elapsed().as_millis());
        if tokio::time::Instant::now() >= next_command {
            // Time-based writes, independent of roster size and read speed. No
            // accumulated catch-up credit after a slow iteration or pause.
            next_command = tokio::time::Instant::now() + Duration::from_millis(command_interval_ms);
            let (b, _, body) = &players[actions % players.len()];
            let (b, body) = (*b, *body);
            let command_time = 12 * 3_600_000 + started.elapsed().as_millis() as i64;
            store.set_test_time(command_time).await.unwrap();
            pacer.wait().await;
            let quote = game
                .progression_options(
                    principal(b),
                    context(b),
                    QuoteRequestDto3::Progression(QuoteRequest::Upgrade {
                        body,
                        building: Building::MetalMine,
                    }),
                )
                .await
                .unwrap()
                .facts
                .inspection;
            let hash = quote
                .terms_hash
                .expect("ordinary synthetic upgrade must be quotable");
            let admitted = Instant::now();
            let command = CommandEnvelopeV4 {
                protocol: 4,
                binding: b,
                command_id: CommandId(orbit_application::command_id_at(command_time)),
                command: CommandDto3::Progression(Command::StartUpgrade {
                    body,
                    building: Building::MetalMine,
                    expected_terms_hash: hash,
                }),
            };
            pacer.wait().await;
            game.machine_submit(principal(b), command.clone())
                .await
                .unwrap();
            pacer.wait().await;
            game.machine_submit(principal(b), command.clone())
                .await
                .unwrap();
            for _ in 0..100 {
                if matches!(
                    game.step(universe, WorkerId(Uuid::new_v4())).await.unwrap(),
                    StepOutcome::Idle
                ) {
                    break;
                }
            }
            pacer.wait().await;
            match game
                .bound_receipt(principal(b), b, command.command_id)
                .await
                .unwrap()
                .status
            {
                ReceiptStatus::Committed { .. } => committed += 1,
                ReceiptStatus::Rejected { .. } => rejected += 1,
                _ => panic!("accepted command failed to settle"),
            }
            commit_times.push(admitted.elapsed().as_millis());
            guard.check().await.unwrap();
            actions += 1;
        }
        requests += 1;
    }
    let auth = auth.await.expect("auth characterization failed");
    assert!(
        requests >= seconds,
        "local workload fell below one read iteration/second"
    );
    assert!(committed > 0, "fixture must demonstrate worker progress");
    assert_eq!(rejected, 0, "ordinary funded upgrades must commit");
    let classes: Vec<(String,i64)> = sqlx::query_as("SELECT CASE WHEN input#>>'{payload,Command,type}'='World' THEN input#>>'{payload,Command,action,type}' ELSE input#>>'{payload,Command,type}' END,count(*) FROM commands WHERE universe=$1 GROUP BY 1")
        .bind(universe.0).fetch_all(&pool).await.unwrap();
    let classes: std::collections::BTreeMap<_, _> = classes.into_iter().collect();
    let command_rows: i64 = classes.values().sum();
    assert!(
        command_rows as u64 * 60 >= seconds * minimum_rows_per_minute,
        "command write scenario fell below planned observed-load margin"
    );
    assert_eq!(classes.get("StartUpgrade"), Some(&(actions as i64)));
    assert_eq!(
        classes.get("RecordForegroundPresence"),
        Some(&(actions as i64))
    );
    assert_eq!(
        command_rows,
        2 * actions as i64,
        "duplicate admission must not duplicate commands"
    );
    let (pending, invalid_receipts):(i64,i64) = sqlx::query_as("SELECT count(*) FILTER(WHERE NOT done),count(*) FILTER(WHERE receipt->>'status'<>'Committed' OR receipt->>'executed_at' IS NULL) FROM commands WHERE universe=$1")
        .bind(universe.0).fetch_one(&pool).await.unwrap();
    assert_eq!((pending, invalid_receipts), (0, 0));
    let operations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM constructions WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        operations, actions as i64,
        "each accepted upgrade creates one operation"
    );
    let levels: i64 = sqlx::query_scalar("SELECT COALESCE(sum(level),0)::bigint FROM building_levels b JOIN bodies p ON p.id=b.body WHERE p.universe=$1 AND building='MetalMine'").bind(universe.0).fetch_one(&pool).await.unwrap();
    let completed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM constructions WHERE universe=$1 AND status='Completed'",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        levels, completed,
        "every completed upgrade changes the live level once"
    );
    let max_units:i64=sqlx::query_scalar("SELECT COALESCE(max(n),0)::bigint FROM (SELECT count(*) n FROM bot_activity WHERE universe=$1 GROUP BY player) q")
        .bind(universe.0).fetch_one(&pool).await.unwrap();
    assert!(max_units as u64 <= allowance);
    let minimum_spacing = pacer.starts.windows(2).map(|w| w[1] - w[0]).min().unwrap();
    assert!(minimum_spacing >= Duration::from_millis(250));
    println!(
        "{}",
        json!({"bots":bots,"action_units_per_day":allowance,"max_charged_units_per_actor":max_units,"command_interval_ms":command_interval_ms,"command_rows":command_rows,"command_classes":classes,"logical_client_requests":pacer.starts.len(),"minimum_request_spacing_ms":minimum_spacing.as_millis(),"workload_version":2,"retained_completed_pairs":history,"asset_lots_per_player":lots_per_player,"live_state_relation_bytes":live_bytes,"completed_operation_relation_bytes":completed_bytes,"recent_completed_payload_bytes":recent_bytes,"cleanup_backlog_payload_bytes":backlog_bytes,"emitted_log_bytes":0,"provider_history_pairs":provider_history,"preparation_ms":preparation_ms,"duration_ms":started.elapsed().as_millis(),"game_iterations":requests,"latency":{"machine_auth":latency(machine_times),"bot_status":latency(status_times),"world_view":latency(read_times),"admission_settlement":latency(commit_times)},"commands_committed":committed,"commands_rejected":rejected,"auth":auth,"limitations":"direct game services without a logging subscriber (zero emitted log bytes); synthetic terminal rows, no command cleanup; local PostgreSQL cannot certify RDS burst capacity"})
    );
}
