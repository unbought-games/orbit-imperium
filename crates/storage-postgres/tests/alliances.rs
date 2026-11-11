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

#[tokio::test]
async fn presentation_preserves_templates_and_media_obeys_live_visibility_and_permissions() {
    let f = Fixture::new().await;
    let id = f.create(0, "Astral Veil", "VEIL").await;
    f.update(0, id, AllianceRecruitment::Open).await;
    f.command(1, AllianceAction::Join { alliance: id }, None)
        .await;
    let ids = [Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()];
    for media_id in ids {
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::User(AllianceMediaAction::Begin {
                    media_id,
                    filename: format!("{media_id}.gif"),
                    bytes: 100,
                }),
            )
            .await
            .unwrap();
        let receipt = MediaReceipt {
            sha256: "a".repeat(64),
            content_type: "image/gif".into(),
            bytes: 100,
        };
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::Finalize {
                    media_id,
                    receipt: receipt.clone(),
                },
            )
            .await
            .unwrap();
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::Finalize { media_id, receipt },
            )
            .await
            .unwrap();
    }
    let placement = |media_id| MediaPlacement {
        media_id,
        x: 50,
        y: 50,
        mobile_x: None,
        mobile_y: None,
        alt: "Test artwork".into(),
    };
    let identity = AllianceVisualIdentity {
        banner: Some(placement(ids[0])),
        ..Default::default()
    };
    let revision = f.detail(0, id).await.revision;
    let command=f.request(0,AllianceAction::SavePresentation {alliance:id,edits:vec![
        PresentationEdit::SetIdentity{schema_version:1,value:identity},
        PresentationEdit::SetHall{schema_version:1,value:AllianceHall{background:Some(placement(ids[1])),welcome_markdown:"Private welcome".into(),..Default::default()}},
        PresentationEdit::SetTemplateDocument{template_id:"transmission".into(),document:AllianceTemplateDocument{schema_version:1,content:json!({"letter_markdown":"A retained letter","hero_media":placement(ids[2])})}},
    ]},Some(revision));
    let saved = f.store.alliance_command(command.clone()).await.unwrap();
    let replay = f.store.alliance_command(command).await.unwrap();
    assert_eq!(saved.revision, replay.revision);
    let public = f
        .store
        .public_alliance(f.bindings[0].universe, id)
        .await
        .unwrap();
    assert_eq!(public.presentation.unwrap().template_id, "flagship");
    let member = f.detail(1, id).await.presentation.unwrap();
    assert!(member.editor.is_none());
    assert_eq!(member.hall.welcome_markdown, "Private welcome");
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[0], None)
            .await
            .is_ok()
    );
    for asset in &ids[1..] {
        assert!(
            f.store
                .alliance_media_read(f.bindings[0].universe, *asset, None)
                .await
                .is_err()
        );
    }
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[1], Some(f.bindings[1].account))
            .await
            .is_ok()
    );
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[2], Some(f.bindings[1].account))
            .await
            .is_err()
    );
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[2], Some(f.bindings[0].account))
            .await
            .is_ok()
    );
    assert!(
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::User(AllianceMediaAction::Delete { media_id: ids[2] })
            )
            .await
            .is_err()
    );
    f.command(
        0,
        AllianceAction::SavePresentation {
            alliance: id,
            edits: vec![PresentationEdit::SelectTemplate {
                template_id: "transmission".into(),
            }],
        },
        saved.revision,
    )
    .await;
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[2], None)
            .await
            .is_ok()
    );
    let p = f.detail(0, id).await.presentation.unwrap().editor.unwrap();
    assert_eq!(
        p.templates["transmission"].content["letter_markdown"],
        "A retained letter"
    );
    let revision = f.detail(0, id).await.revision;
    f.command(
        0,
        AllianceAction::Transfer {
            alliance: id,
            player: f.bindings[1].player,
        },
        Some(revision),
    )
    .await;
    assert!(
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::Authorize { media_id: ids[0] }
            )
            .await
            .is_err()
    );
    assert!(f.detail(0, id).await.presentation.unwrap().editor.is_none());
    let revision = f.detail(1, id).await.revision;
    f.command(1, AllianceAction::Disband { alliance: id }, Some(revision))
        .await;
    assert!(
        f.store
            .alliance_media_read(f.bindings[0].universe, ids[0], None)
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM alliance_media WHERE alliance=$1 AND state='deleting'",
    )
    .bind(id)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!(count, 3);
}

