use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture {
    store: PgStore,
    pool: PgPool,
    bindings: Vec<Binding>,
    sessions: Vec<LoginResult>,
}
// Store concrete login credentials separately: session login's public type is
// deliberately not needed outside setup.
struct LoginResult {
    token: String,
    csrf: String,
}
impl Fixture {
    async fn new() -> Self {
        let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-alliances");
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        let universe = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("alliance-{}-{i}", Uuid::new_v4()),
            password: Uuid::new_v4().to_string(),
        });
        store
            .bootstrap_mvp_fleets(universe, 1000, &accounts, &[83; 32])
            .await
            .unwrap();
        store.set_test_time(1000).await.unwrap();
        let mut bindings = vec![];
        let mut sessions = vec![];
        for a in accounts {
            let login = SessionService::new(store.clone())
                .login(&a.name, &a.password, None)
                .await
                .unwrap();
            bindings.push(
                store
                    .current_binding(login.session.account, universe)
                    .await
                    .unwrap()
                    .0,
            );
            sessions.push(LoginResult {
                token: login.token,
                csrf: login.session.csrf,
            });
        }
        Self {
            store,
            pool: PgPool::connect(&url).await.unwrap(),
            bindings,
            sessions,
        }
    }
    fn request(
        &self,
        p: usize,
        action: AllianceAction,
        revision: Option<u64>,
    ) -> AllianceCommandRequest {
        AllianceCommandRequest {
            context: QueryContext {
                binding: self.bindings[p],
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: revision,
            action,
        }
    }
    async fn command(
        &self,
        p: usize,
        action: AllianceAction,
        revision: Option<u64>,
    ) -> AllianceCommandResult {
        self.store
            .alliance_command(self.request(p, action, revision))
            .await
            .unwrap()
    }
    async fn create(&self, p: usize, name: &str, tag: &str) -> Uuid {
        self.command(
            p,
            AllianceAction::Create {
                name: name.into(),
                tag: tag.into(),
            },
            None,
        )
        .await
        .alliance
        .unwrap()
    }
    async fn view(&self, p: usize, alliance: Uuid) -> AllianceView {
        self.store
            .alliance_query(AllianceQueryRequest {
                context: QueryContext {
                    binding: self.bindings[p],
                    request_id: Uuid::new_v4(),
                },
                query: AllianceQuery::Detail {
                    alliance,
                    post_before: None,
                },
            })
            .await
            .unwrap()
    }
    async fn detail(&self, p: usize, alliance: Uuid) -> AllianceDetail {
        self.view(p, alliance).await.alliance.unwrap()
    }
    async fn update(&self, p: usize, alliance: Uuid, recruitment: AllianceRecruitment) {
        let d = self.detail(p, alliance).await;
        self.command(
            p,
            AllianceAction::Update {
                alliance,
                name: d.summary.name,
                tag: d.summary.tag,
                public_text: d.public_text,
                recruitment,
            },
            Some(d.revision),
        )
        .await;
    }
}
#[tokio::test]
async fn atomic_retries_races_privacy_history_and_revocation() {
    let f = Fixture::new().await;
    let create = f.request(
        0,
        AllianceAction::Create {
            name: "First Alliance".into(),
            tag: "ONE".into(),
        },
        None,
    );
    let (first, retry) = tokio::join!(
        f.store.alliance_command(create.clone()),
        f.store.alliance_command(create.clone())
    );
    let first = first.unwrap();
    assert_eq!(
        serde_json::to_value(&first).unwrap(),
        serde_json::to_value(retry.unwrap()).unwrap()
    );
    let a = first.alliance.unwrap();
    let mut changed = create.clone();
    changed.action = AllianceAction::Create {
        name: "Other name".into(),
        tag: "TWO".into(),
    };
    assert!(matches!(
        f.store.alliance_command(changed).await,
        Err(StoreError::Conflict)
    ));
    assert!(
        f.store
            .alliance_command(f.request(
                1,
                AllianceAction::Create {
                    name: "first alliance".into(),
                    tag: "THR".into()
                },
                None
            ))
            .await
            .is_err()
    );
    let b = f.create(1, "Second Alliance", "TWO").await;
    f.update(0, a, AllianceRecruitment::Open).await;
    f.update(1, b, AllianceRecruitment::Open).await;
    let (join_a, join_b) = tokio::join!(
        f.store
            .alliance_command(f.request(2, AllianceAction::Join { alliance: a }, None)),
        f.store
            .alliance_command(f.request(2, AllianceAction::Join { alliance: b }, None))
    );
    assert_ne!(join_a.is_ok(), join_b.is_ok());
    let won = if join_a.is_ok() { a } else { b };
    let leader = if won == a { 0 } else { 1 };
    assert_eq!(f.detail(leader, won).await.summary.member_count, 2);
    let member = f.detail(2, won).await;
    assert!(
        member
            .members
            .as_ref()
            .unwrap()
            .iter()
            .all(|m| m.activity.is_none())
    );
    assert!(member.applications.is_none() && member.audit.is_none());
    let outsider = f.view(3, won).await;
    assert!(outsider.alliance.is_none());
    let public = serde_json::to_value(
        f.store
            .public_alliance(f.bindings[0].universe, won)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(public.get("leader").is_none());
    assert!(public.get("members").is_none());
    assert_eq!(public.as_object().unwrap().len(), 2);
    let old = f.detail(leader, won).await;
    let stale = f.request(
        leader,
        AllianceAction::CreatePost {
            alliance: won,
            title: "stale".into(),
            body: "never stored".into(),
        },
        Some(old.revision - 1),
    );
    assert!(matches!(
        f.store.alliance_command(stale).await,
        Err(StoreError::Conflict)
    ));
    assert!(f.detail(leader, won).await.posts.unwrap().is_empty());
    f.store.set_test_time(2000).await.unwrap();
    f.command(
        leader,
        AllianceAction::Update {
            alliance: won,
            name: "Renamed Alliance".into(),
            tag: "NEW".into(),
            public_text: "Recruitment".into(),
            recruitment: AllianceRecruitment::Open,
        },
        Some(old.revision),
    )
    .await;
    let historical:Vec<(String,i64,Option<i64>)>=sqlx::query_as("SELECT tag,valid_from,valid_until FROM alliance_affiliation_history WHERE player=$1 ORDER BY id").bind(f.bindings[2].player.0).fetch_all(&f.pool).await.unwrap();
    assert_eq!(historical.len(), 2);
    assert_eq!(historical[0].2, Some(2000));
    assert_eq!(historical[1].0, "NEW");
    let d = f.detail(leader, won).await;
    assert!(
        f.store
            .alliance_command(f.request(
                leader,
                AllianceAction::Leave { alliance: won },
                Some(d.revision)
            ))
            .await
            .is_err()
    );
    f.command(
        leader,
        AllianceAction::Transfer {
            alliance: won,
            player: f.bindings[2].player,
        },
        Some(d.revision),
    )
    .await;
    let former = f.detail(leader, won).await;
    assert!(
        !former
            .permissions
            .contains(&AlliancePermission::ViewActivity)
    );
    assert!(former.audit.is_none());
    let leave = f.request(
        leader,
        AllianceAction::Leave { alliance: won },
        Some(former.revision),
    );
    let left = f.store.alliance_command(leave.clone()).await.unwrap();
    assert!(f.view(leader, won).await.alliance.is_none());
    assert_eq!(
        serde_json::to_value(left).unwrap(),
        serde_json::to_value(f.store.alliance_command(leave).await.unwrap()).unwrap()
    );
    let d = f.detail(2, won).await;
    let disband = f.request(
        2,
        AllianceAction::Disband { alliance: won },
        Some(d.revision),
    );
    f.store.alliance_command(disband.clone()).await.unwrap();
    assert!(
        f.store
            .public_alliance(f.bindings[2].universe, won)
            .await
            .is_err()
    );
    assert!(f.store.alliance_command(disband).await.is_ok());
    assert!(f.store.alliance_command(create).await.is_ok()); // receipt survives rename/leave/disband
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM alliance_affiliation_history WHERE alliance=$1 AND valid_until IS NULL").bind(won).fetch_one(&f.pool).await.unwrap(),0);
}

#[tokio::test]
async fn accept_join_create_compete_and_withdraw_all_pending() {
    let f = Fixture::new().await;
    let a = f.create(0, "Recruiters One", "REC").await;
    let b = f.create(1, "Recruiters Two", "RTW").await;
    f.command(
        2,
        AllianceAction::Apply {
            alliance: a,
            text: "Join one".into(),
        },
        None,
    )
    .await;
    f.command(
        2,
        AllianceAction::Apply {
            alliance: b,
            text: "Join two".into(),
        },
        None,
    )
    .await;
    let da = f.detail(0, a).await;
    let db = f.detail(1, b).await;
    let aa = da.applications.unwrap()[0].id;
    let ab = db.applications.unwrap()[0].id;
    let (accept_a, accept_b, create) = tokio::join!(
        f.store.alliance_command(f.request(
            0,
            AllianceAction::Accept {
                alliance: a,
                application: aa
            },
            Some(da.revision)
        )),
        f.store.alliance_command(f.request(
            1,
            AllianceAction::Accept {
                alliance: b,
                application: ab
            },
            Some(db.revision)
        )),
        f.store.alliance_command(f.request(
            2,
            AllianceAction::Create {
                name: "Race Founder".into(),
                tag: "RAC".into()
            },
            None
        ))
    );
    assert_eq!(
        [accept_a.is_ok(), accept_b.is_ok(), create.is_ok()]
            .into_iter()
            .filter(|x| *x)
            .count(),
        1
    );
    assert!(f.detail(0, a).await.applications.unwrap().is_empty());
    assert!(f.detail(1, b).await.applications.unwrap().is_empty());
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM alliance_memberships WHERE universe=$1 AND player=$2"
        )
        .bind(f.bindings[2].universe.0)
        .bind(f.bindings[2].player.0)
        .fetch_one(&f.pool)
        .await
        .unwrap(),
        1
    );
    // Closed recruitment blocks new requests but retains applications for processing.
    f.command(
        3,
        AllianceAction::Apply {
            alliance: a,
            text: "Pending".into(),
        },
        None,
    )
    .await;
    f.update(0, a, AllianceRecruitment::Closed).await;
    assert!(
        f.store
            .alliance_command(f.request(
                4,
                AllianceAction::Apply {
                    alliance: a,
                    text: "Denied".into()
                },
                None
            ))
            .await
            .is_err()
    );
    let d = f.detail(0, a).await;
    let application = d.applications.unwrap()[0].id;
    f.command(
        0,
        AllianceAction::Accept {
            alliance: a,
            application,
        },
        Some(d.revision),
    )
    .await;
    let d = f.detail(0, a).await;
    f.command(
        0,
        AllianceAction::Kick {
            alliance: a,
            player: f.bindings[3].player,
        },
        Some(d.revision),
    )
    .await;
    assert!(f.view(3, a).await.alliance.is_none());
}

