use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{
    Customization, HttpConfig, router_with_customization, ship_render_environment,
};
use serde_json::{Value, json};
use sqlx::{Row, types::Json};
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture {
    store: PgStore,
    pool: sqlx::PgPool,
    b: Binding,
    other: Binding,
    second: Binding,
    login: LoginResult,
    app: Router,
    customization: Customization,
    directory: std::path::PathBuf,
}
impl Fixture {
    async fn new() -> Self {
        let url = std::env::var("TEST_DATABASE_URL")
            .expect("use make test-db DB_SUITES=ship_appearances");
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let salt = Uuid::new_v4();
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("ship-{salt}-{i}"),
            password: Uuid::new_v4().to_string(),
        });
        store
            .bootstrap_mvp_fleets(u, 1000, &accounts, &[91; 32])
            .await
            .unwrap();
        store.set_test_time(1000).await.unwrap();
        let sessions = SessionService::new(store.clone());
        let game = GameService::new(store.clone());
        let login = sessions
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .unwrap();
        let other_login = sessions
            .login(&accounts[1].name, &accounts[1].password, None)
            .await
            .unwrap();
        let b = game
            .current_binding(login.session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        let other = game
            .current_binding(other_login.session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding;
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let second = Binding {
            universe: UniverseId(Uuid::new_v4()),
            player: PlayerId(Uuid::new_v4()),
            epoch: Epoch(Uuid::new_v4()),
            ..b
        };
        sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash,name) SELECT $1,$2,development,speed,started_at,profile_hash,'Ship '||$1::text FROM universes WHERE id=$3").bind(second.universe.0).bind(second.epoch.0).bind(b.universe.0).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
            .bind(second.player.0)
            .bind(second.universe.0)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)")
            .bind(second.universe.0)
            .bind(second.account.0)
            .bind(second.player.0)
            .execute(&pool)
            .await
            .unwrap();
        let directory = std::env::temp_dir().join(format!("orbit-ship-{salt}"));
        let assets = orbit_storage_assets::AssetConfig::Files {
            directory: directory.to_string_lossy().into(),
        }
        .connect()
        .await
        .unwrap();
        let customization = Customization::load(CosmeticPolicy::Unrestricted, assets, None)
            .await
            .unwrap();
        let (_, drain) = tokio::sync::watch::channel(false);
        let app = router_with_customization(
            store.clone(),
            HttpConfig {
                account_url: None,
                origin: "https://game.test".into(),
                assets: "apps/web/dist".into(),
                login_per_minute: 30,
                signup: None,
                signup_per_minute: 30,
                legacy_signup_enabled: false,
                wake: None,
                observer: None,
            },
            drain,
            None,
            None,
            customization.clone(),
        );
        Self {
            store,
            pool,
            b,
            other,
            second,
            login,
            app,
            customization,
            directory,
        }
    }
    async fn stop_jobs(&self) {
        sqlx::query("UPDATE ship_render_requests SET stage='canceled',lease=NULL,lease_until=NULL WHERE account=$1").bind(self.b.account.0).execute(&self.pool).await.unwrap();
    }
    async fn env(&self, b: Binding) -> ShipRenderEnvironment {
        ship_render_environment(&self.store, b, &self.customization, None)
            .await
            .unwrap()
            .0
    }
    async fn change(
        &self,
        b: Binding,
        request: Uuid,
        action: ShipAppearanceAction,
    ) -> Result<(), ServiceError> {
        self.store
            .change_ship_appearance(b, request, action, self.env(b).await)
            .await
    }
    async fn state(&self, b: Binding) -> ShipAppearanceSnapshot {
        self.store.ship_appearance_snapshot(b).await.unwrap()
    }
    async fn http(
        &self,
        b: Binding,
        request: Uuid,
        action: Value,
        csrf: bool,
    ) -> (StatusCode, Value) {
        let mut req = Request::post(format!("/api/v1/universes/{}/ship-appearances", b.universe))
            .header("origin", "https://game.test")
            .header("cookie", format!("orbit_session={}", self.login.token))
            .header("content-type", "application/json");
        if csrf {
            req = req.header("x-csrf-token", &self.login.session.csrf);
        }
        let response = self
            .app
            .clone()
            .oneshot(
                req.body(Body::from(
                    json!({"context":{"binding":b,"request_id":request},"action":action})
                        .to_string(),
                ))
                .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}
fn design() -> ShipDesign {
    ShipDesign {
        id: Uuid::new_v4(),
        name: "Concord".into(),
        target: SHIP_TARGET.into(),
        revision: 0,
        recipe: ShipPaintRecipe {
            version: 1,
            skin_id: SHIP_PACKAGE.into(),
            package_revision: SHIP_PACKAGE_REVISION.into(),
            primary: "free-ivory".into(),
            accent: "free-blue".into(),
            emblem: ShipEmblem {
                treatment: "full".into(),
                placement: "paired".into(),
            },
        },
    }
}
fn save(design: ShipDesign, revision: i64) -> ShipAppearanceAction {
    ShipAppearanceAction::Save {
        design,
        equip: true,
        expected_equipment_revision: revision,
    }
}
async fn stage(f: &Fixture, id: Uuid) -> String {
    sqlx::query_scalar("SELECT stage FROM ship_render_requests WHERE id=$1")
        .bind(id)
        .fetch_one(&f.pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn http_auth_replay_revision_and_account_namespaces() {
    let f = Fixture::new().await;
    let d = design();
    let request = Uuid::new_v4();
    let action = serde_json::to_value(save(d.clone(), 0)).unwrap();
    assert_eq!(
        f.http(f.b, request, action.clone(), false).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        f.http(f.other, request, action.clone(), true).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        f.http(
            Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..f.b
            },
            request,
            action.clone(),
            true
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (status, first) = f.http(f.b, request, action.clone(), true).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["library"][0]["revision"], 1);
    let (status, replay) = f.http(f.b, request, action, true).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first, replay);
    assert_eq!(
        f.http(
            f.b,
            request,
            json!({"type":"Reset","target":"LightFighter","expected_equipment_revision":1}),
            true
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert!(matches!(
        f.change(f.b, Uuid::new_v4(), save(d.clone(), 1)).await,
        Err(ServiceError::Conflict)
    ));
    assert!(f.state(f.other).await.library.is_empty());
    assert!(matches!(
        f.change(
            f.other,
            Uuid::new_v4(),
            ShipAppearanceAction::Equip {
                target: SHIP_TARGET.into(),
                design_id: d.id,
                design_revision: 1,
                expected_equipment_revision: 0
            }
        )
        .await,
        Err(ServiceError::NotFound)
    ));
    let mut expired = f.env(f.b).await;
    expired.valid_until = 0;
    assert!(matches!(
        f.store
            .change_ship_appearance(f.b, Uuid::new_v4(), save(design(), 1), expired)
            .await,
        Err(ServiceError::Unavailable)
    ));
    let mut invalid = design();
    invalid.recipe.primary = "forged-dye".into();
    assert!(matches!(
        f.change(f.b, Uuid::new_v4(), save(invalid, 1)).await,
        Err(ServiceError::Forbidden)
    ));
    let mut invalid = design();
    invalid.target = "SmallCargo".into();
    assert!(matches!(
        f.change(f.b, Uuid::new_v4(), save(invalid, 1)).await,
        Err(ServiceError::Malformed)
    ));
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    assert_eq!(
        reopened
            .ship_appearance_snapshot(f.b)
            .await
            .unwrap()
            .equipment[0]
            .design_revision,
        Some(1)
    );
    f.change(
        f.second,
        Uuid::new_v4(),
        ShipAppearanceAction::Equip {
            target: SHIP_TARGET.into(),
            design_id: d.id,
            design_revision: 1,
            expected_equipment_revision: 0,
        },
    )
    .await
    .unwrap();
    let mut updated = d.clone();
    updated.revision = 1;
    updated.recipe.primary = "free-red".into();
    f.change(f.b, Uuid::new_v4(), save(updated, 1))
        .await
        .unwrap();
    let independent = f.state(f.second).await;
    assert_eq!(independent.equipment[0].design_revision, Some(1));
    assert_eq!(
        independent
            .library
            .iter()
            .find(|d| d.revision == 1)
            .unwrap()
            .recipe
            .primary,
        "free-ivory"
    );
    assert_eq!(
        independent
            .library
            .iter()
            .find(|d| d.revision == 2)
            .unwrap()
            .recipe
            .primary,
        "free-red"
    );
    f.stop_jobs().await;
}

#[tokio::test]
async fn abc_supersession_cancel_retry_and_expired_worker_fencing() {
    let f = Fixture::new().await;
    let mut d = design();
    f.change(f.b, Uuid::new_v4(), save(d.clone(), 0))
        .await
        .unwrap();
    let a = f.store.claim_ship_render().await.unwrap().unwrap();
    d.revision = 1;
    d.recipe.primary = "free-red".into();
    f.change(f.b, Uuid::new_v4(), save(d.clone(), 1))
        .await
        .unwrap();
    let b = f.state(f.b).await.equipment[0].render.as_ref().unwrap().id;
    d.revision = 2;
    d.recipe.primary = "free-gold".into();
    f.change(f.b, Uuid::new_v4(), save(d.clone(), 2))
        .await
        .unwrap();
    let c = f.state(f.b).await.equipment[0].render.as_ref().unwrap().id;
    assert_eq!(stage(&f, b).await, "superseded");
    assert!(f.store.claim_ship_render().await.unwrap().is_none());
    f.store
        .finish_ship_render(&a, Ok((Uuid::new_v4(), vec![])))
        .await
        .unwrap();
    assert_eq!(stage(&f, a.id).await, "superseded");
    assert!(f.state(f.b).await.equipment[0].artwork.is_none());
    let running = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(running.id, c);
    f.change(
        f.b,
        Uuid::new_v4(),
        ShipAppearanceAction::Cancel { request_id: c },
    )
    .await
    .unwrap();
    assert!(matches!(
        f.change(
            f.b,
            Uuid::new_v4(),
            ShipAppearanceAction::Retry { request_id: c }
        )
        .await,
        Err(ServiceError::Conflict)
    ));
    assert!(!f.store.ship_render_wanted(&running).await.unwrap());
    assert_eq!(
        f.state(f.b).await.equipment[0]
            .render
            .as_ref()
            .unwrap()
            .stage,
        "rendering"
    );
    assert!(
        f.store.claim_ship_render().await.unwrap().is_none(),
        "canceled HTTP render keeps its lane lease until it stops"
    );
    f.store
        .finish_ship_render(&running, Ok((Uuid::new_v4(), vec![])))
        .await
        .unwrap();
    assert!(f.state(f.b).await.equipment[0].artwork.is_none());
    f.change(
        f.b,
        Uuid::new_v4(),
        ShipAppearanceAction::Retry { request_id: c },
    )
    .await
    .unwrap();
    let before_restart = f.store.claim_ship_render().await.unwrap().unwrap();
    sqlx::query("UPDATE ship_render_requests SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1").bind(before_restart.id).execute(&f.pool).await.unwrap();
    let after_restart = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(before_restart.id, after_restart.id);
    assert_ne!(before_restart.lease, after_restart.lease);
    f.store
        .finish_ship_render(&before_restart, Ok((Uuid::new_v4(), vec![])))
        .await
        .unwrap();
    assert_eq!(stage(&f, after_restart.id).await, "rendering");
    f.store.defer_ship_render(&after_restart, 60).await.unwrap();
    assert_eq!(stage(&f, after_restart.id).await, "queued");
    assert!(f.store.claim_ship_render().await.unwrap().is_none());
    sqlx::query("UPDATE ship_render_requests SET not_before=clock_timestamp()-interval '1 second' WHERE id=$1").bind(after_restart.id).execute(&f.pool).await.unwrap();
    let resumed = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(resumed.id, after_restart.id);
    f.store
        .finish_ship_render(&resumed, Err("Recoverable renderer outage".into()))
        .await
        .unwrap();
    let state = f.state(f.b).await;
    assert_eq!(state.equipment[0].render.as_ref().unwrap().stage, "failed");
    assert!(state.equipment[0].render.as_ref().unwrap().can_retry);
    assert_eq!(state.library[0].recipe.primary, "free-gold");
    f.stop_jobs().await;
}

#[tokio::test]
async fn empire_emblems_editor_source_history_and_live_ship_refresh_are_independent() {
    let f = Fixture::new().await;
    let mut emblem = InsigniaDesign {
        id: Uuid::new_v4(),
        name: "Original".into(),
        recipe: InsigniaRecipe::default(),
        revision: 0,
    };
    f.store
        .change_insignia(
            f.b,
            InsigniaAction::Save {
                design: emblem.clone(),
                equip: true,
            },
            &f.customization.catalog,
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    f.store
        .change_insignia(
            f.second,
            InsigniaAction::Equip {
                design_id: Some(emblem.id),
            },
            &f.customization.catalog,
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    let history_before:Vec<(i64,Json<Value>)>=sqlx::query_as("SELECT observed_at,recipe FROM orbit_appearance_history WHERE player=$1 ORDER BY observed_at").bind(f.b.player.0).fetch_all(&f.pool).await.unwrap();
    f.change(f.b, Uuid::new_v4(), save(design(), 0))
        .await
        .unwrap();
    let job = f.store.claim_ship_render().await.unwrap().unwrap();
    emblem.revision = 1;
    emblem.recipe.symbol = "wings".into();
    f.store
        .change_insignia(
            f.second,
            InsigniaAction::Save {
                design: emblem.clone(),
                equip: true,
            },
            &f.customization.catalog,
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.insignia_library(f.b).await.unwrap().designs[0]
            .recipe
            .symbol,
        "compass",
        "editor starts from this empire's authored recipe"
    );
    assert_eq!(
        f.store
            .equipped_insignias(f.b.universe, vec![f.b.player])
            .await
            .unwrap()[&f.b.player]
            .0
            .symbol,
        "compass"
    );
    let history_after:Vec<(i64,Json<Value>)>=sqlx::query_as("SELECT observed_at,recipe FROM orbit_appearance_history WHERE player=$1 ORDER BY observed_at").bind(f.b.player.0).fetch_all(&f.pool).await.unwrap();
    assert_eq!(history_before, history_after);
    f.store
        .change_insignia(
            f.b,
            InsigniaAction::Equip { design_id: None },
            &f.customization.catalog,
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    // An emblem edit fences a completion even before the refresh poll runs.
    f.store
        .finish_ship_render(&job, Ok((Uuid::new_v4(), vec![])))
        .await
        .unwrap();
    assert!(f.state(f.b).await.equipment[0].artwork.is_none());
    f.change(f.b, Uuid::new_v4(), ShipAppearanceAction::Load)
        .await
        .unwrap();
    let refreshed = f.store.claim_ship_render().await.unwrap().unwrap();
    assert!(refreshed.input["emblem"].is_null());
    f.store
        .finish_ship_render(&refreshed, Err("fixture".into()))
        .await
        .unwrap();
    f.store
        .change_insignia(
            f.b,
            InsigniaAction::Delete {
                design_id: emblem.id,
            },
            &f.customization.catalog,
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.insignia_library(f.second).await.unwrap().designs[0]
            .recipe
            .symbol,
        "wings"
    );
    assert_eq!(
        f.state(f.second).await.emblem_recipe.unwrap().symbol,
        "wings"
    );
    assert!(
        sqlx::query("UPDATE empire_insignias SET design_id=NULL WHERE universe=$1 AND account=$2")
            .bind(f.second.universe.0)
            .bind(f.second.account.0)
            .execute(&f.pool)
            .await
            .is_err(),
        "legacy writer fails explicitly"
    );
    f.stop_jobs().await;
}

#[tokio::test]
async fn published_artifacts_are_private_and_survive_empire_deletion_and_render_failure() {
    let f = Fixture::new().await;
    let d = design();
    f.change(f.b, Uuid::new_v4(), save(d.clone(), 0))
        .await
        .unwrap();
    let job = f.store.claim_ship_render().await.unwrap().unwrap();
    let id = Uuid::new_v4();
    let key = format!("ship-appearances/{}/{id}/0", f.b.account.0);
    f.customization
        .assets
        .create_immutable(&key, b"fixture-pixels".to_vec(), 1024)
        .await
        .unwrap();
    let variants = vec![ShipStoredVariant {
        width: 192,
        height: 128,
        mime_type: "image/webp".into(),
        key,
    }];
    f.store.prepare_ship_render(&job).await.unwrap();
    f.store
        .finish_ship_render(&job, Ok((id, variants)))
        .await
        .unwrap();
    assert!(f.store.ship_artifact(f.other.account, id).await.is_err());
    let url = f.state(f.b).await.equipment[0]
        .artwork
        .as_ref()
        .unwrap()
        .variants[0]
        .url
        .clone();
    let response = f
        .app
        .clone()
        .oneshot(Request::get(&url).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let response = f
        .app
        .clone()
        .oneshot(
            Request::get(&url)
                .header("cookie", format!("orbit_session={}", f.login.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["cache-control"],
        "private, max-age=31536000, immutable"
    );
    let mut next = d.clone();
    next.revision = 1;
    next.recipe.primary = "free-green".into();
    f.change(f.b, Uuid::new_v4(), save(next, 1)).await.unwrap();
    let fail = f.store.claim_ship_render().await.unwrap().unwrap();
    f.store
        .finish_ship_render(&fail, Err("Renderer absent".into()))
        .await
        .unwrap();
    assert_eq!(
        f.state(f.b).await.equipment[0].artwork.as_ref().unwrap().id,
        id
    );
    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND account=$2")
        .bind(f.b.universe.0)
        .bind(f.b.account.0)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(
        f.store.ship_artifact(f.b.account, id).await.unwrap().len(),
        1
    );
    assert_eq!(f.state(f.second).await.library[0].id, d.id);
    let provenance = sqlx::query("SELECT account,player FROM ship_render_requests WHERE id=$1")
        .bind(job.id)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(provenance.get::<Uuid, _>("player"), f.b.player.0);
    f.stop_jobs().await;
}

#[tokio::test]
async fn lost_dye_access_refreshes_to_free_paint_without_mutating_revision() {
    let f = Fixture::new().await;
    let catalog=InsigniaCatalog::with_manifest(serde_json::from_value(json!({"version":3,"insignias":[],"dyes":[{"id":"fixture-copper","name":"Fixture copper","color":"#ab7432","tier":"fixture","access":"membership","scope":"account"}]})).unwrap()).unwrap();
    let installed = Customization {
        catalog,
        policy: CosmeticPolicy::Unrestricted,
        ..f.customization.clone()
    };
    let (allowed, _) = ship_render_environment(&f.store, f.b, &installed, None)
        .await
        .unwrap();
    let mut d = design();
    d.recipe.primary = "fixture-copper".into();
    f.store
        .change_ship_appearance(f.b, Uuid::new_v4(), save(d.clone(), 0), allowed)
        .await
        .unwrap();
    let original = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(original.input["colors"]["primary"], "#ab7432");
    f.store
        .finish_ship_render(&original, Err("fixture".into()))
        .await
        .unwrap();
    let restricted = Customization {
        policy: CosmeticPolicy::Supporter,
        ..installed
    };
    let (expired, choices) = ship_render_environment(&f.store, f.b, &restricted, None)
        .await
        .unwrap();
    assert_eq!(
        choices
            .iter()
            .find(|d| d["id"] == "fixture-copper")
            .unwrap()["availability"],
        "unavailable"
    );
    f.store
        .change_ship_appearance(f.b, Uuid::new_v4(), ShipAppearanceAction::Load, expired)
        .await
        .unwrap();
    let fallback = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(fallback.input["colors"]["primary"], "#e5dfce");
    let state = f.state(f.b).await;
    assert_eq!(state.library[0].recipe.primary, "fixture-copper");
    assert_eq!(state.library[0].revision, 1);
    assert_eq!(state.equipment[0].design_revision, Some(1));
    f.store
        .finish_ship_render(&fallback, Err("fixture".into()))
        .await
        .unwrap();
    let (restored, _) = ship_render_environment(
        &f.store,
        f.b,
        &Customization {
            policy: CosmeticPolicy::Unrestricted,
            ..restricted
        },
        None,
    )
    .await
    .unwrap();
    f.store
        .change_ship_appearance(f.b, Uuid::new_v4(), ShipAppearanceAction::Load, restored)
        .await
        .unwrap();
    let restored = f.store.claim_ship_render().await.unwrap().unwrap();
    assert_eq!(restored.input["colors"]["primary"], "#ab7432");
    f.stop_jobs().await;
}
