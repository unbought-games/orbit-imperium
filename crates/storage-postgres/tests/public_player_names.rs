use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::json;
use std::collections::BTreeMap;
use uuid::Uuid;

#[tokio::test]
async fn visible_names_are_batched_scoped_current_and_separate_from_report_history() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("public-name-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[35; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let game = GameService::new(store.clone());
    let mut bindings = vec![];
    for a in &accounts {
        let auth = SessionService::new(store.clone())
            .login(&a.name, &a.password, None)
            .await
            .unwrap();
        bindings.push(
            game.current_binding(auth.session.account, u, Uuid::new_v4())
                .await
                .unwrap()
                .binding,
        );
    }
    let b = bindings[0];
    let other = bindings[1];
    let principal = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let context = || QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    };
    let view = game.world_view(principal, context()).await.unwrap();
    let coords = view.progression.bodies[0].coordinates;
    let query = || WorldQuery {
        context: context(),
        query: WorldQueryKind::Galaxy {
            galaxy: coords.galaxy,
            system: coords.system,
        },
    };
    let galaxy = game.world_query(principal, query()).await.unwrap();
    let names = galaxy.data["player_names"].as_object().unwrap();
    assert_eq!(names[&b.player.to_string()], accounts[0].name);
    for (id, value) in names {
        assert!(
            galaxy.data["positions"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| p["body"]["owner"] == *id)
        );
        assert!(value.is_string());
    }
    // Arbitrary account IDs, missing identities and members of another universe
    // must not become public player identities in this universe.
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let foreign_u = UniverseId(Uuid::new_v4());
    let policy = store
        .ensure_signup_universe(Some(foreign_u), Default::default(), Some(10))
        .await
        .unwrap();
    store.enroll_oidc(b.account, policy).await.unwrap();
    let foreign = game
        .current_binding(b.account, foreign_u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let requested = vec![
        b.player,
        other.player,
        b.player,
        PlayerId(b.account.0),
        foreign.player,
        PlayerId(Uuid::new_v4()),
    ];
    let names = store.public_player_names(b, requested).await.unwrap();
    assert_eq!(
        names,
        BTreeMap::from([
            (b.player, accounts[0].name.clone()),
            (other.player, accounts[1].name.clone())
        ])
    );
    let invalid = Binding {
        account: other.account,
        ..b
    };
    assert!(
        store
            .public_player_names(invalid, vec![b.player])
            .await
            .is_err()
    );

    let id = ReportId(Uuid::new_v4());
    let visible = json!({"kind":"Combat","target_name":"Historical colony","target_kind":"Planet","participants":[{"owner":other.player,"side":"Defender"}],"rounds":[{"start":[{"owner":other.player}],"end":[]}],"captured":"immutable"});
    let hidden_player = bindings[2].player;
    let report = MissionReport {
        id,
        event: InputId(Uuid::new_v4()),
        kind: "Combat".into(),
        at: 1000,
        fleet: None,
        rules_hash: Ruleset::mvp_fleets().unwrap().hash,
        payloads: BTreeMap::from([
            (b.player, visible.clone()),
            (
                other.player,
                json!({"kind":"Combat","participants":[{"owner":hidden_player}]}),
            ),
        ]),
    };
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Combat',1000,$4)")
        .bind(u.0).bind(id.0).bind(report.event.0).bind(sqlx::types::Json(&report)).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,0)",
    )
    .bind(id.0)
    .bind(b.player.0)
    .execute(&pool)
    .await
    .unwrap();
    let report_query = || ReportsQuery4 {
        context: context(),
        cursor: None,
        kind: None,
        limit: 100,
        include_hidden: false,
    };
    let page = game.reports4(principal, report_query()).await.unwrap();
    assert_eq!(
        page.data.player_names,
        BTreeMap::from([(other.player, accounts[1].name.clone())])
    );
    assert_eq!(page.data.items.len(), 1);
    assert_eq!(
        page.data.items[0].preview.as_ref().unwrap()["target_name"],
        "Historical colony"
    );
    let detail = game.report4(principal, context(), id).await.unwrap();
    assert_eq!(
        detail.data.player_names,
        BTreeMap::from([(other.player, accounts[1].name.clone())])
    );
    assert_eq!(detail.data.payload, visible);
    let unauthorized = Principal {
        account: other.account,
        player: other.player,
        universe: u,
    };
    assert!(
        game.report4(
            unauthorized,
            QueryContext {
                binding: other,
                request_id: Uuid::new_v4()
            },
            id
        )
        .await
        .is_err()
    );

    sqlx::query("UPDATE accounts SET name='Renamed commander' WHERE id=$1")
        .bind(other.account.0)
        .execute(&pool)
        .await
        .unwrap();
    let renamed = game.report4(principal, context(), id).await.unwrap();
    assert_eq!(
        renamed.data.player_names[&other.player],
        "Renamed commander"
    );
    assert_eq!(renamed.data.payload, visible);
    let renamed_page = game.reports4(principal, report_query()).await.unwrap();
    assert_eq!(
        renamed_page.data.player_names[&other.player],
        "Renamed commander"
    );
    assert_eq!(
        renamed_page.data.items[0].preview,
        page.data.items[0].preview
    );
    let persisted: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM mission_reports WHERE id=$1")
            .bind(id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(persisted, serde_json::to_value(&report).unwrap());

    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND player=$2")
        .bind(u.0)
        .bind(other.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let missing = game.report4(principal, context(), id).await.unwrap();
    assert!(missing.data.player_names.is_empty());
    let missing_page = game.reports4(principal, report_query()).await.unwrap();
    assert!(missing_page.data.player_names.is_empty());
    assert_eq!(
        missing_page.data.items[0].preview,
        page.data.items[0].preview
    );
    assert_eq!(missing.data.payload, visible);
    pool.close().await;
}