#[tokio::test]
async fn board_is_bounded_pin_races_and_revision_bound_pages() {
    let f = Fixture::new().await;
    let a = f.create(0, "Noticeboard", "PIN").await;
    for n in 0..101 {
        let d = f.detail(0, a).await;
        f.store.set_test_time(1000 + n).await.unwrap();
        f.command(
            0,
            AllianceAction::CreatePost {
                alliance: a,
                title: format!("Post {n}"),
                body: "Body".into(),
            },
            Some(d.revision),
        )
        .await;
    }
    let d = f.detail(0, a).await;
    assert_eq!(d.posts.as_ref().unwrap().len(), 20);
    assert_eq!(d.posts.as_ref().unwrap()[0].title, "Post 100");
    let cursor = d.next_post_before.unwrap().unwrap();
    let mut page = f
        .store
        .alliance_query(AllianceQueryRequest {
            context: QueryContext {
                binding: f.bindings[0],
                request_id: Uuid::new_v4(),
            },
            query: AllianceQuery::Detail {
                alliance: a,
                post_before: Some(cursor),
            },
        })
        .await
        .unwrap()
        .alliance
        .unwrap();
    assert_eq!(page.posts.as_ref().unwrap()[0].title, "Post 80");
    let mut total = 40;
    while let Some(c) = page.next_post_before.flatten() {
        page = f
            .store
            .alliance_query(AllianceQueryRequest {
                context: QueryContext {
                    binding: f.bindings[0],
                    request_id: Uuid::new_v4(),
                },
                query: AllianceQuery::Detail {
                    alliance: a,
                    post_before: Some(c),
                },
            })
            .await
            .unwrap()
            .alliance
            .unwrap();
        total += page.posts.as_ref().unwrap().len();
    }
    assert_eq!(total, 100);
    assert!(!page.posts.unwrap().iter().any(|p| p.title == "Post 0"));
    let ids: Vec<_> = d.posts.unwrap().iter().map(|p| p.id).collect();
    for post in ids.iter().take(4) {
        let d = f.detail(0, a).await;
        f.command(
            0,
            AllianceAction::PinPost {
                alliance: a,
                post: *post,
                pinned: true,
            },
            Some(d.revision),
        )
        .await;
    }
    let d = f.detail(0, a).await;
    let (pin1, pin2) = tokio::join!(
        f.store.alliance_command(f.request(
            0,
            AllianceAction::PinPost {
                alliance: a,
                post: ids[4],
                pinned: true
            },
            Some(d.revision)
        )),
        f.store.alliance_command(f.request(
            0,
            AllianceAction::PinPost {
                alliance: a,
                post: ids[5],
                pinned: true
            },
            Some(d.revision)
        ))
    );
    assert_ne!(pin1.is_ok(), pin2.is_ok());
    let d = f.detail(0, a).await;
    assert_eq!(d.posts.unwrap().iter().filter(|p| p.pinned).count(), 5);
    assert!(
        f.store
            .alliance_command(f.request(
                0,
                AllianceAction::PinPost {
                    alliance: a,
                    post: ids[6],
                    pinned: true
                },
                Some(d.revision)
            ))
            .await
            .is_err()
    );
    assert!(matches!(
        f.store
            .alliance_query(AllianceQueryRequest {
                context: QueryContext {
                    binding: f.bindings[0],
                    request_id: Uuid::new_v4()
                },
                query: AllianceQuery::Detail {
                    alliance: a,
                    post_before: Some(cursor)
                }
            })
            .await,
        Err(StoreError::Conflict)
    ));
    let count: i32 =
        sqlx::query_scalar("SELECT jsonb_array_length(posts) FROM alliances WHERE id=$1")
            .bind(a)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(count, 100);
    let columns:Vec<String>=sqlx::query_scalar("SELECT column_name FROM information_schema.columns WHERE table_name='alliance_command_receipts'").fetch_all(&f.pool).await.unwrap();
    assert!(columns.contains(&"intent_hash".into()));
    assert!(!columns.contains(&"intent".into()));
}

