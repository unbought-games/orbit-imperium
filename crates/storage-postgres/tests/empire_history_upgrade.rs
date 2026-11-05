use orbit_application::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn upgrade_retains_available_evidence_without_inventing_names_dates_or_strength() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let older = sqlx::migrate::Migrator {
        migrations: sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version < 36)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    let u = Uuid::new_v4();
    let epoch = Uuid::new_v4();
    let account = Uuid::new_v4();
    let player = Uuid::new_v4();
    let report = Uuid::new_v4();
    sqlx::query("INSERT INTO rulesets VALUES('history-fixture','fixture','{}')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash,name) VALUES($1,$2,true,1,1000,'history-fixture','Historical universe')").bind(u).bind(epoch).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO accounts VALUES($1,'Current name','hash')")
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO players VALUES($1,$2)")
        .bind(player)
        .bind(u)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)")
        .bind(u)
        .bind(account)
        .bind(player)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Combat',1500,$4)").bind(u).bind(report).bind(Uuid::new_v4()).bind(json!({"payloads":{player.to_string():{"kind":"ContactLost","at":1500,"own_lost_ships":[]}}})).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO mission_report_alliances(report,identities) VALUES($1,$2)").bind(report).bind(json!({Uuid::new_v4().to_string():{"id":Uuid::new_v4(),"universe":u,"name":"Unobserved defender alliance","tag":"HIDE"}})).execute(&pool).await.unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let history = store
        .empire_profile(
            Some(AccountId(account)),
            player,
            HistoryQuery {
                library: true,
                before: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(history.entries.len(), 2);
    assert!(
        history
            .entries
            .iter()
            .find(|e| e.kind == "Joined")
            .unwrap()
            .at_ms
            .is_none()
    );
    let battle = history.entries.iter().find(|e| e.kind == "Battle").unwrap();
    assert!(!battle.noteworthy);
    assert_eq!(battle.facts["names"], json!({}));
    assert_eq!(battle.facts["alliances"], json!({}));
    let detail = store
        .history_detail(Some(AccountId(account)), battle.id, false)
        .await
        .unwrap();
    assert_eq!(detail.report.unwrap().payload["kind"], "ContactLost");
    assert!(
        !serde_json::to_string(battle)
            .unwrap()
            .contains("Current name")
    );
    assert!(
        store
            .empire_profile(None, player, HistoryQuery::default())
            .await
            .is_err()
    );
}
