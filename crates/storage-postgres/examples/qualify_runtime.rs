//! Explicit local characterization, never a production load generator.
use orbit_application::*;
use orbit_engine::{Building, WorkerId};
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
                    action_units_per_24h: Some(1000),
                },
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let mut players = Vec::new();
    for n in 0..bots {
        let b = store
            .create_bot(universe, &format!("synthetic-{n}"), 0)
            .await
            .unwrap();
        let token = store.issue_bot_token(universe, b.player).await.unwrap();
        players.push((b, token_digest(&token)));
    }
    // Independent inactive history in a different universe does not masquerade
    // as authoritative receipts. Row counts stress indexes, not RDS burst storage.
    let retained = UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: retained,
            immutable: UniverseImmutable::default(),
            policy: UniversePolicy::default(),
        })
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("INSERT INTO transition_journal(universe,cursor,input_id,input,facts,outcome) SELECT $1,n,gen_random_uuid(),'{}'::jsonb,jsonb_build_object('synthetic',md5(n::text)),'{}'::jsonb FROM generate_series(1,$2::bigint) n")
        .bind(retained.0).bind(history as i64).execute(&pool).await.unwrap();
    let retained_bytes: i64 =
        sqlx::query_scalar("SELECT pg_total_relation_size('transition_journal')")
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
    let mut cadence = tokio::time::interval(Duration::from_millis(250));
    cadence.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    while tokio::time::Instant::now() < until {
        tokio::select! { _=cadence.tick()=>{}, _=tokio::time::sleep_until(until)=>break }
        let (b, digest) = &players[((requests + requests / bots) as usize) % players.len()];
        let b = *b;
        let at = Instant::now();
        assert!(store.authenticate_machine(digest).await.unwrap().is_some());
        machine_times.push(at.elapsed().as_millis());
        tokio::time::sleep(Duration::from_millis(250)).await;
        let at = Instant::now();
        store.bot_status(principal(b)).await.unwrap();
        status_times.push(at.elapsed().as_millis());
        tokio::time::sleep(Duration::from_millis(250)).await;
        let at = Instant::now();
        let view = game.world_view(principal(b), context(b)).await.unwrap();
        read_times.push(at.elapsed().as_millis());
        tokio::time::sleep(Duration::from_millis(250)).await;
        // Exercise a real quote, idempotent admission, worker and receipt each
        // roster rotation. Invalid/unaffordable upgrades remain ordinary rejects.
        if requests.is_multiple_of(bots) {
            store
                .set_test_time(12 * 3_600_000 + started.elapsed().as_millis() as i64)
                .await
                .unwrap();
            let body = view.facts.homeworld_id.expect("synthetic homeworld");
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
            if let Some(hash) = quote.terms_hash {
                let admitted = Instant::now();
                let command = CommandEnvelopeV4 {
                    protocol: 4,
                    binding: b,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::StartUpgrade {
                        body,
                        building: Building::MetalMine,
                        expected_terms_hash: hash,
                    }),
                };
                game.machine_submit(principal(b), command.clone())
                    .await
                    .unwrap();
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
                tokio::time::sleep(Duration::from_millis(250)).await;
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
            }
            guard.check().await.unwrap();
        }
        requests += 1;
    }
    let auth = auth.await.expect("auth characterization failed");
    assert!(
        requests >= seconds,
        "local workload fell below one iteration/second"
    );
    assert!(committed > 0, "fixture must demonstrate worker progress");
    println!(
        "{}",
        json!({"bots":bots,"synthetic_history_rows":history,"synthetic_journal_bytes":retained_bytes,"provider_history_pairs":provider_history,"preparation_ms":preparation_ms,"duration_ms":started.elapsed().as_millis(),"game_iterations":requests,"latency":{"machine_auth":latency(machine_times),"bot_status":latency(status_times),"world_view":latency(read_times),"admission_settlement":latency(commit_times)},"commands_committed":committed,"commands_rejected":rejected,"auth":auth,"limitations":"direct game services, synthetic row history not a 5.3GB storage replica; local PostgreSQL cannot certify RDS burst capacity"})
    );
}
