use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::Value;
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
impl Fixture {
    fn social_request(&self, p: usize, action: SocialAction) -> SocialCommandRequest {
        SocialCommandRequest {
            context: QueryContext {
                binding: self.bindings[p],
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            action,
        }
    }
    async fn social(&self, p: usize, action: SocialAction) -> SocialCommandResult {
        self.store
            .social_command(self.social_request(p, action))
            .await
            .unwrap()
    }
    async fn query(&self, p: usize, query: SocialQuery) -> SocialView {
        self.store
            .social_query(SocialQueryRequest {
                context: QueryContext {
                    binding: self.bindings[p],
                    request_id: Uuid::new_v4(),
                },
                query,
            })
            .await
            .unwrap()
    }
    fn messages(
        &self,
        p: usize,
        before: Option<Uuid>,
        after: Option<Uuid>,
        limit: u32,
    ) -> SocialQuery {
        SocialQuery::Messages {
            player: self.bindings[p].player,
            before,
            after,
            limit,
        }
    }
    async fn send(&self, p: usize, to: usize, body: &str) -> Uuid {
        self.social(
            p,
            SocialAction::Send {
                player: self.bindings[to].player,
                body: body.into(),
            },
        )
        .await
        .message
        .unwrap()
    }
}
#[tokio::test]
async fn history_pages_retry_identity_privacy_and_retention() {
    let f = Fixture::new().await;
    let p = f.bindings[1].player;
    let request = f.social_request(
        0,
        SocialAction::Send {
            player: p,
            body: "**Hello**".into(),
        },
    );
    let first = f
        .store
        .social_command(request.clone())
        .await
        .unwrap()
        .message
        .unwrap();
    assert_eq!(
        f.store
            .social_command(request.clone())
            .await
            .unwrap()
            .message,
        Some(first)
    );
    let mut changed = request.clone();
    changed.action = SocialAction::Send {
        player: p,
        body: "different".into(),
    };
    assert!(matches!(
        f.store.social_command(changed).await,
        Err(StoreError::Conflict)
    ));
    for i in 2..=105 {
        f.send(0, 1, &format!("Message {i}")).await;
    }
    let latest = f.query(1, f.messages(0, None, None, 50)).await;
    assert_eq!(latest.messages.len(), 50);
    assert_eq!(latest.messages[0].sequence, "56");
    assert_eq!(latest.messages[49].sequence, "105");
    let older = f
        .query(1, f.messages(0, latest.next_cursor, None, 50))
        .await;
    assert_eq!(older.messages[0].sequence, "6");
    assert_eq!(older.messages[49].sequence, "55");
    let oldest = f.query(1, f.messages(0, older.next_cursor, None, 50)).await;
    assert_eq!(oldest.messages.len(), 5);
    assert_eq!(oldest.messages[0].body, "**Hello**");
    assert!(oldest.next_cursor.is_none());
    let forward = f.query(1, f.messages(0, None, Some(first), 50)).await;
    assert_eq!(forward.messages[0].sequence, "2");
    assert_eq!(forward.messages[49].sequence, "51");
    assert!(forward.next_cursor.is_some());
    let stranger = f.query(2, f.messages(0, None, None, 50)).await;
    assert!(stranger.messages.is_empty());
    assert!(
        f.store
            .social_query(SocialQueryRequest {
                context: QueryContext {
                    binding: f.bindings[2],
                    request_id: Uuid::new_v4()
                },
                query: f.messages(0, Some(first), None, 50)
            })
            .await
            .is_err()
    );
    f.store
        .set_test_time(1000 + 400 * 86400000i64)
        .await
        .unwrap();
    assert_eq!(
        f.query(1, f.messages(0, None, None, 100))
            .await
            .messages
            .len(),
        100
    );
    assert_eq!(
        f.store.social_command(request).await.unwrap().message,
        Some(first)
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM conversation_messages")
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert!(count >= 105);
}
#[tokio::test]
async fn read_hide_and_new_messages_are_recipient_local() {
    let f = Fixture::new().await;
    let a = f.send(0, 1, "first").await;
    let b = f.send(0, 1, "second").await;
    let inbox = || SocialQuery::Conversations {
        cursor: None,
        limit: 30,
    };
    assert!(f.query(1, inbox()).await.conversations[0].unread);
    f.social(
        1,
        SocialAction::Read {
            player: f.bindings[0].player,
            message: b,
        },
    )
    .await;
    f.social(
        1,
        SocialAction::Read {
            player: f.bindings[0].player,
            message: a,
        },
    )
    .await;
    assert!(!f.query(1, inbox()).await.conversations[0].unread);
    f.social(
        1,
        SocialAction::Hide {
            player: f.bindings[0].player,
            message: b,
        },
    )
    .await;
    assert!(f.query(1, inbox()).await.conversations.is_empty());
    assert_eq!(f.query(0, inbox()).await.conversations.len(), 1);
    f.send(0, 1, "new message").await;
    assert!(f.query(1, inbox()).await.conversations[0].unread);
    assert_eq!(
        f.query(1, f.messages(0, None, None, 50))
            .await
            .messages
            .len(),
        3
    );
    // Cursors from a different conversation cannot mark this conversation read.
    let other = f.send(0, 2, "private").await;
    assert!(
        f.store
            .social_command(f.social_request(
                1,
                SocialAction::Read {
                    player: f.bindings[0].player,
                    message: other
                }
            ))
            .await
            .is_err()
    );
    let first = f
        .query(
            0,
            SocialQuery::Conversations {
                cursor: None,
                limit: 1,
            },
        )
        .await;
    let next = f
        .query(
            0,
            SocialQuery::Conversations {
                cursor: first.next_cursor,
                limit: 1,
            },
        )
        .await;
    assert_ne!(
        first.conversations[0].contact.player,
        next.conversations[0].contact.player
    );
}
#[tokio::test]
async fn friends_explicit_accept_and_blocks_are_atomic() {
    let f = Fixture::new().await;
    let p = f.bindings[1].player;
    f.social(0, SocialAction::RequestFriend { player: p }).await;
    let request = f
        .query(
            1,
            SocialQuery::Contacts {
                kind: ContactKind::Requests,
                cursor: None,
                limit: 30,
            },
        )
        .await
        .contacts[0]
        .request
        .unwrap();
    assert!(
        f.store
            .social_command(f.social_request(
                1,
                SocialAction::RequestFriend {
                    player: f.bindings[0].player
                }
            ))
            .await
            .is_err()
    );
    assert!(
        f.store
            .social_command(f.social_request(0, SocialAction::AcceptFriend { player: p, request }))
            .await
            .is_err()
    );
    f.social(
        1,
        SocialAction::AcceptFriend {
            player: f.bindings[0].player,
            request,
        },
    )
    .await;
    assert!(
        f.query(0, f.messages(1, None, None, 50))
            .await
            .contact
            .unwrap()
            .accepted
    );
    f.social(0, SocialAction::Block { player: p }).await;
    assert!(
        f.query(0, f.messages(1, None, None, 50))
            .await
            .contact
            .unwrap()
            .blocked
    );
    assert!(
        !f.query(1, f.messages(0, None, None, 50))
            .await
            .contact
            .unwrap()
            .blocked
    );
    assert!(
        f.query(
            1,
            SocialQuery::Contacts {
                kind: ContactKind::Friends,
                cursor: None,
                limit: 30
            }
        )
        .await
        .contacts
        .is_empty()
    );
    for (from, to) in [(0, 1), (1, 0)] {
        for action in [
            SocialAction::Send {
                player: f.bindings[to].player,
                body: "blocked".into(),
            },
            SocialAction::RequestFriend {
                player: f.bindings[to].player,
            },
        ] {
            assert!(
                f.store
                    .social_command(f.social_request(from, action))
                    .await
                    .is_err()
            );
        }
    }
    f.social(0, SocialAction::Unblock { player: p }).await;
    assert!(
        !f.query(0, f.messages(1, None, None, 50))
            .await
            .contact
            .unwrap()
            .accepted
    );
    f.social(0, SocialAction::RequestFriend { player: p }).await;
    // An old remove request cannot remove a newer invitation.
    f.social(0, SocialAction::RemoveFriend { player: p, request })
        .await;
    assert!(
        f.query(0, f.messages(1, None, None, 50))
            .await
            .contact
            .unwrap()
            .request
            .is_some()
    );
    f.social(
        1,
        SocialAction::Block {
            player: f.bindings[0].player,
        },
    )
    .await;
    assert!(
        f.query(
            0,
            SocialQuery::Contacts {
                kind: ContactKind::Requests,
                cursor: None,
                limit: 30
            }
        )
        .await
        .contacts
        .is_empty()
    );
}
#[tokio::test]
async fn circulars_snapshot_members_and_survive_disband() {
    let f = Fixture::new().await;
    let a = f.create(0, "Social alliance", "SOC").await;
    f.update(0, a, AllianceRecruitment::Open).await;
    for p in [1, 2] {
        f.command(p, AllianceAction::Join { alliance: a }, None)
            .await;
    }
    f.social(
        2,
        SocialAction::Block {
            player: f.bindings[0].player,
        },
    )
    .await;
    let req = f.social_request(
        0,
        SocialAction::Circular {
            alliance: a,
            body: "**Announcement**".into(),
        },
    );
    let id = f
        .store
        .social_command(req.clone())
        .await
        .unwrap()
        .message
        .unwrap();
    assert_eq!(f.store.social_command(req).await.unwrap().message, Some(id));
    let circulars = || SocialQuery::Circulars {
        cursor: None,
        limit: 30,
    };
    assert_eq!(f.query(1, circulars()).await.circulars.len(), 1);
    assert!(f.query(2, circulars()).await.circulars.is_empty());
    f.command(3, AllianceAction::Join { alliance: a }, None)
        .await;
    assert!(f.query(3, circulars()).await.circulars.is_empty());
    let revision = f.detail(1, a).await.revision;
    f.command(1, AllianceAction::Leave { alliance: a }, Some(revision))
        .await;
    assert_eq!(f.query(1, circulars()).await.circulars.len(), 1);
    assert!(
        f.store
            .social_command(f.social_request(
                1,
                SocialAction::Circular {
                    alliance: a,
                    body: "no membership".into()
                }
            ))
            .await
            .is_err()
    );
    let revision = f.detail(0, a).await.revision;
    f.command(0, AllianceAction::Disband { alliance: a }, Some(revision))
        .await;
    let delivered = f.query(1, circulars()).await;
    assert_eq!(delivered.circulars[0].alliance_name, "Social alliance");
    assert!(!delivered.circulars[0].read);
    f.social(1, SocialAction::ReadCircular { circular: id })
        .await;
    assert!(f.query(1, circulars()).await.circulars[0].read);
    assert!(
        f.store
            .social_command(f.social_request(3, SocialAction::ReadCircular { circular: id }))
            .await
            .is_err()
    );
    f.social(1, SocialAction::HideCircular { circular: id })
        .await;
    assert!(f.query(1, circulars()).await.circulars.is_empty());
    assert_eq!(f.query(0, circulars()).await.circulars.len(), 1);
}
#[tokio::test]
async fn concurrent_send_and_block_have_serial_outcomes() {
    let f = Fixture::new().await;
    let p = f.bindings[1].player;
    let send = f.social_request(
        0,
        SocialAction::Send {
            player: p,
            body: "racing".into(),
        },
    );
    let block = f.social_request(
        1,
        SocialAction::Block {
            player: f.bindings[0].player,
        },
    );
    let (sent, blocked) = tokio::join!(f.store.social_command(send), f.store.social_command(block));
    blocked.unwrap();
    assert_eq!(
        f.query(1, f.messages(0, None, None, 50))
            .await
            .messages
            .len(),
        usize::from(sent.is_ok())
    );
    assert!(
        f.store
            .social_command(f.social_request(
                0,
                SocialAction::Send {
                    player: p,
                    body: "after block".into()
                }
            ))
            .await
            .is_err()
    );
}
#[tokio::test]
async fn transport_requires_auth_csrf_binding_and_valid_content() {
    let f = Fixture::new().await;
    let u = f.bindings[0].universe;
    let config = orbit_transport_http::HttpConfig {
        origin: "https://game.test".into(),
        assets: "missing".into(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = orbit_transport_http::router_with_profiles(f.store.clone(), config, rx, None, None);
    let url = format!("/api/v4/universes/{u}/social/commands");
    let q = serde_json::to_value(f.social_request(
        0,
        SocialAction::Send {
            player: f.bindings[1].player,
            body: "**hello**".into(),
        },
    ))
    .unwrap();
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
    for (origin, csrf) in [("https://evil.test", true), ("https://game.test", false)] {
        assert_eq!(
            http(
                &app,
                &url,
                Some(q.clone()),
                Some(&f.sessions[0]),
                Some(origin),
                csrf
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        http(
            &app,
            &url,
            Some(q.clone()),
            Some(&f.sessions[1]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        http(
            &app,
            &url,
            Some(q),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    for body in [" ".into(), "x".repeat(4001)] {
        assert!(
            f.store
                .social_command(f.social_request(
                    0,
                    SocialAction::Send {
                        player: f.bindings[1].player,
                        body
                    }
                ))
                .await
                .is_err()
        );
    }
    let mut wrong = f.social_request(
        0,
        SocialAction::Block {
            player: f.bindings[1].player,
        },
    );
    wrong.context.binding.epoch = Epoch(Uuid::new_v4());
    assert!(f.store.social_command(wrong).await.is_err());
}

#[tokio::test]
async fn circular_permission_revocation_and_recipient_bound_paging() {
    let f = Fixture::new().await;
    let a = f.create(0, "Circular permissions", "CIRC").await;
    f.update(0, a, AllianceRecruitment::Open).await;
    f.command(1, AllianceAction::Join { alliance: a }, None)
        .await;
    let action = || SocialAction::Circular {
        alliance: a,
        body: "Hello members".into(),
    };
    f.social(1, action()).await;
    let detail = f.detail(0, a).await;
    let role = detail
        .roles
        .unwrap()
        .into_iter()
        .find(|r| r.is_default)
        .unwrap();
    f.command(
        0,
        AllianceAction::SaveRole {
            alliance: a,
            role: Some(role.id),
            name: role.name,
            permissions: vec![AlliancePermission::ViewMembers],
            grantable_permissions: vec![],
        },
        Some(detail.revision),
    )
    .await;
    assert!(
        f.store
            .social_command(f.social_request(1, action()))
            .await
            .is_err()
    );
    for at in [1001, 1002] {
        f.store.set_test_time(at).await.unwrap();
        f.social(0, action()).await;
    }
    let mut cursor = None;
    let mut ids = vec![];
    loop {
        let page = f
            .query(1, SocialQuery::Circulars { cursor, limit: 1 })
            .await;
        assert_eq!(page.circulars.len(), 1);
        ids.push(page.circulars[0].id);
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(ids.len(), 3);
    assert_eq!(
        ids.iter().collect::<std::collections::BTreeSet<_>>().len(),
        3
    );
    let context = QueryContext {
        binding: f.bindings[2],
        request_id: Uuid::new_v4(),
    };
    assert!(
        f.store
            .social_query(SocialQueryRequest {
                context,
                query: SocialQuery::Circulars {
                    cursor: Some(ids[0]),
                    limit: 1
                }
            })
            .await
            .is_err()
    );
    for limit in [0, 101] {
        assert!(
            f.store
                .social_query(SocialQueryRequest {
                    context: QueryContext {
                        binding: f.bindings[0],
                        request_id: Uuid::new_v4()
                    },
                    query: SocialQuery::Conversations {
                        cursor: None,
                        limit
                    }
                })
                .await
                .is_err()
        );
    }
}