async fn http(
    app: &Router,
    url: &str,
    body: Option<Value>,
    login: Option<&LoginResult>,
    origin: Option<&str>,
    csrf: bool,
) -> (StatusCode, Value) {
    let mut req = if body.is_some() {
        Request::post(url)
    } else {
        Request::get(url)
    };
    req = req.header("content-type", "application/json");
    if let Some(login) = login {
        req = req.header("cookie", format!("orbit_session={}", login.token));
        if csrf {
            req = req.header("x-csrf-token", &login.csrf);
        }
    }
    if let Some(origin) = origin {
        req = req.header("origin", origin);
    }
    let response = app
        .clone()
        .oneshot(
            req.body(Body::from(body.map(|v| v.to_string()).unwrap_or_default()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    assert_eq!(response.headers()["cache-control"], "no-store");
    (
        status,
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap(),
    )
}
#[tokio::test]
async fn http_authentication_csrf_origin_scope_and_anonymous_privacy() {
    let f = Fixture::new().await;
    let a = f.create(0, "HTTP Alliance", "WEB").await;
    let u = f.bindings[0].universe;
    let config = orbit_transport_http::HttpConfig {
        origin: "https://game.test".into(),
        secure_cookies: true,
        assets: "missing".into(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = orbit_transport_http::router_with_profiles(f.store.clone(), config, rx, None, None);
    let url = format!("/api/v4/universes/{u}/alliances/query");
    let q = json!({"context":{"binding":f.bindings[0],"request_id":Uuid::new_v4()},"query":{"type":"Mine"}});
    assert_eq!(
        http(
            &app,
            &url,
            Some(q.clone()),
            None,
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        http(
            &app,
            &url,
            Some(q.clone()),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            false
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        http(
            &app,
            &url,
            Some(q.clone()),
            Some(&f.sessions[0]),
            Some("https://evil.test"),
            true
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        http(
            &app,
            &url,
            Some(q.clone()),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut wrong = q.clone();
    wrong["context"]["binding"]["player"] = json!(f.bindings[1].player);
    assert_ne!(
        http(
            &app,
            &url,
            Some(wrong),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut wrong = q.clone();
    wrong["context"]["binding"]["epoch"] = json!(Uuid::new_v4());
    assert_eq!(
        http(
            &app,
            &url,
            Some(wrong),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let mut wrong = q;
    wrong["context"]["binding"]["universe"] = json!(Uuid::new_v4());
    assert_ne!(
        http(
            &app,
            &url,
            Some(wrong),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    let public = http(
        &app,
        &format!("/api/v4/universes/{u}/alliances/{a}"),
        None,
        None,
        None,
        false,
    )
    .await;
    assert_eq!(public.0, StatusCode::OK);
    assert_eq!(
        public
            .1
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["public_text", "summary"]
    );
    let binding = f.bindings[0];
    let ranks = GameService::new(f.store.clone())
        .rankings(
            Principal {
                account: binding.account,
                player: binding.player,
                universe: u,
            },
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let ranked = ranks.alliances.iter().find(|r| r.alliance.id == a).unwrap();
    assert_eq!(public.1["summary"]["ranking"]["points"], ranked.points);
    assert_eq!(public.1["summary"]["member_count"], ranked.member_count);
    assert_eq!(public.1["summary"]["ranking"]["rank"], ranked.rank);
    let commands = format!("/api/v4/universes/{u}/alliances/commands");
    let request = serde_json::to_value(f.request(
        0,
        AllianceAction::CreatePost {
            alliance: a,
            title: "Via HTTP".into(),
            body: "Private".into(),
        },
        Some(1),
    ))
    .unwrap();
    assert_eq!(
        http(
            &app,
            &commands,
            Some(request.clone()),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            false
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        http(
            &app,
            &commands,
            Some(request),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn concurrent_applications_enforce_five_and_join_withdraws_everywhere() {
    let f = Fixture::new().await;
    let b = f.bindings[0];
    let mut alliances = vec![];
    // Additional source universe members avoid coupling this policy test to signup.
    for n in 0..6 {
        let account = Uuid::new_v4();
        let player = Uuid::new_v4();
        sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,'unused')")
            .bind(account)
            .bind(format!("quota-{account}"))
            .execute(&f.pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
            .bind(player)
            .bind(b.universe.0)
            .execute(&f.pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)")
            .bind(b.universe.0)
            .bind(account)
            .bind(player)
            .execute(&f.pool)
            .await
            .unwrap();
        let leader = Binding {
            account: AccountId(account),
            player: PlayerId(player),
            ..b
        };
        let request = AllianceCommandRequest {
            context: QueryContext {
                binding: leader,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: None,
            action: AllianceAction::Create {
                name: format!("Quota Alliance {n}"),
                tag: format!("QT{n}"),
            },
        };
        alliances.push(
            f.store
                .alliance_command(request)
                .await
                .unwrap()
                .alliance
                .unwrap(),
        );
    }
    let mut tasks = tokio::task::JoinSet::new();
    for a in &alliances {
        let store = f.store.clone();
        let q = f.request(
            0,
            AllianceAction::Apply {
                alliance: *a,
                text: "Application".into(),
            },
            None,
        );
        tasks.spawn(async move { store.alliance_command(q).await });
    }
    let mut succeeded = 0;
    while let Some(r) = tasks.join_next().await {
        if r.unwrap().is_ok() {
            succeeded += 1;
        }
    }
    assert_eq!(succeeded, 5);
    let own = f
        .store
        .alliance_query(AllianceQueryRequest {
            context: QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
            query: AllianceQuery::Mine,
        })
        .await
        .unwrap();
    assert_eq!(own.applications.len(), 5);
    f.command(
        0,
        AllianceAction::Withdraw {
            application: own.applications[0].id,
        },
        None,
    )
    .await;
    let own = f
        .store
        .alliance_query(AllianceQueryRequest {
            context: QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
            query: AllianceQuery::Mine,
        })
        .await
        .unwrap();
    assert_eq!(own.applications.len(), 4);
    // Creating an alliance is also an atomic membership transition and clears all pending applications.
    f.create(0, "Now A Founder", "NEW").await;
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM alliance_applications WHERE player=$1")
            .bind(b.player.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn delegated_access_is_revoked_immediately_and_stale_authority_cannot_mutate() {
    let f = Fixture::new().await;
    let a = f.create(0, "Delegation", "DEL").await;
    f.update(0, a, AllianceRecruitment::Open).await;
    f.command(1, AllianceAction::Join { alliance: a }, None)
        .await;
    f.update(0, a, AllianceRecruitment::Application).await;
    let d = f.detail(0, a).await;
    let recruiter = d
        .roles
        .unwrap()
        .iter()
        .find(|r| r.name == "Recruiter")
        .unwrap()
        .id;
    f.command(
        0,
        AllianceAction::AssignRoles {
            alliance: a,
            player: f.bindings[1].player,
            roles: vec![recruiter],
        },
        Some(d.revision),
    )
    .await;
    f.command(
        2,
        AllianceAction::Apply {
            alliance: a,
            text: "Private application".into(),
        },
        None,
    )
    .await;
    let old = f.detail(1, a).await;
    let application = old.applications.unwrap()[0].id;
    assert!(
        old.permissions
            .contains(&AlliancePermission::ProcessApplications)
    );
    let d = f.detail(0, a).await;
    f.command(
        0,
        AllianceAction::AssignRoles {
            alliance: a,
            player: f.bindings[1].player,
            roles: vec![],
        },
        Some(d.revision),
    )
    .await;
    let revoked = f.detail(1, a).await;
    assert!(revoked.applications.is_none());
    assert!(
        !revoked
            .permissions
            .contains(&AlliancePermission::ProcessApplications)
    );
    let result = f
        .store
        .alliance_command(f.request(
            1,
            AllianceAction::Accept {
                alliance: a,
                application,
            },
            Some(revoked.revision),
        ))
        .await;
    assert!(result.is_err());
    assert_eq!(f.detail(0, a).await.applications.unwrap().len(), 1);
    // Removing baseline ViewMembers immediately omits the roster on the next read.
    let d = f.detail(0, a).await;
    let default = d.roles.unwrap().into_iter().find(|r| r.is_default).unwrap();
    f.command(
        0,
        AllianceAction::SaveRole {
            alliance: a,
            role: Some(default.id),
            name: default.name,
            permissions: vec![AlliancePermission::PublishPosts],
            grantable_permissions: vec![],
        },
        Some(d.revision),
    )
    .await;
    let limited = f.detail(1, a).await;
    assert!(limited.members.is_none());
    assert!(limited.roles.is_none());
}
