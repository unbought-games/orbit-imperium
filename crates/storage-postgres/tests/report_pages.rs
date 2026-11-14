use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::json;
use uuid::Uuid;

// Regression: filters must run before LIMIT; archived/read rows and other players'
// history must not force the browser to traverse the complete report collection.
#[tokio::test]
async fn filtered_pages_are_bounded_ordered_private_and_cursor_scoped() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("report-pages-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1_000_000, &accounts, &[23; 32])
        .await
        .unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let game = GameService::new(store.clone());
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let b = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    // Equal timestamps exercise deterministic UUID tie breaking. Known empty,
    // unknown and large resource values exercise numeric sorting and null cursors.
    for i in 1..=600u128 {
        let kind = if i % 2 == 0 { "Espionage" } else { "Harvested" };
        let payload = json!({"kind":kind,"resources": if i%10==0 {json!({"visibility":"Unknown"})} else {json!({"visibility":"Known","value":{"metal":(i*10000000000000000).to_string(),"crystal":"0","deuterium":"0"}})}, "fleet":{"visibility":"Known","value":[{"item":{"kind":"Ship","id":"SmallCargo"},"count":i.to_string()}]},"defenses":{"visibility":"Known","value":[]}});
        sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(u.0).bind(Uuid::from_u128(i)).bind(Uuid::new_v4()).bind(kind).bind((i/3) as i64)
            .bind(json!({"payloads":{b.player.to_string():payload}})).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision,read,hidden,starred) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(Uuid::from_u128(i)).bind(b.player.0).bind(i as i64).bind(i%3==0).bind(i%4==0).bind(i%5==0).execute(&pool).await.unwrap();
    }
    sqlx::query("UPDATE mission_report_heads SET revision=600 WHERE recipient=$1")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let principal = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let query = ReportsQuery4 {
        context: QueryContext {
            binding: b,
            request_id: Uuid::new_v4(),
        },
        cursor: None,
        kind: None,
        limit: 50,
        include_hidden: false,
        filter: ReportFilter4 {
            hidden: Some(false),
            ..Default::default()
        },
    };
    let first = game
        .reports4(principal, query.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(first.items.len(), 50);
    assert!(first.items.iter().all(|h| !h.hidden));
    assert_eq!(first.unread_count, 99);
    assert!(first.has_more);
    let mut next = query.clone();
    next.cursor = first.next_cursor.clone();
    let second = game
        .reports4(principal, next.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert!(
        second
            .items
            .iter()
            .all(|h| !first.items.iter().any(|old| old.id == h.id))
    );
    next.filter.hidden = Some(true);
    assert!(
        game.reports4(principal, next).await.is_err(),
        "cursor must be bound to folder"
    );
    for sort in [
        ReportSort4::Newest,
        ReportSort4::Oldest,
        ReportSort4::Total,
        ReportSort4::Fleet,
        ReportSort4::Defenses,
    ] {
        for hidden in [false, true] {
            let mut q = query.clone();
            q.filter = ReportFilter4 {
                hidden: Some(hidden),
                unread_only: true,
                starred_only: true,
                sort,
                ..Default::default()
            };
            q.kind = Some("Espionage".into());
            q.limit = 7;
            let mut ids = Vec::new();
            let mut metrics = Vec::new();
            loop {
                let page = game
                    .reports4(principal, q.clone())
                    .await
                    .unwrap()
                    .facts
                    .data;
                assert!(page.items.len() <= 7);
                for h in &page.items {
                    assert_eq!(h.hidden, hidden);
                    assert!(!h.read);
                    assert!(h.starred);
                    assert_eq!(h.kind, "Espionage");
                    ids.push(h.id.0.as_u128());
                    metrics.push(match sort {
                        ReportSort4::Fleet => h.fleet_investment.clone(),
                        ReportSort4::Defenses => h.defense_investment.clone(),
                        _ => None,
                    });
                }
                if !page.has_more {
                    break;
                }
                q.cursor = page.next_cursor;
            }
            let mut expected: Vec<u128> = (1..=600)
                .filter(|i| (i % 4 == 0) == hidden && i % 2 == 0 && i % 3 != 0 && i % 5 == 0)
                .collect();
            if sort == ReportSort4::Oldest {
                expected.sort_by_key(|i| (i / 3, std::cmp::Reverse(*i)));
            } else {
                expected.reverse();
            }
            assert_eq!(ids, expected, "sort {sort:?} folder {hidden}");
            if sort == ReportSort4::Defenses {
                assert!(metrics.iter().all(|v| v.as_deref() == Some("0")));
            }
        }
    }
    // Target selection is recipient-scoped and happens before LIMIT, including
    // archived observations. Another recipient's payload must never match.
    let target = BodyId(Uuid::new_v4());
    let other = Uuid::new_v4();
    for (report, recipient, body) in [
        (2u128, b.player.0, target.0),
        (4, b.player.0, target.0),
        (600, other, target.0),
    ] {
        sqlx::query("UPDATE mission_reports SET data=jsonb_set(data,ARRAY['payloads',$1],COALESCE(data->'payloads'->$1,'{}'::jsonb)||$2) WHERE id=$3")
            .bind(recipient.to_string())
            .bind(json!({"target":{"body":body}}))
            .bind(Uuid::from_u128(report)).execute(&pool).await.unwrap();
    }
    let mut targeted = query.clone();
    targeted.kind = Some("Espionage".into());
    targeted.limit = 1;
    targeted.include_hidden = true;
    targeted.filter = ReportFilter4 {
        target_body: Some(target),
        ..Default::default()
    };
    let page = game
        .reports4(principal, targeted.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(page.items[0].id.0.as_u128(), 4);
    assert!(page.items[0].hidden);
    assert!(page.has_more);
    targeted.cursor = page.next_cursor.clone();
    let older = game
        .reports4(principal, targeted.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(older.items[0].id.0.as_u128(), 2);
    targeted.filter.target_body = Some(BodyId(Uuid::new_v4()));
    assert!(game.reports4(principal, targeted.clone()).await.is_err());
    targeted.cursor = None;
    assert!(
        game.reports4(principal, targeted)
            .await
            .unwrap()
            .facts
            .data
            .items
            .is_empty()
    );
    // Resource ordering spans known and unknown sections, not just one filtered page.
    let mut q = query.clone();
    q.kind = Some("Espionage".into());
    q.filter.sort = ReportSort4::Total;
    let first = game
        .reports4(principal, q.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(first.items[0].id.0.as_u128(), 598);
    q.cursor = first.next_cursor;
    let second = game.reports4(principal, q).await.unwrap().facts.data;
    assert!(!second.items.is_empty());
    // A legacy unit count outside i64 must remain unknown in both the header
    // and SQL ordering, rather than being ranked as an enormous known fleet.
    sqlx::query("UPDATE mission_reports SET data=jsonb_set(data,ARRAY['payloads',$1,'fleet','value'], $2) WHERE id=$3")
        .bind(b.player.to_string()).bind(json!([{"item":{"kind":"Ship","id":"SmallCargo"},"count":"9223372036854775808"}])).bind(Uuid::from_u128(598)).execute(&pool).await.unwrap();
    let mut q = query.clone();
    q.kind = Some("Espionage".into());
    q.filter.sort = ReportSort4::Fleet;
    let first = game
        .reports4(principal, q.clone())
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(first.items[0].id.0.as_u128(), 594);
    let mut last = first;
    while last.has_more {
        q.cursor = last.next_cursor;
        last = game
            .reports4(principal, q.clone())
            .await
            .unwrap()
            .facts
            .data;
    }
    assert_eq!(last.items.last().unwrap().id.0.as_u128(), 598);
    assert!(last.items.last().unwrap().fleet_investment.is_none());
    // Regression: malformed historical resource values must sort as unknown,
    // never abort the SQL cast or rank NaN/overflow ahead of valid observations.
    let invalid = [
        json!("bad"),
        json!("NaN"),
        json!("9223372036854775808"),
        json!("9".repeat(140_000)),
        json!(12),
        json!(null),
    ];
    let bad_ids = [598u128, 594, 590, 586, 582, 578];
    for (index, (id, value)) in bad_ids.into_iter().zip(invalid).enumerate() {
        let resource = ["metal", "crystal", "deuterium"][index % 3];
        sqlx::query("UPDATE mission_reports SET data=jsonb_set(data,ARRAY['payloads',$1,'resources'], $2) WHERE id=$3")
            .bind(b.player.to_string()).bind(json!({"visibility":"Known","value":{"metal":"0","crystal":"0","deuterium":"0"}})).bind(Uuid::from_u128(id)).execute(&pool).await.unwrap();
        sqlx::query("UPDATE mission_reports SET data=jsonb_set(data,ARRAY['payloads',$1,'resources','value',$2], $3) WHERE id=$4")
            .bind(b.player.to_string()).bind(resource).bind(value).bind(Uuid::from_u128(id)).execute(&pool).await.unwrap();
    }
    let mut q = query.clone();
    q.kind = Some("Espionage".into());
    q.filter.sort = ReportSort4::Total;
    q.limit = 7;
    let mut ids = Vec::new();
    loop {
        let page = game
            .reports4(principal, q.clone())
            .await
            .unwrap()
            .facts
            .data;
        for header in &page.items {
            if bad_ids.contains(&header.id.0.as_u128()) {
                assert_eq!(
                    header.preview.as_ref().unwrap()["resources"],
                    json!({"visibility":"Unknown"})
                );
            }
        }
        ids.extend(page.items.iter().map(|h| h.id.0.as_u128()));
        if !page.has_more {
            break;
        }
        q.cursor = page.next_cursor;
    }
    let mut expected: Vec<u128> = (1..=600).filter(|i| i % 2 == 0 && i % 4 != 0).collect();
    expected.sort_by_key(|i| (i % 10 == 0 || bad_ids.contains(i), std::cmp::Reverse(*i)));
    assert_eq!(
        ids, expected,
        "invalid resources stay last across cursor boundaries"
    );
    // No recipient rows -> no visibility even though all reports are in the universe.
    let auth = SessionService::new(store.clone())
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap();
    let other = game
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let mut q = query;
    q.context.binding = other;
    let page = game
        .reports4(
            Principal {
                account: other.account,
                player: other.player,
                universe: u,
            },
            q,
        )
        .await
        .unwrap()
        .facts
        .data;
    assert!(page.items.is_empty());
    assert_eq!(page.unread_count, 0);
}