#[tokio::test]
async fn concurrent_upload_reservations_cannot_exceed_capacity_or_cross_alliance_ownership() {
    let f = Fixture::new().await;
    let id = f.create(0, "Upload Group", "UPL").await;
    for _ in 0..9 {
        f.store
            .alliance_media(
                f.bindings[0],
                id,
                MediaOperation::User(AllianceMediaAction::Begin {
                    media_id: Uuid::new_v4(),
                    filename: "large.gif".into(),
                    bytes: ALLIANCE_MEDIA_MAX_BYTES,
                }),
            )
            .await
            .unwrap();
    }
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let reserve = |media_id| {
        MediaOperation::User(AllianceMediaAction::Begin {
            media_id,
            filename: "last.gif".into(),
            bytes: ALLIANCE_MEDIA_MAX_BYTES,
        })
    };
    let (first, second) = tokio::join!(
        f.store.alliance_media(f.bindings[0], id, reserve(a)),
        f.store.alliance_media(f.bindings[0], id, reserve(b))
    );
    assert_ne!(first.is_ok(), second.is_ok());
    let foreign = f.create(1, "Other Group", "OTH").await;
    let asset = if first.is_ok() { a } else { b };
    f.store
        .alliance_media(
            f.bindings[0],
            id,
            MediaOperation::Finalize {
                media_id: asset,
                receipt: MediaReceipt {
                    sha256: "b".repeat(64),
                    bytes: 100,
                    content_type: "image/png".into(),
                },
            },
        )
        .await
        .unwrap();
    assert!(
        f.store
            .alliance_command(f.request(
                1,
                AllianceAction::SavePresentation {
                    alliance: foreign,
                    edits: vec![PresentationEdit::SetIdentity {
                        schema_version: 1,
                        value: AllianceVisualIdentity {
                            crest: AllianceCrest::Upload { media_id: asset },
                            ..Default::default()
                        }
                    }]
                },
                Some(f.detail(1, foreign).await.revision)
            ))
            .await
            .is_err()
    );
    assert!(
        f.store
            .alliance_media(
                f.bindings[1],
                foreign,
                MediaOperation::Authorize { media_id: asset }
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn prepared_output_reserves_its_actual_size_before_any_blob_write() {
    let f = Fixture::new().await;
    let alliance = f.create(0, "Prepared Media", "PRE").await;
    let limits = AllianceMediaLimits {
        file_bytes: 200,
        total_bytes: 300,
        count: 10,
        uploads_enabled: true,
    };
    let configured = |action| MediaOperation::Configured {
        limits,
        action: Box::new(action),
    };
    let ids = [Uuid::new_v4(), Uuid::new_v4()];
    for id in ids {
        f.store
            .alliance_media(
                f.bindings[0],
                alliance,
                configured(MediaOperation::User(AllianceMediaAction::Begin {
                    media_id: id,
                    filename: "compressed.png".into(),
                    bytes: 50,
                })),
            )
            .await
            .unwrap();
    }
    let receipt = MediaReceipt {
        sha256: "c".repeat(64),
        content_type: "image/png".into(),
        bytes: 200,
    };
    f.store
        .alliance_media(
            f.bindings[0],
            alliance,
            configured(MediaOperation::Prepare {
                media_id: ids[0],
                receipt: receipt.clone(),
            }),
        )
        .await
        .unwrap();
    assert!(
        f.store
            .alliance_media(
                f.bindings[0],
                alliance,
                configured(MediaOperation::Prepare {
                    media_id: ids[1],
                    receipt
                })
            )
            .await
            .is_err()
    );
    let library = f
        .store
        .alliance_media(
            f.bindings[0],
            alliance,
            configured(MediaOperation::User(AllianceMediaAction::List)),
        )
        .await
        .unwrap();
    assert_eq!(
        library
            .media
            .iter()
            .map(|m| m
                .declared_bytes
                .max(m.receipt.as_ref().map_or(0, |r| r.bytes)))
            .sum::<u64>(),
        250
    );
    assert!(library.media.iter().all(|m| m.state == "reserved"));
    f.store
        .alliance_media(
            f.bindings[0],
            alliance,
            configured(MediaOperation::User(AllianceMediaAction::Delete {
                media_id: ids[0],
            })),
        )
        .await
        .unwrap();
    assert!(
        f.store
            .alliance_media(
                f.bindings[0],
                alliance,
                configured(MediaOperation::Finalize {
                    media_id: ids[0],
                    receipt: MediaReceipt {
                        sha256: "c".repeat(64),
                        content_type: "image/png".into(),
                        bytes: 200
                    }
                })
            )
            .await
            .is_err(),
        "a delayed finalize cannot resurrect a deletion tombstone"
    );
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
    assert_eq!(
        public
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![
            "enrollment_open",
            "presentation",
            "public_text",
            "summary",
            "universe_name"
        ]
    );
    assert!(public["presentation"].get("hall").is_none());
    assert!(public["presentation"].get("editor").is_none());
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
    // The kicked player is no longer in the roster. Audit target names must be
    // loaded independently rather than relying on current member identities.
    let audit = f.detail(0, a).await.audit.unwrap();
    for action in ["Accept", "Kick"] {
        let subject = audit
            .iter()
            .find(|entry| entry.action == action)
            .unwrap()
            .subject
            .as_ref()
            .unwrap();
        assert_eq!(subject.player, Some(f.bindings[3].player));
        assert!(subject.label.starts_with("alliance-"));
        assert!(subject.label.ends_with("-3"));
    }
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
async fn http_upload_roundtrip_requires_csrf_and_only_publishes_attached_media() {
    let f = Fixture::new().await;
    let alliance = f.create(0, "Media Alliance", "MED").await;
    let b = f.bindings[0];
    let directory = std::env::temp_dir().join(format!("orbit-alliance-media-{}", Uuid::new_v4()));
    let assets = orbit_storage_assets::AssetConfig::Files {
        directory: directory.to_string_lossy().into(),
    }
    .connect()
    .await
    .unwrap();
    let customization = orbit_transport_http::Customization::load(
        CosmeticPolicy::Unrestricted,
        assets.clone(),
        None,
    )
    .await
    .unwrap();
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
    let app = orbit_transport_http::router_with_customization(
        f.store.clone(),
        config,
        rx,
        None,
        None,
        customization,
    );
    let media = Uuid::new_v4();
    let bytes = include_bytes!("../../../apps/web/public/art/atlas/planet-01-96.webp");
    let request = json!({"context":{"binding":b,"request_id":Uuid::new_v4()},"alliance":alliance,"action":{"type":"Begin","media_id":media,"filename":"planet.webp","bytes":bytes.len()}});
    let url = format!("/api/v4/universes/{}/alliances/media", b.universe);
    assert_eq!(
        http(
            &app,
            &url,
            Some(request.clone()),
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
            Some(request),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    let upload = format!(
        "/api/v4/universes/{}/alliances/{alliance}/media/{media}/content?epoch={}",
        b.universe, b.epoch
    );
    for csrf in [false, true, true] {
        let mut request = Request::put(&upload)
            .header("cookie", format!("orbit_session={}", f.sessions[0].token))
            .header("origin", "https://game.test")
            .header("content-type", "application/octet-stream");
        if csrf {
            request = request.header("x-csrf-token", &f.sessions[0].csrf);
        }
        let response = app
            .clone()
            .oneshot(request.body(Body::from(bytes.as_slice())).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if csrf {
                StatusCode::OK
            } else {
                StatusCode::FORBIDDEN
            }
        );
    }
    let image = format!("/api/v4/universes/{}/alliance-media/{media}", b.universe);
    let get = || Request::get(&image).body(Body::empty()).unwrap();
    assert_eq!(
        app.clone().oneshot(get()).await.unwrap().status(),
        StatusCode::NOT_FOUND
    );
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SavePresentation {
            alliance,
            edits: vec![PresentationEdit::SetIdentity {
                schema_version: 1,
                value: AllianceVisualIdentity {
                    crest: AllianceCrest::Upload { media_id: media },
                    ..Default::default()
                },
            }],
        },
        Some(d.revision),
    )
    .await;
    let response = app.clone().oneshot(get()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/webp");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    let poster = app
        .clone()
        .oneshot(
            Request::get(format!("{image}?still=true&size=96"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(poster.status(), StatusCode::OK);
    assert_eq!(poster.headers()["content-type"], "image/png");
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SavePresentation {
            alliance,
            edits: vec![PresentationEdit::SetIdentity {
                schema_version: 1,
                value: Default::default(),
            }],
        },
        Some(d.revision),
    )
    .await;
    assert_eq!(
        app.clone().oneshot(get()).await.unwrap().status(),
        StatusCode::NOT_FOUND
    );
    let request = json!({"context":{"binding":b,"request_id":Uuid::new_v4()},"alliance":alliance,"action":{"type":"Delete","media_id":media}});
    assert_eq!(
        http(
            &app,
            &url,
            Some(request),
            Some(&f.sessions[0]),
            Some("https://game.test"),
            true
        )
        .await
        .0,
        StatusCode::OK
    );
    assert!(
        f.store
            .cleanup_alliance_media(assets.as_ref())
            .await
            .unwrap()
            >= 1
    );
    tokio::fs::remove_dir_all(directory).await.unwrap();
}
#[tokio::test]
async fn http_authentication_csrf_origin_scope_and_anonymous_privacy() {
    let f = Fixture::new().await;
    let a = f.create(0, "HTTP Alliance", "WEB").await;
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
        vec!["enrollment_open", "public_text", "summary", "universe_name"]
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
        sqlx::query("INSERT INTO player_policies(universe,id,data) SELECT universe,$1,jsonb_set(data,'{player}',to_jsonb($1::text)) FROM player_policies WHERE id=$2")
            .bind(player).bind(b.player.0).execute(&f.pool).await.unwrap();
        sqlx::query("INSERT INTO viewer_heads(universe,player) VALUES($1,$2)")
            .bind(b.universe.0)
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

#[tokio::test]
async fn leadership_changes_invalidate_deletion_guards_without_creating_presence() {
    let f = Fixture::new().await;
    let game = GameService::new(f.store.clone());
    async fn leads(game: &GameService<PgStore>, b: Binding) -> bool {
        game.world_view(
            Principal {
                account: b.account,
                player: b.player,
                universe: b.universe,
            },
            QueryContext {
                binding: b,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap()
        .leads_alliance
    }
    let mut cursors = vec![];
    for &b in &f.bindings[..3] {
        assert!(!leads(&game, b).await);
        cursors.push(
            f.store.read_updates(b, None, 128).await.unwrap().items[0]
                .cursor
                .clone()
                .unwrap(),
        );
    }
    f.store.set_test_time(5000).await.unwrap();
    let create = f.request(
        0,
        AllianceAction::Create {
            name: "View invalidations".into(),
            tag: "VIV".into(),
        },
        None,
    );
    let alliance = f
        .store
        .alliance_command(create.clone())
        .await
        .unwrap()
        .alliance
        .unwrap();
    assert!(leads(&game, f.bindings[0]).await);
    let updates = f
        .store
        .read_updates(f.bindings[0], Some(&cursors[0]), 128)
        .await
        .unwrap();
    assert_eq!(updates.items.len(), 1);
    assert!(
        matches!(&updates.items[0].event,StreamEvent::Invalidate {minimum_viewer_revision} if minimum_viewer_revision=="1")
    );
    cursors[0] = updates.items[0].cursor.clone().unwrap();
    f.store.alliance_command(create).await.unwrap();
    assert!(
        f.store
            .read_updates(f.bindings[0], Some(&cursors[0]), 128)
            .await
            .unwrap()
            .items
            .is_empty()
    );
    f.update(0, alliance, AllianceRecruitment::Open).await;
    f.command(1, AllianceAction::Join { alliance }, None).await;
    let revision = f.detail(0, alliance).await.revision;
    f.command(
        0,
        AllianceAction::Transfer {
            alliance,
            player: f.bindings[1].player,
        },
        Some(revision),
    )
    .await;
    assert!(!leads(&game, f.bindings[0]).await);
    assert!(leads(&game, f.bindings[1]).await);
    for (n, expected) in [(0, "2"), (1, "1")] {
        let updates = f
            .store
            .read_updates(f.bindings[n], Some(&cursors[n]), 128)
            .await
            .unwrap();
        assert_eq!(updates.items.len(), 1);
        assert!(
            matches!(&updates.items[0].event,StreamEvent::Invalidate {minimum_viewer_revision} if minimum_viewer_revision==expected)
        );
        cursors[n] = updates.items[0].cursor.clone().unwrap();
    }
    let revision = f.detail(1, alliance).await.revision;
    f.command(1, AllianceAction::Disband { alliance }, Some(revision))
        .await;
    assert!(!leads(&game, f.bindings[1]).await);
    let updates = f
        .store
        .read_updates(f.bindings[1], Some(&cursors[1]), 128)
        .await
        .unwrap();
    assert!(
        matches!(&updates.items[0].event,StreamEvent::Invalidate {minimum_viewer_revision} if minimum_viewer_revision=="2")
    );
    assert!(
        f.store
            .read_updates(f.bindings[2], Some(&cursors[2]), 128)
            .await
            .unwrap()
            .items
            .is_empty()
    );
    for b in &f.bindings[..3] {
        let (snap, _) = f.store.bound_world(*b).await.unwrap().facts;
        assert_eq!(
            snap.state.world.unwrap().records.policies[&b.player].last_presence_at,
            1000
        );
    }
}

#[tokio::test]
async fn recruitment_discovery_is_opt_in_filtered_and_never_exposes_private_fields() {
    let f = Fixture::new().await;
    let u = f.bindings[0].universe;
    let alliance = f.create(0, "Welcoming Stars", "WEL").await;
    let other = f.create(1, "Hidden Stars", "HID").await;
    assert_eq!(
        f.store
            .recruitment_directory(u, RecruitmentSearch::default())
            .await
            .unwrap()
            .total,
        0
    );
    let profile = RecruitmentProfile {
        listed: true,
        languages: Some(vec!["en".into(), "fr".into()]),
        beginners: Some(RecruitmentExperience::Welcome),
        activity: Some(RecruitmentActivity::Weekly),
    };
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SetRecruitmentProfile { alliance, profile },
        Some(d.revision),
    )
    .await;
    for query in [
        RecruitmentSearch::default(),
        RecruitmentSearch {
            language: Some("fr".into()),
            beginners: Some(RecruitmentExperience::Welcome),
            activity: Some(RecruitmentActivity::Weekly),
            ..Default::default()
        },
    ] {
        let result = f.store.recruitment_directory(u, query).await.unwrap();
        assert_eq!(result.total, 1);
        assert_eq!(result.alliances[0].summary.id, alliance);
        let public = f.store.public_alliance(u, alliance).await.unwrap();
        assert!(public.summary.ranking.is_some());
        assert_eq!(
            serde_json::to_value(&result.alliances[0].summary.ranking).unwrap(),
            serde_json::to_value(&public.summary.ranking).unwrap()
        );
        let json = serde_json::to_value(&result.alliances[0]).unwrap();
        for key in [
            "leader",
            "members",
            "applications",
            "posts",
            "audit",
            "invitation",
        ] {
            assert!(json.get(key).is_none());
        }
    }
    for query in [
        RecruitmentSearch {
            language: Some("de".into()),
            ..Default::default()
        },
        RecruitmentSearch {
            beginners: Some(RecruitmentExperience::Experienced),
            ..Default::default()
        },
        RecruitmentSearch {
            activity: Some(RecruitmentActivity::Daily),
            ..Default::default()
        },
        RecruitmentSearch {
            search: "missing".into(),
            ..Default::default()
        },
    ] {
        assert_eq!(
            f.store.recruitment_directory(u, query).await.unwrap().total,
            0
        );
    }
    assert_eq!(
        f.store.public_alliance(u, other).await.unwrap().summary.id,
        other
    );
    f.update(0, alliance, AllianceRecruitment::Closed).await;
    assert_eq!(
        f.store
            .recruitment_directory(u, RecruitmentSearch::default())
            .await
            .unwrap()
            .total,
        0
    );
    assert_eq!(
        f.store
            .public_alliance(u, alliance)
            .await
            .unwrap()
            .summary
            .recruitment_profile
            .beginners,
        Some(RecruitmentExperience::Welcome)
    );
    f.update(0, alliance, AllianceRecruitment::Open).await;
    assert_eq!(
        f.store
            .recruitment_directory(u, RecruitmentSearch::default())
            .await
            .unwrap()
            .total,
        1
    );
}
#[tokio::test]
async fn recruitment_invitation_rotation_is_atomic_idempotent_and_permission_scoped() {
    let f = Fixture::new().await;
    let u = f.bindings[0].universe;
    let alliance = f.create(0, "Link Stars", "LNK").await;
    let d = f.detail(0, alliance).await;
    let request = f.request(
        0,
        AllianceAction::SetInvitation {
            alliance,
            enabled: true,
        },
        Some(d.revision),
    );
    let result = f.store.alliance_command(request.clone()).await.unwrap();
    let token = f.detail(0, alliance).await.invitation.unwrap().unwrap();
    let replay = f.store.alliance_command(request.clone()).await.unwrap();
    assert_eq!(result.revision, replay.revision);
    assert_eq!(f.detail(0, alliance).await.invitation, Some(Some(token)));
    assert_eq!(
        f.store
            .alliance_invitation(u, token)
            .await
            .unwrap()
            .summary
            .id,
        alliance
    );
    let d = f.detail(0, alliance).await;
    assert!(
        f.store
            .alliance_command(f.request(
                1,
                AllianceAction::SetInvitation {
                    alliance,
                    enabled: false
                },
                Some(d.revision)
            ))
            .await
            .is_err()
    );
    f.command(
        0,
        AllianceAction::SetInvitation {
            alliance,
            enabled: true,
        },
        Some(d.revision),
    )
    .await;
    let next = f.detail(0, alliance).await.invitation.unwrap().unwrap();
    assert_ne!(next, token);
    assert!(matches!(
        f.store.alliance_invitation(u, token).await,
        Err(StoreError::NotFound)
    ));
    f.store.alliance_command(request).await.unwrap();
    assert_eq!(f.detail(0, alliance).await.invitation, Some(Some(next)));
    // A live invitation does not bypass application recruitment.
    assert!(
        f.store
            .alliance_command(f.request(1, AllianceAction::Join { alliance }, None))
            .await
            .is_err()
    );
    f.update(0, alliance, AllianceRecruitment::Open).await;
    f.command(1, AllianceAction::Join { alliance }, None).await;
    assert_eq!(f.detail(1, alliance).await.invitation, None);
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SetInvitation {
            alliance,
            enabled: false,
        },
        Some(d.revision),
    )
    .await;
    assert!(matches!(
        f.store.alliance_invitation(u, next).await,
        Err(StoreError::NotFound)
    ));
    assert!(f.store.public_alliance(u, alliance).await.is_ok());
}

#[tokio::test]
async fn recruitment_http_previews_use_current_public_identity_and_revoke_old_links() {
    let f = Fixture::new().await;
    let u = f.bindings[0].universe;
    let alliance = f.create(0, "Recruitment Preview", "PRV").await;
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SetRecruitmentProfile {
            alliance,
            profile: RecruitmentProfile {
                listed: true,
                ..Default::default()
            },
        },
        Some(d.revision),
    )
    .await;
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SetInvitation {
            alliance,
            enabled: true,
        },
        Some(d.revision),
    )
    .await;
    let token = f.detail(0, alliance).await.invitation.unwrap().unwrap();
    struct Assets(std::path::PathBuf);
    impl Drop for Assets {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    let assets =
        Assets(std::env::temp_dir().join(format!("orbit-recruitment-preview-{}", Uuid::new_v4())));
    std::fs::create_dir(&assets.0).unwrap();
    std::fs::write(assets.0.join("index.html"),r#"<html><head><!--orbit-page-metadata:start--><title>Old</title><!--orbit-page-metadata:end--></head><body><script id="orbit-bootstrap" type="application/json"></script><div id="root"></div></body></html>"#).unwrap();
    let config = orbit_transport_http::HttpConfig {
        origin: "https://game.test".into(),
        assets: assets.0.to_string_lossy().into_owned(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        wake: None,
        observer: None,
    };
    let app = orbit_transport_http::router(f.store.clone(), config);
    let listing = http(
        &app,
        &format!("/api/v4/universes/{u}/recruitment"),
        None,
        None,
        None,
        false,
    )
    .await;
    assert_eq!(listing.0, StatusCode::OK);
    assert_eq!(listing.1["total"], 1);
    let resolved = http(
        &app,
        &format!("/api/v4/universes/{u}/invitations/{token}"),
        None,
        None,
        None,
        false,
    )
    .await;
    assert_eq!(resolved.0, StatusCode::OK);
    assert_eq!(resolved.1["summary"]["id"], alliance.to_string());
    for path in [
        format!("/invite/{u}/{token}"),
        format!("/alliances/{u}/{alliance}"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(&path)
                    .header("cookie", format!("orbit_session={}", f.sessions[0].token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains("Recruitment Preview"));
        assert!(html.contains("og:image"));
        assert!(html.contains("\"status\":\"anonymous\""));
        assert!(!html.contains(&f.sessions[0].csrf));
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{path}/image"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "image/png");
        assert!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .starts_with(b"\x89PNG\r\n\x1a\n")
        );
    }
    let d = f.detail(0, alliance).await;
    f.command(
        0,
        AllianceAction::SetInvitation {
            alliance,
            enabled: false,
        },
        Some(d.revision),
    )
    .await;
    for path in [
        format!("/invite/{u}/{token}"),
        format!("/invite/{u}/{token}/image"),
    ] {
        let response = app
            .clone()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}

#[tokio::test]
async fn alliance_directory_combines_language_and_recruitment_without_hiding_closed_or_unlisted_groups()
 {
    let f = Fixture::new().await;
    let open = f.create(0, "Alpha English", "ENG").await;
    let closed = f.create(1, "Beta English", "BET").await;
    let french = f.create(2, "French Stars", "FRE").await;
    for (player, alliance, language) in [(0, open, "en"), (1, closed, "en"), (2, french, "fr")] {
        let detail = f.detail(player, alliance).await;
        f.command(
            player,
            AllianceAction::SetRecruitmentProfile {
                alliance,
                profile: RecruitmentProfile {
                    listed: false,
                    languages: Some(vec![language.into()]),
                    beginners: Some(RecruitmentExperience::Welcome),
                    activity: Some(RecruitmentActivity::Weekly),
                },
            },
            Some(detail.revision),
        )
        .await;
    }
    f.update(1, closed, AllianceRecruitment::Closed).await;
    for (filter, expected, count) in [
        (json!({}), vec![open, closed, french], 3),
        (json!({"language":"en"}), vec![open, closed], 2),
        (
            json!({"language":"en", "recruiting_only":true}),
            vec![open],
            1,
        ),
        (json!({"language":"en", "offset":1}), vec![closed], 2),
        (
            json!({"language":"fr", "beginners":"Welcome", "activity":"Weekly"}),
            vec![french],
            1,
        ),
        (json!({"language":"en", "activity":"Daily"}), vec![], 0),
        (json!({"language":"en", "search":"BET"}), vec![closed], 1),
    ] {
        let mut query = json!({"type":"Directory", "search":"", "offset":0});
        query
            .as_object_mut()
            .unwrap()
            .extend(filter.as_object().unwrap().clone());
        let response = f
            .store
            .alliance_query(AllianceQueryRequest {
                context: QueryContext {
                    binding: f.bindings[0],
                    request_id: Uuid::new_v4(),
                },
                query: serde_json::from_value(query).unwrap(),
            })
            .await
            .unwrap();
        assert_eq!(response.directory_count, count);
        assert_eq!(
            response
                .directory
                .iter()
                .map(|entry| entry.id)
                .collect::<Vec<_>>(),
            expected
        );
        assert!(response.alliance.is_none());
    }
    // Public recruitment remains opt-in even though authenticated discovery can find all groups.
    assert_eq!(
        f.store
            .recruitment_directory(f.bindings[0].universe, RecruitmentSearch::default())
            .await
            .unwrap()
            .total,
        0
    );
    f.pool.close().await;
}
